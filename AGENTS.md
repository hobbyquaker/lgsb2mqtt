# Agent instructions — lgsb2mqtt

## What this is

lgsb2mqtt is an MQTT interface ("bridge"/"adapter") for LG soundbars. It connects to the
soundbar's TCP control interface (`lib/soundbar.js`, AES-encrypted JSON on port 9741,
formerly the `lg-soundbar` npm module) and to an MQTT broker,
publishing soundbar state and accepting commands over MQTT.

It follows the [mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome)
architecture and, since 2.0, is built on
[mqtt-interfaces-core](https://github.com/hobbyquaker/mqtt-interfaces-core) (`../mqtt-interfaces-core`
when checked out next to this repo — generic fixes go there; its README is the complete guide
to building an adapter). Consistency with the core's conventions and with lgtv2mqtt / cul2mqtt
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
`set/<MSG>/<key>` is opt-in via `--raw-set`. Renaming items is a breaking change — document in
CHANGELOG and README.

## Code layout (ES modules, node >= 20.19)

- `index.js` — `createAdapter()` from the core plus the soundbar part: `LgSoundbar` events
  mirrored into `connected`, `publishData()` (ranges first, then `statusFor()` → `pubStatus()`),
  `onSet` (friendly via `commandFor()`, raw behind `--raw-set`), discovery re-published when
  ranges change (the core handles the item triggers).
- `lib/soundbar.js` — soundbar protocol client (`LgSoundbar` EventEmitter: `connect()`,
  `get(msg)`, `set(msg, data)`, `disconnect()`; events `connect`, `disconnect`, `receive`,
  `socketerror`) plus exported pure helpers (`Framer`, `createPacket`, `encrypt`, `decrypt`).
  Reconnects itself with backoff; `get`/`set` reject with `TimeoutError`/`ResponseError`.
- `lib/mapping.js` — raw ↔ friendly item table and the pure `statusFor`/`commandFor`
  translation (enum names, booleans, range checks, level offsets).
- `lib/hadiscovery.js` — `discoveryModel()`: pure device block (id, device, entity map via the
  core's `entity()`) from the last known state + ranges; the core publishes it after the initial
  `get`s and again when lists/ranges/device info change.
- `lib/install.js` — the core installer (`createInstaller`) wired to lgsb2mqtt.
- `test/` — node:test unit tests (`npm test`), incl. a fake soundbar TCP server.
- `deploy.sh [user@host]` — `npm pack`, copy to a host and install into
  `/usr/local/lib/node_modules/lgsb2mqtt`, restart all `lgsb2mqtt@*` units. Same script as
  in lgtv2mqtt; keep in sync.
- `scripts/dump.js <address>` — read-only protocol dump of a real device;
  `scripts/live.sh <address> [item value ...]` — run against a real device via a
  throwaway broker; `scripts/e2e.sh` — same without a device.
- `config.js` — adapter options (`--address`, `--port`, `--publish-raw`, `--raw-set`) on top of
  the core's `parseConfig()` (shared MQTT/name/discovery/maintenance options, `LGSB2MQTT_*` env
  vars, `--config-schema`). Exports `OPTIONS` and the parsed config (camelCased).
- Logging via the core logger (`adapter.log`), journald-aware; verbosity from `--verbosity`.

## Style & practices

- Plain JavaScript, ES modules, no build step. 4-space indentation, semicolons.
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
