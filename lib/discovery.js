/**
 * Finding soundbars on the network (core B-2).
 *
 * LG soundbars have Chromecast built in, so they answer a DNS-SD browse for `_googlecast._tcp`
 * — but so does every Chromecast, Google speaker and Android TV on the network. What makes it an
 * LG soundbar is the temescal control port (9741, `--port`): the core probes it on every
 * candidate and drops the ones that do not answer.
 *
 * The Chromecast TXT record carries the labels worth showing: `fn` is the friendly name the user
 * gave the device ("Wohnzimmer"), `md` the model ("LG S95QR"). The mDNS instance name is a bare
 * uuid, so those two are lifted into `name` and `model` for the `--discover` output.
 */

export const CAST_SERVICE = '_googlecast._tcp';
export const DEFAULT_PORT = 9741;

/**
 * The hint `--discover` and `--address auto` scan with.
 * @param {{port?: number}} [options] the control port (`--port`)
 */
export function discoveryHint({port = DEFAULT_PORT} = {}) {
    return {
        mdns: {service: CAST_SERVICE},
        ports: {control: port},
        // no i/o: the port probe above is the proof, this only picks the readable labels
        probe: (address, entry) => labels(entry),
    };
}

/**
 * The friendly name and model of a Chromecast answer, if it has them.
 * @param {{txt?: object, name?: string}} entry
 * @returns {{name?: string, model?: string}}
 */
export function labels(entry = {}) {
    const txt = entry.txt || {};
    const out = {};
    if (typeof txt.fn === 'string' && txt.fn) {
        out.name = txt.fn;
    }
    if (typeof txt.md === 'string' && txt.md) {
        out.model = txt.md;
    }
    return out;
}
