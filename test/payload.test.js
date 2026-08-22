const {test, describe} = require('node:test');
const assert = require('node:assert/strict');

const {parsePayload, StatusTracker} = require('../lib/payload.js');

describe('parsePayload', () => {
    test('plain values', () => {
        assert.equal(parsePayload('12'), 12);
        assert.equal(parsePayload('-3.5'), -3.5);
        assert.equal(parsePayload('true'), true);
        assert.equal(parsePayload('false'), false);
        assert.equal(parsePayload('HDMI'), 'HDMI');
        assert.equal(parsePayload(' on '), ' on ');
    });

    test('empty is undefined, not 0', () => {
        assert.equal(parsePayload(''), undefined);
        assert.equal(parsePayload('   '), undefined);
    });

    test('json {val} is unwrapped, other json passed through', () => {
        assert.equal(parsePayload('{"val": 7}'), 7);
        assert.equal(parsePayload('{"val": "Cinema", "ts": 1}'), 'Cinema');
        assert.deepEqual(parsePayload('{"x": 1}'), {x: 1});
        assert.deepEqual(parsePayload('[1,2]'), [1, 2]);
        assert.equal(parsePayload('{not json'), '{not json');
    });

    test('accepts Buffers', () => {
        assert.equal(parsePayload(Buffer.from('42')), 42);
    });
});

describe('StatusTracker', () => {
    test('plain mode returns the value and change flag', () => {
        const tracker = new StatusTracker();
        assert.deepEqual(tracker.update('volume', 8), {payload: 8, changed: true});
        assert.deepEqual(tracker.update('volume', 8), {payload: 8, changed: false});
        assert.deepEqual(tracker.update('volume', 9), {payload: 9, changed: true});
        assert.equal(tracker.get('volume'), 9);
        assert.equal(tracker.get('nope'), undefined);
    });

    test('json mode tracks ts and lc', () => {
        let now = 1000;
        const tracker = new StatusTracker({json: true, now: () => now});
        assert.deepEqual(tracker.update('volume', 8).payload, {val: 8, ts: 1000, lc: 1000});
        now = 2000;
        assert.deepEqual(tracker.update('volume', 8).payload, {val: 8, ts: 2000, lc: 1000});
        now = 3000;
        assert.deepEqual(tracker.update('volume', 9).payload, {val: 9, ts: 3000, lc: 3000});
    });

    test('arrays compare by content', () => {
        const tracker = new StatusTracker();
        tracker.update('list', ['a', 'b']);
        assert.equal(tracker.update('list', ['a', 'b']).changed, false);
        assert.equal(tracker.update('list', ['a', 'c']).changed, true);
    });
});
