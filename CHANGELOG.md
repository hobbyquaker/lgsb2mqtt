# Changelog

## 1.0.1 — 2026-08-22

- Release workflow creates a GitHub release with the changelog section as notes; can be
  re-run for an existing tag. No functional changes.

## 1.0.0 — 2026-08-22

Complete rewrite of the 0.0.1 prototype.

### Breaking

- Status topics are friendly items (`soundbar/status/volume`, `status/mute`,
  `status/input`, `status/eq`, `status/woofer`, ...) instead of raw protocol fields
  (`status/SPK_LIST_VIEW_INFO/i_vol`). Raw topics are available with `--publish-raw`.
- `set/<item>` uses the same friendly names; `input` and `eq` accept names. Raw
  `set/<MSG>/<key>` still works.
- Speaker levels (`woofer`, `rear_level`, ...) are published in dB relative to their `min`/`max`
  (the protocol reports offsets from `min`).
- `--address` is required (previously defaulted to a private LAN IP).
- The MQTT broker URL option is `--mqtt-url`; `-u` and `--url` keep working as aliases.
  The default changed from `mqtt://mqtt` to `mqtt://localhost`.
- Unknown CLI options are rejected.

### Added

- Home Assistant MQTT discovery (device-based), enabled by default; `--no-ha-discovery`,
  `--ha-prefix`.
- `--install` / `--uninstall`: run as systemd template service `lgsb2mqtt@<name>` with the
  config in `/etc/lgsb2mqtt/<name>.env`.
- All options can be set via environment variables (`LGSB2MQTT_ADDRESS`, `LGSB2MQTT_MQTT_URL`,
  `LGSB2MQTT_NAME`, `LGSB2MQTT_VERBOSITY`, ...).
- `--json-payloads`: status as `{"val", "ts", "lc"}` JSON.
- `set` topics accept mqtt-smarthome style JSON payloads (`{"val": 12}`) in addition to plain values.
- Device info topics: `model`, `firmware`, `uuid`, `name`, `ip`, `power`, `audio_source`,
  `input_list`, `eq_list`, play info.
- Graceful shutdown on SIGINT/SIGTERM: publishes `connected: 0` and closes the MQTT connection.
- `bin` entry (`lgsb2mqtt` command), Dockerfile, README, LICENSE, eslint + prettier, CI,
  release workflow.
- `scripts/dump.js` for protocol exploration, `scripts/live.sh` for checks against a real device.
- Unit tests (node:test).

### Changed

- The soundbar protocol implementation moved from the `lg-soundbar` npm module into this repo
  (`lib/soundbar.js`): correct TCP framing (multiple/partial packets per chunk), reconnect with
  exponential backoff (1 s → 30 s), per-request timeouts that reject with a proper `Error`,
  no more mis-removal of pending requests, listeners are wired before connecting.

### Fixed

- Crash when the soundbar did not answer a `get`/`set` (timeout) — errors are now logged.
- `connected` now drops from `2` to `1` when the soundbar connection is lost.
- Malformed `set` topics (wrong depth) are ignored with a warning instead of sending broken commands.
- Empty payloads are no longer coerced to `0`.

## 0.0.1

- Initial release.
