---
name: chrome-bridge-skill
description: Install a Chrome extension + native host bridge, then send JavaScript from terminal to execute on web pages.
---

# Chrome Bridge Skill

## What This Skill Does

This package lets you send JavaScript from terminal commands to a Chrome extension service worker, which executes the code on browser tabs.

Bridge flow:

1. `scripts/chrome-bridge-cli.sh` sends HTTP requests to `native-host/app.js` on `127.0.0.1:3456`.
2. `native-host/app.js` forwards `execute_js` tasks over Chrome Native Messaging.
3. `chrome-bridge-extension/backgroud.js` runs the JS in a target tab and returns execution results.

## Package Structure

- `SKILL.md`
- `chrome-bridge-extension/backgroud.js`
- `chrome-bridge-extension/manifest.json`
- `native-host/app.js`
- `scripts/chrome-bridge-cli.sh`
- `scripts/install.sh`
- `scripts/screenshot.js`
- `scripts/open_url.js`
- `scripts/click.js`
- `scripts/input.js`
- `scripts/list_tabs.js`

## Install

### 1) Load Extension in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. From this package root, run:

```bash
echo "$(pwd)/chrome-bridge-extension"
```

4. Click `Load unpacked` and paste/select the printed absolute path.
5. Copy the extension ID (for example: `abcdefghijklmnopabcdefghijklmnop`).

### 2) Register Native Messaging Host (macOS)

Run from this package root:

```bash
./scripts/install.sh
```

When prompted, copy and paste your extension ID to finish installation.

Then reload the extension in `chrome://extensions`.

## Usage

### Health

```bash
./scripts/chrome-bridge-cli.sh --health
```

Expected: JSON with `ok: true` and bridge status fields.

### Execute JavaScript on Active Tab

```bash
./scripts/chrome-bridge-cli.sh --code "document.title='EXEC_OK'"
```

### Execute JavaScript on Specific Tab

```bash
./scripts/chrome-bridge-cli.sh --code "document.body.style.background='gold'" --target-tab 123456
```

### Execute JavaScript by URL Pattern

```bash
./scripts/chrome-bridge-cli.sh --code "document.title='DONE'" --target-url-pattern google.com
```

### Open URL Through JS

```bash
./scripts/chrome-bridge-cli.sh --open-url "https://www.google.com"
```

### Open URL (Helper Script)

```bash
node scripts/open_url.js --url "https://www.google.com"
```

### List All Tabs Across All Windows (Helper Script)

```bash
node scripts/list_tabs.js
```

### Snapshot Current Page (Helper Script)

```bash
node scripts/screenshot.js
```

### Click Element by Selector (Helper Script)

```bash
node scripts/click.js --selector "button[type='submit']"
```

### Fill Input by Selector (Helper Script)

```bash
node scripts/input.js --selector "input[name='q']" --text "hello world"
```

### Read Host Events

```bash
./scripts/chrome-bridge-cli.sh --events
```

## Troubleshooting

- `--health` cannot connect:
  - Ensure Chrome is running.
  - Open extension details and reload it.
  - Verify native host manifest path and extension ID.
- `execution_result.ok` is `false`:
  - Verify target tab exists (`--target-tab`) or URL pattern matches (`--target-url-pattern`).
  - Test with a simple command like `document.title='EXEC_OK'`.
- Nothing happens on page:
  - Ensure the target tab is a regular web page and not restricted browser UI pages.
