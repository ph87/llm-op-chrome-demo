#!/usr/bin/env node

const HOST = process.env.HOST_HTTP_URL || 'http://127.0.0.1:3010';

function usage() {
  console.error(
    'Usage:\n' +
      '  node scripts/send-command.js --code "document.title=\\"EXEC_OK\\"" [--targetTabId 123] [--timeoutMs 20000]\n' +
      '  node scripts/send-command.js --open-url "https://www.google.com" [--new-window]\n' +
      '  node scripts/send-command.js --health\n' +
      '  node scripts/send-command.js --events\n'
  );
}

function parseArgs(argv) {
  const args = {
    code: '',
    openUrl: '',
    newWindow: false,
    targetTabId: null,
    targetUrlPattern: '',
    timeoutMs: null,
    health: false,
    events: false
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];

    if (key === '--code' && next) {
      args.code = next;
      i++;
      continue;
    }
    if (key === '--open-url' && next) {
      args.openUrl = next;
      i++;
      continue;
    }
    if (key === '--new-window') {
      args.newWindow = true;
      continue;
    }
    if (key === '--targetTabId' && next) {
      args.targetTabId = Number(next);
      i++;
      continue;
    }
    if (key === '--targetUrlPattern' && next) {
      args.targetUrlPattern = next;
      i++;
      continue;
    }
    if (key === '--timeoutMs' && next) {
      args.timeoutMs = Number(next);
      i++;
      continue;
    }
    if (key === '--health') {
      args.health = true;
      continue;
    }
    if (key === '--events') {
      args.events = true;
      continue;
    }
    if (key === '--help' || key === '-h') {
      usage();
      process.exit(0);
    }
  }

  return args;
}

async function getJson(url) {
  const resp = await fetch(url);
  const text = await resp.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function postJson(url, payload) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.health) {
    console.log(JSON.stringify(await getJson(`${HOST}/health`), null, 2));
    return;
  }

  if (args.events) {
    console.log(JSON.stringify(await getJson(`${HOST}/events`), null, 2));
    return;
  }

  let code = args.code;
  if (!code && args.openUrl) {
    const safeUrl = args.openUrl.replace(/'/g, "\\'");
    code = `window.open('${safeUrl}', '_blank');`;
  }

  if (!code) {
    usage();
    process.exit(1);
  }

  const payload = {
    code,
    openInNewWindow: args.newWindow,
    targetTabId: Number.isFinite(args.targetTabId) ? args.targetTabId : null,
    targetUrlPattern: args.targetUrlPattern || null,
    timeoutMs: Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : undefined
  };

  console.log(JSON.stringify(await postJson(`${HOST}/command`, payload), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
