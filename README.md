# LLM OP Chrome Demo

Execute JavaScript in Chrome tabs/windows from local scripts through a Native Messaging bridge.

## Demo Media

Put demo files under `assets/` (folder already included in this repo).

```md
![Demo GIF](assets/demo.gif)
![UI Screenshot](assets/ui.png)
![Chrome Result Screenshot](assets/chrome-result.png)
```

Suggested captures:

- terminal command execution
- new window opened in Chrome
- title changed to `EXEC_OK`

## Prerequisites

- macOS (native host installer currently targets macOS)
- Google Chrome (not Safari)
- Node.js 18+

## Architecture

```text
Terminal Script / curl
  -> native-host local HTTP bridge (:3010)
  -> Chrome extension (Native Messaging)
  -> execute JS in target tab/window
  -> execution_result back to script
```

## Project Layout

- `native-bridge/native-host/` Native Messaging host bridge + installer
- `native-bridge/scripts/` script CLI for sending execute commands
- `chrome-extension/` Manifest V3 extension/service worker
- `skills/native-messaging-ops/` Codex skill for this script mode workflow

## Quick Start

### 1) Load extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select `chrome-extension/`
5. Copy extension ID

Install native host manifest:

```bash
cd native-bridge/native-host
./install-native-host.sh <EXTENSION_ID>
```

Then click `Reload` on the extension.

### 2) Send commands from terminal

```bash
cd native-bridge
npm install
npm run command -- --health
npm run command -- --open-url "https://www.google.com" --new-window
npm run command -- --code "document.title='EXEC_OK'"
```

The native host exposes local HTTP at `http://127.0.0.1:3010`:

- `GET /health`
- `GET /events`
- `POST /command` with JSON `{ "code": "..." }`

## Codex Skill

This repo includes a reusable skill:

- `skills/native-messaging-ops`

Use it when you want Codex to operate Chrome through this native-host script bridge (no WebSocket flow).

## Smoke Test

Run:

1. `npm run command -- --open-url "https://www.google.com" --new-window`
2. `npm run command -- --code "document.title='EXEC_OK'" --targetUrlPattern "google.com"`

Expected:

- A Google window opens
- Google tab title becomes `EXEC_OK`
- Command output includes `executionResult` with `ok: true`

## Troubleshooting

- `No extension connected`
  - Extension/native host is not connected yet. Reload extension and retry.
- `Native host has exited`
  - Re-run native host install script with current extension ID, then reload extension.
- Commands execute on wrong tab
  - Use `--targetTabId` or `--targetUrlPattern`.
- No visible effect from `alert(...)`
  - Dialogs may be suppressed by browser/page policy. Use title/style changes as visible validation.

## Message Protocol

- Script -> host:
  - `POST /command` body:
  - `{ "code": "...", "targetTabId": 123, "openInNewWindow": false }`
- Host -> extension:
  - `{ "type": "execute_js", "taskId": "...", "code": "...", ... }`
- Extension -> host:
  - `{ "type": "execution_result", "taskId": "...", "ok": true|false, ... }`

## Security

This is a demo/PoC. It executes JavaScript in live browser pages. Do not use in production without:

- strict action allowlists
- prompt/code policy enforcement
- user approval workflow
- auditing and rollback controls
