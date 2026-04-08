---
name: chrome-bridge-setup
description: Install the Chrome extension and native host bridge for Chrome Bridge.
---

# Chrome Bridge Setup Skill

## What This Skill Does

This skill contains setup assets and installation steps for Chrome Bridge:

1. Load the extension from `chrome-bridge-extension/`.
2. Register the native messaging host from `native-host/`.
3. Install the manifest with `scripts/setup.sh`.
4. Create `~/.chrome-bridge/config.json` with host/port/token defaults.

## Config

Setup creates `~/.chrome-bridge/config.json`:

```json
{"host":"127.0.0.1","port":3456,"token":"<uuid>"}
```

- `host` and `port` are editable in extension sidebar settings.
- `token` is shown in sidebar settings and can be rotated with `Refresh`.
- Any host/port/token change is written back to this file.

## Package Structure

- `SKILL.md`
- `chrome-bridge-extension/`
- `native-host/`
- `scripts/setup.sh`

## Install

Run from the `chrome-bridge-setup` skill root.

### 1) Load Extension in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Use extension path:

```bash
echo "$(pwd)/chrome-bridge-extension"
```

4. Click `Load unpacked` and choose the printed path.
5. Copy the extension ID.

### 2) Register Native Messaging Host (macOS)

Run installer:

```bash
./scripts/setup.sh
```

Or pass extension ID directly:

```bash
./scripts/setup.sh <EXTENSION_ID>
```

After install, reload the extension in `chrome://extensions`.
