/**
 * The discovery hint (core B-2): a `_googlecast._tcp` browse narrowed to the devices that answer
 * on the temescal control port, with the Chromecast TXT labels lifted into name and model.
 */

import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {CAST_SERVICE, DEFAULT_PORT, discoveryHint, labels} from '../lib/discovery.js';

describe('the hint', () => {
    test('browses googlecast and requires the control port', () => {
        const hint = discoveryHint();
        assert.equal(hint.mdns.service, CAST_SERVICE);
        assert.equal(hint.ports.control, DEFAULT_PORT);
        // a Chromecast without 9741 is a speaker, a TV or a Nest — not a soundbar
        assert.notEqual(hint.requirePort, false);
    });

    test('follows --port', () => {
        assert.equal(discoveryHint({port: 9742}).ports.control, 9742);
    });

    test('the probe adds the labels and touches no socket', () => {
        const hint = discoveryHint();
        assert.deepEqual(hint.probe('172.16.20.180', {txt: {fn: 'Wohnzimmer-Soundbar', md: 'LG S90Q Soundbar'}}), {
            name: 'Wohnzimmer-Soundbar',
            model: 'LG S90Q Soundbar',
        });
    });
});

describe('labels', () => {
    test('the friendly name and model of a Chromecast answer', () => {
        assert.deepEqual(labels({txt: {fn: 'Wohnzimmer-Soundbar', md: 'LG S90Q Soundbar', id: 'abc'}}), {
            name: 'Wohnzimmer-Soundbar',
            model: 'LG S90Q Soundbar',
        });
    });

    test('a device without those TXT keys keeps whatever mDNS found', () => {
        assert.deepEqual(labels({txt: {id: 'abc'}}), {});
        assert.deepEqual(labels({}), {});
        assert.deepEqual(labels(), {});
    });

    test('empty strings are not labels', () => {
        assert.deepEqual(labels({txt: {fn: '', md: 'LG S90Q Soundbar'}}), {model: 'LG S90Q Soundbar'});
    });
});
