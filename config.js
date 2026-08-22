const pkg = require('./package.json');

module.exports = require('yargs')
    .usage('Usage: $0 [options]')
    .env('LGSB2MQTT')
    .option('address', {
        alias: 'a',
        type: 'string',
        describe: 'soundbar address (ip or hostname)',
    })
    .option('mqtt-url', {
        alias: ['u', 'url'],
        type: 'string',
        describe: 'mqtt broker url',
        default: 'mqtt://localhost',
    })
    .option('name', {
        alias: 'n',
        type: 'string',
        describe: 'instance name. used as mqtt client id and as prefix for topics',
        default: 'soundbar',
    })
    .option('json-payloads', {
        type: 'boolean',
        describe: 'publish status as JSON {"val": ..., "ts": ..., "lc": ...} instead of plain values',
        default: false,
    })
    .option('ha-discovery', {
        type: 'boolean',
        describe: 'publish Home Assistant MQTT discovery (use --no-ha-discovery to disable and clear)',
        default: true,
    })
    .option('ha-prefix', {
        type: 'string',
        describe: 'Home Assistant discovery prefix',
        default: 'homeassistant',
    })
    .option('publish-raw', {
        type: 'boolean',
        describe: 'additionally publish raw protocol messages as status/<MSG>/<key>',
        default: false,
    })
    .option('verbosity', {
        alias: 'v',
        type: 'string',
        describe: 'log level',
        choices: ['error', 'warn', 'info', 'debug'],
        default: 'info',
    })
    .option('install', {
        type: 'boolean',
        describe:
            'install as systemd service lgsb2mqtt@<name> using the other options as its config, enable and start it. needs root',
    })
    .option('uninstall', {
        type: 'boolean',
        describe: 'stop, disable and remove the systemd service lgsb2mqtt@<name>. needs root',
    })
    .check((argv) => {
        if (!argv.address && !argv.uninstall) {
            throw new Error('Missing required argument: address');
        }
        return true;
    })
    .example('$0 -a 192.168.1.50 -u mqtt://broker', 'run in the foreground')
    .example('sudo $0 --install -n soundbar -a 192.168.1.50 -u mqtt://broker', 'install as service lgsb2mqtt@soundbar')
    .epilog(
        'Every option can also be set via environment variable, e.g. LGSB2MQTT_ADDRESS, LGSB2MQTT_MQTT_URL.\n' +
            pkg.homepage,
    )
    .version()
    .help('help')
    .alias('h', 'help')
    .strict().argv;
