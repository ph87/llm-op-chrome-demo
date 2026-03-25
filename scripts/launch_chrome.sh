#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://www.google.com}"
if [[ -d "/Applications/Google Chrome.app" ]]; then
  open -a "/Applications/Google Chrome.app" "${URL}"
else
  open -a "Google Chrome" "${URL}"
fi

echo "Opened in Chrome: ${URL}"
