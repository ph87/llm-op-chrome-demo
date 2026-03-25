const NATIVE_HOST_NAME = 'com.argentum.chrome_bridge';

let nativePort = null;
let reconnectTimer = null;

connectNativeHost();
chrome.runtime.onStartup.addListener(connectNativeHost);
chrome.runtime.onInstalled.addListener(connectNativeHost);
chrome.action.onClicked.addListener(connectNativeHost);

function connectNativeHost() {
  if (nativePort !== null) return;

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  } catch (error) {
    console.error('[chrome-bridge] connectNative failed', error);
    scheduleReconnect();
    return;
  }

  nativePort.onMessage.addListener(async (message) => {
    const invalidMessage =
      message === null ||
      message === undefined ||
      typeof message !== 'object';
    if (invalidMessage) return;

    if (message.type === 'execute_js') {
      await handleExecute(message);
      return;
    }

    if (message.type === 'list_tabs') {
      await handleListTabs(message);
      return;
    }
  });

  nativePort.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    console.warn('[chrome-bridge] native disconnected', err?.message || null);
    nativePort = null;
    scheduleReconnect();
  });

  sendNative({
    type: 'host_status',
    event: 'extension_connected',
    ts: new Date().toISOString()
  });
}

function scheduleReconnect() {
  if (reconnectTimer !== null) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNativeHost();
  }, 1500);
}

async function handleExecute(payload) {
  const taskId = String(payload.taskId || '');
  const code = String(payload.code || '').trim();

  if (taskId === '') {
    sendNative({
      type: 'execution_result',
      taskId: '',
      ok: false,
      error: 'Missing taskId'
    });
    return;
  }

  if (code === '') {
    sendNative({
      type: 'execution_result',
      taskId,
      ok: false,
      error: 'Missing code'
    });
    return;
  }

  try {
    const tab = await resolveTargetTab(payload);
    const before = { url: tab.url || null, title: tab.title || null };
    const evalResult = await evaluateInTabWithDebugger(tab.id, code);
    if (evalResult.exceptionDetails) {
      const errText =
        evalResult.exceptionDetails.text ||
        evalResult.result?.description ||
        'Execution failed';
      throw new Error(errText);
    }

    const afterTab = await chrome.tabs.get(tab.id).catch(() => null);

    sendNative({
      type: 'execution_result',
      taskId,
      ok: true,
      result: {
        value: evalResult.result?.value ?? null,
        targetTabId: tab.id,
        targetTabUrl: (afterTab && afterTab.url) || tab.url || null,
        probe: {
          before,
          after: {
            url: (afterTab && afterTab.url) || before.url,
            title: (afterTab && afterTab.title) || before.title
          }
        }
      }
    });
  } catch (error) {
    sendNative({
      type: 'execution_result',
      taskId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleListTabs(payload) {
  const taskId = String(payload.taskId || '');
  if (taskId === '') {
    sendNative({
      type: 'execution_result',
      taskId: '',
      ok: false,
      error: 'Missing taskId'
    });
    return;
  }

  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const rows = [];

    for (const win of windows) {
      const winId = win.id ?? null;
      const winTabs = Array.isArray(win.tabs) ? win.tabs : [];
      for (const tab of winTabs) {
        rows.push({
          windowId: winId,
          tabId: tab.id ?? null,
          index: tab.index ?? null,
          active: Boolean(tab.active),
          pinned: Boolean(tab.pinned),
          audible: Boolean(tab.audible),
          discarded: Boolean(tab.discarded),
          title: tab.title || null,
          url: tab.url || null
        });
      }
    }

    sendNative({
      type: 'execution_result',
      taskId,
      ok: true,
      result: {
        value: {
          totalWindows: windows.length,
          totalTabs: rows.length,
          tabs: rows
        }
      }
    });
  } catch (error) {
    sendNative({
      type: 'execution_result',
      taskId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function evaluateInTabWithDebugger(tabId, expression) {
  const target = { tabId };
  await debuggerAttach(target);
  try {
    return await debuggerSendCommand(target, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
      allowUnsafeEvalBlockedByCSP: true
    });
  } finally {
    await debuggerDetach(target).catch(() => undefined);
  }
}

function debuggerAttach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, '1.3', () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || 'debugger.attach failed'));
        return;
      }
      resolve();
    });
  });
}

function debuggerSendCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || `${method} failed`));
        return;
      }
      resolve(result);
    });
  });
}

function debuggerDetach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || 'debugger.detach failed'));
        return;
      }
      resolve();
    });
  });
}

async function resolveTargetTab(payload) {
  const targetTabId =
    payload?.targetTabId == null || payload?.targetTabId === ''
      ? null
      : Number(payload.targetTabId);

  if (Number.isFinite(targetTabId)) {
    const tab = await chrome.tabs.get(targetTabId);
    const invalidTab = tab === null || tab === undefined || tab.id === undefined;
    if (invalidTab) {
      throw new Error(`targetTabId not found: ${targetTabId}`);
    }
    return tab;
  }

  const targetUrlPattern = String(payload?.targetUrlPattern || '').trim().toLowerCase();
  if (targetUrlPattern !== '') {
    const tabs = await chrome.tabs.query({});
    const matched = tabs.find((tab) => String(tab.url || '').toLowerCase().includes(targetUrlPattern));
    const noMatch = matched === null || matched === undefined || matched.id === undefined;
    if (noMatch) {
      throw new Error(`No tab matches targetUrlPattern: ${targetUrlPattern}`);
    }
    return matched;
  }

  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTab = activeTabs[0];
  const noActive = activeTab === null || activeTab === undefined || activeTab.id === undefined;
  if (noActive) {
    throw new Error('No active tab found');
  }
  return activeTab;
}

function sendNative(message) {
  if (nativePort === null) return;
  try {
    nativePort.postMessage(message);
  } catch (error) {
    console.error('[chrome-bridge] postMessage failed', error);
  }
}
