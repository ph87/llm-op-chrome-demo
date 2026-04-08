#!/usr/bin/env node

const {
  parseArgs,
  sendCommand,
  printJson,
  fail
} = require('./_bridge_client');

function usage() {
  return [
    'Usage:',
    '  node scripts/close_tab.js --tab-id <id> [--timeout-ms <ms>]',
    '',
    'Closes a tab by tab id.'
  ].join('\n');
}

async function main() {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const { common, local, positionals } = parseArgs(process.argv.slice(2), {
    '--tab-id': (argv, i, out) => {
      const raw = argv[i + 1];
      const val = Number(raw);
      if (!Number.isFinite(val)) throw new Error(`Invalid --tab-id: ${raw}`);
      out.tabId = val;
      return i + 1;
    }
  });

  if (positionals.length > 0) {
    fail(`${usage()}\n\nError: unexpected argument(s): ${positionals.join(' ')}`);
  }

  if (!Number.isFinite(local.tabId)) {
    fail(`${usage()}\n\nError: --tab-id is required`);
  }

  const result = await sendCommand({
    command: 'close_tab',
    targetTabId: local.tabId,
    timeoutMs: common.timeoutMs
  });
  printJson(result);
}

main().catch((err) => fail(`close_tab.js failed: ${err.message}`));
