# Chrome Bridge

Chrome extension + native host bridge for running JavaScript on browser tabs from terminal commands.

## How It Works

1. `scripts/chrome-bridge-cli.sh` sends requests to `native-host/app.js` over HTTP (`127.0.0.1:3456`).
2. `native-host/app.js` forwards tasks through Chrome Native Messaging.
3. `chrome-bridge-extension/backgroud.js` executes JavaScript in tabs and returns results.

Native host name: `com.argentum.chrome_bridge`

## Project Layout

- `chrome-bridge-extension/` - MV3 extension with background service worker.
- `native-host/` - Node.js native messaging host + launcher.
- `scripts/` - installer, CLI, and helper scripts.

## Prerequisites

- macOS
- Google Chrome
- Node.js (available as `node` in `PATH`)

## Setup

### 1) Load the extension

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked` and select:
   - `./llm-op-chrome-demo/chrome-bridge-extension`
4. Copy the extension ID.

### 2) Register native messaging host

From repo root:

```bash
./scripts/install.sh <EXTENSION_ID>
```

Example:

```bash
./scripts/install.sh ghnogoimmjgbgmmkkkdkfkjalaajfhbk
```

This writes the manifest to:

`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.argentum.chrome_bridge.json`

Reload the extension after install.

## Usage

Health check:

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

Open a URL:

```bash
./scripts/chrome-bridge-cli.sh --open-url "https://www.google.com"
```

Read host events:

```bash
./scripts/chrome-bridge-cli.sh --events
```

List all tabs across all windows:

```bash
node scripts/list_tabs.js
```

## Helper Scripts

Open URL:

```bash
node scripts/open_url.js --url "https://www.google.com"
```

Take screenshot:

```bash
node scripts/screenshot.js
```

Click element:

```bash
node scripts/click.js --selector "button[type='submit']"
```

Fill input:

```bash
node scripts/input.js --selector "input[name='q']" --text "hello world"
```

## Troubleshooting

- `--health` cannot connect:
  - Make sure Chrome is running.
  - Reload the extension in `chrome://extensions`.
  - Re-run `./scripts/install.sh <EXTENSION_ID>` if needed.
- Command times out:
  - Check target tab or URL pattern.
  - Try a simpler command first.
- No visible page change:
  - Avoid restricted pages (`chrome://*`, Web Store, etc.).
