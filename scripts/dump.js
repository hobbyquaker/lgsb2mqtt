#!/usr/bin/env node
// Read-only protocol exploration: queries known info messages and prints the
// raw responses, then listens for unsolicited messages.
// Usage: node scripts/dump.js <address> [listen-seconds]

const LgSoundbar = require('../lib/soundbar.js');

const address = process.argv[2];
const listenSeconds = Number(process.argv[3] || 20);
if (!address) {
    console.error('usage: dump.js <address> [listen-seconds]');
    process.exit(1);
}

const MESSAGES = [
    'SPK_LIST_VIEW_INFO',
    'FUNC_VIEW_INFO',
    'EQ_VIEW_INFO',
    'SETTING_VIEW_INFO',
    'PLAY_INFO',
    'PRODUCT_INFO',
    'C4A_SETTING_INFO',
    'RADIO_VIEW_INFO',
    'AP_SETTING_INFO',
    'SHARE_AP_SETTING_INFO',
    'UPDATE_VIEW_INFO',
    'BUILD_INFO_DEV',
    'OPTION_INFO_DEV',
    'MAC_INFO_DEV',
    'MEM_MON_DEV',
    'TEST_DEV',
    'TEST_TONE_REQ',
];

const device = new LgSoundbar(address, {responseTimeout: 2000, log: {debug() {}, warn: console.warn}});

device.on('receive', (message) => {
    console.log('UNSOLICITED', JSON.stringify(message));
});
device.on('socketerror', (error) => console.error('socket error', error.message));
device.on('disconnect', () => console.error('disconnected'));

device.on('connect', async () => {
    console.error('connected to', address);
    for (const msg of MESSAGES) {
        try {
            const response = await device.get(msg);
            console.log('GET', msg, JSON.stringify(response));
        } catch (error) {
            console.log('GET', msg, 'ERROR', error.message);
        }
    }
    console.error(`listening for unsolicited messages for ${listenSeconds}s ...`);
    setTimeout(() => {
        device.disconnect();
        process.exit(0);
    }, listenSeconds * 1000);
});

device.connect();
