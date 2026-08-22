/**
 * Mapping between the raw LG protocol (message name + key) and friendly MQTT items.
 *
 * Field names verified on an LG DS90QY (firmware 2603241); other models may lack
 * some keys — unknown keys are simply not mapped (still visible with --publish-raw).
 * Index → name tables come from the temescal Python library; indices without a
 * known name are published as `unknown_<n>` and accepted back in that form.
 */

const FUNCTIONS = [
    'Wifi',
    'Bluetooth',
    'Portable',
    'Aux',
    'Optical',
    'CP',
    'HDMI',
    'ARC',
    'Spotify',
    'Optical2',
    'HDMI2',
    'HDMI3',
    'LG TV',
    'Mic',
    'Chromecast',
    'Optical/HDMI ARC',
    'LG Optical',
    'FM',
    'USB',
    'USB2',
    'E-ARC',
];

const EQUALISERS = [
    'Standard',
    'Bass',
    'Flat',
    'Boost',
    'Treble and Bass',
    'User',
    'Music',
    'Cinema',
    'Night',
    'News',
    'Voice',
    'ia_sound',
    'Adaptive Sound Control',
    'Movie',
    'Bass Blast',
    'Dolby Atmos',
    'DTS Virtual X',
    'Bass Boost Plus',
    'DTS X',
    'AI Sound Pro',
    'Clear Voice',
    'Sports',
    'Game',
];

/**
 * One entry per raw (msg, key). `item` is the friendly topic suffix. Entries with
 * `readonly` are status-only; for items that appear in several messages exactly one
 * entry is writable and defines which message a `set` is sent as.
 *
 * types: number | boolean | string | enum (index -> names) | enumlist (index[] -> names[])
 *        | object (uses `transform` to pick a value)
 */
const ITEMS = [
    // SPK_LIST_VIEW_INFO
    {item: 'volume', msg: 'SPK_LIST_VIEW_INFO', key: 'i_vol', type: 'number', range: 'volume'},
    {item: 'volume/min', msg: 'SPK_LIST_VIEW_INFO', key: 'i_vol_min', type: 'number', readonly: true},
    {item: 'volume/max', msg: 'SPK_LIST_VIEW_INFO', key: 'i_vol_max', type: 'number', readonly: true},
    {item: 'mute', msg: 'SPK_LIST_VIEW_INFO', key: 'b_mute', type: 'boolean'},
    {item: 'power', msg: 'SPK_LIST_VIEW_INFO', key: 'b_powerstatus', type: 'boolean', readonly: true},
    {item: 'input', msg: 'SPK_LIST_VIEW_INFO', key: 'i_curr_func', type: 'enum', names: FUNCTIONS, readonly: true},
    {item: 'name', msg: 'SPK_LIST_VIEW_INFO', key: 's_user_name', type: 'string', readonly: true},
    {item: 'audio_source', msg: 'SPK_LIST_VIEW_INFO', key: 's_audio_source', type: 'string', readonly: true},
    {item: 'update_available', msg: 'SPK_LIST_VIEW_INFO', key: 'b_update', type: 'boolean', readonly: true},

    // FUNC_VIEW_INFO
    {item: 'input', msg: 'FUNC_VIEW_INFO', key: 'i_curr_func', type: 'enum', names: FUNCTIONS},
    {
        item: 'input_list',
        msg: 'FUNC_VIEW_INFO',
        key: 'ai_func_list',
        type: 'enumlist',
        names: FUNCTIONS,
        readonly: true,
    },
    {item: 'bluetooth_name', msg: 'FUNC_VIEW_INFO', key: 's_bt_name', type: 'string', readonly: true},

    // EQ_VIEW_INFO
    {item: 'eq', msg: 'EQ_VIEW_INFO', key: 'i_curr_eq', type: 'enum', names: EQUALISERS},
    {item: 'eq_list', msg: 'EQ_VIEW_INFO', key: 'ai_eq_list', type: 'enumlist', names: EQUALISERS, readonly: true},
    {item: 'bass', msg: 'EQ_VIEW_INFO', key: 'i_bass', type: 'number'},
    {item: 'treble', msg: 'EQ_VIEW_INFO', key: 'i_treble', type: 'number'},

    // SETTING_VIEW_INFO
    {item: 'eq', msg: 'SETTING_VIEW_INFO', key: 'i_curr_eq', type: 'enum', names: EQUALISERS, readonly: true},
    {item: 'night_mode', msg: 'SETTING_VIEW_INFO', key: 'b_night_time', type: 'boolean'},
    {item: 'auto_volume', msg: 'SETTING_VIEW_INFO', key: 'b_auto_vol', type: 'boolean'},
    {item: 'drc', msg: 'SETTING_VIEW_INFO', key: 'b_drc', type: 'boolean'},
    {item: 'auto_power', msg: 'SETTING_VIEW_INFO', key: 'b_auto_power', type: 'boolean'},
    {item: 'tv_remote', msg: 'SETTING_VIEW_INFO', key: 'b_tv_remote', type: 'boolean'},
    {item: 'neuralx', msg: 'SETTING_VIEW_INFO', key: 'b_neuralx', type: 'boolean'},
    {item: 'rear', msg: 'SETTING_VIEW_INFO', key: 'b_rear', type: 'boolean'},
    {item: 'av_sync', msg: 'SETTING_VIEW_INFO', key: 'i_av_sync', type: 'number'},
    ...levels('woofer', 'i_woofer_level', 'i_woofer_min', 'i_woofer_max'),
    ...levels('rear_level', 'i_rear_level', 'i_rear_min', 'i_rear_max'),
    ...levels('top_level', 'i_top_level', 'i_top_min', 'i_top_max'),
    ...levels('center_level', 'i_center_level', 'i_center_min', 'i_center_max'),
    ...levels('side_level', 'i_side_level', 'i_side_min', 'i_side_max'),
    ...levels('dialog_level', 'i_dialog_level', 'i_dialog_min', 'i_dialog_max'),
    {item: 'ip', msg: 'SETTING_VIEW_INFO', key: 's_ipv4_addr', type: 'string', readonly: true},

    // PLAY_INFO
    {item: 'play/state', msg: 'PLAY_INFO', key: 'i_play_ctrl', type: 'number', readonly: true},
    {item: 'play/stream_type', msg: 'PLAY_INFO', key: 'i_stream_type', type: 'number', readonly: true},
    {item: 'play/position', msg: 'PLAY_INFO', key: 'i_position', type: 'number', readonly: true, retain: false},
    {item: 'play/duration', msg: 'PLAY_INFO', key: 'i_duration', type: 'number', readonly: true},
    {item: 'play/title', msg: 'PLAY_INFO', key: 's_title', type: 'string', readonly: true},
    {item: 'play/artist', msg: 'PLAY_INFO', key: 's_artist', type: 'string', readonly: true},
    {item: 'play/album', msg: 'PLAY_INFO', key: 's_album', type: 'string', readonly: true},

    // PRODUCT_INFO / UPDATE_VIEW_INFO
    {item: 'model', msg: 'PRODUCT_INFO', key: 's_model_name', type: 'string', readonly: true},
    {item: 'uuid', msg: 'PRODUCT_INFO', key: 's_uuid', type: 'string', readonly: true},
    {
        item: 'firmware',
        msg: 'UPDATE_VIEW_INFO',
        key: 'o_system_ver',
        type: 'object',
        readonly: true,
        transform: (v) => v && v.s_main,
    },
    {item: 'update_available', msg: 'UPDATE_VIEW_INFO', key: 'b_update', type: 'boolean', readonly: true},
];

/**
 * Speaker level settings. The device reports the level as an offset from `min`
 * (observed on a DS90QY: i_woofer_level 15 with i_woofer_min -15 means 0 dB), so
 * status = raw + min and set sends value - min. Marked with `offset: true`.
 */
function levels(item, key, minKey, maxKey) {
    return [
        {item, msg: 'SETTING_VIEW_INFO', key, type: 'number', range: item, offset: true},
        {item: item + '/min', msg: 'SETTING_VIEW_INFO', key: minKey, type: 'number', readonly: true},
        {item: item + '/max', msg: 'SETTING_VIEW_INFO', key: maxKey, type: 'number', readonly: true},
    ];
}

/** Messages to query on connect. */
const INITIAL_MESSAGES = [
    'PRODUCT_INFO',
    'UPDATE_VIEW_INFO',
    'SPK_LIST_VIEW_INFO',
    'FUNC_VIEW_INFO',
    'EQ_VIEW_INFO',
    'SETTING_VIEW_INFO',
    'PLAY_INFO',
];

const byRaw = new Map(ITEMS.map((entry) => [entry.msg + '/' + entry.key, entry]));
const writable = new Map(ITEMS.filter((entry) => !entry.readonly).map((entry) => [entry.item, entry]));

function indexToName(names, index) {
    return names[index] !== undefined ? names[index] : 'unknown_' + index;
}

function nameToIndex(names, value) {
    if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
    }
    const text = String(value).trim();
    if (/^\d+$/.test(text)) {
        return Number(text);
    }
    const unknown = /^unknown_(\d+)$/i.exec(text);
    if (unknown) {
        return Number(unknown[1]);
    }
    const index = names.findIndex((name) => name.toLowerCase() === text.toLowerCase());
    if (index === -1) {
        throw new Error(`unknown value "${value}"`);
    }
    return index;
}

/**
 * Translate one raw key/value into a friendly status publication.
 * @param {Object<string, {min?: number, max?: number}>} ranges known ranges per item (for offset items)
 * @returns {{item: string, payload: any, retain: boolean} | null}
 */
function statusFor(msg, key, value, ranges = {}) {
    const entry = byRaw.get(msg + '/' + key);
    if (!entry) {
        return null;
    }
    let payload;
    switch (entry.type) {
        case 'enum':
            payload = indexToName(entry.names, value);
            break;
        case 'enumlist':
            payload = Array.isArray(value) ? value.map((v) => indexToName(entry.names, v)) : null;
            break;
        case 'object':
            payload = entry.transform(value);
            break;
        case 'number': {
            const min = entry.offset && ranges[entry.range] && ranges[entry.range].min;
            payload = typeof value === 'number' && typeof min === 'number' ? value + min : value;
            break;
        }
        default:
            payload = value;
    }
    if (payload === null || payload === undefined) {
        return null;
    }
    return {item: entry.item, payload, retain: entry.retain !== false};
}

function toBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    const text = String(value).trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(text)) {
        return true;
    }
    if (['false', '0', 'off', 'no'].includes(text)) {
        return false;
    }
    throw new Error(`not a boolean: "${value}"`);
}

function toNumber(value) {
    const number = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(number)) {
        throw new Error(`not a number: "${value}"`);
    }
    return Math.round(number);
}

/**
 * Translate a friendly set request into a raw command.
 * @param {string} item friendly item name
 * @param {*} value payload as received (already JSON-unwrapped)
 * @param {Object<string, {min?: number, max?: number}>} ranges known ranges per item
 * @returns {{msg: string, data: object}}
 * @throws {Error} for unknown items or invalid values
 */
function commandFor(item, value, ranges = {}) {
    const entry = writable.get(item);
    if (!entry) {
        throw new Error(byRaw.size && [...byRaw.values()].some((e) => e.item === item) ? 'read-only' : 'unknown item');
    }
    let raw;
    switch (entry.type) {
        case 'boolean':
            raw = toBoolean(value);
            break;
        case 'number': {
            raw = toNumber(value);
            const range = entry.range && ranges[entry.range];
            if (range) {
                if (range.min !== undefined && raw < range.min) {
                    throw new Error(`${raw} below minimum ${range.min}`);
                }
                if (range.max !== undefined && raw > range.max) {
                    throw new Error(`${raw} above maximum ${range.max}`);
                }
                if (entry.offset && typeof range.min === 'number') {
                    raw -= range.min;
                }
            }
            break;
        }
        case 'enum':
            raw = nameToIndex(entry.names, value);
            break;
        default:
            raw = String(value);
    }
    return {msg: entry.msg, data: {[entry.key]: raw}};
}

/** Item name a raw key contributes a range bound to, e.g. ('SPK_LIST_VIEW_INFO','i_vol_min') → {item:'volume', bound:'min'} */
function rangeBoundFor(msg, key) {
    const entry = byRaw.get(msg + '/' + key);
    if (!entry) {
        return null;
    }
    const match = /^(.+)\/(min|max)$/.exec(entry.item);
    return match ? {item: match[1], bound: match[2]} : null;
}

module.exports = {
    ITEMS,
    FUNCTIONS,
    EQUALISERS,
    INITIAL_MESSAGES,
    statusFor,
    commandFor,
    rangeBoundFor,
    indexToName,
    nameToIndex,
};
