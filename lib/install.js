/**
 * --install / --uninstall: systemd template service lgsb2mqtt@<name>, one instance per soundbar
 * (mqtt-interfaces-core installer): /etc/lgsb2mqtt/<name>.env, /var/lib/lgsb2mqtt/<name>/,
 * system user lgsb2mqtt, optional shared /etc/mqtt-interfaces/broker.env.
 */

import {createInstaller} from 'mqtt-interfaces-core';

export const SERVICE = 'lgsb2mqtt';
export const ENV_PREFIX = 'LGSB2MQTT';

const installer = createInstaller({
    service: SERVICE,
    envPrefix: ENV_PREFIX,
    description: `${SERVICE} %i - LG soundbar to MQTT bridge`,
    documentation: 'https://github.com/hobbyquaker/lgsb2mqtt',
});

export const {unitFile, envFile, installService, uninstallService, handle} = installer;
export {envVarName, instanceName} from 'mqtt-interfaces-core';
