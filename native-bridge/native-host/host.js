#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const HOST_HTTP_BIND = process.env.HOST_HTTP_BIND || '127.0.0.1';
const HOST_HTTP_PORT = Number(process.env.HOST_HTTP_PORT || 3010);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000);
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 200);

const pendingByTaskId = new Map();
const recentEvents = [];
let inputBuffer = Buffer.alloc(0);
let nativeReadableEnded = false;

function pushEvent(type, details = {}) {
  recentEvents.push({ ts: new Date().toISOString(), type, details });
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.shift();
  }
}

function sendNative(message) {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(header);
  process.stdout.write(body);
  pushEvent('native_out', { type: message?.type || null, taskId: message?.taskId || null });
}

function resolvePending(taskId, payload) {
  const pending = pendingByTaskId.get(taskId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingByTaskId.delete(taskId);
  pending.resolve({
    executionResult: payload,
    extensionLogs: pending.logs
  });
}

function rejectAllPending(reason) {
  for (const [, pending] of pendingByTaskId) {
    clearTimeout(pending.timeout);
    pending.reject(new Error(reason));
  }
  pendingByTaskId.clear();
}

function handleNativeMessage(msg) {
  pushEvent('native_in', { type: msg?.type || null, taskId: msg?.taskId || null });

  if (msg?.type === 'extension_log') {
    const taskId = msg?.details?.taskId || msg?.taskId;
    if (taskId && pendingByTaskId.has(taskId)) {
      pendingByTaskId.get(taskId).logs.push(msg);
    }
    return;
  }

  if (msg?.type === 'execution_result' && msg?.taskId) {
    resolvePending(msg.taskId, msg);
  }
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + length) return;

    const body = inputBuffer.slice(4, 4 + length);
    inputBuffer = inputBuffer.slice(4 + length);

    try {
      const msg = JSON.parse(body.toString('utf8'));
      handleNativeMessage(msg);
    } catch (error) {
      pushEvent('native_bad_json', { error: String(error) });
    }
  }
});

process.stdin.on('end', () => {
  nativeReadableEnded = true;
  pushEvent('stdin_end');
  rejectAllPending('Native messaging pipe ended');
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeExecuteRequest(body) {
  const taskId = String(body?.taskId || randomUUID());
  const type = 'execute_js';
  const code = String(body?.code || '').trim();

  if (!code) {
    throw new Error('`code` is required');
  }

  const targetTabId =
    body?.targetTabId == null || body?.targetTabId === '' ? null : Number(body.targetTabId);
  const targetUrlPattern = String(body?.targetUrlPattern || '').trim() || null;

  return {
    type,
    taskId,
    code,
    openInNewWindow: Boolean(body?.openInNewWindow),
    targetTabId: Number.isFinite(targetTabId) ? targetTabId : null,
    targetUrlPattern
  };
}

const httpServer = createServer(async (req, res) => {
  try {
    const pathname = req.url?.split('?')[0] || '/';

    if (req.method === 'GET' && pathname === '/health') {
      writeJson(res, 200, {
        ok: true,
        nativeReadableEnded,
        pendingTasks: pendingByTaskId.size,
        hostHttp: `http://${HOST_HTTP_BIND}:${HOST_HTTP_PORT}`
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/events') {
      writeJson(res, 200, { ok: true, events: recentEvents });
      return;
    }

    if (req.method === 'POST' && pathname === '/command') {
      const body = await readJsonBody(req);
      const executeMsg = normalizeExecuteRequest(body);

      const waitForResult = body?.waitForResult !== false;
      const timeoutMs = Number(body?.timeoutMs) > 0 ? Number(body.timeoutMs) : REQUEST_TIMEOUT_MS;

      sendNative(executeMsg);

      if (!waitForResult) {
        writeJson(res, 202, { ok: true, accepted: true, taskId: executeMsg.taskId });
        return;
      }

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingByTaskId.delete(executeMsg.taskId);
          reject(new Error(`Timed out waiting for task ${executeMsg.taskId}`));
        }, timeoutMs);

        pendingByTaskId.set(executeMsg.taskId, {
          resolve,
          reject,
          timeout,
          logs: []
        });
      });

      writeJson(res, 200, {
        ok: true,
        taskId: executeMsg.taskId,
        ...result
      });
      return;
    }

    writeJson(res, 404, { ok: false, error: 'Not Found' });
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

httpServer.listen(HOST_HTTP_PORT, HOST_HTTP_BIND, () => {
  pushEvent('host_start', { bind: HOST_HTTP_BIND, port: HOST_HTTP_PORT });
  console.error(`[native-host] HTTP bridge listening on http://${HOST_HTTP_BIND}:${HOST_HTTP_PORT}`);
  sendNative({
    type: 'host_status',
    event: 'host_start',
    details: { mode: 'script_http', bind: HOST_HTTP_BIND, port: HOST_HTTP_PORT },
    ts: new Date().toISOString()
  });
});
