/**
 * Home Assistant MQTT discovery (device-based, HA >= 2024.11).
 * https://www.home-assistant.io/integrations/mqtt/#device-discovery-payload
 *
 * HA has no MQTT media_player platform, so the soundbar is exposed as a bundle of
 * entities: number (volume, levels), switch (mute, settings), select (input, eq),
 * binary_sensor (power) and sensors.
 */

const SWITCHES = [
    {item: 'mute', name: 'Mute', icon: 'mdi:volume-mute'},
    {item: 'night_mode', name: 'Night mode', icon: 'mdi:weather-night', category: 'config'},
    {item: 'auto_volume', name: 'Auto volume', category: 'config'},
    {item: 'drc', name: 'DRC', category: 'config'},
    {item: 'auto_power', name: 'Auto power', category: 'config'},
    {item: 'tv_remote', name: 'TV remote', category: 'config'},
    {item: 'neuralx', name: 'Neural:X', category: 'config'},
    {item: 'rear', name: 'Rear speakers', category: 'config'},
];

const LEVELS = [
    {item: 'woofer', name: 'Woofer level'},
    {item: 'center_level', name: 'Center level'},
    {item: 'rear_level', name: 'Rear level'},
    {item: 'top_level', name: 'Top level'},
    {item: 'side_level', name: 'Side level'},
    {item: 'dialog_level', name: 'Dialog level'},
];

const SENSORS = [
    {item: 'audio_source', name: 'Audio source', icon: 'mdi:surround-sound'},
    {item: 'firmware', name: 'Firmware', category: 'diagnostic'},
    {item: 'ip', name: 'IP address', category: 'diagnostic'},
];

/**
 * Build the discovery payload.
 * @param {object} input
 * @param {string} input.name instance name / topic prefix
 * @param {string} input.prefix discovery prefix (default "homeassistant")
 * @param {(item: string) => *} input.get last known value of a friendly item
 * @param {Object<string, {min?: number, max?: number}>} input.ranges known ranges
 * @param {{name: string, version: string, homepage?: string}} input.pkg
 * @param {boolean} [input.jsonPayloads] status payloads are {val, ts, lc} JSON
 * @returns {{topic: string, payload: object}}
 */
function buildDiscovery({name, prefix = 'homeassistant', get, ranges = {}, pkg, jsonPayloads = false}) {
    const uuid = get('uuid');
    const id = 'lgsb2mqtt_' + String(uuid || name).replace(/[^a-zA-Z0-9_-]/g, '_');
    const status = (item) => `${name}/status/${item}`;
    const set = (item) => `${name}/set/${item}`;
    const valueTemplate = jsonPayloads ? '{{ value_json.val }}' : undefined;

    const common = (item, extra) => ({
        p: extra.p,
        uniq_id: `${id}_${item.replace(/\//g, '_')}`,
        name: extra.name,
        stat_t: status(item),
        ...(valueTemplate && {val_tpl: valueTemplate}),
        ...(extra.icon && {ic: extra.icon}),
        ...(extra.category && {ent_cat: extra.category}),
    });

    const components = {};

    // volume
    components.volume = {
        ...common('volume', {p: 'number', name: 'Volume', icon: 'mdi:volume-high'}),
        cmd_t: set('volume'),
        min: range(ranges, 'volume', 'min', 0),
        max: range(ranges, 'volume', 'max', 100),
        step: 1,
        mode: 'slider',
    };

    for (const level of LEVELS) {
        if (!ranges[level.item]) {
            continue;
        }
        components[level.item] = {
            ...common(level.item, {p: 'number', name: level.name, category: 'config'}),
            cmd_t: set(level.item),
            min: range(ranges, level.item, 'min', -6),
            max: range(ranges, level.item, 'max', 6),
            step: 1,
            unit_of_meas: 'dB',
            mode: 'slider',
        };
    }

    for (const sw of SWITCHES) {
        if (get(sw.item) === undefined) {
            continue;
        }
        components[sw.item] = {
            ...common(sw.item, {p: 'switch', name: sw.name, icon: sw.icon, category: sw.category}),
            cmd_t: set(sw.item),
            pl_on: 'true',
            pl_off: 'false',
            stat_on: 'true',
            stat_off: 'false',
        };
    }

    const inputs = get('input_list');
    if (Array.isArray(inputs) && inputs.length) {
        components.input = {
            ...common('input', {p: 'select', name: 'Input', icon: 'mdi:import'}),
            cmd_t: set('input'),
            options: inputs,
        };
    }

    const eqs = get('eq_list');
    if (Array.isArray(eqs) && eqs.length) {
        components.eq = {
            ...common('eq', {p: 'select', name: 'Sound mode', icon: 'mdi:equalizer'}),
            cmd_t: set('eq'),
            options: eqs,
        };
    }

    if (get('power') !== undefined) {
        components.power = {
            ...common('power', {p: 'binary_sensor', name: 'Power', category: 'diagnostic'}),
            dev_cla: 'power',
            pl_on: 'true',
            pl_off: 'false',
        };
    }

    for (const sensor of SENSORS) {
        if (get(sensor.item) === undefined) {
            continue;
        }
        components[sensor.item] = common(sensor.item, {p: 'sensor', ...sensor});
    }

    const payload = {
        dev: {
            ids: [id],
            name: get('name') || name,
            mf: 'LG',
            ...(get('model') && {mdl: get('model')}),
            ...(get('firmware') && {sw: String(get('firmware'))}),
        },
        o: {
            name: pkg.name,
            sw: pkg.version,
            ...(pkg.homepage && {url: pkg.homepage}),
        },
        avty: [{t: `${name}/connected`, avty_tpl: "{{ 'online' if value == '2' else 'offline' }}"}],
        qos: 0,
        cmps: components,
    };

    return {topic: `${prefix}/device/${id}/config`, payload};
}

function range(ranges, item, bound, fallback) {
    const r = ranges[item];
    return r && typeof r[bound] === 'number' ? r[bound] : fallback;
}

module.exports = {buildDiscovery};
