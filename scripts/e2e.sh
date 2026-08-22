#!/usr/bin/env bash
# Manual end-to-end smoke test: starts a throwaway mosquitto broker in docker,
# runs lgsb2mqtt against it (soundbar address unreachable on purpose) and checks
# the connected topic lifecycle and set-topic validation.
# Usage: scripts/e2e.sh   (needs docker and mosquitto-clients)
set -u
cd "$(dirname "$0")/.."

PORT=18883
NAME=lgsb2mqtt-e2e
TMP=$(mktemp -d)
trap 'kill $APP $SUB 2>/dev/null; docker rm -f $NAME >/dev/null 2>&1; rm -rf "$TMP"' EXIT

printf 'listener 1883\nallow_anonymous true\n' > "$TMP/mosquitto.conf"
docker run -d --rm --name $NAME -p $PORT:1883 \
    -v "$TMP/mosquitto.conf:/mosquitto/config/mosquitto.conf" eclipse-mosquitto:2 >/dev/null
sleep 2

mosquitto_sub -h 127.0.0.1 -p $PORT -t 'soundbar/#' -v > "$TMP/sub.log" 2>&1 &
SUB=$!

LGSB2MQTT_VERBOSITY=debug node index.js -a 127.0.0.1 -u mqtt://127.0.0.1:$PORT > "$TMP/app.log" 2>&1 &
APP=$!
sleep 2

pub() { mosquitto_pub -h 127.0.0.1 -p $PORT -t "$1" -m "$2"; }
pub soundbar/set/SPK_LIST_VIEW_INFO/i_vol 12
pub soundbar/set/SPK_LIST_VIEW_INFO/i_vol '{"val": 7}'
pub soundbar/set/bogus 1
pub soundbar/set/A/B/C 1
pub soundbar/set/SPK_LIST_VIEW_INFO/i_vol ''
sleep 3

kill -TERM $APP
wait $APP
echo "app exit=$?"
sleep 1

echo '--- app log'
sed -E 's/\x1b\[[0-9;]*m//g' "$TMP/app.log" | cut -c25-
echo '--- broker saw'
cat "$TMP/sub.log"
