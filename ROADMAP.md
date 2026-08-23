# Roadmap — lgsb2mqtt

## Done in 1.0.0

- Robust protocol client (`lib/soundbar.js`): proper TCP framing, reconnect with
  backoff, per-request timeouts, typed errors; absorbed from the former
  `lg-soundbar` module.
- Friendly topics (`status/volume`, `set/input`, …) verified on a DS90QY, raw
  protocol topics behind `--publish-raw`.
- Home Assistant MQTT discovery (device-based), on by default.
- `--json-payloads` (`{val, ts, lc}`), env var configuration, `--install` as
  systemd service, Docker image, CI, unit tests.

## Done in 2.0.0

- Ported to mqtt-interfaces-core 0.6: config, MQTT, discovery publishing, installer, logging and
  the maintenance topics come from the core; `{val, ts, lc}` payloads by default, `--raw-set`,
  `--port`, `--config-schema`, `mqttInterfaces` field. Friendly topics unchanged.

## Open

### Protocol / device coverage

- EQ indices 23–26 have no known name (published as `unknown_23..26`); the
  DS90QY lists them. Match against the sound-mode names shown in the LG app
  and add them to `EQUALISERS` in `lib/mapping.js`.
- Input index → name table comes from the temescal Python library; confirm
  the names match what the app shows (DS90QY reports
  `[Wifi, Bluetooth, Optical/HDMI ARC, HDMI, USB2]`, current `E-ARC`).
- Speaker levels are treated as offsets from `min` (raw woofer 15 with min
  −15 → 0 dB). Confirm against the app display.
- `power` is status-only; no power-off command is known. temescal's
  `SPK_LIST_VIEW_INFO {b_powerkey: true}` toggle is unverified.
- Unmapped keys seen on the DS90QY, semantics unclear: `b_enable_imax`,
  `b_enable_dialog`, `b_smart_mixer`, `i_back_light`, `i_wow_mode`,
  `b_avsmrm_status`, `i_calibration_status`.
- Other models (SN/SP/SC series) may expose different keys; collect
  `scripts/dump.js` output from users and extend the mapping table.
- `bass`/`treble` and `av_sync` ranges are unknown; expose them as HA
  `number` entities once known.

### Home Assistant

- HA has no MQTT `media_player` platform. Optionally publish a config payload
  for a community MQTT media player component (`--ha-media-player`); pick the
  most maintained one and pin its payload schema.

### Housekeeping

- Deprecate `lg-soundbar` on npm (`npm deprecate lg-soundbar "moved into lgsb2mqtt"`).
- Port to ESM.
- Replace `yalm` with a small built-in logger that detects journald
  (`JOURNAL_STREAM`) and emits `<N>` priority prefixes, so
  `journalctl -p warning -u lgsb2mqtt@<name>` filters by level.
- `<name>/info` topic (retained JSON: version, node version, uptime, host)
  and `maintenance/set/loglevel` for runtime log level changes.
