#!/usr/bin/env node

import {createAdapter} from 'mqtt-interfaces-core';
import config from './config.js';
import pkg from './package.json' with {type: 'json'};
import {LgSoundbar} from './lib/soundbar.js';
import * as mapping from './lib/mapping.js';
import {discoveryModel} from './lib/hadiscovery.js';
import {handle as handleInstall} from './lib/install.js';

handleInstall(config);

/** known numeric ranges per friendly item, learned from status messages: {volume: {min, max}, ...} */
const ranges = {};
let lgsb = null;

const adapter = createAdapter({
    pkg,
    config,
    deviceLabel: 'soundbar',
    info: {soundbar: `${config.address}:${config.port}`},
    discovery: ({get}) => discoveryModel({name: config.name, get, ranges, jsonPayloads: config.jsonPayloads}),
    // items whose change requires a new discovery payload (options / device info); ranges are handled below
    discoveryTriggers: ['input_list', 'eq_list', 'name', 'model', 'firmware', 'uuid'],
    onSet: handleSet,
    onShutdown: () => lgsb && lgsb.disconnect(),
});
const {log, pubStatus, setDeviceConnected} = adapter;

/*
 * soundbar
 */

lgsb = new LgSoundbar(config.address, {port: config.port, log});

lgsb.on('receive', (data) => {
    log.debug('soundbar <', data.msg, data.data);
    publishData(data);
});

lgsb.on('connect', () => {
    setDeviceConnected(true);
    log.info('soundbar', config.address, 'connected');
    getInitialValues();
});

lgsb.on('disconnect', () => {
    setDeviceConnected(false);
    log.info('soundbar', config.address, 'disconnected');
});

lgsb.on('socketerror', (error) => {
    log.warn('soundbar', config.address, error.message || error);
});

async function getInitialValues() {
    for (const msg of mapping.INITIAL_MESSAGES) {
        await getData(msg);
    }
    adapter.markDiscoveryDirty();
    adapter.publishDiscovery();
}

async function getData(msg) {
    log.debug('soundbar > get', msg);
    try {
        publishData(await lgsb.get(msg));
    } catch (error) {
        log.warn('soundbar get', msg, 'failed:', error.message);
    }
}

/** Send a set and publish the confirmed state; rejections propagate to the core's set handling (warn). */
async function lgsbSet(msg, data) {
    log.debug('soundbar > set', msg, data);
    publishData(await lgsb.set(msg, data));
}

function publishData(data) {
    if (!data || data.result !== 'ok' || !data.msg || !data.data || typeof data.data !== 'object') {
        return;
    }
    const entries = Object.entries(data.data);

    // learn min/max first: level values in the same message are relative to them
    let rangesChanged = false;
    for (const [key, value] of entries) {
        const bound = mapping.rangeBoundFor(data.msg, key);
        if (bound && typeof value === 'number') {
            if (!ranges[bound.item] || ranges[bound.item][bound.bound] !== value) {
                rangesChanged = true;
            }
            ranges[bound.item] = {...ranges[bound.item], [bound.bound]: value};
        }
    }

    for (const [key, value] of entries) {
        const friendly = mapping.statusFor(data.msg, key, value, ranges);
        if (friendly) {
            pubStatus(friendly.item, friendly.payload, {retain: friendly.retain});
        }
        if (config.publishRaw) {
            publishRaw(data.msg, key, value);
        }
    }

    if (rangesChanged) {
        adapter.markDiscoveryDirty();
        adapter.publishDiscovery();
    }
}

function publishRaw(msg, key, value) {
    if (Array.isArray(value)) {
        value.forEach((val, index) => pubStatus(`${msg}/${key}/${index}`, val));
    } else {
        pubStatus(`${msg}/${key}`, value);
    }
}

/*
 * set handling
 */

async function handleSet(parts, value, topic) {
    if (value === undefined) {
        log.warn('mqtt ignoring empty payload on', topic);
        return;
    }

    // <name>/set/<MSG>/<key>: raw protocol set, opt-in
    if (parts.length === 2 && /^[A-Z0-9_]+$/.test(parts[0])) {
        if (!config.rawSet) {
            log.warn('mqtt ignoring', topic, '(raw set topics disabled, see --raw-set)');
            return;
        }
        return lgsbSet(parts[0], {[parts[1]]: value});
    }

    // <name>/set/<item>: friendly
    const item = parts.join('/');
    let command;
    try {
        command = mapping.commandFor(item, value, ranges);
    } catch (error) {
        log.warn('mqtt set', item, String(value), '-', error.message);
        return;
    }
    return lgsbSet(command.msg, command.data);
}

log.info('soundbar trying to connect', config.address);
lgsb.connect();
adapter.start();
