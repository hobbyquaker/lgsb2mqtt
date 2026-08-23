import {test, describe, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';

import LgSoundbar, {Framer, createPacket, encrypt, decrypt, TimeoutError, ResponseError} from '../lib/soundbar.js';

describe('packet encoding', () => {
    test('encrypt/decrypt round trip', () => {
        const text = JSON.stringify({cmd: 'get', msg: 'SPK_LIST_VIEW_INFO'});
        assert.equal(decrypt(encrypt(text)), text);
    });

    test('createPacket writes header and length', () => {
        const packet = createPacket({cmd: 'get', msg: 'X'});
        assert.equal(packet[0], 0x10);
        assert.equal(packet.readUInt32BE(1), packet.length - 5);
        assert.equal(decrypt(packet.subarray(5)), '{"cmd":"get","msg":"X"}');
    });
});

describe('Framer', () => {
    const msgA = JSON.stringify({cmd: 'a'});
    const msgB = JSON.stringify({cmd: 'b', data: {x: 'y'.repeat(100)}});

    test('single complete frame', () => {
        const framer = new Framer();
        assert.deepEqual(framer.push(createPacket(msgA)), [msgA]);
    });

    test('two frames in one chunk', () => {
        const framer = new Framer();
        const chunk = Buffer.concat([createPacket(msgA), createPacket(msgB)]);
        assert.deepEqual(framer.push(chunk), [msgA, msgB]);
    });

    test('frame split across chunks, byte by byte', () => {
        const framer = new Framer();
        const packet = createPacket(msgB);
        const out = [];
        for (const byte of packet) {
            out.push(...framer.push(Buffer.from([byte])));
        }
        assert.deepEqual(out, [msgB]);
        assert.equal(framer.buffer.length, 0);
    });

    test('split in the middle of the header', () => {
        const framer = new Framer();
        const packet = createPacket(msgA);
        assert.deepEqual(framer.push(packet.subarray(0, 3)), []);
        assert.deepEqual(framer.push(packet.subarray(3)), [msgA]);
    });

    test('plaintext json passthrough', () => {
        const framer = new Framer();
        assert.deepEqual(framer.push(Buffer.from(msgA)), [msgA]);
    });

    test('plaintext followed by an encrypted frame', () => {
        const framer = new Framer();
        const chunk = Buffer.concat([Buffer.from(msgA), createPacket(msgB)]);
        assert.deepEqual(framer.push(chunk), [msgA, msgB]);
    });

    test('corrupt ciphertext yields an error item, stream recovers', () => {
        const framer = new Framer();
        const bad = createPacket(msgA);
        bad[bad.length - 1] ^= 0xff;
        const out = framer.push(Buffer.concat([bad, createPacket(msgB)]));
        assert.equal(out.length, 2);
        assert.ok(out[0].error instanceof Error);
        assert.equal(out[1], msgB);
    });
});

describe('LgSoundbar against a fake device', () => {
    let server;
    let sockets = [];
    let devices = [];

    /**
     * Fake soundbar: answers get/set with notibyget/notibyset. `handler` can override.
     */
    function startServer(handler) {
        return new Promise((resolve) => {
            server = net.createServer((socket) => {
                sockets.push(socket);
                const framer = new Framer();
                socket.on('data', (chunk) => {
                    for (const text of framer.push(chunk)) {
                        const req = JSON.parse(text);
                        const reply = handler ? handler(req, socket) : null;
                        if (reply === false) {
                            continue;
                        }
                        const response = reply || {
                            cmd: 'notiby' + req.cmd,
                            msg: req.msg,
                            result: 'ok',
                            data: req.data || {i_vol: 5},
                        };
                        socket.write(createPacket(response));
                    }
                });
            });
            server.listen(0, '127.0.0.1', () => resolve(server.address().port));
        });
    }

    function createDevice(port, options) {
        const device = new LgSoundbar('127.0.0.1', {port, responseTimeout: 200, reconnectMin: 50, ...options});
        devices.push(device);
        return device;
    }

    function once(emitter, event) {
        return new Promise((resolve) => emitter.once(event, resolve));
    }

    /** Connects the device and waits until the server has registered the socket too. */
    async function connectDevice(device) {
        const count = sockets.length;
        const connected = once(device, 'connect');
        device.connect();
        await connected;
        while (sockets.length <= count) {
            await sleep(5);
        }
        return sockets[sockets.length - 1];
    }

    afterEach(async () => {
        for (const device of devices) {
            device.disconnect();
        }
        devices = [];
        for (const socket of sockets) {
            socket.destroy();
        }
        sockets = [];
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            server = null;
        }
    });

    test('connect, get, set', async () => {
        const port = await startServer();
        const device = createDevice(port);
        await connectDevice(device);
        assert.equal(device.connected, true);

        const got = await device.get('SPK_LIST_VIEW_INFO');
        assert.equal(got.cmd, 'notibyget');
        assert.deepEqual(got.data, {i_vol: 5});

        const set = await device.set('SPK_LIST_VIEW_INFO', {i_vol: 9});
        assert.equal(set.cmd, 'notibyset');
        assert.deepEqual(set.data, {i_vol: 9});
    });

    test('unsolicited messages are emitted as receive, duplicates suppressed', async () => {
        const port = await startServer();
        const device = createDevice(port);
        const socket = await connectDevice(device);

        const received = [];
        device.on('receive', (m) => received.push(m));
        const packet = createPacket({cmd: 'notibyset', msg: 'FUNC_VIEW_INFO', result: 'ok', data: {i_curr_func: 4}});
        socket.write(Buffer.concat([packet, packet]));
        await sleep(50);
        assert.equal(received.length, 1);
        assert.deepEqual(received[0].data, {i_curr_func: 4});
    });

    test('unsolicited messages are not swallowed by pending requests with another msg', async () => {
        const port = await startServer((req, socket) => {
            socket.write(createPacket({cmd: 'notibyget', msg: 'OTHER', result: 'ok', data: {}}));
            return null;
        });
        const device = createDevice(port);
        await connectDevice(device);
        const received = [];
        device.on('receive', (m) => received.push(m));
        await device.get('SPK_LIST_VIEW_INFO');
        assert.equal(received.length, 1);
        assert.equal(received[0].msg, 'OTHER');
    });

    test('timeout rejects with TimeoutError and clears pending', async () => {
        const port = await startServer(() => false);
        const device = createDevice(port);
        await connectDevice(device);
        await assert.rejects(device.get('SPK_LIST_VIEW_INFO'), TimeoutError);
        assert.equal(device._pending.length, 0);
    });

    test('result != ok rejects with ResponseError', async () => {
        const port = await startServer((req) => ({cmd: 'notiby' + req.cmd, msg: req.msg, result: 'fail'}));
        const device = createDevice(port);
        await connectDevice(device);
        await assert.rejects(device.set('X', {}), (error) => {
            assert.ok(error instanceof ResponseError);
            assert.equal(error.response.result, 'fail');
            return true;
        });
    });

    test('requests while disconnected reject immediately', async () => {
        const device = createDevice(1);
        await assert.rejects(device.get('X'), /not connected/);
    });

    test('disconnect event and reconnect with backoff', async () => {
        const port = await startServer();
        const device = createDevice(port);
        const socket = await connectDevice(device);

        const disconnected = once(device, 'disconnect');
        const reconnected = once(device, 'connect');
        socket.destroy();
        await disconnected;
        assert.equal(device.connected, false);
        await reconnected;
        assert.equal(device.connected, true);
        assert.equal(device._reconnectDelay, 50, 'delay resets after successful connect');
    });

    test('pending requests reject when the connection drops', async () => {
        const port = await startServer(() => false);
        const device = createDevice(port, {responseTimeout: 5000});
        const socket = await connectDevice(device);
        const request = device.get('X');
        socket.destroy();
        await assert.rejects(request, /connection closed/);
    });

    test('disconnect() stops reconnecting', async () => {
        const port = await startServer();
        const device = createDevice(port);
        await connectDevice(device);
        device.disconnect();
        assert.equal(device.connected, false);
        await sleep(150);
        assert.equal(device._socket, null);
        assert.equal(sockets.length, 1);
    });
});
