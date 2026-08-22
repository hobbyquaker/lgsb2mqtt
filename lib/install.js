'use strict';

/**
 * --install / --uninstall: run lgsb2mqtt as a systemd template service, one instance per soundbar.
 *
 *   lgsb2mqtt@<name>.service      instance = --name (= mqtt topic prefix)
 *   /etc/lgsb2mqtt/<name>.env     per-instance config (LGSB2MQTT_* variables)
 *   system user lgsb2mqtt         shared by all instances
 *
 * Same layout as lgtv2mqtt.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const SERVICE = 'lgsb2mqtt';
const UNIT_PATH = `/etc/systemd/system/${SERVICE}@.service`;
const CONF_DIR = `/etc/${SERVICE}`;

// options that are written to the env file (everything except --name, which is the instance)
const ENV_OPTIONS = ['address', 'mqttUrl', 'jsonPayloads', 'haDiscovery', 'haPrefix', 'publishRaw', 'verbosity'];

function run(cmd, args) {
    return execFileSync(cmd, args, {stdio: ['ignore', 'pipe', 'inherit']})
        .toString()
        .trim();
}

function envVarName(option) {
    return 'LGSB2MQTT_' + option.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase();
}

function instanceName(name) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
        throw new Error(`--name "${name}" cannot be used as systemd instance name (allowed: letters, digits, _ . -)`);
    }
    return name;
}

function envPath(name) {
    return path.join(CONF_DIR, `${name}.env`);
}

function unitName(name) {
    return `${SERVICE}@${name}.service`;
}

function unitFile(execStart) {
    return `[Unit]
Description=lgsb2mqtt %i - LG soundbar to MQTT bridge
Documentation=https://github.com/hobbyquaker/lgsb2mqtt
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${CONF_DIR}/%i.env
Environment=LGSB2MQTT_NAME=%i
ExecStart=${execStart}
Restart=on-failure
RestartSec=10
SyslogIdentifier=${SERVICE}@%i
User=${SERVICE}
Group=${SERVICE}
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;
}

/** Build the env file content from the parsed CLI options. */
function envFile(argv) {
    const lines = [
        `# lgsb2mqtt instance "${argv.name}" - read by ${unitName(argv.name)}.`,
        `# Edit and run: systemctl restart ${unitName(argv.name)}`,
    ];
    for (const option of ENV_OPTIONS) {
        const value = argv[option];
        if (value === undefined || value === null || value === '') {
            continue;
        }
        lines.push(`${envVarName(option)}=${String(value).replace(/\n/g, ' ')}`);
    }
    return lines.join('\n') + '\n';
}

function installedInstances() {
    if (!fs.existsSync(CONF_DIR)) {
        return [];
    }
    return fs
        .readdirSync(CONF_DIR)
        .filter((f) => f.endsWith('.env'))
        .map((f) => f.slice(0, -4));
}

function requireRoot(option) {
    if (os.platform() !== 'linux') {
        throw new Error(`${option} is only supported on Linux with systemd`);
    }
    if (typeof process.getuid === 'function' && process.getuid() !== 0) {
        throw new Error(`${option} must run as root, e.g. sudo lgsb2mqtt ${option} --name <name> ...`);
    }
    if (!fs.existsSync('/run/systemd/system')) {
        throw new Error('systemd is not running on this system');
    }
}

/**
 * Install the instance `argv.name` as systemd service using the other CLI options as its
 * configuration, then enable and start it. Must run as root.
 */
function installService(argv, log) {
    requireRoot('--install');
    if (!argv.address) {
        throw new Error('--install needs --address');
    }
    const name = instanceName(argv.name);
    const execStart = `${process.execPath} ${fs.realpathSync(process.argv[1])}`;

    // shared system user
    try {
        run('id', ['-u', SERVICE]);
    } catch {
        log(`creating system user ${SERVICE}`);
        run('useradd', ['--system', '--no-create-home', '--shell', '/usr/sbin/nologin', SERVICE]);
    }

    // config
    fs.mkdirSync(CONF_DIR, {recursive: true, mode: 0o750});
    const conf = envPath(name);
    if (fs.existsSync(conf)) {
        fs.copyFileSync(conf, conf + '.bak');
        log(`existing ${conf} backed up to ${conf}.bak`);
    }
    fs.writeFileSync(conf, envFile(argv), {mode: 0o640});
    run('chown', ['-R', `root:${SERVICE}`, CONF_DIR]);
    log(`wrote ${conf}`);

    // template unit (shared by all instances, rewritten so ExecStart follows node/package updates)
    fs.writeFileSync(UNIT_PATH, unitFile(execStart), {mode: 0o644});
    log(`wrote ${UNIT_PATH} (ExecStart=${execStart})`);

    run('systemctl', ['daemon-reload']);
    run('systemctl', ['enable', '--now', unitName(name)]);
    const others = installedInstances().filter((i) => i !== name);
    if (others.length > 0) {
        log(`other instances: ${others.map(unitName).join(', ')}`);
    }
    log(`${unitName(name)} enabled and started. logs: journalctl -u ${unitName(name)} -f`);
}

/** Stop, disable and remove the instance `argv.name`; remove the template when it was the last one. */
function uninstallService(argv, log) {
    requireRoot('--uninstall');
    const name = instanceName(argv.name);
    const unit = unitName(name);

    try {
        run('systemctl', ['disable', '--now', unit]);
    } catch {
        // not installed
    }
    const conf = envPath(name);
    if (fs.existsSync(conf)) {
        fs.rmSync(conf);
        log(`removed ${conf}`);
    }
    const remaining = installedInstances();
    if (remaining.length === 0 && fs.existsSync(UNIT_PATH)) {
        fs.rmSync(UNIT_PATH);
        log(`removed ${UNIT_PATH} (no instances left)`);
    }
    run('systemctl', ['daemon-reload']);
    log(`${unit} removed.`);
    if (remaining.length > 0) {
        log(`remaining instances: ${remaining.map(unitName).join(', ')}`);
    }
}

module.exports = {installService, uninstallService, unitFile, envFile, envVarName, instanceName, SERVICE};
