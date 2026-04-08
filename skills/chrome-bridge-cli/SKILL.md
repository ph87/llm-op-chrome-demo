---
name: chrome-bridge-cli
description: Send JavaScript and helper commands through the Chrome Bridge native host.
---

# Chrome Bridge CLI Skill

## What This Skill Does

This skill provides CLI and helper scripts to control browser tabs through Chrome Bridge.

Bridge flow:

1. `scripts/chrome-bridge-cli.sh` sends HTTP requests to the native host (`127.0.0.1:3456`).
2. Native host forwards tasks over Chrome Native Messaging.
3. Extension executes JavaScript on target tabs and returns results.

## Package Structure

- `SKILL.md`
- `scripts/chrome-bridge-cli.sh`
- `scripts/_bridge_client.js`
- `scripts/open_url.js`
- `scripts/list_tabs.js`
- `scripts/screenshot.js`
- `scripts/click.js`
- `scripts/input.js`
- `scripts/launch_chrome.sh`

## Usage

Run from the `chrome-bridge-cli` skill root.

Health:

```bash
./scripts/chrome-bridge-cli.sh --health
```

Execute JavaScript on active tab:

```bash
./scripts/chrome-bridge-cli.sh --code "document.title='EXEC_OK'"
```

Execute JavaScript on specific tab:

```bash
./scripts/chrome-bridge-cli.sh --code "document.body.style.background='gold'" --target-tab 123456
```

Execute JavaScript by URL pattern:

```bash
./scripts/chrome-bridge-cli.sh --code "document.title='DONE'" --target-url-pattern google.com
```

Open URL through JS:

```bash
./scripts/chrome-bridge-cli.sh --open-url "https://www.google.com"
```

Read host events:

```bash
./scripts/chrome-bridge-cli.sh --events
```

Helper scripts:

```bash
node scripts/open_url.js --url "https://www.google.com"
node scripts/list_tabs.js
node scripts/screenshot.js
node scripts/click.js --selector "button[type='submit']"
node scripts/input.js --selector "input[name='q']" --text "hello world"
```
