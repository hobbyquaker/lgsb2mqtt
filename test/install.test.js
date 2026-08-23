import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {unitFile, envFile, envVarName, instanceName} from '../lib/install.js';
import {SHARED_OPTIONS} from 'mqtt-interfaces-core';

// config.js parses the command line at import time and --address is mandatory
process.env.LGSB2MQTT_ADDRESS = '192.168.1.50';
const {OPTIONS} = await import('../config.js');

describe('install', () => {
    test('unit is the shared template layout', () => {
        const unit = unitFile('/usr/bin/node /usr/local/lib/node_modules/lgsb2mqtt/index.js');
        assert.match(unit, /^Description=lgsb2mqtt %i - LG soundbar to MQTT bridge$/m);
        assert.match(unit, /^EnvironmentFile=-\/etc\/mqtt-interfaces\/broker\.env$/m);
        assert.match(unit, /^EnvironmentFile=\/etc\/lgsb2mqtt\/%i\.env$/m);
        assert.match(unit, /^Environment=LGSB2MQTT_NAME=%i$/m);
        assert.match(unit, /^SyslogIdentifier=lgsb2mqtt@%i$/m);
        assert.match(unit, /^StateDirectory=lgsb2mqtt\/%i$/m);
        assert.match(unit, /^Restart=always$/m);
        assert.match(unit, /^User=lgsb2mqtt$/m);
    });

    test('env file carries the set options as LGSB2MQTT_* variables, never the name', () => {
        const argv = {
            name: 'soundbar',
            address: '192.168.1.50',
            port: 9741,
            mqttUrl: 'mqtt://broker',
            publishRaw: false,
            rawSet: undefined,
        };
        Object.defineProperty(argv, '$options', {value: {...OPTIONS, ...SHARED_OPTIONS}});
        const out = envFile(argv);
        assert.match(out, /^LGSB2MQTT_ADDRESS=192\.168\.1\.50$/m);
        assert.match(out, /^LGSB2MQTT_PORT=9741$/m);
        assert.match(out, /^LGSB2MQTT_MQTT_URL=mqtt:\/\/broker$/m);
        assert.match(out, /^LGSB2MQTT_PUBLISH_RAW=false$/m);
        assert.doesNotMatch(out, /LGSB2MQTT_NAME|RAW_SET/);
        assert.match(out, /lgsb2mqtt@soundbar\.service/);
    });

    test('helpers', () => {
        assert.equal(envVarName('mqttUrl', 'LGSB2MQTT'), 'LGSB2MQTT_MQTT_URL');
        assert.equal(instanceName('sb-living'), 'sb-living');
        assert.throws(() => instanceName('living room'), /instance name/);
    });
});
