#!/usr/bin/env node

const log = require('yalm');
const Mqtt = require('mqtt');
const config = require('./config.js');
const pkg = require('./package.json');
const LgSoundbar = require('./lib/soundbar.js');
const mapping = require('./lib/mapping.js');
const {parsePayload, StatusTracker} = require('./lib/payload.js');
const {buildDiscovery} = require('./lib/hadiscovery.js');

if (config.install || config.uninstall) {
    const {installService, uninstallService} = require('./lib/install.js');
    const plain = (...args) => console.log(...args);
    try {
        if (config.uninstall) {
            uninstallService(config, plain);
        } else {
            installService(config, plain);
        }
        process.exit(0);
    } catch (err) {
        console.error('error:', err.message);
        process.exit(1);
    }
}

const topicPrefix = config.name;
const connectedTopic = topicPrefix + '/connected';

let mqttConnected = false;
let sbConnected = false;
let shuttingDown = false;

/** last known friendly values, also produces plain or {val, ts, lc} payloads */
const status = new StatusTracker({json: config.jsonPayloads});

/** known numeric ranges per friendly item, learned from status messages: {volume: {min, max}, ...} */
const ranges = {};

/** items whose change requires a new discovery payload (options/ranges/device info) */
const DISCOVERY_TRIGGERS = new Set(['input_list', 'eq_list', 'name', 'model', 'firmware', 'uuid']);
let discoveryTopic = null;
let discoveryDirty = false;

log.setLevel(config.verbosity);

log.info(pkg.name + ' ' + pkg.version + ' starting');
log.info('mqtt trying to connect', config.mqttUrl);

const mqtt = Mqtt.connect(config.mqttUrl, {
    clientId: config.name + '_' + Math.random().toString(16).slice(2, 10),
    will: {topic: connectedTopic, payload: '0', retain: true},
});

const lgsb = new LgSoundbar(config.address, {log});

lgsb.on('receive', (data) => {
    log.debug('lgsb <', data.msg, data.data);
    publishData(data);
    publishDiscoveryIfDirty();
});

lgsb.on('connect', () => {
    sbConnected = true;
    publishConnected();
    log.info('soundbar', config.address, 'connected');
    getInitialValues();
});

lgsb.on('disconnect', () => {
    sbConnected = false;
    publishConnected();
    log.info('soundbar', config.address, 'disconnected');
});

lgsb.on('socketerror', (error) => {
    log.warn('soundbar', config.address, error.message || error);
});

log.info('soundbar trying to connect', config.address);
lgsb.connect();

function publishConnected() {
    if (!mqttConnected) {
        return;
    }
    mqttPub(connectedTopic, sbConnected ? '2' : '1', {retain: true});
}

async function getInitialValues() {
    for (const msg of mapping.INITIAL_MESSAGES) {
        await getData(msg);
    }
    discoveryDirty = true;
    publishDiscoveryIfDirty();
}

async function getData(msg) {
    log.debug('lgsb > get', msg);
    try {
        publishData(await lgsb.get(msg));
    } catch (error) {
        log.error('lgsb get', msg, 'failed:', error.message);
    }
}

async function lgsbSet(msg, data) {
    log.debug('lgsb > set', msg, data);
    try {
        publishData(await lgsb.set(msg, data));
    } catch (error) {
        log.error('lgsb set', msg, 'failed:', error.message);
    }
}

function publishData(data) {
    if (!data || data.result !== 'ok' || !data.msg || !data.data || typeof data.data !== 'object') {
        return;
    }
    const entries = Object.entries(data.data);

    // learn min/max first: level values in the same message are relative to them
    for (const [key, value] of entries) {
        const bound = mapping.rangeBoundFor(data.msg, key);
        if (bound && typeof value === 'number') {
            if (!ranges[bound.item] || ranges[bound.item][bound.bound] !== value) {
                discoveryDirty = true;
            }
            ranges[bound.item] = {...ranges[bound.item], [bound.bound]: value};
        }
    }

    for (const [key, value] of entries) {
        const friendly = mapping.statusFor(data.msg, key, value, ranges);
        if (friendly) {
            const {payload, changed} = status.update(friendly.item, friendly.payload);
            mqttPub(topicPrefix + '/status/' + friendly.item, payload, {retain: friendly.retain});
            if (changed && DISCOVERY_TRIGGERS.has(friendly.item)) {
                discoveryDirty = true;
            }
        }
        if (config.publishRaw) {
            publishRaw(data.msg, key, value);
        }
    }
}

function publishRaw(msg, key, value) {
    if (Array.isArray(value)) {
        value.forEach((val, index) => {
            mqttPub(topicPrefix + '/status/' + msg + '/' + key + '/' + index, val, {retain: true});
        });
    } else {
        mqttPub(topicPrefix + '/status/' + msg + '/' + key, value, {retain: true});
    }
}

function publishDiscoveryIfDirty() {
    if (!config.haDiscovery || !discoveryDirty || !mqttConnected) {
        return;
    }
    discoveryDirty = false;
    const {topic, payload} = buildDiscovery({
        name: config.name,
        prefix: config.haPrefix,
        get: (item) => status.get(item),
        ranges,
        pkg,
        jsonPayloads: config.jsonPayloads,
    });
    if (discoveryTopic && discoveryTopic !== topic) {
        // device id changed (uuid became known): remove the old announcement
        mqttPub(discoveryTopic, '', {retain: true});
    }
    discoveryTopic = topic;
    log.info('mqtt publishing home assistant discovery', topic);
    mqttPub(topic, payload, {retain: true});
}

function clearDiscovery() {
    // remove a possibly earlier announced device (id based on instance name; uuid based ids
    // are unknown at this point, users can remove those in HA)
    const {topic} = buildDiscovery({name: config.name, prefix: config.haPrefix, get: () => undefined, pkg});
    mqttPub(topic, '', {retain: true});
}

function mqttPub(topic, payload, options) {
    if (payload !== null && typeof payload === 'object') {
        payload = JSON.stringify(payload);
    }
    log.debug('mqtt >', topic, payload);
    mqtt.publish(topic, String(payload), options);
}

mqtt.on('connect', () => {
    mqttConnected = true;
    log.info('mqtt connected', config.mqttUrl);
    publishConnected();

    const setTopic = topicPrefix + '/set/#';
    log.info('mqtt subscribe', setTopic);
    mqtt.subscribe(setTopic);

    if (config.haDiscovery) {
        publishDiscoveryIfDirty();
    } else {
        clearDiscovery();
    }
});

mqtt.on('close', () => {
    if (mqttConnected) {
        mqttConnected = false;
        log.info('mqtt closed', config.mqttUrl);
    }
});

mqtt.on('error', (err) => {
    log.error('mqtt', err.message || err);
});

mqtt.on('message', (topic, payload) => {
    payload = payload.toString();
    log.debug('mqtt <', topic, payload);

    // <name>/set/<item>  (friendly)  or  <name>/set/<MSG>/<key>  (raw protocol)
    const [prefix, action, ...parts] = topic.split('/');
    if (prefix !== topicPrefix || action !== 'set' || parts.length < 1 || parts.length > 2 || parts.includes('')) {
        log.warn('mqtt ignoring unexpected topic', topic);
        return;
    }

    const value = parsePayload(payload);
    if (value === undefined) {
        log.warn('mqtt ignoring empty payload on', topic);
        return;
    }

    if (parts.length === 2 && /^[A-Z0-9_]+$/.test(parts[0])) {
        // raw protocol set
        lgsbSet(parts[0], {[parts[1]]: value});
        return;
    }

    const item = parts.join('/');
    let command;
    try {
        command = mapping.commandFor(item, value, ranges);
    } catch (error) {
        log.warn('mqtt set', item, String(payload), '-', error.message);
        return;
    }
    lgsbSet(command.msg, command.data);
});

function shutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    log.info('received', signal, '- shutting down');

    const exit = () => process.exit(0);
    const timer = setTimeout(exit, 2000);

    lgsb.disconnect();

    if (mqttConnected) {
        mqtt.publish(connectedTopic, '0', {retain: true}, () => {
            mqtt.end(false, {}, () => {
                clearTimeout(timer);
                exit();
            });
        });
    } else {
        mqtt.end(true, {}, () => {
            clearTimeout(timer);
            exit();
        });
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
