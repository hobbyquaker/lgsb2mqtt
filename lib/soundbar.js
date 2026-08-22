/**
 * LG soundbar TCP control protocol ("temescal").
 *
 * Wire format: 1 byte 0x10, 4 byte big-endian payload length, payload = AES-256-CBC
 * encrypted JSON. Some firmwares answer with plaintext JSON (no header).
 *
 * Messages are JSON objects {cmd, msg, data?, result?}. Requests use cmd "get"/"set",
 * responses come back with cmd "notibyget"/"notibyset" and the same msg; unsolicited
 * state changes arrive with other cmds and are emitted as 'receive'.
 *
 * Formerly published as the separate npm module `lg-soundbar`.
 */

const net = require('node:net');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');

const HEADER_LENGTH = 5;
const HEADER_MAGIC = 0x10;
const CIPHER = 'aes-256-cbc';
const IV = "'%^Ur7gy$~t+f)%@";
const KEY = 'T^&*J%^7tr~4^%^&I(o%^!jIJ__+a0 k';

const DEFAULTS = {
    port: 9741,
    responseTimeout: 1000,
    reconnectMin: 1000,
    reconnectMax: 30000,
    suppressDuplicateTimeout: 1000,
    log: {debug() {}, warn() {}},
};

function encrypt(text) {
    const cipher = crypto.createCipheriv(CIPHER, KEY, IV);
    return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
}

function decrypt(buffer) {
    const decipher = crypto.createDecipheriv(CIPHER, KEY, IV);
    return Buffer.concat([decipher.update(buffer), decipher.final()]).toString('utf8');
}

function createPacket(payload) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const encrypted = encrypt(text);
    const header = Buffer.alloc(HEADER_LENGTH);
    header[0] = HEADER_MAGIC;
    header.writeUInt32BE(encrypted.length, 1);
    return Buffer.concat([header, encrypted]);
}

/**
 * Incremental frame parser. Feed it chunks, get back complete decrypted JSON strings.
 * Handles multiple frames per chunk and frames split across chunks.
 */
class Framer {
    constructor() {
        this.buffer = Buffer.alloc(0);
    }

    /**
     * @param {Buffer} chunk
     * @returns {string[]} complete messages (JSON text, not yet parsed)
     */
    push(chunk) {
        this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
        const messages = [];

        for (;;) {
            if (this.buffer.length === 0) {
                break;
            }

            if (this.buffer[0] !== HEADER_MAGIC) {
                // plaintext JSON: consume until the next header byte or end of buffer
                const next = this.buffer.indexOf(HEADER_MAGIC);
                const end = next === -1 ? this.buffer.length : next;
                const text = this.buffer.subarray(0, end).toString('utf8').trim();
                this.buffer = this.buffer.subarray(end);
                if (text) {
                    messages.push(text);
                }
                continue;
            }

            if (this.buffer.length < HEADER_LENGTH) {
                break;
            }
            const length = this.buffer.readUInt32BE(1);
            if (this.buffer.length < HEADER_LENGTH + length) {
                break;
            }
            const body = this.buffer.subarray(HEADER_LENGTH, HEADER_LENGTH + length);
            this.buffer = this.buffer.subarray(HEADER_LENGTH + length);
            try {
                messages.push(decrypt(body));
            } catch (error) {
                messages.push({error});
            }
        }

        return messages;
    }

    reset() {
        this.buffer = Buffer.alloc(0);
    }
}

class ResponseError extends Error {
    constructor(message, response) {
        super(message);
        this.name = 'ResponseError';
        this.response = response;
    }
}

class TimeoutError extends Error {
    constructor(cmd, msg) {
        super(`no response to ${cmd} ${msg}`);
        this.name = 'TimeoutError';
        this.cmd = cmd;
        this.msg = msg;
    }
}

/**
 * Events:
 *  - 'connect'
 *  - 'disconnect'
 *  - 'socketerror' (error)   — connection problems; reconnect is handled internally
 *  - 'receive' (message)     — unsolicited messages
 */
class LgSoundbar extends EventEmitter {
    constructor(address, options = {}) {
        super();
        this.address = address;
        this.options = {...DEFAULTS, ...options};
        this.log = this.options.log;
        this.connected = false;
        this._socket = null;
        this._framer = new Framer();
        this._pending = [];
        this._reconnectDelay = this.options.reconnectMin;
        this._reconnectTimer = null;
        this._closing = false;
        this._lastMessage = null;
        this._lastMessageTimer = null;
    }

    connect() {
        if (this._socket) {
            return;
        }
        this._closing = false;
        this.log.debug('lgsb connecting', this.address);

        const socket = new net.Socket();
        this._socket = socket;
        this._framer.reset();

        socket.setNoDelay(true);
        socket.setKeepAlive(true, 10000);

        socket.on('connect', () => {
            this.connected = true;
            this._reconnectDelay = this.options.reconnectMin;
            this.emit('connect');
        });

        socket.on('data', (chunk) => this._onData(chunk));

        socket.on('error', (error) => {
            this.emit('socketerror', error);
        });

        socket.on('close', () => {
            if (this._socket !== socket) {
                return;
            }
            this._socket = null;
            this._rejectPending(new Error('connection closed'));
            if (this.connected) {
                this.connected = false;
                this.emit('disconnect');
            }
            this._scheduleReconnect();
        });

        socket.connect(this.options.port, this.address);
    }

    disconnect() {
        this._closing = true;
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
        const socket = this._socket;
        this._socket = null;
        this._rejectPending(new Error('disconnected'));
        if (socket) {
            socket.destroy();
        }
        if (this.connected) {
            this.connected = false;
            this.emit('disconnect');
        }
    }

    get(msg) {
        return this._request('get', msg);
    }

    set(msg, data) {
        return this._request('set', msg, data);
    }

    _request(cmd, msg, data) {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this._socket) {
                reject(new Error('not connected'));
                return;
            }
            const entry = {cmd: 'notiby' + cmd, msg, resolve, reject, timer: null};
            entry.timer = setTimeout(() => {
                this._pending = this._pending.filter((p) => p !== entry);
                reject(new TimeoutError(cmd, msg));
            }, this.options.responseTimeout);
            this._pending.push(entry);

            const packet = {cmd, msg};
            if (data !== undefined) {
                packet.data = data;
            }
            this._socket.write(createPacket(packet));
        });
    }

    _rejectPending(error) {
        const pending = this._pending;
        this._pending = [];
        for (const entry of pending) {
            clearTimeout(entry.timer);
            entry.reject(error);
        }
    }

    _scheduleReconnect() {
        if (this._closing || this._reconnectTimer) {
            return;
        }
        const delay = this._reconnectDelay;
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, this.options.reconnectMax);
        this.log.debug('lgsb reconnect in', delay, 'ms');
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connect();
        }, delay);
    }

    _onData(chunk) {
        for (const item of this._framer.push(chunk)) {
            if (typeof item !== 'string') {
                this.log.warn('lgsb rx decryption error', item.error.message);
                continue;
            }
            let message;
            try {
                message = JSON.parse(item);
            } catch {
                this.log.warn('lgsb rx invalid json', item.slice(0, 80));
                continue;
            }
            this._dispatch(message, item);
        }
    }

    _dispatch(message, raw) {
        const index = this._pending.findIndex((p) => p.cmd === message.cmd && p.msg === message.msg);
        if (index !== -1) {
            const [entry] = this._pending.splice(index, 1);
            clearTimeout(entry.timer);
            if (message.result === 'ok') {
                entry.resolve(message);
            } else {
                entry.reject(new ResponseError(`${message.cmd} ${message.msg}: ${message.result}`, message));
            }
            return;
        }

        if (this.options.suppressDuplicateTimeout > 0) {
            if (raw === this._lastMessage) {
                return;
            }
            this._lastMessage = raw;
            clearTimeout(this._lastMessageTimer);
            this._lastMessageTimer = setTimeout(() => {
                this._lastMessage = null;
            }, this.options.suppressDuplicateTimeout);
            this._lastMessageTimer.unref();
        }

        this.emit('receive', message);
    }
}

module.exports = LgSoundbar;
module.exports.LgSoundbar = LgSoundbar;
module.exports.Framer = Framer;
module.exports.ResponseError = ResponseError;
module.exports.TimeoutError = TimeoutError;
module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;
module.exports.createPacket = createPacket;
