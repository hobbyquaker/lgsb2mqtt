import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {devicePayload} from 'mqtt-interfaces-core';

import {discoveryModel} from '../lib/hadiscovery.js';

const pkg = {name: 'lgsb2mqtt', version: '2.0.0', homepage: 'https://example.invalid'};

function stateOf(values) {
    return (item) => values[item];
}

/** What the core publishes for the model. */
function publish(model, name, prefix) {
    return devicePayload({pkg, name, prefix, ...model});
}

describe('discoveryModel', () => {
    const full = {
        uuid: '0355-abc',
        name: 'Wohnzimmer',
        model: 'DS90QY',
        firmware: '2603241',
        mute: false,
        night_mode: false,
        rear: true,
        input_list: ['Wifi', 'Bluetooth', 'HDMI'],
        eq_list: ['AI Sound Pro', 'Standard'],
        power: true,
        audio_source: 'DOLBY AUDIO',
        ip: '10.0.0.2',
    };
    const ranges = {volume: {min: 0, max: 100}, woofer: {min: -15, max: 6}, center_level: {min: -6, max: 6}};

    test('id, topic and device block', () => {
        const model = discoveryModel({name: 'soundbar', get: stateOf(full), ranges});
        assert.equal(model.id, 'lgsb2mqtt_0355-abc');
        const {topic, payload} = publish(model, 'soundbar');
        assert.equal(topic, 'homeassistant/device/lgsb2mqtt_0355-abc/config');
        assert.deepEqual(payload.dev, {
            ids: ['lgsb2mqtt_0355-abc'],
            name: 'Wohnzimmer',
            mf: 'LG',
            mdl: 'DS90QY',
            sw: '2603241',
        });
        assert.deepEqual(payload.o, {name: 'lgsb2mqtt', sw: '2.0.0', url: 'https://example.invalid'});
        assert.equal(payload.avty[0].t, 'soundbar/connected');
        assert.match(payload.avty[0].val_tpl, /2/);
    });

    test('components reflect known state', () => {
        const {components: c} = discoveryModel({name: 'soundbar', get: stateOf(full), ranges});
        assert.deepEqual(Object.keys(c).sort(), [
            'audio_source',
            'center_level',
            'eq',
            'firmware',
            'input',
            'ip',
            'mute',
            'night_mode',
            'power',
            'rear',
            'volume',
            'woofer',
        ]);
        assert.equal(c.volume.p, 'number');
        assert.equal(c.volume.stat_t, 'soundbar/status/volume');
        assert.equal(c.volume.cmd_t, 'soundbar/set/volume');
        assert.equal(c.volume.max, 100);
        assert.equal(c.volume.val_tpl, '{{ value_json.val }}');
        assert.equal(c.woofer.min, -15);
        assert.equal(c.woofer.unit_of_meas, 'dB');
        assert.deepEqual(c.input.options, ['Wifi', 'Bluetooth', 'HDMI']);
        assert.equal(c.eq.p, 'select');
        assert.equal(c.mute.pl_on, 'true');
        assert.equal(c.power.p, 'binary_sensor');
        assert.equal(c.power.dev_cla, 'power');
        assert.equal(c.firmware.ent_cat, 'diagnostic');
        assert.equal(c.audio_source.cmd_t, undefined);
    });

    test('unique ids are distinct and slash-free', () => {
        const {components} = discoveryModel({name: 'soundbar', get: stateOf(full), ranges});
        const ids = Object.values(components).map((c) => c.uniq_id);
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(ids.every((id) => !id.includes('/')));
    });

    test('minimal state: falls back to the instance name, only volume', () => {
        const model = discoveryModel({name: 'sb', get: stateOf({})});
        const {topic, payload} = publish(model, 'sb');
        assert.equal(topic, 'homeassistant/device/lgsb2mqtt_sb/config');
        assert.equal(payload.dev.name, 'sb');
        assert.deepEqual(Object.keys(model.components), ['volume']);
        assert.equal(model.components.volume.min, 0);
        assert.equal(model.components.volume.max, 100);
    });

    test('plain payloads drop the value template; custom prefix', () => {
        const model = discoveryModel({name: 'sb', get: stateOf({mute: true}), jsonPayloads: false});
        assert.equal(model.components.volume.val_tpl, undefined);
        assert.equal(model.components.mute.val_tpl, undefined);
        assert.equal(publish(model, 'sb', 'ha').topic, 'ha/device/lgsb2mqtt_sb/config');
    });

    test('id sanitizes odd characters', () => {
        assert.equal(discoveryModel({name: 'living room/sb', get: stateOf({})}).id, 'lgsb2mqtt_living_room_sb');
    });
});
