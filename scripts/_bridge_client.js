#!/usr/bin/env node

const HOST_URL = process.env.HOST_URL || 'http://127.0.0.1:3456';

function usageCommon() {
  return [
    'Common options:',
    '  --target-tab <id>',
    '  --target-url-pattern <pattern>',
    '  --timeout-ms <ms>'
  ].join('\n');
}

function parseArgs(argv, handlers = {}) {
  const common = {
    targetTabId: null,
    targetUrlPattern: null,
    timeoutMs: null
  };
  const local = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--target-tab') {
      const raw = argv[++i];
      const val = Number(raw);
      if (!Number.isFinite(val)) throw new Error(`Invalid --target-tab: ${raw}`);
      common.targetTabId = val;
      continue;
    }

    if (arg === '--target-url-pattern') {
      const val = argv[++i];
      if (!val) throw new Error('Missing value for --target-url-pattern');
      common.targetUrlPattern = val;
      continue;
    }

    if (arg === '--timeout-ms') {
      const raw = argv[++i];
      const val = Number(raw);
      if (!Number.isFinite(val) || val <= 0) throw new Error(`Invalid --timeout-ms: ${raw}`);
      common.timeoutMs = val;
      continue;
    }

    const handler = handlers[arg];
    if (handler) {
      i = handler(argv, i, local);
      continue;
    }

    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    positionals.push(arg);
  }

  return { common, local, positionals };
}

async function sendCode({ code, targetTabId, targetUrlPattern, timeoutMs }) {
  return sendCommand({
    code,
    targetTabId,
    targetUrlPattern,
    timeoutMs
  });
}

async function sendCommand(payload) {
  const res = await fetch(`${HOST_URL}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let json;
  try {
    json = await res.json();
  } catch {
    const text = await res.text();
    throw new Error(`Host returned non-JSON response: ${text}`);
  }
  return json;
}

function printJson(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function fail(message, exitCode = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(exitCode);
}

module.exports = {
  usageCommon,
  parseArgs,
  sendCommand,
  sendCode,
  printJson,
  fail
};
