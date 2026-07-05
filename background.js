const ASKANCHOR_COMMANDS = new Set([
  "askanchor-open-anchors",
  "askanchor-follow-up-selection"
]);

function getExtensionApi() {
  return globalThis.browser || globalThis.chrome || null;
}

function queryActiveTab(api) {
  if (globalThis.browser?.tabs?.query) {
    return api.tabs.query({ active: true, currentWindow: true })
      .then((tabs) => (Array.isArray(tabs) ? tabs[0] : null))
      .catch(() => null);
  }

  return new Promise((resolve) => {
    try {
      const maybePromise = api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(Array.isArray(tabs) ? tabs[0] : null);
      });
      if (maybePromise?.then) {
        maybePromise.then((tabs) => resolve(Array.isArray(tabs) ? tabs[0] : null)).catch(() => resolve(null));
      }
    } catch (error) {
      resolve(null);
    }
  });
}

function sendCommandToTab(api, tabId, command) {
  if (!Number.isFinite(tabId)) {
    return;
  }

  const message = {
    type: "askanchor-command",
    command
  };

  try {
    if (globalThis.browser?.tabs?.sendMessage) {
      api.tabs.sendMessage(tabId, message).catch(() => {});
      return;
    }

    const maybePromise = api.tabs.sendMessage(tabId, message, () => {
      const runtimeError = api.runtime?.lastError;
      if (runtimeError) {
        // The active tab may be unsupported or not have the content script yet.
      }
    });
    if (maybePromise?.catch) {
      maybePromise.catch(() => {});
    }
  } catch (error) {
    // Ignore unsupported pages and unloaded content scripts.
  }
}

async function handleCommand(command) {
  if (!ASKANCHOR_COMMANDS.has(command)) {
    return;
  }

  const api = getExtensionApi();
  if (!api?.tabs?.query || !api.tabs.sendMessage) {
    return;
  }

  const tab = await queryActiveTab(api);
  sendCommandToTab(api, tab?.id, command);
}

getExtensionApi()?.commands?.onCommand?.addListener?.(handleCommand);
