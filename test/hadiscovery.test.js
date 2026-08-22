const {test, describe} = require('node:test');
const assert = require('node:assert/strict');

const {buildDiscovery} = require('../lib/hadiscovery.js');

const pkg = {name: 'lgsb2mqtt', version: '1.0.0', homepage: 'https://example.invalid'};

function stateOf(values) {
    return (item) => values[item];
}

describe('buildDiscovery', () => {
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

    test('topic and device block', () => {
        const {topic, payload} = buildDiscovery({name: 'soundbar', get: stateOf(full), ranges, pkg});
        assert.equal(topic, 'homeassistant/device/lgsb2mqtt_0355-abc/config');
        assert.deepEqual(payload.dev, {
            ids: ['lgsb2mqtt_0355-abc'],
            name: 'Wohnzimmer',
            mf: 'LG',
            mdl: 'DS90QY',
            sw: '2603241',
        });
        assert.deepEqual(payload.o, {name: 'lgsb2mqtt', sw: '1.0.0', url: 'https://example.invalid'});
        assert.equal(payload.avty[0].t, 'soundbar/connected');
        assert.match(payload.avty[0].avty_tpl, /'2'/);
    });

    test('components reflect known state', () => {
        const {payload} = buildDiscovery({name: 'soundbar', get: stateOf(full), ranges, pkg});
        const c = payload.cmps;
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
        assert.equal(c.woofer.min, -15);
        assert.equal(c.woofer.unit_of_meas, 'dB');
        assert.deepEqual(c.input.options, ['Wifi', 'Bluetooth', 'HDMI']);
        assert.equal(c.eq.p, 'select');
        assert.equal(c.mute.pl_on, 'true');
        assert.equal(c.power.p, 'binary_sensor');
        assert.equal(c.firmware.ent_cat, 'diagnostic');
        assert.equal(c.volume.val_tpl, undefined);
    });

    test('unique ids are distinct and slash-free', () => {
        const {payload} = buildDiscovery({name: 'soundbar', get: stateOf(full), ranges, pkg});
        const ids = Object.values(payload.cmps).map((c) => c.uniq_id);
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(ids.every((id) => !id.includes('/')));
    });

    test('minimal state: falls back to instance name, only volume', () => {
        const {topic, payload} = buildDiscovery({name: 'sb', get: stateOf({}), pkg});
        assert.equal(topic, 'homeassistant/device/lgsb2mqtt_sb/config');
        assert.equal(payload.dev.name, 'sb');
        assert.deepEqual(Object.keys(payload.cmps), ['volume']);
        assert.equal(payload.cmps.volume.min, 0);
        assert.equal(payload.cmps.volume.max, 100);
    });

    test('custom prefix and json payloads', () => {
        const {topic, payload} = buildDiscovery({
            name: 'sb',
            prefix: 'ha',
            get: stateOf({mute: true}),
            pkg,
            jsonPayloads: true,
        });
        assert.equal(topic, 'ha/device/lgsb2mqtt_sb/config');
        assert.equal(payload.cmps.volume.val_tpl, '{{ value_json.val }}');
        assert.equal(payload.cmps.mute.val_tpl, '{{ value_json.val }}');
    });

    test('id sanitizes odd characters', () => {
        const {topic} = buildDiscovery({name: 'living room/sb', get: stateOf({}), pkg});
        assert.equal(topic, 'homeassistant/device/lgsb2mqtt_living_room_sb/config');
    });
});
