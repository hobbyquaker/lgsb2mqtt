#!/usr/bin/env bash
# Live check against a real soundbar through a throwaway mosquitto broker.
# Usage: scripts/live.sh <soundbar-address> [set-topic payload ...]
# Example: scripts/live.sh 192.168.1.50 volume 9 volume 8
set -u
cd "$(dirname "$0")/.."

ADDRESS=${1:?soundbar address}
shift
PORT=18884
NAME=lgsb2mqtt-live
TMP=$(mktemp -d)
trap 'kill $APP $SUB 2>/dev/null; docker rm -f $NAME >/dev/null 2>&1; rm -rf "$TMP"' EXIT

printf 'listener 1883\nallow_anonymous true\n' > "$TMP/mosquitto.conf"
docker rm -f $NAME >/dev/null 2>&1
docker run -d --rm --name $NAME -p $PORT:1883 \
    -v "$TMP/mosquitto.conf:/mosquitto/config/mosquitto.conf" eclipse-mosquitto:2 >/dev/null
sleep 2

mosquitto_sub -h 127.0.0.1 -p $PORT -t 'soundbar/#' -v > "$TMP/sub.log" 2>&1 &
SUB=$!

LGSB2MQTT_VERBOSITY=debug node index.js -a "$ADDRESS" -u mqtt://127.0.0.1:$PORT --publish-raw > "$TMP/app.log" 2>&1 &
APP=$!
sleep 5

while [ $# -ge 2 ]; do
    echo ">>> set/$1 = $2"
    mosquitto_pub -h 127.0.0.1 -p $PORT -t "soundbar/set/$1" -m "$2"
    sleep 3
    shift 2
done
sleep 2

kill -TERM $APP
wait $APP
sleep 1

echo '--- app log'
sed -E 's/\x1b\[[0-9;]*m//g' "$TMP/app.log" | cut -c25-
echo '--- broker saw'
cat "$TMP/sub.log"
