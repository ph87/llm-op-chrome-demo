#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <chrome_extension_id> [host_name]"
  exit 1
fi

EXT_ID="$1"
HOST_NAME="${2:-com.codex.llm_bridge}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_PATH="$SCRIPT_DIR/run-native-host.sh"
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$HOST_DIR/$HOST_NAME.json"

mkdir -p "$HOST_DIR"

cat > "$MANIFEST_PATH" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Native messaging bridge for llm-op-chrome-demo",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
JSON

chmod 644 "$MANIFEST_PATH"
chmod +x "$HOST_PATH"

echo "Installed native host manifest: $MANIFEST_PATH"
echo "Allowed extension: chrome-extension://$EXT_ID/"
