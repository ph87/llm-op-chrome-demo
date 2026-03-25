const NATIVE_HOST_NAME = 'com.codex.llm_bridge';
const RECONNECT_ALARM = 'llm-native-reconnect';

let nativePort = null;
let reconnectTimer = null;

console.log('[LLM JS Runner] service worker loaded');

function connectNativeHost() {
  if (nativePort) {
    console.log('[LLM JS Runner] native port already connected');
    return;
  }

  try {
    console.log('[LLM JS Runner] connecting native host', NATIVE_HOST_NAME);
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  } catch (error) {
    console.error('[LLM JS Runner] connectNative threw', error);
    scheduleReconnect();
    return;
  }

  nativePort.onMessage.addListener(async (message) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'host_status') {
      logLocal('host_status', message);
      return;
    }

    if (message.type === 'execute_js') {
      sendExtensionLog('info', 'execute_received', {
        taskId: message.taskId,
        codePreview: String(message.code || '').slice(0, 180)
      });
      await executeInActiveTab(message);
      return;
    }

    // For server side acknowledgements/debug payloads.
    logLocal('server_message', message);
  });

  nativePort.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    console.warn('[LLM JS Runner] native disconnect', err?.message || null);
    sendExtensionLog('warn', 'native_disconnect', {
      error: err?.message || null
    });
    nativePort = null;
    scheduleReconnect();
  });

  sendExtensionLog('info', 'native_connected', { host: NATIVE_HOST_NAME });
  console.log('[LLM JS Runner] native connected');
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  console.log('[LLM JS Runner] scheduling reconnect');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNativeHost();
  }, 1500);
}

async function executeInActiveTab(payload) {
  const { taskId, code } = payload;

  try {
    sendExtensionLog('info', 'execute_start', { taskId });
    const openTabResult = await tryOpenTabFromGeneratedCode(payload);
    if (openTabResult.handled) {
      sendExecutionResult({
        type: 'execution_result',
        taskId,
        ok: true,
        result: {
          message: openTabResult.result,
          openedTabId: openTabResult.tabId,
          openedTabUrl: openTabResult.tabUrl
        }
      });
      return;
    }

    const tab = await resolveExecutionTab(payload);
    await focusTab(tab);
    sendExtensionLog('info', 'execute_target_tab', {
      taskId,
      tabId: tab.id,
      tabUrl: tab.url
    });

    const executionProbe = await executeWithDebugger(tab.id, code);
    if (executionProbe?.runtimeError) {
      throw new Error(executionProbe.runtimeError);
    }

    sendExecutionResult({
      type: 'execution_result',
      taskId,
      ok: true,
      result: {
        value: executionProbe?.returnValue ?? null,
        probe: {
          before: executionProbe?.before ?? null,
          after: executionProbe?.after ?? null
        },
        targetTabId: tab.id,
        targetTabUrl: tab.url
      }
    });
    sendExtensionLog('info', 'execute_success', {
      taskId,
      probe: executionProbe
    });
  } catch (error) {
    sendExtensionLog('error', 'execute_error', {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    });
    sendExecutionResult({
      type: 'execution_result',
      taskId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function focusTab(tab) {
  if (!tab?.id) return;
  if (Number.isFinite(tab.windowId)) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  await chrome.tabs.update(tab.id, { active: true });
}

async function executeWithDebugger(tabId, jsCode) {
  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, '1.3');
  try {
    const expression = [
      '(async () => {',
      '  const __before = { url: location.href, title: document.title };',
      '  let __returnValue = null;',
      '  try {',
      '    __returnValue = (() => {',
      String(jsCode || ''),
      '    })();',
      '  } catch (e) {',
      '    return {',
      "      runtimeError: e?.message ? String(e.message) : String(e),",
      '      before: __before,',
      '      after: { url: location.href, title: document.title },',
      '      returnValue: null',
      '    };',
      '  }',
      '  return {',
      '    runtimeError: null,',
      '    before: __before,',
      '    after: { url: location.href, title: document.title },',
      '    returnValue: __returnValue',
      '  };',
      '})();'
    ].join('\n');

    const evalResult = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });

    if (evalResult?.exceptionDetails) {
      const text = evalResult.exceptionDetails.text || 'Runtime.evaluate exception';
      const line = Number.isFinite(evalResult.exceptionDetails.lineNumber)
        ? evalResult.exceptionDetails.lineNumber + 1
        : null;
      const col = Number.isFinite(evalResult.exceptionDetails.columnNumber)
        ? evalResult.exceptionDetails.columnNumber + 1
        : null;
      return {
        runtimeError: line && col ? `${text} at ${line}:${col}` : text,
        before: null,
        after: null,
        returnValue: null
      };
    }

    const value = evalResult?.result?.value;
    if (!value || typeof value !== 'object') {
      return {
        runtimeError: 'Runtime.evaluate returned non-object result',
        before: null,
        after: null,
        returnValue: null
      };
    }
    return value;
  } finally {
    try {
      await chrome.debugger.detach(debuggee);
    } catch {
      // ignore detach errors
    }
  }
}

async function tryOpenTabFromGeneratedCode(payload) {
  const code = payload?.code;
  const match = String(code).match(
    /window\.open\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]_blank['"`]\s*\)/i
  );
  if (!match) {
    return { handled: false };
  }

  let url = match[1].trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const openInNewWindow = Boolean(payload?.openInNewWindow);
  if (openInNewWindow) {
    const win = await chrome.windows.create({ url, focused: true });
    const openedTab = Array.isArray(win.tabs) && win.tabs.length > 0 ? win.tabs[0] : null;
    return {
      handled: true,
      result: `opened new window: ${url}`,
      tabId: openedTab?.id ?? null,
      tabUrl: openedTab?.url || url
    };
  }

  const tab = await chrome.tabs.create({ url });
  return {
    handled: true,
    result: `opened new tab: ${url}`,
    tabId: tab.id,
    tabUrl: tab.url
  };
}

async function resolveExecutionTab(payload) {
  const targetTabId =
    payload?.targetTabId == null || payload?.targetTabId === ''
      ? null
      : Number(payload.targetTabId);
  if (Number.isFinite(targetTabId)) {
    const tab = await chrome.tabs.get(targetTabId);
    if (!tab?.id) {
      throw new Error(`targetTabId not found: ${targetTabId}`);
    }
    return tab;
  }

  const targetUrlPattern = String(payload?.targetUrlPattern || '').trim().toLowerCase();
  if (targetUrlPattern) {
    const tabs = await chrome.tabs.query({});
    const found = tabs.find((t) => String(t.url || '').toLowerCase().includes(targetUrlPattern));
    if (!found?.id) {
      throw new Error(`No tab matched targetUrlPattern: ${targetUrlPattern}`);
    }
    return found;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab?.id) {
    throw new Error('No active tab found');
  }
  return activeTab;
}

function sendExecutionResult(message) {
  postNativeMessage(message);
}

function sendExtensionLog(level, event, details) {
  postNativeMessage({ type: 'extension_log', level, event, details });
}

function postNativeMessage(message) {
  if (!nativePort) {
    connectNativeHost();
  }
  if (nativePort) {
    try {
      nativePort.postMessage(message);
    } catch {
      // drop message if bridge is currently unavailable
    }
  }
}

function logLocal(event, details) {
  console.log('[LLM JS Runner]', event, details || {});
}

function ensureReconnectAlarm() {
  chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 0.5 });
}

connectNativeHost();
ensureReconnectAlarm();

chrome.runtime.onInstalled.addListener(() => {
  ensureReconnectAlarm();
  connectNativeHost();
});

chrome.runtime.onStartup.addListener(() => {
  ensureReconnectAlarm();
  connectNativeHost();
});

chrome.action.onClicked.addListener(() => {
  connectNativeHost();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) {
    connectNativeHost();
  }
});
