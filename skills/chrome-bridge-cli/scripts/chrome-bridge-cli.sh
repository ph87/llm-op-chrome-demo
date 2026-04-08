#!/usr/bin/env bash
set -euo pipefail

HOST_URL="${HOST_URL:-http://127.0.0.1:3456}"

usage() {
  cat <<'USAGE'
Usage:
  chrome-bridge-cli.sh --health
  chrome-bridge-cli.sh --events
  chrome-bridge-cli.sh --code "document.title='EXEC_OK'" [--target-tab 123] [--target-url-pattern google.com] [--timeout-ms 20000]
  chrome-bridge-cli.sh --open-url "https://example.com" [--target-tab 123] [--target-url-pattern example.com]
USAGE
}

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

request_get() {
  curl -sS "${HOST_URL}$1"
}

request_post() {
  local payload="$1"
  curl -sS -X POST "${HOST_URL}/command" \
    -H 'Content-Type: application/json' \
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
