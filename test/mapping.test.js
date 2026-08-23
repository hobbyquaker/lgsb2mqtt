import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {statusFor, commandFor, rangeBoundFor, ITEMS} from '../lib/mapping.js';

describe('statusFor', () => {
    test('plain values', () => {
        assert.deepEqual(statusFor('SPK_LIST_VIEW_INFO', 'i_vol', 8), {item: 'volume', payload: 8, retain: true});
        assert.deepEqual(statusFor('SPK_LIST_VIEW_INFO', 'b_mute', false), {
            item: 'mute',
            payload: false,
            retain: true,
        });
        assert.deepEqual(statusFor('SETTING_VIEW_INFO', 'b_night_time', true), {
            item: 'night_mode',
            payload: true,
            retain: true,
        });
    });

    test('enum index to name, unknown fallback', () => {
        assert.equal(statusFor('FUNC_VIEW_INFO', 'i_curr_func', 20).payload, 'E-ARC');
        assert.equal(statusFor('EQ_VIEW_INFO', 'i_curr_eq', 19).payload, 'AI Sound Pro');
        assert.equal(statusFor('EQ_VIEW_INFO', 'i_curr_eq', 26).payload, 'unknown_26');
    });

    test('enum lists', () => {
        assert.deepEqual(statusFor('FUNC_VIEW_INFO', 'ai_func_list', [0, 1, 15]).payload, [
            'Wifi',
            'Bluetooth',
            'Optical/HDMI ARC',
        ]);
        assert.equal(statusFor('FUNC_VIEW_INFO', 'ai_func_list', 'nope'), null);
    });

    test('nested object via transform', () => {
        const status = statusFor('UPDATE_VIEW_INFO', 'o_system_ver', {s_main: '2603241', s_micom: '1'});
        assert.deepEqual(status, {item: 'firmware', payload: '2603241', retain: true});
        assert.equal(statusFor('UPDATE_VIEW_INFO', 'o_system_ver', {}), null);
    });

    test('unmapped keys return null', () => {
        assert.equal(statusFor('SPK_LIST_VIEW_INFO', 'b_soundbarmode', true), null);
        assert.equal(statusFor('NOPE', 'x', 1), null);
    });

    test('level items are offsets from min', () => {
        const ranges = {woofer: {min: -15, max: 6}, center_level: {min: -6, max: 6}};
        assert.equal(statusFor('SETTING_VIEW_INFO', 'i_woofer_level', 15, ranges).payload, 0);
        assert.equal(statusFor('SETTING_VIEW_INFO', 'i_center_level', 11, ranges).payload, 5);
        // without a known range the raw value is passed through
        assert.equal(statusFor('SETTING_VIEW_INFO', 'i_woofer_level', 15).payload, 15);
        // volume is not an offset item
        assert.equal(statusFor('SPK_LIST_VIEW_INFO', 'i_vol', 8, {volume: {min: 0, max: 100}}).payload, 8);
    });

    test('non-retained items', () => {
        assert.equal(statusFor('PLAY_INFO', 'i_position', 5).retain, false);
    });
});

describe('commandFor', () => {
    test('number with range check', () => {
        assert.deepEqual(commandFor('volume', '12'), {msg: 'SPK_LIST_VIEW_INFO', data: {i_vol: 12}});
        assert.deepEqual(commandFor('volume', 12.4, {volume: {min: 0, max: 100}}), {
            msg: 'SPK_LIST_VIEW_INFO',
            data: {i_vol: 12},
        });
        assert.throws(() => commandFor('volume', 101, {volume: {min: 0, max: 100}}), /above maximum/);
        assert.throws(() => commandFor('woofer', -16, {woofer: {min: -15, max: 6}}), /below minimum/);
        assert.throws(() => commandFor('volume', 'loud'), /not a number/);
    });

    test('level set converts to offset from min', () => {
        const ranges = {woofer: {min: -15, max: 6}};
        assert.deepEqual(commandFor('woofer', 0, ranges).data, {i_woofer_level: 15});
        assert.deepEqual(commandFor('woofer', -15, ranges).data, {i_woofer_level: 0});
        assert.deepEqual(commandFor('woofer', 6, ranges).data, {i_woofer_level: 21});
        assert.throws(() => commandFor('woofer', 7, ranges), /above maximum/);
        assert.deepEqual(commandFor('woofer', 3).data, {i_woofer_level: 3}, 'no range known: pass through');
    });

    test('booleans accept common spellings', () => {
        for (const v of [true, 'true', '1', 1, 'on', 'ON', 'yes']) {
            assert.deepEqual(commandFor('mute', v).data, {b_mute: true});
        }
        for (const v of [false, 'false', '0', 0, 'off', 'no']) {
            assert.deepEqual(commandFor('mute', v).data, {b_mute: false});
        }
        assert.throws(() => commandFor('mute', 'maybe'), /not a boolean/);
    });

    test('enums accept name (case-insensitive), index, unknown_n', () => {
        assert.deepEqual(commandFor('input', 'Bluetooth'), {msg: 'FUNC_VIEW_INFO', data: {i_curr_func: 1}});
        assert.deepEqual(commandFor('input', 'e-arc').data, {i_curr_func: 20});
        assert.deepEqual(commandFor('input', 6).data, {i_curr_func: 6});
        assert.deepEqual(commandFor('input', '6').data, {i_curr_func: 6});
        assert.deepEqual(commandFor('eq', 'unknown_26').data, {i_curr_eq: 26});
        assert.deepEqual(commandFor('eq', 'AI Sound Pro').data, {i_curr_eq: 19});
        assert.throws(() => commandFor('input', 'Telepathy'), /unknown value/);
    });

    test('writable entries pick the right message', () => {
        assert.equal(commandFor('eq', 0).msg, 'EQ_VIEW_INFO');
        assert.equal(commandFor('night_mode', true).msg, 'SETTING_VIEW_INFO');
        assert.equal(commandFor('woofer', 0).msg, 'SETTING_VIEW_INFO');
    });

    test('read-only and unknown items throw', () => {
        assert.throws(() => commandFor('power', true), /read-only/);
        assert.throws(() => commandFor('volume/max', 5), /read-only/);
        assert.throws(() => commandFor('teleport', 1), /unknown item/);
    });
});

describe('table consistency', () => {
    test('exactly one writable entry per settable item', () => {
        const counts = new Map();
        for (const entry of ITEMS.filter((e) => !e.readonly)) {
            counts.set(entry.item, (counts.get(entry.item) || 0) + 1);
        }
        for (const [item, count] of counts) {
            assert.equal(count, 1, `item ${item} has ${count} writable entries`);
        }
    });

    test('no duplicate raw keys', () => {
        const keys = ITEMS.map((e) => e.msg + '/' + e.key);
        assert.equal(new Set(keys).size, keys.length);
    });

    test('rangeBoundFor', () => {
        assert.deepEqual(rangeBoundFor('SPK_LIST_VIEW_INFO', 'i_vol_max'), {item: 'volume', bound: 'max'});
        assert.deepEqual(rangeBoundFor('SETTING_VIEW_INFO', 'i_woofer_min'), {item: 'woofer', bound: 'min'});
        assert.equal(rangeBoundFor('SPK_LIST_VIEW_INFO', 'i_vol'), null);
    });
});
