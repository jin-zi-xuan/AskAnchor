(function registerAskAnchorCoreModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.core = function createAskAnchorCoreModule(ctx) {
    with (ctx) {
  function getSettingsStorageArea() {
    return getExtensionApi()?.storage?.local || null;
  }

  function getExtensionStorageArea() {
    return getExtensionApi()?.storage?.local || null;
  }

  function usesPromiseExtensionStorage() {
    return Boolean(globalThis.browser?.storage?.local);
  }

  function getDefaultEnabledPlatforms() {
    return globalThis.AskAnchorPlatforms?.getDefaultEnabledPlatforms?.() || {};
  }

  function normalizeEnabledPlatforms(value) {
    return core.normalizeEnabledPlatforms(value, globalThis.AskAnchorPlatforms);
  }

  function getCurrentPlatformId() {
    return globalThis.AskAnchorPlatforms?.getPlatformForHost?.(location.hostname)?.id
      || activeAdapter.name
      || "";
  }

  function isCurrentPlatformEnabled(settings = askAnchorSettings) {
    const platformId = getCurrentPlatformId();
    if (!platformId || platformId === "fallback" || platformId === "generic") {
      return true;
    }

    return settings.enabledPlatforms?.[platformId] !== false;
  }

  function normalizeSettings(value) {
    return core.normalizeSettings(value, globalThis.AskAnchorPlatforms);
  }

  function loadSettingsFromStorage() {
    const storageArea = getSettingsStorageArea();
    if (!storageArea?.get) {
      applySettings(DEFAULT_SETTINGS);
      return;
    }

    try {
      const storageKeys = [SETTINGS_STORAGE_KEY, LEGACY_SETTINGS_STORAGE_KEY];
      if (usesPromiseExtensionStorage()) {
        storageArea.get(storageKeys)
          .then((items) => applySettings(normalizeSettings(items?.[SETTINGS_STORAGE_KEY] || items?.[LEGACY_SETTINGS_STORAGE_KEY])))
          .catch(() => applySettings(DEFAULT_SETTINGS));
        return;
      }

      const maybePromise = storageArea.get(storageKeys, (items) => {
        applySettings(normalizeSettings(items?.[SETTINGS_STORAGE_KEY] || items?.[LEGACY_SETTINGS_STORAGE_KEY]));
      });
      if (maybePromise?.then) {
        maybePromise
          .then((items) => applySettings(normalizeSettings(items?.[SETTINGS_STORAGE_KEY] || items?.[LEGACY_SETTINGS_STORAGE_KEY])))
          .catch(() => applySettings(DEFAULT_SETTINGS));
      }
    } catch (error) {
      console.debug("[AskAnchor] Failed to load settings:", error);
      applySettings(DEFAULT_SETTINGS);
    }
  }

  function installExtensionMessageListeners() {
    const api = getExtensionApi();
    api?.runtime?.onMessage?.addListener?.((message) => {
      if (message?.type !== "askanchor-command") {
        return;
      }

      handleExtensionCommand(message.command);
    });

    api?.storage?.onChanged?.addListener?.((changes, areaName) => {
      const settingsChange = changes?.[SETTINGS_STORAGE_KEY] || changes?.[LEGACY_SETTINGS_STORAGE_KEY];
      if (areaName !== "local" || !settingsChange) {
        return;
      }

      applySettings(normalizeSettings(settingsChange.newValue));
    });
  }

  function applySettings(nextSettings) {
    askAnchorSettings = normalizeSettings(nextSettings);

    if (!isCurrentPlatformEnabled()) {
      platformDisabledBySettings = true;
      shutdownAskAnchor();
      return;
    }

    if (platformDisabledBySettings && !askAnchorStarted) {
      showToast("AskAnchor 已重新启用，刷新页面后生效");
      return;
    }

    if (!askAnchorStarted) {
      startAskAnchor();
      return;
    }

    document.documentElement.classList.toggle("ask-anchor-cat-disabled", !askAnchorSettings.showCat);
    document.documentElement.classList.toggle("ask-anchor-eye-tracking-disabled", !askAnchorSettings.eyeTracking);

    if (!askAnchorSettings.eyeTracking) {
      resetCatEyes();
    }

    if (!askAnchorSettings.showCat) {
      closeAnchorList();
    }

    renderAnchorDock();
    renderStandaloneAnchorPanel();
  }

  function updateStoredSettings(partialSettings) {
    const nextSettings = normalizeSettings({
      ...askAnchorSettings,
      ...partialSettings
    });
    applySettings(nextSettings);

    const storageArea = getSettingsStorageArea();
    if (!storageArea?.set) {
      return;
    }

    try {
      const payload = { [SETTINGS_STORAGE_KEY]: nextSettings };
      if (usesPromiseExtensionStorage()) {
        storageArea.set(payload).catch((error) => {
          console.debug("[AskAnchor] Failed to save settings:", error);
        });
        return;
      }

      const maybePromise = storageArea.set(payload, () => {});
      if (maybePromise?.catch) {
        maybePromise.catch((error) => {
          console.debug("[AskAnchor] Failed to save settings:", error);
        });
      }
    } catch (error) {
      console.debug("[AskAnchor] Failed to save settings:", error);
    }
  }

  function installRouteChangeListeners() {
    window.addEventListener("popstate", handleUrlChangeIfNeeded);
    window.addEventListener("hashchange", handleUrlChangeIfNeeded);
    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
  }

  function getPersistentStorageItem(storageKey) {
    const storageArea = getExtensionStorageArea();
    if (!storageArea?.get) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      try {
        if (usesPromiseExtensionStorage()) {
          storageArea.get(storageKey).then((items) => resolve(items || {})).catch(() => resolve({}));
          return;
        }

        const maybePromise = storageArea.get(storageKey, (items) => resolve(items || {}));
        if (maybePromise?.then) {
          maybePromise.then((items) => resolve(items || {})).catch(() => resolve({}));
        }
      } catch (error) {
        resolve({});
      }
    });
  }

  function setPersistentStorageItem(storageKey, value, debugLabel = "data") {
    const storageArea = getExtensionStorageArea();
    if (!storageArea?.set) {
      return;
    }

    try {
      const data = { [storageKey]: value };
      if (usesPromiseExtensionStorage()) {
        storageArea.set(data).catch((error) => {
          console.debug(`[AskAnchor] Failed to persist ${debugLabel} to extension storage:`, error);
        });
        return;
      }

      const maybePromise = storageArea.set(data, () => {
        const error = getExtensionApi()?.runtime?.lastError;
        if (error) {
          console.debug(`[AskAnchor] Failed to persist ${debugLabel} to extension storage:`, error);
        }
      });
      if (maybePromise?.catch) {
        maybePromise.catch((error) => {
          console.debug(`[AskAnchor] Failed to persist ${debugLabel} to extension storage:`, error);
        });
      }
    } catch (error) {
      console.debug(`[AskAnchor] Failed to persist ${debugLabel} to extension storage:`, error);
    }
  }

  function startRoutePolling() {
    stopRoutePolling();
    routePollTimer = window.setInterval(handleUrlChangeIfNeeded, 1000);
  }

  function stopRoutePolling() {
    window.clearInterval(routePollTimer);
    routePollTimer = null;
  }

  function uninstallRouteChangeListeners() {
    window.removeEventListener("popstate", handleUrlChangeIfNeeded);
    window.removeEventListener("hashchange", handleUrlChangeIfNeeded);
    restoreHistoryMethod("pushState");
    restoreHistoryMethod("replaceState");
  }

  function wrapHistoryMethod(methodName) {
    const original = history[methodName];
    if (typeof original !== "function" || original.__askAnchorWrapped) {
      return;
    }

    const wrapped = function askAnchorHistoryWrapper(...args) {
      const result = original.apply(this, args);
      window.setTimeout(handleUrlChangeIfNeeded, 0);
      return result;
    };
    wrapped.__askAnchorWrapped = true;
    wrapped.__askAnchorOriginal = original;

    try {
      history[methodName] = wrapped;
    } catch (error) {
      console.debug("[AskAnchor] Failed to wrap history method:", methodName, error);
    }
  }

  function restoreHistoryMethod(methodName) {
    const wrapped = history[methodName];
    if (!wrapped?.__askAnchorWrapped || typeof wrapped.__askAnchorOriginal !== "function") {
      return;
    }

    try {
      history[methodName] = wrapped.__askAnchorOriginal;
    } catch (error) {
      console.debug("[AskAnchor] Failed to restore history method:", methodName, error);
    }
  }

  function handleUrlChangeIfNeeded() {
    if (!askAnchorStarted) {
      return false;
    }

    if (location.href === lastObservedUrl) {
      return false;
    }

    lastObservedUrl = location.href;
    handleConversationRouteChange();
    return true;
  }

  function handleConversationMutations(mutations) {
    const routeChanged = handleUrlChangeIfNeeded();
    if (pendingFollowUp) {
      schedulePendingFollowUpCheck();
    }

    if (routeChanged || hasMessageStructureMutation(mutations)) {
      scheduleConversationRootRefresh();
      scheduleConversationTimelineRender();
    }
  }

  function observeConversationRoot() {
    const nextRoot = findConversationRoot();
    if (!nextRoot || nextRoot === observedConversationRoot) {
      return;
    }

    conversationObserver.disconnect();
    observedConversationRoot = nextRoot;
    conversationObserver.observe(observedConversationRoot, {
      childList: true,
      subtree: true
    });
  }

  function scheduleConversationRootRefresh() {
    if (conversationRootRefreshTimer) {
      return;
    }

    conversationRootRefreshTimer = window.setTimeout(() => {
      conversationRootRefreshTimer = null;
      observeConversationRoot();
    }, CONVERSATION_ROOT_REFRESH_DELAY);
  }

  function findConversationRoot() {
    const platformRoot = activeAdapter.findConversationRoot?.();
    if (platformRoot && !platformRoot.closest(`#${DOCK_ID}, #${PANEL_ID}, #${TIMELINE_ID}, #${TIMELINE_PREVIEW_ID}, #${BUTTON_ID}, #${TOAST_ID}`)) {
      return platformRoot;
    }

    const messages = collectTimelineMessageElements();
    if (messages.length >= 2) {
      return getUsefulConversationAncestor(findCommonAncestor(messages)) || document.body;
    }

    if (messages.length === 1) {
      return getUsefulConversationAncestor(messages[0]) || document.body;
    }

    const selectors = [
      "main",
      "[role='main']",
      "[data-testid*='conversation']",
      "[data-testid*='chat']",
      "[class*='conversation' i]",
      "[class*='chat' i]"
    ];

    for (const selector of selectors) {
      try {
        const node = document.querySelector(selector);
        if (node && !node.closest(`#${DOCK_ID}, #${PANEL_ID}, #${TIMELINE_ID}, #${TIMELINE_PREVIEW_ID}, #${BUTTON_ID}, #${TOAST_ID}`)) {
          return node;
        }
      } catch (error) {
        console.debug("[AskAnchor] Ignored invalid conversation root selector:", selector, error);
      }
    }

    return document.body;
  }

  function findCommonAncestor(elements) {
    if (!elements.length) {
      return null;
    }

    let ancestor = elements[0];
    while (ancestor && elements.some((element) => !ancestor.contains(element))) {
      ancestor = ancestor.parentElement;
    }
    return ancestor || null;
  }

  function getUsefulConversationAncestor(element) {
    let current = element;
    let fallback = element?.parentElement || element;
    let depth = 0;
    while (current && current !== document.body && current !== document.documentElement) {
      if (current.matches?.("main, [role='main'], [data-testid*='conversation'], [data-testid*='chat'], [class*='conversation' i], [class*='chat' i]")) {
        return current;
      }

      const parent = current.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) {
        break;
      }
      if (depth < 3) {
        fallback = parent;
      }
      current = parent;
      depth += 1;
    }

    return fallback && fallback !== document.documentElement ? fallback : document.body;
  }

  function hasMessageStructureMutation(mutations) {
    return mutations.some((mutation) => {
      if (mutation.type !== "childList") {
        return false;
      }

      return Array.from(mutation.addedNodes).some(isPotentialMessageMutationNode)
        || Array.from(mutation.removedNodes).some(isPotentialMessageMutationNode);
    });
  }

  function isPotentialMessageMutationNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node;
    if (element.closest?.(`#${DOCK_ID}, #${PANEL_ID}, #${TIMELINE_ID}, #${TIMELINE_PREVIEW_ID}, #${BUTTON_ID}, #${TOAST_ID}`)) {
      return false;
    }

    if (timelineState.messageToTick.has(element)) {
      return true;
    }

    const selectors = getTimelineMessageSelectors();
    return matchesAnySelector(element, selectors)
      || hasDescendantMatchingAnySelector(element, selectors)
      || Array.from(timelineState.messageToTick.keys()).some((message) => element.contains(message));
  }

  const conversationObserver = new MutationObserver(handleConversationMutations);

  function startAskAnchor() {
    if (askAnchorStarted) {
      return;
    }

    askAnchorStarted = true;
    platformDisabledBySettings = false;
    document.documentElement.classList.toggle("ask-anchor-cat-disabled", !askAnchorSettings.showCat);
    document.documentElement.classList.toggle("ask-anchor-eye-tracking-disabled", !askAnchorSettings.eyeTracking);

    document.addEventListener("selectionchange", handleSelectionChangeDebounced);
    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("keyup", handleDocumentKeyup);
    document.addEventListener("pointerdown", handleAnchorListOutsidePointerDown, true);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("click", handlePossibleSendClick, true);
    document.addEventListener("keydown", handlePossibleSendKeydown, true);
    document.addEventListener("pointermove", handleCatEyePointerMove, { passive: true });
    document.addEventListener("pointerleave", resetCatEyes);
    window.addEventListener("blur", resetCatEyes);
    window.addEventListener("resize", updateCatDockPosition);
    window.addEventListener("scroll", updateCatDockPosition, { passive: true });
    document.addEventListener("scroll", updateCatDockPosition, { passive: true, capture: true });
    installPromptEditorTracking();

    installRouteChangeListeners();
    startRoutePolling();
    observeConversationRoot();
    renderAnchorDock();
    anchorLoadTimer = window.setTimeout(() => {
      anchorLoadTimer = null;
      loadAnchorsFromSession();
    }, 500);
    initialTimelineTimer = window.setTimeout(() => {
      initialTimelineTimer = null;
      updateConversationTimeline();
    }, 900);
  }

  function shutdownAskAnchor() {
    if (!askAnchorStarted) {
      removeAskAnchorUi();
      return;
    }

    askAnchorStarted = false;
    document.removeEventListener("selectionchange", handleSelectionChangeDebounced);
    document.removeEventListener("mouseup", handleSelectionChange);
    document.removeEventListener("keyup", handleDocumentKeyup);
    document.removeEventListener("pointerdown", handleAnchorListOutsidePointerDown, true);
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("click", handlePossibleSendClick, true);
    document.removeEventListener("keydown", handlePossibleSendKeydown, true);
    document.removeEventListener("pointermove", handleCatEyePointerMove);
    document.removeEventListener("pointerleave", resetCatEyes);
    window.removeEventListener("blur", resetCatEyes);
    window.removeEventListener("resize", updateCatDockPosition);
    window.removeEventListener("scroll", updateCatDockPosition);
    document.removeEventListener("scroll", updateCatDockPosition, true);
    uninstallPromptEditorTracking();
    uninstallRouteChangeListeners();
    stopRoutePolling();
    conversationObserver.disconnect();
    observedConversationRoot = null;
    clearAskAnchorTimers();
    removeAskAnchorUi();
  }

  function clearAskAnchorTimers() {
    window.clearTimeout(selectionTimer);
    window.clearTimeout(conversationRootRefreshTimer);
    window.clearTimeout(conversationTimelineTimer);
    window.clearTimeout(anchorLoadTimer);
    window.clearTimeout(initialTimelineTimer);
    window.clearInterval(routePollTimer);
    window.clearTimeout(pendingFollowUpTimer);
    window.clearInterval(pendingFollowUpPollTimer);
    window.clearInterval(sentQuestionStabilizeTimer);
    window.clearTimeout(showToast.timer);
    window.clearTimeout(showToast.hideTimer);
    selectionTimer = null;
    conversationRootRefreshTimer = null;
    conversationTimelineTimer = null;
    anchorLoadTimer = null;
    initialTimelineTimer = null;
    routePollTimer = null;
    pendingFollowUpTimer = null;
    pendingFollowUpPollTimer = null;
    sentQuestionStabilizeTimer = null;
  }

  function removeAskAnchorUi() {
    resetCatEyes();
    resetConversationTimeline();
    [BUTTON_ID, FOLLOW_UP_MENU_ID, DOCK_ID, PANEL_ID, TIMELINE_PREVIEW_ID, TOAST_ID]
      .forEach((id) => document.getElementById(id)?.remove());
    document.querySelectorAll(`.${MARKER_CLASS}`).forEach((marker) => marker.remove());
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((node) => node.classList.remove(HIGHLIGHT_CLASS));
    currentSelection = null;
    lastValidSelection = null;
    activeAnchorId = null;
    pendingFollowUp = null;
    document.documentElement.classList.remove("ask-anchor-cat-disabled", "ask-anchor-eye-tracking-disabled");
  }

      return {
        getSettingsStorageArea,
        getExtensionStorageArea,
        usesPromiseExtensionStorage,
        getDefaultEnabledPlatforms,
        normalizeEnabledPlatforms,
        getCurrentPlatformId,
        isCurrentPlatformEnabled,
        normalizeSettings,
        loadSettingsFromStorage,
        installExtensionMessageListeners,
        applySettings,
        updateStoredSettings,
        getPersistentStorageItem,
        setPersistentStorageItem,
        installRouteChangeListeners,
        startRoutePolling,
        stopRoutePolling,
        uninstallRouteChangeListeners,
        wrapHistoryMethod,
        restoreHistoryMethod,
        handleUrlChangeIfNeeded,
        handleConversationMutations,
        observeConversationRoot,
        scheduleConversationRootRefresh,
        findConversationRoot,
        findCommonAncestor,
        getUsefulConversationAncestor,
        hasMessageStructureMutation,
        isPotentialMessageMutationNode,
        startAskAnchor,
        shutdownAskAnchor,
        clearAskAnchorTimers,
        removeAskAnchorUi
      };
    }
  };
})(globalThis);
