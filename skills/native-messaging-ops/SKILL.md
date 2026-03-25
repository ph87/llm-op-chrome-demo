---
name: native-messaging-ops
description: Execute JavaScript in Google Chrome through the local Native Messaging bridge without WebSocket. Use when the user asks to open URLs, target specific tabs, run in-page JS, or debug Chrome automation for the llm-op-chrome-demo script mode.
---

# Native Msg Chrome Ops

## Overview

Use the local script bridge in `llm-op-chrome-demo/native-bridge` to send `execute_js` tasks into Chrome via Native Messaging.
Prefer deterministic JS commands over natural-language prompts.

## Quick Start

Use project root:

```bash
ROOT="/Users/pnn/Workspaces/CodexPlayground/llm-op-chrome-demo"
```

Run health check:

```bash
cd "$ROOT/native-bridge"
npm run command -- --health
```

Open Google in new window:

```bash
npm run command -- --open-url "https://www.google.com" --new-window
```

Set page title on target tab:

```bash
npm run command -- --code "document.title='EXEC_OK'" --targetTabId <TAB_ID>
```

## Standard Workflow

1. Verify extension/native host connectivity with `--health`.
2. If needed, open a page with `--open-url` and capture returned `openedTabId`.
3. Run JS with `--code` and pass `--targetTabId` whenever precision matters.
4. Read `executionResult.ok` and `executionResult.result.probe.before/after` to confirm effects.

## Command Patterns

Open URL:

```bash
npm run command -- --open-url "https://example.com"
```

Open URL in new window:

```bash
npm run command -- --open-url "https://example.com" --new-window
```

Run JS on active tab:

```bash
npm run command -- --code "document.body.style.background='rgb(255,240,180)'"
```

Run JS on specific tab:

```bash
npm run command -- --code "document.title='DONE'" --targetTabId 123456
```

Run JS by URL match:

```bash
npm run command -- --code "document.title='DONE'" --targetUrlPattern "google.com"
```

## Troubleshooting

`No extension connected`:
- Reload extension at `chrome://extensions`.
- Re-run `native-bridge/native-host/install-native-host.sh <EXTENSION_ID>`.

`Native host has exited`:
- Check native host logs in `${TMPDIR:-/tmp}`.
- Ensure `run-native-host.sh` can find a valid `node` binary.

No visible page effect:
- Use `document.title=...` test first.
- Avoid relying on `alert()` because dialogs can be suppressed.
- Check returned `probe.before` and `probe.after` in command output.

Wrong tab was updated:
- Use `--targetTabId` from previous `openedTabId`.
- Avoid active-tab fallback for multi-tab scenarios.
