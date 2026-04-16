#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const CONFIG_PATH =
  process.env.CHROME_BRIDGE_CONFIG_PATH || path.join(os.homedir(), '.chrome-bridge', 'config.json');

function loadConfig() {
  let parsed = {};
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to read config at ${CONFIG_PATH}. Run setup first (./scripts/setup.sh <EXTENSION_ID>). ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const mode = String(parsed.mode || '').trim().toLowerCase() === 'ipc' ? 'ipc' : 'http';
  const legacyHost = String(parsed.host || '').trim();
  const legacyPort = Number(parsed.port);
  const legacyHostPort =
    legacyHost !== '' && Number.isInteger(legacyPort) && legacyPort >= 1 && legacyPort <= 65535
      ? `${legacyHost}:${legacyPort}`
      : '';
  const hostPort = normalizeHostPort(String(parsed.hostPort || '').trim() || legacyHostPort);
  const socketPath =
    String(parsed.socketPath || '').trim() || path.join(path.dirname(CONFIG_PATH), 'bridge.sock');
  const token = String(parsed.token || '').trim();

  if (mode === 'http' && !hostPort) {
    throw new Error('Invalid or missing hostPort in config (expected host:port)');
  }
  if (token === '') {
    throw new Error('Missing token in config');
  }

  return { mode, hostPort, socketPath, token };
}

function normalizeHostPort(value) {
  const raw = String(value || '').trim();
  if (raw === '') return null;
  const sep = raw.lastIndexOf(':');
  if (sep <= 0 || sep >= raw.length - 1) return null;
  const host = raw.slice(0, sep).trim();
  const port = Number(raw.slice(sep + 1).trim());
  if (host === '') return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return `${host}:${port}`;
}

let runtimeConfigCache = null;

function getRuntimeConfig() {
  if (runtimeConfigCache) return runtimeConfigCache;
  const config = loadConfig();
  const hostUrl = String(process.env.HOST_URL || '').trim();
  const hostSocketPath = String(process.env.HOST_SOCKET_PATH || '').trim();
  const token = process.env.HOST_TOKEN || config.token;

  if (hostUrl !== '') {
    runtimeConfigCache = {
      mode: 'http',
      hostUrl,
      token
    };
    return runtimeConfigCache;
  }

  if (config.mode === 'ipc') {
    runtimeConfigCache = {
      mode: 'ipc',
      socketPath: hostSocketPath || config.socketPath,
      token
    };
    return runtimeConfigCache;
  }

  runtimeConfigCache = {
    mode: 'http',
    hostUrl: `http://${config.hostPort}`,
    token
  };
  return runtimeConfigCache;
}

function usageCommon() {
  return [
    'Common options:',
    '  --target-tab <id>',
    '  --target-url-pattern <pattern>',
    '  --frame-id <cdp frame id>',
    '  --frame-url-pattern <pattern>',
    '  --timeout-ms <ms>'
  ].join('\n');
}

function parseArgs(argv, handlers = {}) {
  const common = {
    targetTabId: null,
    targetUrlPattern: null,
    frameId: null,
    frameUrlPattern: null,
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

    if (arg === '--frame-id') {
      const val = String(argv[++i] || '').trim();
      if (val === '') throw new Error('Missing value for --frame-id');
      common.frameId = val;
      continue;
    }

    if (arg === '--frame-url-pattern') {
      const val = String(argv[++i] || '').trim();
      if (val === '') throw new Error('Missing value for --frame-url-pattern');
      common.frameUrlPattern = val;
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

async function sendCode({ code, targetTabId, targetUrlPattern, frameId, frameUrlPattern, timeoutMs }) {
  return sendCommand({
    code,
    targetTabId,
    targetUrlPattern,
    frameId: frameId || null,
    frameUrlPattern: frameUrlPattern || null,
    timeoutMs
  });
}

async function sendCommand(payload) {
  return sendJsonRequest('POST', '/command', payload);
}

async function sendGet(endpoint) {
  return sendJsonRequest('GET', endpoint, null);
}

async function sendJsonRequest(method, endpoint, payload) {
  const runtimeConfig = getRuntimeConfig();

  if (runtimeConfig.mode === 'ipc') {
    return await sendOverIpc(runtimeConfig, method, endpoint, payload);
  }

  const headers = {
    authorization: `Bearer ${runtimeConfig.token}`
  };
  if (method !== 'GET') headers['content-type'] = 'application/json';
  const res = await fetch(`${runtimeConfig.hostUrl}${endpoint}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(payload || {})
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_error) {
    throw new Error(`Host returned non-JSON response: ${text}`);
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return json;
}

function sendOverIpc(runtimeConfig, method, endpoint, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        socketPath: runtimeConfig.socketPath,
        path: endpoint,
        headers: {
          authorization: `Bearer ${runtimeConfig.token}`,
          ...(method === 'GET' ? {} : { 'content-type': 'application/json' })
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = text === '' ? {} : JSON.parse(text);
          } catch (_error) {
            reject(new Error(`Host returned non-JSON response: ${text}`));
            return;
          }
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`Request failed (${res.statusCode}): ${text}`));
            return;
          }
          resolve(json);
        });
      }
    );

    req.on('error', (error) => {
      reject(new Error(`IPC request failed: ${error.message}`));
    });

    if (method !== 'GET') {
      req.write(JSON.stringify(payload || {}));
    }
    req.end();
  });
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
  sendGet,
  sendCode,
  printJson,
  fail
};
