#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Install Chrome Native Messaging host manifest for this project.

Usage:
  ./scripts/setup.sh <EXTENSION_ID>
  EXT_ID=<EXTENSION_ID> ./scripts/setup.sh
  ./scripts/setup.sh

Example:
  ./scripts/setup.sh abcdefghijklmnopabcdefghijklmnop
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

EXT_ID="${1:-${EXT_ID:-}}"
if [[ -z "${EXT_ID}" ]]; then
  read -r -p "Paste your Chrome extension ID (32 chars, a-p): " EXT_ID
fi

if [[ ! "${EXT_ID}" =~ ^[a-p]{32}$ ]]; then
  echo "Error: extension id must be 32 chars in [a-p]. Got: ${EXT_ID}" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${PROJECT_ROOT}/native-host/app.js"
LAUNCHER_PATH="${PROJECT_ROOT}/native-host/chrome-native-host-launcher.sh"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="${MANIFEST_DIR}/chrome_bridge.json"
CONFIG_DIR="$HOME/.chrome-bridge"
CONFIG_PATH="${CONFIG_DIR}/config.json"
NODE_BIN="$(command -v node || true)"

if [[ ! -f "${APP_PATH}" ]]; then
  echo "Error: native host not found at ${APP_PATH}" >&2
  exit 1
fi

if [[ -z "${NODE_BIN}" ]]; then
  echo "Error: node not found in PATH while installing." >&2
  echo "Install Node.js first, then rerun the installer." >&2
  exit 1
fi

chmod +x "${APP_PATH}"
mkdir -p "${MANIFEST_DIR}"
mkdir -p "${CONFIG_DIR}"

TOKEN="$("${NODE_BIN}" -e 'process.stdout.write(require("node:crypto").randomUUID())')"

cat > "${CONFIG_PATH}" <<JSON
{
  "mode": "http",
  "hostPort": "127.0.0.1:3456",
  "socketPath": "${CONFIG_DIR}/bridge.sock",
  "token": "${TOKEN}"
}
JSON

cat > "${LAUNCHER_PATH}" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PATH="${SCRIPT_DIR}/app.js"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export CHROME_BRIDGE_PROJECT_ROOT="${PROJECT_ROOT}"

exec /usr/bin/env node "${APP_PATH}"
SH

chmod +x "${LAUNCHER_PATH}"

cat > "${MANIFEST_PATH}" <<JSON
{
  "name": "chrome_bridge",
  "description": "Chrome Bridge native host",
  "path": "${LAUNCHER_PATH}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXT_ID}/"
  ]
}
JSON

echo "Installed native host manifest:"
echo "  ${MANIFEST_PATH}"
echo "Bridge config:"
echo "  ${CONFIG_PATH}"
echo "Native host launcher:"
echo "  ${LAUNCHER_PATH}"
echo
echo "Next:"
echo "1) Reload the extension in chrome://extensions"
echo "2) Run CLI health check from chrome-bridge-cli skill root:"
echo "   ./scripts/chrome-bridge-cli.js --health"
