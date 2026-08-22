# Agent instructions — lgsb2mqtt

## What this is

lgsb2mqtt is an MQTT interface ("bridge"/"adapter") for LG soundbars. It connects to the
soundbar's TCP control interface (`lib/soundbar.js`, AES-encrypted JSON on port 9741,
formerly the `lg-soundbar` npm module) and to an MQTT broker,
publishing soundbar state and accepting commands over MQTT.

It follows the [mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome)
architecture, like the author's other adapters (e.g.
[lgtv2mqtt](https://github.com/hobbyquaker/lgtv2mqtt)). Consistency with that convention
and with lgtv2mqtt (CLI options, topic/payload style, `--install` layout, logging idioms)
is a hard requirement. ROADMAP.md lists what is planned for this adapter.

## MQTT conventions (mqtt-smarthome)

Topic structure is `<name>/<function>/<item>`, where `<name>` is the configurable instance
name (default `soundbar`, CLI option `--name`):

- `<name>/connected` — retained integer, published via LWT and on state changes:
  - `0` = not connected to MQTT broker (set by broker via last will)
  - `1` = connected to MQTT, but not to the soundbar
  - `2` = connected to MQTT **and** the soundbar (fully operational)
- `<name>/status/<item>` — state reports, published by this adapter.
  Retained for persistent state (volume, mute, input, EQ); **not** retained for one-shot
  events. Payload is either a plain value or a JSON object with at least `val`, optionally
  `ts` (timestamp obtained, ms since epoch) and `lc` (timestamp last changed).
- `<name>/set/<item>` — change requests, subscribed by this adapter. Never retained.
  Payloads are plain values (accept JSON `{val: ...}` too for robustness).
- `<name>/get/<item>` — optional active-read triggers. Never retained.

QoS: use 0 (avoid QoS 1 — duplicate delivery can re-trigger hardware actions).

Items are friendly names (`volume`, `mute`, `input`, `eq`, `woofer`, ...) defined in
`lib/mapping.js` (`ITEMS` table: raw `msg`/`key` ↔ item, type, writable, range, offset).
Raw protocol topics (`status/<MSG>/<key>`) are opt-in via `--publish-raw`; raw
`set/<MSG>/<key>` is always accepted. Renaming items is a breaking change — document in
CHANGELOG and README.

## Code layout

- `index.js` — MQTT connection, topic handling, wiring to the soundbar client.
- `lib/soundbar.js` — soundbar protocol client (`LgSoundbar` EventEmitter: `connect()`,
  `get(msg)`, `set(msg, data)`, `disconnect()`; events `connect`, `disconnect`, `receive`,
  `socketerror`) plus exported pure helpers (`Framer`, `createPacket`, `encrypt`, `decrypt`).
  Reconnects itself with backoff; `get`/`set` reject with `TimeoutError`/`ResponseError`.
- `lib/mapping.js` — raw ↔ friendly item table and the pure `statusFor`/`commandFor`
  translation (enum names, booleans, range checks, level offsets).
- `lib/payload.js` — `parsePayload` (incoming plain/JSON `{val}`) and `StatusTracker`
  (last values, `{val, ts, lc}` generation for `--json-payloads`).
- `lib/hadiscovery.js` — `buildDiscovery()`: pure builder of the Home Assistant
  device-based discovery payload from the last known state + ranges. index.js publishes it
  after the initial `get`s and again when lists/ranges/device info change.
- `lib/install.js` — `--install`/`--uninstall` as systemd template service
  `lgsb2mqtt@<name>` (`/etc/lgsb2mqtt/<name>.env`, system user `lgsb2mqtt`). Mirrors
  lgtv2mqtt's `lib/install.js`; keep the two in sync.
- `test/` — node:test unit tests (`npm test`), incl. a fake soundbar TCP server.
- `deploy.sh [user@host]` — `npm pack`, copy to a host and install into
  `/usr/local/lib/node_modules/lgsb2mqtt`, restart all `lgsb2mqtt@*` units. Same script as
  in lgtv2mqtt; keep in sync.
- `scripts/dump.js <address>` — read-only protocol dump of a real device;
  `scripts/live.sh <address> [item value ...]` — run against a real device via a
  throwaway broker; `scripts/e2e.sh` — same without a device.
- `config.js` — CLI argument parsing via yargs (`--address`, `--mqtt-url` (aliases
  `-u`, `--url`), `--name`, `--verbosity`, `--json-payloads`, `--ha-discovery`,
  `--ha-prefix`, `--publish-raw`), every option also via `LGSB2MQTT_*` env vars.
  Exports the parsed config object (camelCased: `config.mqttUrl`, `config.haDiscovery`).
- Logging via `yalm` (`log.debug/info/warn/error`), verbosity from `--verbosity`.

## Style & practices

- Plain Node.js (CommonJS), no build step. 4-space indentation, semicolons.
- Keep dependencies minimal; this runs on small always-on machines (Raspberry Pi etc.).
- Never make default config values point at personal infrastructure (LAN IPs, hostnames).
- Log received/sent messages at `debug` level with the established `mqtt >`/`mqtt <` /
  `lgsb >`/`lgsb <` prefix style.
- Breaking changes to topics, payloads, or CLI options must be called out explicitly and
  should stay consistent with lgtv2mqtt.

## Running

```
node index.js --address <soundbar-ip> --mqtt-url mqtt://<broker> --name soundbar --verbosity debug
```

Lint: `npm run lint` (eslint + prettier check), `npm run format` to fix. Tests: `npm test`.
CI runs both on Node 20/22/24. `scripts/e2e.sh` is a manual end-to-end smoke test against a
throwaway mosquitto container (needs docker + mosquitto-clients).

## Known weak spots (be careful around these)

- The protocol's message/field names (`SPK_LIST_VIEW_INFO/i_vol`, ...) are only known from
  observation (verified on a DS90QY); there is no official documentation. Don't invent
  fields — verify against a real device (`scripts/dump.js`). Never run `set`s against a
  device that is in use without the owner's ok; `get`s are harmless.
- Speaker levels are protocol offsets from `min` (woofer raw 15 with min -15 = 0 dB); the
  conversion lives in `lib/mapping.js` (`offset: true`) and relies on `min` arriving in the
  same message — `publishData()` scans bounds before values for that reason.
- Duplicate suppression in `lib/soundbar.js` drops identical unsolicited messages arriving
  within 1 s (`suppressDuplicateTimeout`), because the device repeats notifications.
