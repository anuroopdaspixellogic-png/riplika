#!/usr/bin/env bash
#
# Runs the production server on this machine and exposes it through a
# temporary Cloudflare tunnel, so a phone can reach it over HTTPS/WSS.
#
#   npm run tunnel          # start the server + tunnel, print the URL
#   npm run tunnel -- --apk # also build an Android APK for that URL
#
# The URL changes every time the tunnel restarts. It is fine for testing,
# but a Play Store release needs a permanent domain (see render.yaml).
set -euo pipefail

cd "$(dirname "$0")/.."

BUILD_APK=false
for arg in "$@"; do
  if [ "$arg" = "--apk" ]; then
    BUILD_APK=true
  fi
done

if ! command -v cloudflared > /dev/null 2>&1; then
  echo "cloudflared is not installed. Install it with: brew install cloudflared" >&2
  exit 1
fi

echo "Building the client..."
npm run build

echo "Starting the server on port ${PORT:-8787}..."
NODE_ENV=production node --env-file-if-exists=.env server/index.js &
SERVER_PID=$!

TUNNEL_LOG="$(mktemp -t riplika-tunnel)"
cloudflared tunnel --url "http://localhost:${PORT:-8787}" --no-autoupdate > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

cleanup() {
  kill "$TUNNEL_PID" "$SERVER_PID" 2> /dev/null || true
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${PORT:-8787}/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  if [ -n "$URL" ]; then
    break
  fi
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "The tunnel did not come up. Log:" >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

echo
echo "Public URL: $URL"
echo "WebSocket: ${URL/https:/wss:}/ws"
echo "Press Ctrl+C to stop."
echo

if [ "$BUILD_APK" = true ]; then
  echo "Building the Android app for $URL..."
  VITE_API_ORIGIN="$URL" npm run android:apk
fi

wait "$SERVER_PID"
