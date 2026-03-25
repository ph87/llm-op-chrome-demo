#!/usr/bin/env node

const {
  sendCommand,
  printJson,
  fail
} = require('./_bridge_client');

function usage() {
  return [
    'Usage:',
    '  node scripts/list_tabs.js',
    '',
    'Lists all tabs across all Chrome windows.'
  ].join('\n');
}

async function main() {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (process.argv.length > 2) {
    fail(`${usage()}\n\nError: list_tabs.js does not accept extra arguments`);
  }

  const result = await sendCommand({ command: 'list_tabs' });
  printJson(result);
}

main().catch((err) => fail(`list_tabs.js failed: ${err.message}`));
