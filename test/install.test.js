const {test, describe} = require('node:test');
const assert = require('node:assert/strict');

const {unitFile, envFile, envVarName, instanceName} = require('../lib/install.js');

describe('envFile', () => {
    test('writes only set options as LGSB2MQTT_* variables, never the name', () => {
        const out = envFile({
            name: 'soundbar',
            address: '192.168.1.50',
            mqttUrl: 'mqtt://broker',
            jsonPayloads: false,
            haDiscovery: true,
            haPrefix: 'homeassistant',
            publishRaw: undefined,
            verbosity: 'info',
        });
        assert.match(out, /^LGSB2MQTT_ADDRESS=192\.168\.1\.50$/m);
        assert.match(out, /^LGSB2MQTT_MQTT_URL=mqtt:\/\/broker$/m);
        assert.match(out, /^LGSB2MQTT_JSON_PAYLOADS=false$/m);
        assert.match(out, /^LGSB2MQTT_HA_DISCOVERY=true$/m);
        assert.match(out, /^LGSB2MQTT_HA_PREFIX=homeassistant$/m);
        assert.match(out, /^LGSB2MQTT_VERBOSITY=info$/m);
        assert.doesNotMatch(out, /LGSB2MQTT_NAME|PUBLISH_RAW/);
        assert.match(out, /lgsb2mqtt@soundbar\.service/);
    });
});

describe('unitFile', () => {
    test('is a template unit with per-instance env file and name', () => {
        const unit = unitFile('/usr/bin/node /usr/local/lib/node_modules/lgsb2mqtt/index.js');
        assert.match(unit, /^ExecStart=\/usr\/bin\/node \/usr\/local\/lib\/node_modules\/lgsb2mqtt\/index\.js$/m);
        assert.match(unit, /^EnvironmentFile=\/etc\/lgsb2mqtt\/%i\.env$/m);
        assert.match(unit, /^Environment=LGSB2MQTT_NAME=%i$/m);
        assert.match(unit, /^User=lgsb2mqtt$/m);
        assert.match(unit, /^SyslogIdentifier=lgsb2mqtt@%i$/m);
        assert.match(unit, /^Restart=on-failure$/m);
        assert.match(unit, /^WantedBy=multi-user\.target$/m);
    });
});

describe('helpers', () => {
    test('envVarName maps camelCase options', () => {
        assert.equal(envVarName('address'), 'LGSB2MQTT_ADDRESS');
        assert.equal(envVarName('mqttUrl'), 'LGSB2MQTT_MQTT_URL');
        assert.equal(envVarName('haDiscovery'), 'LGSB2MQTT_HA_DISCOVERY');
    });

    test('instanceName rejects names systemd or the topic scheme cannot take', () => {
        assert.equal(instanceName('soundbar'), 'soundbar');
        assert.equal(instanceName('sb-living_room.1'), 'sb-living_room.1');
        assert.throws(() => instanceName('living room'));
        assert.throws(() => instanceName('a/b'));
        assert.throws(() => instanceName(''));
    });
});
