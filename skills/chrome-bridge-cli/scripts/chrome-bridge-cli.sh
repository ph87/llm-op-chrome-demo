#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${CHROME_BRIDGE_CONFIG_PATH:-$HOME/.chrome-bridge/config.json}"
HOST_URL="${HOST_URL:-}"
AUTH_TOKEN="${HOST_TOKEN:-}"

usage() {
  cat <<'USAGE'
Usage:
  chrome-bridge-cli.sh --health
  chrome-bridge-cli.sh --events
  chrome-bridge-cli.sh --code "document.title='EXEC_OK'" [--target-tab 123] [--target-url-pattern google.com] [--timeout-ms 20000]
  chrome-bridge-cli.sh --open-url "https://example.com" [--target-tab 123] [--target-url-pattern example.com]
USAGE
}

load_config() {
  if [[ -n "${HOST_URL}" && -n "${AUTH_TOKEN}" ]]; then
    return
  fi

  if [[ ! -f "${CONFIG_PATH}" ]]; then
    echo "Error: missing config file: ${CONFIG_PATH}" >&2
    echo "Run setup first: ./scripts/setup.sh <EXTENSION_ID>" >&2
    exit 1
  fi

  local line
  line="$(node - "${CONFIG_PATH}" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const parsed = JSON.parse(raw);
const host = String(parsed.host || '').trim() || '127.0.0.1';
const port = Number(parsed.port);
const token = String(parsed.token || '').trim();
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid port in ${file}`);
}
if (token === '') {
  throw new Error(`Missing token in ${file}`);
}
process.stdout.write(`${host}\t${port}\t${token}`);
NODE
)"

  local host port token
  host="${line%%$'\t'*}"
  line="${line#*$'\t'}"
  port="${line%%$'\t'*}"
  token="${line#*$'\t'}"

  if [[ -z "${HOST_URL}" ]]; then
    HOST_URL="http://${host}:${port}"
  fi
  if [[ -z "${AUTH_TOKEN}" ]]; then
    AUTH_TOKEN="${token}"
  fi
}

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

request_get() {
  curl -sS "${HOST_URL}$1" \
    -H "Authorization: Bearer ${AUTH_TOKEN}"
}

request_post() {
  local payload="$1"
  curl -sS -X POST "${HOST_URL}/command" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -d "${payload}"
}

CODE=""
OPEN_URL=""
TARGET_TAB=""
TARGET_URL_PATTERN=""
TIMEOUT_MS=""
MODE="command"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --code)
      CODE="${2:-}"
      shift 2
      ;;
    --open-url)
      OPEN_URL="${2:-}"
      shift 2
      ;;
    --target-tab)
      TARGET_TAB="${2:-}"
      shift 2
      ;;
    --target-url-pattern)
      TARGET_URL_PATTERN="${2:-}"
      shift 2
      ;;
    --timeout-ms)
      TIMEOUT_MS="${2:-}"
      shift 2
      ;;
    --health)
      MODE="health"
      shift
      ;;
    --events)
      MODE="events"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

load_config

if [[ "${MODE}" == "health" ]]; then
  request_get "/health"
  exit 0
fi

if [[ "${MODE}" == "events" ]]; then
  request_get "/events"
  exit 0
fi

if [[ -z "${CODE}" && -n "${OPEN_URL}" ]]; then
  CODE="window.open('${OPEN_URL}', '_blank');"
fi

if [[ -z "${CODE}" ]]; then
  echo "Error: provide --code or --open-url" >&2
  usage
  exit 1
fi

CODE_JSON="$(json_escape "${CODE}")"
TARGET_TAB_JSON="null"
TARGET_URL_PATTERN_JSON="null"
TIMEOUT_MS_JSON="null"

if [[ -n "${TARGET_TAB}" ]]; then
  TARGET_TAB_JSON="${TARGET_TAB}"
fi

if [[ -n "${TARGET_URL_PATTERN}" ]]; then
  TARGET_URL_PATTERN_JSON="$(json_escape "${TARGET_URL_PATTERN}")"
fi

if [[ -n "${TIMEOUT_MS}" ]]; then
  TIMEOUT_MS_JSON="${TIMEOUT_MS}"
fi

PAYLOAD=$(cat <<JSON
{
  "code": ${CODE_JSON},
  "targetTabId": ${TARGET_TAB_JSON},
  "targetUrlPattern": ${TARGET_URL_PATTERN_JSON},
  "timeoutMs": ${TIMEOUT_MS_JSON}
}
JSON
)

request_post "${PAYLOAD}"
