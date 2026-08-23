import {parseConfig} from 'mqtt-interfaces-core';
import pkg from './package.json' with {type: 'json'};

export const OPTIONS = {
    address: {
        alias: 'a',
        type: 'string',
        describe: 'soundbar address (ip or hostname)',
        demandOption: true,
    },
    port: {
        type: 'number',
        describe: 'soundbar control port',
        default: 9741,
    },
    'publish-raw': {
        type: 'boolean',
        describe: 'additionally publish every raw protocol field as <name>/status/<MSG>/<key>',
        default: false,
    },
    'raw-set': {
        type: 'boolean',
        describe: 'accept raw protocol sets on <name>/set/<MSG>/<key> (unrestricted device access!)',
        default: false,
    },
};

export default parseConfig({
    pkg,
    options: OPTIONS,
    defaults: {name: 'soundbar'},
    examples: [
        ['$0 -a 192.168.1.50 -u mqtt://broker', 'run in the foreground'],
        ['sudo $0 --install -n soundbar -a 192.168.1.50 -u mqtt://broker', 'install as service lgsb2mqtt@soundbar'],
    ],
});
