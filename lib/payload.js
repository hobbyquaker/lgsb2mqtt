/**
 * MQTT payload helpers (mqtt-smarthome conventions).
 */

/**
 * Converts an incoming MQTT payload string to a JS value.
 * Accepts plain values (numbers, booleans, strings) and mqtt-smarthome style JSON {val: ...}.
 * @returns {*} the value, or undefined for empty payloads
 */
function parsePayload(payload) {
    const trimmed = String(payload).trim();
    if (trimmed === '') {
        return undefined;
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'val' in parsed) {
                return parsed.val;
            }
            return parsed;
        } catch {
            // not JSON, fall through and treat as string
        }
    }
    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return Number(trimmed);
    }
    return String(payload);
}

/**
 * Remembers the last value per item and produces outgoing status payloads,
 * either plain or as {val, ts, lc} JSON.
 */
class StatusTracker {
    /**
     * @param {object} options
     * @param {boolean} [options.json] emit {val, ts, lc} objects instead of plain values
     * @param {() => number} [options.now] clock, for tests
     */
    constructor({json = false, now = Date.now} = {}) {
        this.json = json;
        this.now = now;
        this.state = new Map();
    }

    /** Last known value of an item (undefined if never seen). */
    get(item) {
        const entry = this.state.get(item);
        return entry && entry.val;
    }

    /**
     * Record a new value and return what to publish.
     * @returns {{payload: *, changed: boolean}}
     */
    update(item, val) {
        const ts = this.now();
        const previous = this.state.get(item);
        const changed = !previous || JSON.stringify(previous.val) !== JSON.stringify(val);
        const lc = changed ? ts : previous.lc;
        this.state.set(item, {val, ts, lc});
        return {payload: this.json ? {val, ts, lc} : val, changed};
    }
}

module.exports = {parsePayload, StatusTracker};
