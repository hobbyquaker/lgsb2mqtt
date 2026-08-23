/**
 * Home Assistant MQTT discovery (device-based, HA >= 2024.11) — the entity map for the core's
 * `discovery()` hook. Pure: last known state + learned ranges in, device block out.
 *
 * HA has no MQTT media_player platform, so the soundbar is exposed as a bundle of entities:
 * number (volume, speaker levels), switch (mute, settings), select (input, sound mode),
 * binary_sensor (power) and sensors.
 */

import {entity, discoveryId} from 'mqtt-interfaces-core';

export const ADAPTER = 'lgsb2mqtt';

const SWITCHES = [
    {item: 'mute', label: 'Mute', icon: 'mdi:volume-mute'},
    {item: 'night_mode', label: 'Night mode', icon: 'mdi:weather-night', category: 'config'},
    {item: 'auto_volume', label: 'Auto volume', category: 'config'},
    {item: 'drc', label: 'DRC', category: 'config'},
    {item: 'auto_power', label: 'Auto power', category: 'config'},
    {item: 'tv_remote', label: 'TV remote', category: 'config'},
    {item: 'neuralx', label: 'Neural:X', category: 'config'},
    {item: 'rear', label: 'Rear speakers', category: 'config'},
];

const LEVELS = [
    {item: 'woofer', label: 'Woofer level'},
    {item: 'center_level', label: 'Center level'},
    {item: 'rear_level', label: 'Rear level'},
    {item: 'top_level', label: 'Top level'},
    {item: 'side_level', label: 'Side level'},
    {item: 'dialog_level', label: 'Dialog level'},
];

const SENSORS = [
    {item: 'audio_source', label: 'Audio source', icon: 'mdi:surround-sound'},
    {item: 'firmware', label: 'Firmware', category: 'diagnostic'},
    {item: 'ip', label: 'IP address', category: 'diagnostic'},
];

function range(ranges, item, bound, fallback) {
    const r = ranges[item];
    return r && typeof r[bound] === 'number' ? r[bound] : fallback;
}

/**
 * The device block for `createAdapter({discovery})`.
 * @param {object} input
 * @param {string} input.name instance name / topic prefix
 * @param {(item: string) => *} input.get last known value of a friendly item
 * @param {Object<string, {min?: number, max?: number}>} [input.ranges] known ranges
 * @param {boolean} [input.jsonPayloads] status payloads are {val, ts, lc} JSON
 * @returns {{id: string, device: object, components: Object<string, object>}}
 */
export function discoveryModel({name, get, ranges = {}, jsonPayloads = true}) {
    const uuid = get('uuid');
    // the device uuid keeps the HA device stable across renames; the instance name until it is known
    const id = discoveryId(ADAPTER, uuid || name);
    const e = (item, platform, label, more = {}) => entity({id, name, item, platform, label, jsonPayloads, ...more});
    const components = {};

    components.volume = e('volume', 'number', 'Volume', {
        icon: 'mdi:volume-high',
        command: true,
        extra: {
            min: range(ranges, 'volume', 'min', 0),
            max: range(ranges, 'volume', 'max', 100),
            step: 1,
            mode: 'slider',
        },
    });

    for (const level of LEVELS) {
        if (!ranges[level.item]) {
            continue;
        }
        components[level.item] = e(level.item, 'number', level.label, {
            category: 'config',
            command: true,
            extra: {
                min: range(ranges, level.item, 'min', -6),
                max: range(ranges, level.item, 'max', 6),
                step: 1,
                unit_of_meas: 'dB',
                mode: 'slider',
            },
        });
    }

    for (const sw of SWITCHES) {
        if (get(sw.item) === undefined) {
            continue;
        }
        components[sw.item] = e(sw.item, 'switch', sw.label, {
            icon: sw.icon,
            category: sw.category,
            command: true,
            extra: {pl_on: 'true', pl_off: 'false', stat_on: 'true', stat_off: 'false'},
        });
    }

    const inputs = get('input_list');
    if (Array.isArray(inputs) && inputs.length) {
        components.input = e('input', 'select', 'Input', {icon: 'mdi:import', command: true, extra: {options: inputs}});
    }
    const eqs = get('eq_list');
    if (Array.isArray(eqs) && eqs.length) {
        components.eq = e('eq', 'select', 'Sound mode', {icon: 'mdi:equalizer', command: true, extra: {options: eqs}});
    }
    if (get('power') !== undefined) {
        components.power = e('power', 'binary_sensor', 'Power', {
            category: 'diagnostic',
            extra: {dev_cla: 'power', pl_on: 'true', pl_off: 'false'},
        });
    }
    for (const sensor of SENSORS) {
        if (get(sensor.item) === undefined) {
            continue;
        }
        components[sensor.item] = e(sensor.item, 'sensor', sensor.label, {
            icon: sensor.icon,
            category: sensor.category,
        });
    }

    return {
        id,
        device: {
            name: get('name') || name,
            mf: 'LG',
            ...(get('model') && {mdl: get('model')}),
            ...(get('firmware') && {sw: String(get('firmware'))}),
        },
        components,
    };
}
