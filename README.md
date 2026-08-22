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

Requires Node.js >= 20.

## Usage

```
lgsb2mqtt --address <soundbar-ip> --mqtt-url mqtt://<broker>
```

```
Options:
  -a, --address         soundbar address (ip or hostname)          [string] [required]
  -u, --mqtt-url, --url mqtt broker url          [string] [default: "mqtt://localhost"]
  -n, --name            instance name. used as mqtt client id and as prefix for topics
                                                       [string] [default: "soundbar"]
      --json-payloads   publish status as JSON {"val": ..., "ts": ..., "lc": ...} instead
                        of plain values                     [boolean] [default: false]
      --ha-discovery    publish Home Assistant MQTT discovery (use --no-ha-discovery to
                        disable and clear)                   [boolean] [default: true]
      --ha-prefix       Home Assistant discovery prefix [string] [default: "homeassistant"]
      --publish-raw     additionally publish raw protocol messages as status/<MSG>/<key>
                                                            [boolean] [default: false]
  -v, --verbosity       log level
                  [string] [choices: "error", "warn", "info", "debug"] [default: "info"]
      --install         install as systemd service lgsb2mqtt@<name> using the other
                        options as its config, enable and start it. needs root [boolean]
      --uninstall       stop, disable and remove the systemd service lgsb2mqtt@<name>.
                        needs root                                           [boolean]
      --version         Show version number                                  [boolean]
  -h, --help            Show help                                            [boolean]
```

Every option can also be set via environment variable with the prefix `LGSB2MQTT_`,
e.g. `LGSB2MQTT_ADDRESS=192.168.1.50 LGSB2MQTT_MQTT_URL=mqtt://broker lgsb2mqtt`.

### Run as a systemd service

```
sudo lgsb2mqtt --install --name soundbar --address 192.168.1.50 --mqtt-url mqtt://192.168.1.2
```

`--install` creates a system user `lgsb2mqtt`, writes the given options to
`/etc/lgsb2mqtt/<name>.env` (`LGSB2MQTT_*` variables — edit and `systemctl restart lgsb2mqtt@<name>`
to change), installs the template unit `/etc/systemd/system/lgsb2mqtt@.service` and enables + starts
`lgsb2mqtt@<name>`. The instance name is the `--name` option, i.e. the MQTT topic prefix.
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
the last one).

### Docker

```
docker run -d --name lgsb2mqtt \
  -e LGSB2MQTT_ADDRESS=192.168.1.50 \
  -e LGSB2MQTT_MQTT_URL=mqtt://broker \
  ghcr.io/hobbyquaker/lgsb2mqtt
```

## Topics

`<name>` defaults to `soundbar`.

### `<name>/connected`

Retained. `0` = not connected to the broker (set via last will), `1` = connected to the
broker but not to the soundbar, `2` = connected to both.

### `<name>/status/<item>`

Retained status reports (plain values; lists as JSON arrays). Published on connect and
whenever the soundbar reports a change (also when changed via remote or app). With
`--json-payloads` every status is `{"val": <value>, "ts": <ms received>, "lc": <ms last changed>}`.

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
explore what your model supports. Raw sets are always accepted:
`soundbar/set/SPK_LIST_VIEW_INFO/i_vol 12`. `scripts/dump.js <address>` prints every known
info message of a device.

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

## License

MIT © Sebastian Raff
