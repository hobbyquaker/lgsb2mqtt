# lgsb2mqtt

[![npm](https://img.shields.io/npm/v/lgsb2mqtt.svg)](https://www.npmjs.com/package/lgsb2mqtt)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Control LG soundbars via MQTT

Connects to the TCP control interface of LG soundbars (the same one the
"LG Sound Bar" app uses) and bridges it to an MQTT broker, following the
[mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome) architecture.

## Install

```
npm install -g lgsb2mqtt
```

Requires Node.js ^20.19, ^22.12 or >= 24. lgsb2mqtt 2 is built on
[mqtt-interfaces-core](https://github.com/hobbyquaker/mqtt-interfaces-core) (mqtt-smarthome spec
2.x) like the author's other adapters; see "Upgrading from 1.x" below.

## Usage

```
lgsb2mqtt --address <soundbar-ip> --mqtt-url mqtt://<broker>
```

| option                               | default            | description                                                                      |
| ------------------------------------ | ------------------ | -------------------------------------------------------------------------------- |
| `-a, --address`                      |                    | soundbar address (ip or hostname), required                                      |
| `--port`                             | `9741`             | soundbar control port                                                            |
| `--publish-raw`                      | off                | additionally publish every raw protocol field as `<name>/status/<MSG>/<key>`     |
| `--raw-set`                          | off                | accept raw protocol sets on `<name>/set/<MSG>/<key>` (unrestricted!)             |
| `-u, --mqtt-url`                     | `mqtt://localhost` | broker URL, see [MQTT.js](https://github.com/mqttjs/MQTT.js#connect-using-a-url) |
| `--mqtt-username`, `--mqtt-password` |                    | broker credentials                                                               |
| `-n, --name`                         | `soundbar`         | instance name, used as topic prefix                                              |
| `--json-payloads`                    | on                 | status as `{"val", "ts", "lc"}` JSON; `--no-json-payloads` for plain values      |
| `--ha-discovery`                     | on                 | Home Assistant MQTT discovery (`--no-ha-discovery` disables and clears it)       |
| `--ha-prefix`                        | `homeassistant`    | discovery prefix                                                                 |
| `--maintenance`                      | on                 | accept `<name>/maintenance/set/{loglevel,restart}`; `--no-maintenance` disables  |
| `-v, --verbosity`                    | `info`             | `error`, `warn`, `info`, `debug`                                                 |
| `--install` / `--uninstall`          |                    | install/remove the systemd service `lgsb2mqtt@<name>`                            |
| `--config-schema`                    |                    | print the JSON Schema of all options and exit                                    |

Every option can also be set via environment variable with the prefix `LGSB2MQTT_`, e.g.
`LGSB2MQTT_ADDRESS=192.168.1.50 LGSB2MQTT_MQTT_URL=mqtt://broker lgsb2mqtt`; the broker settings
fall back to the unprefixed `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`.

### Run as a systemd service

```
sudo lgsb2mqtt --install --name soundbar --address 192.168.1.50 --mqtt-url mqtt://192.168.1.2
```

`--install` creates a system user `lgsb2mqtt`, writes the given options to
`/etc/lgsb2mqtt/<name>.env` (`LGSB2MQTT_*` variables — edit and `systemctl restart lgsb2mqtt@<name>`
to change), installs the template unit `/etc/systemd/system/lgsb2mqtt@.service` and enables + starts
`lgsb2mqtt@<name>`. The instance name is the `--name` option, i.e. the MQTT topic prefix.
Broker settings shared by all mqtt-interfaces adapters on the host can go to
`/etc/mqtt-interfaces/broker.env` (`MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`).
Logs: `journalctl -u lgsb2mqtt@<name> -f`.

**Several soundbars**: run `--install` once per device with a different `--name` — each becomes
its own instance with its own config and topic prefix, sharing one template unit and one
system user:

```
sudo lgsb2mqtt --install --name sb-living  --address 192.168.1.50 --mqtt-url mqtt://broker
sudo lgsb2mqtt --install --name sb-bedroom --address 192.168.1.51 --mqtt-url mqtt://broker
systemctl status 'lgsb2mqtt@*'
```

`sudo lgsb2mqtt --uninstall --name sb-bedroom` removes one instance (the template unit goes with
the last one). [she](https://github.com/hobbyquaker/she) can install, configure and update
instances from its Services page.

### Docker

```
docker run -d --name lgsb2mqtt \
  -e LGSB2MQTT_ADDRESS=192.168.1.50 \
  -e LGSB2MQTT_MQTT_URL=mqtt://broker \
  ghcr.io/hobbyquaker/lgsb2mqtt
```

## Finding the soundbar

```
lgsb2mqtt --discover
```

browses the network for Chromecast devices — LG soundbars have Chromecast built in — and keeps
the ones that also answer on the temescal control port (9741, `--port`), which is what tells a
soundbar apart from a speaker, a TV or a Nest:

```
172.16.20.180  Wohnzimmer-Soundbar  LG S90Q Soundbar  [control]  (mdns)
```

The name and model come from the Chromecast TXT record. `--discover-json` prints the same as
JSON. `-a auto` runs the scan at start and uses what it found, refusing to start when none or
more than one soundbar answers rather than bridging the wrong one:

```
lgsb2mqtt -a auto -u mqtt://broker
```

### When the soundbar is on another VLAN

mDNS is link-local: a browse does not cross a router on its own. An mDNS reflector (avahi with
`enable-reflector`) does bridge it — the output above was produced through one — but the
reflected answers arrive late and not on every attempt: measured over 20 second windows, the
soundbar showed up in one browse and not in the next. Give the scan `--discover-timeout 20`, and
when you want it to work every time, name the soundbar or the range it is in instead. The
control port is probed over TCP, which routes fine:

```
lgsb2mqtt --discover --discover-address 172.16.20.180      # this device
lgsb2mqtt --discover --discover-address 172.16.20.0/24     # sweep the range for port 9741
lgsb2mqtt -a auto --discover-address 172.16.20.0/24 -u mqtt://broker
```

A soundbar found that way has no Chromecast labels — nothing answered the browse — just its
address and the open port:

```
172.16.20.180  [control]  (sweep)
```

`--discover-timeout` (default 5 s) is how long the scan listens — enough on the local link,
too short through a reflector.

The scanning itself lives in
[mqtt-interfaces-core](https://github.com/hobbyquaker/mqtt-interfaces-core); this adapter only
declares the browse and the port ([lib/discovery.js](lib/discovery.js)).

## Topics

`<name>` defaults to `soundbar`.

### `<name>/connected`

Retained. `0` = not connected to the broker (set via last will), `1` = connected to the
broker but not to the soundbar, `2` = connected to both.

### `<name>/info` and `<name>/maintenance/set/…`

`<name>/info` (retained JSON) describes the running instance: package name and version,
mqtt-smarthome spec version, node version, host, pid, start time, the soundbar address.
`<name>/maintenance/set/loglevel` (`error|warn|info|debug`) changes the log level at runtime,
`<name>/maintenance/set/restart` exits cleanly so the service manager restarts the process;
`--no-maintenance` turns both off.

### `<name>/status/<item>`

Retained status reports, published on connect and whenever the soundbar reports a change (also
when changed via remote or app). Every status is `{"val": <value>, "ts": <ms received>, "lc": <ms
last changed>}`; with `--no-json-payloads` the plain value (lists as JSON arrays).

| item                                                                              | type        | set | notes                                                                  |
| --------------------------------------------------------------------------------- | ----------- | --- | ---------------------------------------------------------------------- |
| `volume`                                                                          | int         | yes | range in `volume/min`, `volume/max`                                    |
| `mute`                                                                            | bool        | yes |                                                                        |
| `input`                                                                           | string      | yes | e.g. `E-ARC`, `HDMI`, `Bluetooth`, `Wifi`, `Optical/HDMI ARC`          |
| `input_list`                                                                      | string[]    |     | inputs available on this model                                         |
| `eq`                                                                              | string      | yes | sound mode, e.g. `AI Sound Pro`, `Standard`, `Cinema`, `Music`, `Game` |
| `eq_list`                                                                         | string[]    |     | sound modes available on this model                                    |
| `bass`, `treble`                                                                  | int         | yes |                                                                        |
| `woofer`, `rear_level`, `top_level`, `center_level`, `side_level`, `dialog_level` | int         | yes | in dB, range in `<item>/min`, `<item>/max` (channels depend on model)  |
| `night_mode`, `auto_volume`, `drc`, `auto_power`, `tv_remote`, `neuralx`, `rear`  | bool        | yes |                                                                        |
| `av_sync`                                                                         | int         | yes | ms                                                                     |
| `power`                                                                           | bool        |     | the soundbar is unreachable while off — see `connected`                |
| `audio_source`                                                                    | string      |     | e.g. `DOLBY AUDIO`                                                     |
| `play/state`, `play/position`, `play/duration`, `play/stream_type`                | int         |     | `play/position` is not retained                                        |
| `play/title`, `play/artist`, `play/album`                                         | string      |     | only while streaming                                                   |
| `name`, `model`, `firmware`, `uuid`, `ip`, `bluetooth_name`, `update_available`   | string/bool |     | device info                                                            |

Sound modes or inputs without a known name are published as `unknown_<n>` and can be set
using that form. Verified on a DS90QY; other models may lack some items.

### `<name>/set/<item>`

Change requests. Payload is a plain value or mqtt-smarthome style JSON (`{"val": 12}`).
Booleans accept `true/false`, `1/0`, `on/off`; `input` and `eq` accept a name
(case-insensitive) or the numeric protocol index. Numeric values are checked against the
known range.

```
mosquitto_pub -t soundbar/set/volume -m 12
mosquitto_pub -t soundbar/set/mute -m true
mosquitto_pub -t soundbar/set/input -m HDMI
mosquitto_pub -t soundbar/set/eq -m "Cinema"
mosquitto_pub -t soundbar/set/woofer -m -3
mosquitto_pub -t soundbar/set/night_mode -m on
```

### Raw protocol topics

With `--publish-raw` every protocol field is additionally published as
`<name>/status/<MSG>/<key>` (e.g. `soundbar/status/SPK_LIST_VIEW_INFO/i_vol`), useful to
explore what your model supports. With `--raw-set` raw sets are accepted:
`soundbar/set/SPK_LIST_VIEW_INFO/i_vol 12` (off by default — it is unrestricted device access).
`scripts/dump.js <address>` prints every known info message of a device.

## Home Assistant

MQTT discovery is on by default (HA ≥ 2024.11, device-based discovery). After connecting,
the soundbar appears as one device with entities: volume (number), mute and settings
(switches: night mode, auto volume, DRC, auto power, TV remote, Neural:X, rear speakers),
input and sound mode (selects, options from what your model reports), speaker levels
(numbers in dB), power (binary sensor), audio source / firmware / IP (sensors).
Availability follows `<name>/connected`.

`--no-ha-discovery` disables discovery and removes the device announcement on startup;
`--ha-prefix` changes the discovery prefix. HA has no MQTT media player platform; a
payload for a community media player component is planned.

## Upgrading from 1.x

lgsb2mqtt 2.0 moves to mqtt-interfaces-core. Friendly items and topics are unchanged; what changed:

| 1.x                                               | 2.0                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plain status payloads, `--json-payloads` opt-in   | `{val, ts, lc}` JSON by default; `--no-json-payloads` for plain values                                                                                                                                        |
| raw sets `<name>/set/<MSG>/<key>` always accepted | opt-in with `--raw-set`                                                                                                                                                                                       |
| —                                                 | `<name>/info`, `<name>/maintenance/set/{loglevel,restart}`, `--config-schema`, `--port`                                                                                                                       |
| `/etc/lgsb2mqtt/<name>.env` + own template unit   | same file; the template unit is rewritten by `--install` (shared `broker.env`, state directory `/var/lib/lgsb2mqtt/<name>`, `Restart=always`) — run `sudo lgsb2mqtt --install --name <n> …` once per instance |
| Node >= 20                                        | Node ^20.19, ^22.12 or >= 24                                                                                                                                                                                  |

Home Assistant: the device id (`lgsb2mqtt_<uuid>`) and entity unique ids are unchanged, so the
device and its history are kept; the discovery payload is re-published on start.

## License

MIT © Sebastian Raff
