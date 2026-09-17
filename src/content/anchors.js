(function registerAskAnchorAnchorsModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.anchors = function createAskAnchorAnchorsModule(ctx) {
    with (ctx) {
  const QUOTE_CARD_ID = "ask-anchor-quote-card";
  const QUOTE_CONTEXT_LENGTH = 80;
  let anchorNavigationId = 0;
  let cancelPendingAnchorScroll = null;

  function addAnchor({ text, range, selector, messageLocator, blockLocator, selectionLocator, anchorVersion, marker, element, scrollY, scrollPosition }) {
    const anchor = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: createAnchorName(text),
      text,
      range,
      selector,
      messageLocator,
      blockLocator,
      selectionLocator,
      anchorVersion,
      marker,
      element,
      scrollY,
      scrollPosition,
      createdAt: new Date(),
      status: ANCHOR_STATUS_UNRESOLVED
    };

    anchors.unshift(anchor);
    anchors = anchors.slice(0, MAX_ANCHORS);
    persistAnchorsToSession();
    return anchor;
  }

  function serializeAnchorsForStorage() {
    return anchors.map((anchor) => {
      const payload = {
        id: anchor.id,
        name: anchor.name,
        text: anchor.text,
        selector: anchor.selector,
        messageLocator: anchor.messageLocator || null,
        scrollY: anchor.scrollY,
        createdAt: anchor.createdAt instanceof Date ? anchor.createdAt.toISOString() : anchor.createdAt,
        status: normalizeAnchorStatus(anchor.status)
      };

      if (anchor.anchorVersion === 2) {
        payload.anchorVersion = 2;
        payload.blockLocator = anchor.blockLocator || null;
        payload.selectionLocator = anchor.selectionLocator || null;
      }

      const scrollPosition = serializeAnchorScrollPosition(anchor.scrollPosition);
      if (scrollPosition) {
        payload.scrollPosition = scrollPosition;
      }

      return payload;
    });
  }

  function persistAnchorsToSession() {
    const payload = serializeAnchorsForStorage();
    const storageKey = getAnchorStorageKey();

    try {
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      console.debug("[AskAnchor] Failed to persist anchors:", error);
    }

    persistAnchorsToLocalStorage(storageKey, payload);
  }

  function persistAnchorsToLocalStorage(storageKey, payload) {
    setPersistentStorageItem(storageKey, payload, "anchors");
  }

  function loadAnchorsFromSession() {
    const storageKey = getAnchorStorageKey();
    activeAnchorStorageKey = storageKey;

    loadAnchorsFromLocalStorage(storageKey)
      .then((loaded) => {
        if (!loaded || activeAnchorStorageKey !== storageKey) {
          return;
        }

        renderAnchorDock();
      })
      .catch((error) => {
        console.debug("[AskAnchor] Failed to load anchors from extension storage:", error);
      });

    loadAnchorsFromSessionFallback(storageKey, { shouldPersistToLocal: false });
  }

  function loadAnchorsFromSessionFallback(storageKey, options = {}) {
    if (activeAnchorStorageKey !== storageKey) {
      return false;
    }

    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        anchors = [];
        activeAnchorId = null;
        renderAnchorDock();
        return false;
      }

      const parsed = JSON.parse(raw);
      const didLoad = applyStoredAnchors(parsed);
      if (options.shouldPersistToLocal && didLoad) {
        persistAnchorsToLocalStorage(storageKey, serializeAnchorsForStorage());
      }

      renderAnchorDock();
      return didLoad;
    } catch (error) {
      console.debug("[AskAnchor] Failed to load anchors:", error);
      return false;
    }
  }

  async function loadAnchorsFromLocalStorage(storageKey) {
    if (!getExtensionStorageArea()?.get) {
      return loadAnchorsFromSessionFallback(storageKey, { shouldPersistToLocal: false });
    }

    const items = await getPersistentStorageItem(storageKey);
    if (activeAnchorStorageKey !== storageKey) {
      return false;
    }

    const storedValue = items?.[storageKey];
    if (Array.isArray(storedValue)) {
      return applyStoredAnchors(storedValue);
    }

    return loadAnchorsFromSessionFallback(storageKey, { shouldPersistToLocal: true });
  }

  function applyStoredAnchors(storedAnchors) {
    if (!Array.isArray(storedAnchors) || storedAnchors.length === 0) {
      anchors = [];
      activeAnchorId = null;
      return false;
    }

    anchors = storedAnchors.slice(0, MAX_ANCHORS).map((item) => {
      const blockLocator = normalizeBlockLocator(item.blockLocator);
      const selectionLocator = normalizeSelectionLocator(item.selectionLocator);
      const isV2 = item.anchorVersion === 2 && blockLocator && selectionLocator;
      return {
        id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: item.name || createAnchorName(item.text),
        text: item.text || "",
        selector: item.selector || null,
        messageLocator: normalizeMessageLocator(item.messageLocator),
        blockLocator: isV2 ? blockLocator : null,
        selectionLocator: isV2 ? selectionLocator : null,
        anchorVersion: isV2 ? 2 : 1,
        scrollY: typeof item.scrollY === "number" ? item.scrollY : window.scrollY,
        scrollPosition: normalizeAnchorScrollPosition(item.scrollPosition),
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        status: normalizeAnchorStatus(item.status),
        range: null,
        marker: null,
        element: document.body
      };
    });
    if (activeAnchorId && !anchors.some((anchor) => anchor.id === activeAnchorId)) {
      activeAnchorId = null;
    }
    return true;
  }

  function getAnchorStorageKey() {
    return `${STORAGE_KEY_PREFIX}${location.origin}${location.pathname}${location.search}`;
  }

  function serializeAnchorScrollPosition(position) {
    if (!position || typeof position !== "object") {
      return null;
    }

    return {
      windowTop: Number.isFinite(position.windowTop) ? position.windowTop : null,
      containerTop: Number.isFinite(position.containerTop) ? position.containerTop : null,
      scrollContainers: Array.isArray(position.scrollContainers)
        ? position.scrollContainers.filter((item) => typeof item?.selector === 'string' && Number.isFinite(item.top))
          .map((item) => ({ selector: item.selector, top: item.top }))
        : null
    };
  }

  function normalizeAnchorScrollPosition(position) {
    const serialized = serializeAnchorScrollPosition(position);
    return serialized ? { ...serialized, container: null } : null;
  }

  function handleConversationRouteChange() {
    const nextKey = getAnchorStorageKey();
    if (nextKey === activeAnchorStorageKey) {
      observeConversationRoot();
      return;
    }

    cancelPendingAnchorScroll?.();
    anchorNavigationId += 1;
    activeAnchorStorageKey = nextKey;
    closeAnchorList();
    resetConversationTimeline();
    observeConversationRoot();
    loadAnchorsFromSession();
    scheduleConversationTimelineRender();
  }

  function ensureCurrentConversationAnchorsLoaded() {
    const nextKey = getAnchorStorageKey();
    if (nextKey === activeAnchorStorageKey) {
      return;
    }

    handleConversationRouteChange();
  }

  function createAnchorName(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= ANCHOR_NAME_LENGTH) {
      return normalized || UNNAMED_ANCHOR_NAME;
    }

    return `${normalized.slice(0, ANCHOR_NAME_LENGTH)}...`;
  }

  function normalizeAnchorName(name) {
    return String(name || "").replace(/\s+/g, " ").trim() || UNNAMED_ANCHOR_NAME;
  }

  function normalizeAnchorStatus(status) {
    return status === ANCHOR_STATUS_UNDERSTOOD ? ANCHOR_STATUS_UNDERSTOOD : ANCHOR_STATUS_UNRESOLVED;
  }

  function getAnchorStatusLabel(status) {
    return normalizeAnchorStatus(status) === ANCHOR_STATUS_UNDERSTOOD ? "\u5df2\u7406\u89e3" : "\u672a\u89e3\u51b3";
  }

  function renderAnchorDock() {
    let dock = document.getElementById(DOCK_ID);
    if (!dock) {
      dock = document.createElement("div");
      dock.id = DOCK_ID;
      dock.innerHTML = `
        <button class="ask-anchor-dock-button" type="button" aria-label="AskAnchor" aria-expanded="false">
          <img class="ask-anchor-cat-image" alt="" aria-hidden="true">
          <span class="ask-anchor-cat-eye ask-anchor-cat-eye--left" aria-hidden="true">
            <span class="ask-anchor-cat-pupil"></span>
          </span>
          <span class="ask-anchor-cat-eye ask-anchor-cat-eye--right" aria-hidden="true">
            <span class="ask-anchor-cat-pupil"></span>
          </span>
          <span class="ask-anchor-cat-blink ask-anchor-cat-blink--left" aria-hidden="true"></span>
          <span class="ask-anchor-cat-blink ask-anchor-cat-blink--right" aria-hidden="true"></span>
          <span class="ask-anchor-cat-hint" aria-hidden="true">\u53cc\u51fb\u9690\u85cf\u5c0f\u732b</span>
        </button>
        <div id="${LIST_ID}" class="ask-anchor-anchor-list" hidden></div>
      `;
      document.documentElement.appendChild(dock);

      const catImage = dock.querySelector(".ask-anchor-cat-image");
      catImage.src = CAT_IMAGE_URL;

      const catButton = dock.querySelector(".ask-anchor-dock-button");
      catButton.addEventListener("click", handleCatClick);
      catButton.addEventListener("dblclick", tuckCatDock);
      catButton.addEventListener("pointerdown", startCatDrag);
    }

    ensureCatFaceLayers(dock);

    const button = dock.querySelector(".ask-anchor-dock-button");
    const list = dock.querySelector(`#${LIST_ID}`);
    button.title = `AskAnchor - ${anchors.length} \u4e2a\u951a\u70b9`;
    renderAnchorItems(list);
    renderStandaloneAnchorPanel();

    updateConversationTimeline();
    updateCatDockPosition();
  }

  function renderAnchorItems(list) {
    if (!list) {
      return;
    }

    list.innerHTML = "";
    anchors.forEach((anchor, index) => {
      list.appendChild(createAnchorItem(anchor, index));
    });
  }

  function createAnchorItem(anchor, index) {
    anchor.status = normalizeAnchorStatus(anchor.status);

    const item = document.createElement("div");
    item.className = [
      "ask-anchor-anchor-item",
      anchor.id === activeAnchorId ? "is-active" : "",
      anchor.status === ANCHOR_STATUS_UNDERSTOOD ? "is-understood" : ""
    ].filter(Boolean).join(" ");
    item.innerHTML = `
      <button class="ask-anchor-anchor-main" type="button">
        <span class="ask-anchor-anchor-index" aria-hidden="true">
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--one"></span>
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--two"></span>
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--three"></span>
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--four"></span>
          <span class="ask-anchor-paw__pad"></span>
        </span>
        <span class="ask-anchor-anchor-name"></span>
      </button>
      <div class="ask-anchor-anchor-actions" aria-label="\u951a\u70b9\u7ba1\u7406\u64cd\u4f5c">
        <button class="ask-anchor-anchor-status" type="button"></button>
        <button class="ask-anchor-anchor-action ask-anchor-anchor-rename" type="button" aria-label="\u91cd\u547d\u540d\u951a\u70b9" title="\u91cd\u547d\u540d">\u270e</button>
        <button class="ask-anchor-anchor-action ask-anchor-anchor-delete" type="button" aria-label="\u5220\u9664\u951a\u70b9" title="\u5220\u9664">\u00d7</button>
      </div>
    `;

    item.querySelector(".ask-anchor-anchor-name").textContent = anchor.name;
    const mainButton = item.querySelector(".ask-anchor-anchor-main");
    mainButton.setAttribute("aria-label", `\u8fd4\u56de\u951a\u70b9 ${index + 1}\uff1a${anchor.name}`);
    mainButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeAnchorList();
      returnToAnchor(anchor.id);
    });
    item.addEventListener("click", (event) => {
      if (event.target.closest(".ask-anchor-anchor-actions, .ask-anchor-anchor-editor, .ask-anchor-anchor-name-input")) {
        return;
      }

      closeAnchorList();
      returnToAnchor(anchor.id);
    });

    const statusButton = item.querySelector(".ask-anchor-anchor-status");
    statusButton.textContent = getAnchorStatusLabel(anchor.status);
    statusButton.setAttribute("aria-label", `\u6807\u8bb0\u4e3a${anchor.status === ANCHOR_STATUS_UNDERSTOOD ? "\u672a\u89e3\u51b3" : "\u5df2\u7406\u89e3"}`);
    statusButton.title = anchor.status === ANCHOR_STATUS_UNDERSTOOD ? "\u6807\u8bb0\u4e3a\u672a\u89e3\u51b3" : "\u6807\u8bb0\u4e3a\u5df2\u7406\u89e3";
    statusButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleAnchorStatus(anchor.id);
    });

    const renameButton = item.querySelector(".ask-anchor-anchor-rename");
    renameButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startRenameAnchor(anchor.id, item);
    });

    const deleteButton = item.querySelector(".ask-anchor-anchor-delete");
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteAnchor(anchor.id);
    });

    return item;
  }

  function toggleAnchorStatus(id) {
    const anchor = anchors.find((item) => item.id === id);
    if (!anchor) {
      return;
    }

    anchor.status = normalizeAnchorStatus(anchor.status) === ANCHOR_STATUS_UNDERSTOOD
      ? ANCHOR_STATUS_UNRESOLVED
      : ANCHOR_STATUS_UNDERSTOOD;
    persistAnchorsToSession();
    renderAnchorDock();
  }

  function deleteAnchor(id) {
    const nextAnchors = anchors.filter((anchor) => anchor.id !== id);
    if (nextAnchors.length === anchors.length) {
      return;
    }

    anchors = nextAnchors;
    if (activeAnchorId === id) {
      activeAnchorId = null;
    }

    persistAnchorsToSession();
    renderAnchorDock();
    if (anchors.length === 0) {
      closeAnchorList();
    }
  }

  function startRenameAnchor(id, item) {
    const anchor = anchors.find((candidate) => candidate.id === id);
    const mainButton = item.querySelector(".ask-anchor-anchor-main");
    if (!anchor || !mainButton || item.querySelector(".ask-anchor-anchor-name-input")) {
      return;
    }

    const editor = document.createElement("div");
    editor.className = "ask-anchor-anchor-editor";
    editor.innerHTML = `
      <span class="ask-anchor-anchor-index" aria-hidden="true">
        <span class="ask-anchor-paw__toe ask-anchor-paw__toe--one"></span>
        <span class="ask-anchor-paw__toe ask-anchor-paw__toe--two"></span>
        <span class="ask-anchor-paw__toe ask-anchor-paw__toe--three"></span>
        <span class="ask-anchor-paw__toe ask-anchor-paw__toe--four"></span>
        <span class="ask-anchor-paw__pad"></span>
      </span>
    `;

    const input = document.createElement("input");
    input.className = "ask-anchor-anchor-name-input";
    input.type = "text";
    input.value = anchor.name;
    input.setAttribute("aria-label", "\u91cd\u547d\u540d\u951a\u70b9");

    editor.appendChild(input);
    mainButton.replaceWith(editor);

    let finished = false;
    const finish = (shouldSave) => {
      if (finished) {
        return;
      }

      finished = true;
      if (shouldSave) {
        renameAnchor(id, input.value);
        return;
      }

      renderAnchorDock();
    };

    input.addEventListener("click", stopAnchorControlEvent);
    input.addEventListener("pointerdown", stopAnchorControlEvent);
    input.addEventListener("mousedown", stopAnchorControlEvent);
    input.addEventListener("keyup", stopAnchorControlEvent);
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    input.focus();
    input.select();
  }

  function renameAnchor(id, name) {
    const anchor = anchors.find((item) => item.id === id);
    if (!anchor) {
      return;
    }

    anchor.name = normalizeAnchorName(name);
    persistAnchorsToSession();
    renderAnchorDock();
  }

  function stopAnchorControlEvent(event) {
    event.stopPropagation();
  }

  function handleAnchorListOutsidePointerDown(event) {
    const target = event.target;
    if (!target || !target.closest) {
      return;
    }

    if (target.closest(`#${DOCK_ID}, #${PANEL_ID}`)) {
      return;
    }

    closeAnchorList();
  }


  function toggleAnchorList() {
    ensureCurrentConversationAnchorsLoaded();

    if (!askAnchorSettings.showCat) {
      toggleStandaloneAnchorPanel();
      return;
    }

    const dock = document.getElementById(DOCK_ID);
    if (!dock) {
      return;
    }

    const button = dock.querySelector(".ask-anchor-dock-button");
    const list = dock.querySelector(`#${LIST_ID}`);
    const willOpen = list.hidden;
    if (anchors.length === 0) {
      list.hidden = true;
      button.setAttribute("aria-expanded", "false");
      showToast("\u5f53\u524d\u5bf9\u8bdd\u8fd8\u6ca1\u6709 AskAnchor \u951a\u70b9");
      return;
    }
    list.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
    updateCatDockPosition();
  }

  function closeAnchorList() {
    const dock = document.getElementById(DOCK_ID);
    if (dock) {
      const button = dock.querySelector(".ask-anchor-dock-button");
      const list = dock.querySelector(`#${LIST_ID}`);
      if (list) {
        list.hidden = true;
      }
      if (button) {
        button.setAttribute("aria-expanded", "false");
      }
    }

    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.hidden = true;
    }
  }

  function toggleStandaloneAnchorPanel() {
    ensureCurrentConversationAnchorsLoaded();

    const panel = getOrCreateStandaloneAnchorPanel();
    const willOpen = panel.hidden;
    if (anchors.length === 0) {
      panel.hidden = true;
      showToast("\u5f53\u524d\u5bf9\u8bdd\u8fd8\u6ca1\u6709 AskAnchor \u951a\u70b9");
      return;
    }

    renderStandaloneAnchorPanel();
    panel.hidden = !willOpen;
    if (willOpen) {
      panel.querySelector(".ask-anchor-anchor-main")?.focus();
    }
  }

  function getOrCreateStandaloneAnchorPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      return panel;
    }

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "ask-anchor-anchor-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="ask-anchor-anchor-panel__header">
        <div>
          <div class="ask-anchor-anchor-panel__title">AskAnchor</div>
          <div class="ask-anchor-anchor-panel__meta"></div>
        </div>
        <button class="ask-anchor-anchor-panel__close" type="button" aria-label="\u5173\u95ed\u951a\u70b9\u5217\u8868" title="\u5173\u95ed">\u00d7</button>
      </div>
      <div id="${PANEL_LIST_ID}" class="ask-anchor-anchor-list ask-anchor-anchor-list--panel"></div>
    `;
    panel.querySelector(".ask-anchor-anchor-panel__close").addEventListener("click", () => {
      panel.hidden = true;
    });
    document.documentElement.appendChild(panel);
    return panel;
  }

  function renderStandaloneAnchorPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return;
    }

    const meta = panel.querySelector(".ask-anchor-anchor-panel__meta");
    if (meta) {
      meta.textContent = `${anchors.length} \u4e2a\u951a\u70b9`;
    }
    renderAnchorItems(panel.querySelector(`#${PANEL_LIST_ID}`));
    if (anchors.length === 0) {
      panel.hidden = true;
    }
  }


  async function returnToAnchor(id) {
    const anchor = anchors.find((item) => item.id === id);
    if (!anchor) {
      return;
    }

    cancelPendingAnchorScroll?.();
    const navigationId = ++anchorNavigationId;

    clearRestoredRangeHighlight();
    clearAnchorQuoteCard();
    window.getSelection()?.removeAllRanges();
    activeAnchorId = id;
    renderAnchorDock();

    const restoredRange = resolveAnchorRange(anchor);
    try {
      if (localStorage.getItem("ask-anchor:debug")) {
        const landedMsg = restoredRange ? findAssistantMessageElement(restoredRange.commonAncestorContainer) : null;
        console.debug("[AskAnchor] returnToAnchor", {
          name: anchor.name,
          text: (anchor.text || "").slice(0, 50),
          rangeFound: Boolean(restoredRange),
          version: anchor.anchorVersion || 1,
          savedStableId: anchor.messageLocator?.stableMessageId || "(none)",
          savedIndex: anchor.messageLocator?.assistantIndex,
          landedStableId: landedMsg ? (getStableMessageId(landedMsg) || "(none)") : "(no msg)"
        });
      }
    } catch (debugError) {
      /* debug logging must never break anchor flow */
    }
    const landed = restoredRange && await scrollToSavedRange(restoredRange);
    if (navigationId !== anchorNavigationId) {
      return;
    }
    if (landed) {
      anchor.range = restoredRange.cloneRange();
      restoreSelectionHighlight(restoredRange);
      brieflyHighlight(getRangeHighlightTarget(restoredRange) || anchor.element);
      return;
    }

    const marker = anchor.marker && document.contains(anchor.marker) ? anchor.marker : null;
    const target = getAnchorFallbackTarget(anchor);

    if (marker) {
      marker.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      brieflyHighlight(target || marker);
      if (isAnchorRangeUsable(anchor.range, anchor.selector)) {
        restoreSelectionHighlight(anchor.range);
      } else {
        showAnchorQuoteCard(anchor, "message");
        showToast("未能确认原文位置，已回到对应回答并保留原文卡片");
      }
      return;
    }

    const cachedRangeLanded = isAnchorRangeUsable(anchor.range, anchor.selector)
      && await scrollToSavedRange(anchor.range);
    if (navigationId !== anchorNavigationId) {
      return;
    }
    if (cachedRangeLanded) {
      restoreSelectionHighlight(anchor.range);
      brieflyHighlight(target || document.documentElement);
      return;
    }

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      brieflyHighlight(target);
      showAnchorQuoteCard(anchor, "message");
      showToast("\u672a\u80fd\u786e\u8ba4\u539f\u6587\u4f4d\u7f6e\uff0c\u5df2\u56de\u5230\u5bf9\u5e94\u56de\u7b54\u5e76\u4fdd\u7559\u539f\u6587\u5361\u7247");
      return;
    }

    const restoredScrollPosition = scrollToAnchorSavedPosition(anchor);
    showAnchorQuoteCard(anchor, restoredScrollPosition ? "scroll" : "unavailable");
    showToast(restoredScrollPosition
      ? "\u672a\u80fd\u786e\u8ba4\u539f\u6587\u4f4d\u7f6e\uff0c\u5df2\u6062\u590d\u9605\u8bfb\u4f4d\u7f6e\u5e76\u4fdd\u7559\u539f\u6587\u5361\u7247"
      : "\u672a\u80fd\u786e\u8ba4\u539f\u6587\u6216\u9605\u8bfb\u4f4d\u7f6e\uff0c\u5df2\u4fdd\u7559\u539f\u6587\u5361\u7247");
  }

  function getAnchorFallbackTarget(anchor) {
    if (anchor.anchorVersion === 2 && anchor.blockLocator) {
      const blockTarget = resolveAnchorV2BlockTarget(anchor);
      if (blockTarget) {
        return blockTarget;
      }
    }

    if (
      anchor.element
      && document.contains(anchor.element)
      && anchor.element !== document.body
      && anchor.element !== document.documentElement
      && findAssistantMessageElement(anchor.element)
    ) {
      return anchor.element;
    }

    return resolveMessageElement(anchor.messageLocator, anchor.selector);
  }

  function getAnchorQuoteCardContent(anchor, location) {
    const selector = anchor?.selector || {};
    return {
      text: String(selector.exact || anchor?.text || "").trim(),
      prefix: String(selector.prefix || "").trim().slice(-QUOTE_CONTEXT_LENGTH),
      suffix: String(selector.suffix || "").trim().slice(0, QUOTE_CONTEXT_LENGTH),
      locationLabel: location === "message"
        ? "已回到对应回答"
        : location === "scroll"
          ? "已恢复保存时的阅读位置"
          : "未能恢复页面阅读位置"
    };
  }

  function clearAnchorQuoteCard() {
    document.getElementById(QUOTE_CARD_ID)?.remove();
  }

  function createQuoteCardTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
  }

  function showAnchorQuoteCard(anchor, location) {
    clearAnchorQuoteCard();
    const quote = getAnchorQuoteCardContent(anchor, location);
    const card = document.createElement("aside");
    card.id = QUOTE_CARD_ID;
    card.className = "ask-anchor-quote-card";
    card.setAttribute("role", "status");
    card.setAttribute("aria-label", "AskAnchor 原文卡片");

    const header = document.createElement("div");
    header.className = "ask-anchor-quote-card__header";
    const meta = document.createElement("div");
    meta.append(
      createQuoteCardTextElement("div", "ask-anchor-quote-card__eyebrow", "原文位置未能确认"),
      createQuoteCardTextElement("div", "ask-anchor-quote-card__location", quote.locationLabel)
    );
    const closeButton = createQuoteCardTextElement("button", "ask-anchor-quote-card__close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "关闭原文卡片");
    closeButton.addEventListener("click", clearAnchorQuoteCard);
    header.append(meta, closeButton);

    card.append(header, createQuoteCardTextElement("blockquote", "ask-anchor-quote-card__text", quote.text));
    if (quote.prefix || quote.suffix) {
      const context = document.createElement("div");
      context.className = "ask-anchor-quote-card__context";
      if (quote.prefix) {
        context.appendChild(createQuoteCardTextElement("div", "ask-anchor-quote-card__context-line", `前文：${quote.prefix}`));
      }
      if (quote.suffix) {
        context.appendChild(createQuoteCardTextElement("div", "ask-anchor-quote-card__context-line", `后文：${quote.suffix}`));
      }
      card.appendChild(context);
    }

    document.documentElement.appendChild(card);
    return card;
  }

  function resolveAnchorV2BlockTarget(anchor) {
    const messageRoots = typeof resolveMessageElements === "function"
      ? resolveMessageElements(anchor.messageLocator, anchor.selector)
      : [resolveMessageElement(anchor.messageLocator, anchor.selector)].filter(Boolean);

    for (const messageRoot of uniqueElements(messageRoots)) {
      const block = resolveAnchorBlockCandidates(messageRoot, anchor.blockLocator, anchor.selectionLocator)[0];
      if (block) {
        return block;
      }
    }

    return null;
  }


  function createSelectionMarker(range) {
    const marker = document.createElement("span");
    marker.className = MARKER_CLASS;
    marker.setAttribute("aria-hidden", "true");
    marker.dataset.askAnchor = "selection-marker";

    try {
      const markerRange = range.cloneRange();
      markerRange.collapse(true);
      markerRange.insertNode(marker);
      return marker;
    } catch (error) {
      console.debug("[AskAnchor] Failed to create selection marker:", error);
      return null;
    }
  }

  function serializeRange(range, root) {
    if (!range || !root) {
      return null;
    }

    const snapshot = collectVisibleText(root);
    if (!snapshot.text) {
      return null;
    }

    const start = getTextOffsetInNodes(range.startContainer, range.startOffset, snapshot.nodes);
    const end = getTextOffsetInNodes(range.endContainer, range.endOffset, snapshot.nodes);
    if (start < 0 || end < start) {
      return null;
    }

    return {
      exact: range.toString(),
      prefix: snapshot.text.slice(Math.max(0, start - SELECTION_CONTEXT_LENGTH), start),
      suffix: snapshot.text.slice(end, end + SELECTION_CONTEXT_LENGTH),
      start,
      end
    };
  }

  function createAnchorV2Snapshot(range, messageElement, selector) {
    const messageRoot = findAssistantMessageElement(range?.commonAncestorContainer) || messageElement;
    if (!range || !messageRoot || !selector?.exact) {
      return null;
    }

    const block = getAnchorBlockForRange(range, messageRoot);
    const blocks = collectAnchorTextBlocks(messageRoot);
    const blockIndex = Math.max(0, blocks.indexOf(block));
    const blockSnapshot = collectVisibleText(block);
    const start = getTextOffsetInNodes(range.startContainer, range.startOffset, blockSnapshot.nodes);
    const end = getTextOffsetInNodes(range.endContainer, range.endOffset, blockSnapshot.nodes);
    if (start < 0 || end < start || !blockSnapshot.text) {
      return null;
    }

    const normalizedBlock = normalizeTextWithOffsetMap(blockSnapshot.text);
    const normalizedSelected = normalizeTextWithOffsetMap(range.toString());
    const normalizedStart = getNormalizedOffsetForOriginalOffset(normalizedBlock.map, start);
    const occurrences = findAllTextMatches(normalizedBlock.text, normalizedSelected.text);
    const exactOccurrence = occurrences.indexOf(normalizedStart);
    const occurrenceIndexInBlock = exactOccurrence >= 0
      ? exactOccurrence
      : getNearestOccurrenceIndex(occurrences, normalizedStart);

    return {
      anchorVersion: 2,
      blockLocator: {
        tag: block.tagName?.toLowerCase?.() || "",
        index: blockIndex,
        textHash: hashAnchorText(blockSnapshot.text),
        previousTextHash: blocks[blockIndex - 1] ? hashAnchorText(collectVisibleText(blocks[blockIndex - 1]).text) : "",
        nextTextHash: blocks[blockIndex + 1] ? hashAnchorText(collectVisibleText(blocks[blockIndex + 1]).text) : ""
      },
      selectionLocator: {
        start,
        end,
        normalizedStart,
        normalizedEnd: normalizedStart + normalizedSelected.text.length,
        normalizedText: normalizedSelected.text,
        occurrenceIndexInBlock,
        occurrenceCountInBlock: occurrences.length
      }
    };
  }

  function normalizeBlockLocator(locator) {
    if (!locator || typeof locator !== "object") {
      return null;
    }

    return {
      tag: String(locator.tag || "").toLowerCase(),
      index: Number.isFinite(locator.index) ? locator.index : -1,
      textHash: String(locator.textHash || ""),
      previousTextHash: String(locator.previousTextHash || ""),
      nextTextHash: String(locator.nextTextHash || "")
    };
  }

  function normalizeSelectionLocator(locator) {
    if (!locator || typeof locator !== "object") {
      return null;
    }

    const normalizedText = String(locator.normalizedText || "");
    if (!normalizedText) {
      return null;
    }

    return {
      start: Number.isFinite(locator.start) ? locator.start : null,
      end: Number.isFinite(locator.end) ? locator.end : null,
      normalizedStart: Number.isFinite(locator.normalizedStart) ? locator.normalizedStart : null,
      normalizedEnd: Number.isFinite(locator.normalizedEnd) ? locator.normalizedEnd : null,
      normalizedText,
      occurrenceIndexInBlock: Number.isFinite(locator.occurrenceIndexInBlock) ? locator.occurrenceIndexInBlock : -1,
      occurrenceCountInBlock: Number.isFinite(locator.occurrenceCountInBlock) ? locator.occurrenceCountInBlock : null
    };
  }

  function resolveAnchorRange(anchor) {
    if (anchor.anchorVersion === 2 && anchor.blockLocator && anchor.selectionLocator) {
      return resolveAnchorV2Range(anchor);
    }

    if (isAnchorRangeUsable(anchor.range, anchor.selector)) {
      return anchor.range.cloneRange();
    }

    if (!anchor.selector) {
      return null;
    }

    const messageRoots = typeof resolveMessageElements === "function"
      ? resolveMessageElements(anchor.messageLocator, anchor.selector)
      : [resolveMessageElement(anchor.messageLocator, anchor.selector)].filter(Boolean);

    for (const messageRoot of uniqueElements(messageRoots)) {
      const scopedRange = findRangeFromSelector(anchor.selector, messageRoot);
      if (scopedRange) {
        anchor.element = messageRoot;
        return scopedRange;
      }
    }

    const fallbackRoots = getAnchorSearchFallbackRoots(anchor);
    for (const root of fallbackRoots) {
      const fallbackRange = findRangeFromSelector(anchor.selector, root);
      if (fallbackRange) {
        anchor.element = root;
        return fallbackRange;
      }
    }

    return null;
  }

  function resolveAnchorV2Range(anchor) {
    const messageRoots = typeof resolveMessageElements === "function"
      ? resolveMessageElements(anchor.messageLocator, anchor.selector)
      : [resolveMessageElement(anchor.messageLocator, anchor.selector)].filter(Boolean);

    for (const messageRoot of uniqueElements(messageRoots)) {
      const blockCandidates = resolveAnchorBlockCandidates(messageRoot, anchor.blockLocator, anchor.selectionLocator);
      for (const block of blockCandidates) {
        const range = createRangeFromSelectionLocator(block, anchor.selectionLocator);
        if (isTrustedRestoredRange(range, messageRoot, anchor.selectionLocator, anchor.selector)) {
          anchor.element = block;
          return range;
        }
      }

      // 段落重排或新增重复文字时，旧的块索引和出现次数可能失效。
      // 只在已确认的回答内重找，并且必须由前后文唯一确定，不能按距离猜。
      if (anchor.selector?.prefix?.trim() || anchor.selector?.suffix?.trim()) {
        const snapshot = collectVisibleText(messageRoot);
        const normalized = normalizeTextWithOffsetMap(snapshot.text);
        const text = anchor.selectionLocator.normalizedText;
        const matches = findAllTextMatches(normalized.text, text);
        let trustedRange = null;
        let ambiguous = false;
        for (const start of matches) {
          const range = createRangeFromOffsets(snapshot.nodes, normalized.map[start], normalized.map[start + text.length]);
          if (!isTrustedRestoredRange(range, messageRoot, anchor.selectionLocator, anchor.selector)) continue;
          if (trustedRange) {
            ambiguous = true;
            break;
          }
          trustedRange = range;
        }
        if (trustedRange && !ambiguous) {
          anchor.element = messageRoot;
          return trustedRange;
        }
      }
    }

    return null;
  }

  function resolveAnchorBlockCandidates(messageRoot, blockLocator, selectionLocator) {
    const blocks = collectAnchorTextBlocks(messageRoot);
    if (blocks.length === 0) {
      return [messageRoot];
    }

    const candidates = blocks
      .map((block, index) => ({
        block,
        score: scoreAnchorBlockMatch(block, index, blocks, blockLocator, selectionLocator),
        textHashMatched: Boolean(
          blockLocator?.textHash
          && hashAnchorText(collectVisibleText(block).text) === blockLocator.textHash
        ),
        containsSelection: Boolean(
          selectionLocator?.normalizedText
          && normalizeTextWithOffsetMap(collectVisibleText(block).text).text.includes(selectionLocator.normalizedText)
        )
      }))
      .filter((candidate) => candidate.containsSelection)
      .sort((a, b) => b.score - a.score);

    const exactHashCandidates = candidates.filter((candidate) => candidate.textHashMatched);
    const candidatePool = exactHashCandidates.length > 0 ? exactHashCandidates : candidates;
    const trustedCandidate = core.selectUniqueBestMatch(candidatePool, exactHashCandidates.length > 0 ? 12 : 7, 2);
    return trustedCandidate ? [trustedCandidate.block] : [];
  }

  function isTrustedRestoredRange(range, messageRoot, selectionLocator, selector) {
    if (!range || !messageRoot || !selectionLocator?.normalizedText) {
      return false;
    }

    const commonAncestorElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (
      !messageRoot.contains(range.startContainer)
      || !messageRoot.contains(range.endContainer)
      || !commonAncestorElement
      || isInsideUserMessage(commonAncestorElement)
      || !findAssistantMessageElement(range.commonAncestorContainer)
    ) {
      return false;
    }

    return normalizeTextForAnchorComparison(range.toString()) === selectionLocator.normalizedText
      && doesRestoredRangeContextMatch(range, messageRoot, selector);
  }

  function doesRestoredRangeContextMatch(range, messageRoot, selector) {
    if (!selector?.prefix && !selector?.suffix) {
      return true;
    }

    const restoredSelector = serializeRange(range, messageRoot);
    if (!restoredSelector) {
      return false;
    }

    const contextMatches = [];
    if (selector.prefix) {
      contextMatches.push(
        normalizeTextForAnchorComparison(restoredSelector.prefix)
          .endsWith(normalizeTextForAnchorComparison(selector.prefix))
      );
    }
    if (selector.suffix) {
      contextMatches.push(
        normalizeTextForAnchorComparison(restoredSelector.suffix)
          .startsWith(normalizeTextForAnchorComparison(selector.suffix))
      );
    }

    return contextMatches.some(Boolean);
  }

  function scoreAnchorBlockMatch(block, index, blocks, blockLocator, selectionLocator) {
    let score = 0;
    const text = collectVisibleText(block).text;
    const textHash = hashAnchorText(text);
    const normalizedBlock = normalizeTextWithOffsetMap(text);
    const hasSelectionText = selectionLocator?.normalizedText
      && normalizedBlock.text.includes(selectionLocator.normalizedText);

    if (blockLocator?.textHash && textHash === blockLocator.textHash) {
      score += 12;
    }
    if (blockLocator?.tag && block.tagName?.toLowerCase?.() === blockLocator.tag) {
      score += 1;
    }
    if (Number.isFinite(blockLocator?.index) && blockLocator.index >= 0) {
      const distance = Math.abs(index - blockLocator.index);
      score += distance === 0 ? 6 : Math.max(0, 4 - distance);
    }
    if (blockLocator?.previousTextHash && blocks[index - 1] && hashAnchorText(collectVisibleText(blocks[index - 1]).text) === blockLocator.previousTextHash) {
      score += 3;
    }
    if (blockLocator?.nextTextHash && blocks[index + 1] && hashAnchorText(collectVisibleText(blocks[index + 1]).text) === blockLocator.nextTextHash) {
      score += 3;
    }
    if (hasSelectionText) {
      score += 4;
    } else {
      score -= 6;
    }

    return score;
  }

  function createRangeFromSelectionLocator(block, selectionLocator) {
    if (!selectionLocator?.normalizedText) {
      return null;
    }

    const snapshot = collectVisibleText(block);
    const normalizedBlock = normalizeTextWithOffsetMap(snapshot.text);
    const matches = findAllTextMatches(normalizedBlock.text, selectionLocator.normalizedText);
    if (matches.length === 0) {
      return null;
    }

    const occurrenceIndex = selectionLocator.occurrenceIndexInBlock;
    if (
      Number.isFinite(selectionLocator.occurrenceCountInBlock)
      && selectionLocator.occurrenceCountInBlock !== matches.length
    ) {
      return null;
    }
    if (occurrenceIndex >= matches.length) {
      return null;
    }
    const matchStart = occurrenceIndex >= 0 && occurrenceIndex < matches.length
      ? matches[occurrenceIndex]
      : matches[getNearestOccurrenceIndex(matches, selectionLocator.normalizedStart || 0)];
    const matchEnd = matchStart + selectionLocator.normalizedText.length;
    const originalStart = normalizedBlock.map[matchStart];
    const originalEnd = matchEnd < normalizedBlock.map.length
      ? normalizedBlock.map[matchEnd]
      : snapshot.text.length;

    if (!Number.isFinite(originalStart) || !Number.isFinite(originalEnd) || originalEnd <= originalStart) {
      return null;
    }

    return createRangeFromOffsets(snapshot.nodes, originalStart, originalEnd);
  }

  function isAnchorRangeUsable(range, selector) {
    if (!isRangeUsable(range)) {
      return false;
    }

    const assistantMessage = findAssistantMessageElement(range.commonAncestorContainer);
    if (!assistantMessage) {
      return false;
    }

    if (!selector?.exact) {
      return true;
    }

    return normalizeTextForAnchorComparison(range.toString()) === normalizeTextForAnchorComparison(selector.exact);
  }

  function getAnchorSearchFallbackRoots(anchor) {
    // Only fall back to the cached message element. Do NOT re-scan all
    // assistant messages here: resolveMessageElements already covers them
    // (including its selector.exact proximity fallback in dom.js), and a
    // document-order scan here returns the first message containing the
    // text — causing the "jumps to another turn with the same text" bug.
    // When this returns empty, returnToAnchor degrades to
    // getAnchorFallbackTarget (scrolls to the right message + toast).
    const roots = [];
    if (
      anchor.element
      && document.contains(anchor.element)
      && anchor.element !== document.body
      && anchor.element !== document.documentElement
      && findAssistantMessageElement(anchor.element)
      && !isInsideUserMessage(anchor.element)
    ) {
      roots.push(anchor.element);
    }

    return uniqueElements(roots);
  }

  function getAnchorBlockForRange(range, messageRoot) {
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE
      ? range.endContainer
      : range.endContainer.parentElement;
    const startBlock = getClosestAnchorBlock(startElement, messageRoot);
    const endBlock = getClosestAnchorBlock(endElement, messageRoot);

    if (startBlock && startBlock === endBlock) {
      return startBlock;
    }

    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    return getClosestAnchorBlock(container, messageRoot) || messageRoot;
  }

  function getClosestAnchorBlock(element, messageRoot) {
    let current = element;
    while (current && current !== document.documentElement) {
      if (messageRoot.contains(current) && isAnchorTextBlock(current)) {
        return current;
      }
      if (current === messageRoot) {
        break;
      }
      current = current.parentElement;
    }

    return messageRoot;
  }

  function collectAnchorTextBlocks(messageRoot) {
    const selectors = [
      "p",
      "li",
      "blockquote",
      "pre",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "td",
      "th",
      "caption",
      "figcaption"
    ];

    const blocks = uniqueElements([
      messageRoot,
      ...selectors.flatMap((selector) => Array.from(messageRoot.querySelectorAll(selector)))
    ])
      .filter((block) => !isInsideUserMessage(block))
      .filter((block) => !block.closest(`#${DOCK_ID}, #${PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`))
      .filter((block) => normalizeTextForAnchorComparison(collectVisibleText(block).text).length > 0);

    return blocks.length > 0 ? blocks : [messageRoot];
  }

  function isAnchorTextBlock(element) {
    return Boolean(element?.matches?.("p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, td, th, caption, figcaption"));
  }


  function findRangeFromSelector(selector, root) {
    const snapshot = collectVisibleText(root);
    if (!selector || !selector.exact || !snapshot.text) {
      return null;
    }

    const normalizedStartRange = Math.max(0, Math.min(selector.start || 0, snapshot.text.length));
    const candidates = findAllTextMatches(snapshot.text, selector.exact);

    const bestStart = candidates
      .map((start) => ({
        start,
        score: scoreSelectorMatch(snapshot.text, selector, start)
      }))
      .sort((a, b) => b.score - a.score || Math.abs(a.start - normalizedStartRange) - Math.abs(b.start - normalizedStartRange))[0]?.start;

    if (typeof bestStart !== "number") {
      return findRangeFromNormalizedSelector(selector, snapshot);
    }

    return createRangeFromOffsets(snapshot.nodes, bestStart, bestStart + selector.exact.length);
  }

  function findRangeFromNormalizedSelector(selector, snapshot) {
    const normalizedText = normalizeTextWithOffsetMap(snapshot.text);
    const normalizedExact = normalizeTextWithOffsetMap(selector.exact || "");
    if (!normalizedText.text || !normalizedExact.text) {
      return null;
    }

    const normalizedStart = getNormalizedOffsetForOriginalOffset(normalizedText.map, selector.start || 0);
    const candidates = findAllTextMatches(normalizedText.text, normalizedExact.text);

    const bestNormalizedStart = candidates
      .map((start) => ({
        start,
        score: scoreNormalizedSelectorMatch(normalizedText.text, selector, start, normalizedStart)
      }))
      .sort((a, b) => b.score - a.score || Math.abs(a.start - normalizedStart) - Math.abs(b.start - normalizedStart))[0]?.start;

    if (typeof bestNormalizedStart !== "number") {
      return null;
    }

    const normalizedEnd = bestNormalizedStart + normalizedExact.text.length;
    const originalStart = normalizedText.map[bestNormalizedStart];
    const originalEnd = normalizedEnd < normalizedText.map.length
      ? normalizedText.map[normalizedEnd]
      : snapshot.text.length;

    if (!Number.isFinite(originalStart) || !Number.isFinite(originalEnd) || originalEnd <= originalStart) {
      return null;
    }

    return createRangeFromOffsets(snapshot.nodes, originalStart, originalEnd);
  }

  function normalizeTextWithOffsetMap(text) {
    const source = String(text || "");
    const chars = [];
    const map = [];
    let previousWasSpace = true;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (/\s/.test(char)) {
        if (!previousWasSpace) {
          chars.push(" ");
          map.push(index);
          previousWasSpace = true;
        }
        continue;
      }

      chars.push(char);
      map.push(index);
      previousWasSpace = false;
    }

    if (chars[chars.length - 1] === " ") {
      chars.pop();
      map.pop();
    }

    map.push(source.length);
    return {
      text: chars.join(""),
      map
    };
  }

  function normalizeTextForAnchorComparison(text) {
    return normalizeTextWithOffsetMap(text).text;
  }

  function hashAnchorText(text) {
    const normalized = normalizeTextForAnchorComparison(text);
    let hash = 2166136261;
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function findAllTextMatches(text, exact) {
    const matches = [];
    if (!text || !exact) {
      return matches;
    }

    let index = text.indexOf(exact);
    while (index !== -1) {
      matches.push(index);
      index = text.indexOf(exact, index + 1);
    }
    return matches;
  }

  function getNearestOccurrenceIndex(occurrences, expectedStart) {
    if (!occurrences.length) {
      return -1;
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    occurrences.forEach((start, index) => {
      const distance = Math.abs(start - (expectedStart || 0));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function getNormalizedOffsetForOriginalOffset(map, originalOffset) {
    const offset = Math.max(0, originalOffset || 0);
    const index = map.findIndex((originalIndex) => originalIndex >= offset);
    return index === -1 ? Math.max(0, map.length - 1) : index;
  }

  function scoreNormalizedSelectorMatch(normalizedText, selector, normalizedStart, expectedNormalizedStart) {
    let score = 0;
    const normalizedExact = normalizeTextWithOffsetMap(selector.exact || "").text;
    const normalizedPrefix = normalizeTextWithOffsetMap(selector.prefix || "").text;
    const normalizedSuffix = normalizeTextWithOffsetMap(selector.suffix || "").text;
    const normalizedEnd = normalizedStart + normalizedExact.length;

    if (normalizedPrefix) {
      const prefixStart = Math.max(0, normalizedStart - normalizedPrefix.length);
      if (normalizedText.slice(prefixStart, normalizedStart).endsWith(normalizedPrefix)) {
        score += 3;
      }
    }

    if (normalizedSuffix && normalizedText.slice(normalizedEnd, normalizedEnd + normalizedSuffix.length).startsWith(normalizedSuffix)) {
      score += 3;
    }

    score -= Math.min(8, Math.abs(normalizedStart - (expectedNormalizedStart || 0)) / 250);
    score += 0.5;
    return score;
  }

  function scoreSelectorMatch(text, selector, start) {
    let score = 0;
    const prefixStart = Math.max(0, start - (selector.prefix || "").length);
    const prefix = text.slice(prefixStart, start);
    const suffix = text.slice(start + selector.exact.length, start + selector.exact.length + (selector.suffix || "").length);

    let prefixMatched = false;
    if (selector.prefix && prefix.endsWith(selector.prefix)) {
      score += 3;
      prefixMatched = true;
    }
    let suffixMatched = false;
    if (selector.suffix && suffix.startsWith(selector.suffix)) {
      score += 3;
      suffixMatched = true;
    }
    // Whitespace-tolerant fallback: half credit when only normalization
    // (collapsed whitespace / trimmed) differs. Guards against platform
    // re-renders that slightly change surrounding whitespace, which would
    // otherwise zero out context and leave only the offset penalty.
    if (!prefixMatched && selector.prefix) {
      const normPrefix = normalizeTextForAnchorComparison(prefix);
      const normSavedPrefix = normalizeTextForAnchorComparison(selector.prefix);
      if (normPrefix && normSavedPrefix && normPrefix.endsWith(normSavedPrefix)) {
        score += 1.5;
      }
    }
    if (!suffixMatched && selector.suffix) {
      const normSuffix = normalizeTextForAnchorComparison(suffix);
      const normSavedSuffix = normalizeTextForAnchorComparison(selector.suffix);
      if (normSuffix && normSavedSuffix && normSuffix.startsWith(normSavedSuffix)) {
        score += 1.5;
      }
    }
    score -= Math.min(8, Math.abs(start - (selector.start || 0)) / 250);
    return score;
  }

  function collectVisibleText(root) {
    const nodes = [];
    const textParts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!isVisibleTextNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      textParts.push(node.textContent);
      node = walker.nextNode();
    }

    return {
      nodes,
      text: textParts.join("")
    };
  }

  function isVisibleTextNode(node) {
    let element = node.parentElement;
    while (element && element !== document.documentElement) {
      if (element.closest?.(`#${DOCK_ID}, #${PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`)) {
        return false;
      }
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME"].includes(element.tagName)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      element = element.parentElement;
    }
    return true;
  }

  function getTextOffsetInNodes(container, offset, nodes) {
    if (container.nodeType === Node.ELEMENT_NODE) {
      // 元素偏移是 childNodes 索引。尤其在段落结尾，没有下一个文本节点
      // 可以命中，必须比较真实 DOM 边界，不能把它当作文本节点偏移。
      const boundary = document.createRange();
      boundary.setStart(container, offset);
      boundary.collapse(true);
      let total = 0;
      for (const node of nodes) {
        if (boundary.comparePoint(node, 0) >= 0) return total;
        total += node.textContent.length;
      }
      return total;
    }
    let total = 0;
    for (const node of nodes) {
      if (node === container) {
        return total + offset;
      }
      total += node.textContent.length;
    }
    return -1;
  }

  function getDirectChildContaining(parent, node) {
    let child = node;
    while (child && child.parentNode !== parent) {
      child = child.parentNode;
    }
    return child || null;
  }

  function createRangeFromOffsets(nodes, start, end) {
    const startPoint = findTextPoint(nodes, start);
    const endPoint = findTextPoint(nodes, end);
    if (!startPoint || !endPoint) {
      return null;
    }

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    return range;
  }

  function findTextPoint(nodes, offset) {
    let remaining = offset;
    for (const node of nodes) {
      const length = node.textContent.length;
      if (remaining <= length) {
        return {
          node,
          offset: Math.max(0, Math.min(remaining, length))
        };
      }
      remaining -= length;
    }

    const last = nodes[nodes.length - 1];
    return last ? { node: last, offset: last.textContent.length } : null;
  }

  function scrollToSavedRange(range) {
    cancelPendingAnchorScroll?.();
    if (!range || !document.contains(range.startContainer) || !getAnchorReadingRect(range)) {
      return Promise.resolve(false);
    }

    // Range 会随 DOM 编辑移动；等待期间也要检查它仍然指向同一段文字。
    const expectedText = range.toString();
    const containers = getAnchorScrollContainers(range.startContainer);
    const startedAt = performance.now();
    return new Promise((resolve) => {
      let timer;
      let settled = false;
      let stableSince = null;
      let corrections = 0;
      let lastCorrection = 0;
      const finish = (success) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
          window.removeEventListener(type, interrupt, true);
        }
        if (cancelPendingAnchorScroll === cancel) cancelPendingAnchorScroll = null;
        resolve(success);
      };
      const cancel = () => {
        // 同时终止尚未完成的原生平滑滚动。
        for (const container of containers) {
          container.scrollTo({ top: container.scrollTop, behavior: 'instant' });
        }
        finish(false);
      };
      const interrupt = (event) => {
        if (event.type === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Escape'].includes(event.key)) return;
        anchorNavigationId += 1;
        cancel();
      };
      cancelPendingAnchorScroll = cancel;
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
        window.addEventListener(type, interrupt, { capture: true, passive: true });
      }

      const align = (behavior) => {
        for (const container of containers) {
          const rect = getAnchorReadingRect(range);
          if (!rect) return;
          const top = getAnchorScrollTop(rect, container);
          if (Math.abs(container.scrollTop - top) > 2) container.scrollTo({ top, behavior });
        }
      };
      const check = () => {
        try {
          if (!document.contains(range.startContainer) || !document.contains(range.endContainer)
              || range.toString() !== expectedText || containers.some((container) => !document.contains(container))) {
            finish(false);
            return;
          }
          const rect = getAnchorReadingRect(range);
          const elapsed = performance.now() - startedAt;
          const aligned = rect && containers.every((container) => (
            Math.abs(container.scrollTop - getAnchorScrollTop(rect, container)) <= 3
          ));
          const visible = rect && rect.bottom > 0 && rect.top < window.innerHeight
            && containers.every((container) => {
              const viewport = getAnchorScrollViewport(container);
              return rect.top >= viewport.top - 2 && rect.top < viewport.bottom;
            });
          if (aligned && visible) {
            if (stableSince === null) stableSince = elapsed;
            // 给平滑滚动、字体和流式布局留一个有限的稳定观察窗口。
            if (elapsed >= 650 && elapsed - stableSince >= 240) {
              finish(true);
              return;
            }
          } else {
            stableSince = null;
            if (elapsed >= 400 && elapsed - lastCorrection >= 160 && corrections < 4) {
              align('instant');
              corrections += 1;
              lastCorrection = elapsed;
            }
          }
          if (elapsed >= 1600) {
            finish(Boolean(aligned && visible));
            return;
          }
          timer = window.setTimeout(check, 60);
        } catch (error) {
          console.debug('[AskAnchor] Failed to verify anchor position:', error);
          finish(false);
        }
      };
      try {
        align('smooth');
        timer = window.setTimeout(check, 60);
      } catch (error) {
        finish(false);
      }
    });
  }

  function getAnchorReadingRect(range) {
    // 多行或跨段选区以第一行作为阅读落点，不能用整个选区的中心。
    return Array.from(range.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0) || null;
  }

  function getAnchorScrollContainers(node) {
    const containers = [];
    let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const documentScroller = document.scrollingElement || document.documentElement;
    while (element && element !== document.documentElement) {
      if (element !== documentScroller && isAnchorScrollContainer(element)) containers.push(element);
      element = element.parentElement;
    }
    containers.push(documentScroller);
    return containers;
  }

  function isAnchorScrollContainer(element) {
    const style = window.getComputedStyle(element);
    return /(auto|scroll|overlay)/.test(style.overflowY)
      && element.scrollHeight > element.clientHeight + 1;
  }

  function getAnchorScrollViewport(container) {
    const isDocument = container === (document.scrollingElement || document.documentElement);
    const box = isDocument ? { top: 0, left: 0, right: window.innerWidth } : container.getBoundingClientRect();
    const top = box.top + (isDocument ? 0 : container.clientTop);
    let bottom = top + (isDocument ? window.innerHeight : container.clientHeight);
    const editor = typeof findPromptEditor === 'function' ? findPromptEditor() : null;
    if (editor) {
      const editorBox = editor.getBoundingClientRect();
      if (editorBox.width > 0 && editorBox.top > top && editorBox.top < bottom
          && editorBox.right > box.left && editorBox.left < box.right) bottom = editorBox.top;
    }
    return { top, bottom };
  }

  function getAnchorScrollTop(rect, container) {
    const viewport = getAnchorScrollViewport(container);
    const top = container.scrollTop + rect.top - viewport.top - (viewport.bottom - viewport.top) * 0.42;
    return Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight));
  }

  function captureAnchorScrollPosition(range) {
    const windowTop = Number.isFinite(window.scrollY) ? window.scrollY : 0;
    const containers = range ? getAnchorScrollContainers(range.startContainer) : [];
    const container = containers[0];
    const isDocumentScroller = !container || container === document.documentElement || container === document.body;
    return {
      windowTop,
      container: isDocumentScroller ? null : container,
      containerTop: !isDocumentScroller && Number.isFinite(container.scrollTop) ? container.scrollTop : null,
      scrollContainers: containers.filter((item) => item !== (document.scrollingElement || document.documentElement))
        .map((item) => ({ selector: getAnchorContainerSelector(item), top: item.scrollTop }))
    };
  }

  function getAnchorContainerSelector(element) {
    const parts = [];
    for (let current = element; current; current = current.parentElement) {
      if (current.id) {
        const idSelector = `#${CSS.escape(current.id)}`;
        if (document.querySelectorAll(idSelector).length === 1) {
          parts.unshift(idSelector);
          break;
        }
      }
      const tag = current.tagName.toLowerCase();
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName)
        : [current];
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
    }
    return parts.join(' > ');
  }

  function scrollToAnchorSavedPosition(anchor) {
    const position = anchor?.scrollPosition;
    if (position?.scrollContainers?.length) {
      // 原文可能位于独立滚动的代码框里，内外两层的位置不能混用。
      try {
        const restored = position.scrollContainers.map((saved) => {
          const matches = document.querySelectorAll(saved.selector);
          return { container: matches.length === 1 ? matches[0] : null, top: saved.top };
        });
        if (restored.some((item, index) => !item.container || !Number.isFinite(item.top)
            || !isAnchorScrollContainer(item.container)
            || (index > 0 && !item.container.contains(restored[index - 1].container)))) return false;
        const root = typeof findConversationRoot === 'function' ? findConversationRoot() : null;
        if (root && !root.contains(restored[0].container) && !restored[0].container.contains(root)) return false;
        for (const { container, top } of restored) container.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        if (Number.isFinite(position.windowTop)) window.scrollTo({ top: Math.max(0, position.windowTop), behavior: 'instant' });
        return restored.every(({ container, top }) => Math.abs(container.scrollTop - Math.max(0, top)) <= 2)
          && (!Number.isFinite(position.windowTop) || Math.abs(window.scrollY - Math.max(0, position.windowTop)) <= 2);
      } catch (error) {
        return false;
      }
    }
    let container = position?.container;
    const containerTop = position?.containerTop;
    if ((!container || !document.contains(container)) && Number.isFinite(containerTop)) {
      const root = typeof findConversationRoot === 'function' ? findConversationRoot() : null;
      if (root) {
        // 旧记录没有容器身份；出现多层滚动区时不能把内层值套给外层。
        const candidates = [...getAnchorScrollContainers(root), ...Array.from(root.querySelectorAll('*')).filter(isAnchorScrollContainer)]
          .filter((item) => item !== (document.scrollingElement || document.documentElement));
        const unique = [...new Set(candidates)];
        container = unique.length === 1 ? unique[0] : null;
      }
      if (!container) return false;
    }
    if (
      container
      && document.contains(container)
      && Number.isFinite(containerTop)
      && typeof container.scrollTo === "function"
    ) {
      const top = Math.max(0, containerTop);
      container.scrollTo({ top, behavior: "instant" });
      return Math.abs(container.scrollTop - top) <= 2;
    }

    const windowTop = Number.isFinite(position?.windowTop) ? position.windowTop : anchor?.scrollY;
    if (!Number.isFinite(windowTop) || Math.abs(window.scrollY - windowTop) <= 1) {
      return false;
    }

    window.scrollTo({ top: Math.max(0, windowTop), behavior: "instant" });
    return Math.abs(window.scrollY - Math.max(0, windowTop)) <= 2;
  }

  function isRangeUsable(range) {
    try {
      return Boolean(range && getRangeRect(range) && document.contains(range.commonAncestorContainer));
    } catch (error) {
      return false;
    }
  }

  function scrollRectToCenter(rect, sourceNode) {
    const container = findScrollContainerForRect(rect, sourceNode);
    if (!container || container === document.documentElement || container === document.body) {
      const top = rect.top + window.scrollY - window.innerHeight * 0.42;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const topDelta = rect.top - containerRect.top - container.clientHeight * 0.42 + rect.height / 2;
    container.scrollTo({
      top: Math.max(0, container.scrollTop + topDelta),
      behavior: "smooth"
    });
  }

  function findScrollContainerForRect(rect, sourceNode) {
    const root = sourceNode || (typeof findConversationRoot === 'function' ? findConversationRoot() : null);
    return getAnchorScrollContainers(root)[0];
  }

  function restoreSelectionHighlight(range) {
    if (!range) {
      return;
    }

    try {
      highlightRestoredRange(range);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      console.debug("[AskAnchor] Failed to restore selection:", error);
    }
  }

  function highlightRestoredRange(range) {
    clearRestoredRangeHighlight();

    try {
      if (globalThis.CSS?.highlights && typeof globalThis.Highlight === "function") {
        const highlight = new Highlight(range.cloneRange());
        CSS.highlights.set("ask-anchor-restored-selection", highlight);
      }

      renderRestoredRangeOverlay(range);
      highlightRestoredRange.refreshTimer = window.setTimeout(() => {
        document.querySelectorAll(".ask-anchor-restored-selection-overlay").forEach((node) => node.remove());
        if (isRangeUsable(range)) {
          renderRestoredRangeOverlay(range);
        }
      }, 520);
      highlightRestoredRange.timer = window.setTimeout(clearRestoredRangeHighlight, 2600);
    } catch (error) {
      console.debug("[AskAnchor] Failed to highlight restored range:", error);
    }
  }

  function clearRestoredRangeHighlight() {
    window.clearTimeout(highlightRestoredRange.timer);
    window.clearTimeout(highlightRestoredRange.refreshTimer);
    highlightRestoredRange.timer = null;
    highlightRestoredRange.refreshTimer = null;

    try {
      globalThis.CSS?.highlights?.delete("ask-anchor-restored-selection");
      document.querySelectorAll(".ask-anchor-restored-selection-overlay").forEach((node) => node.remove());
    } catch (error) {
      console.debug("[AskAnchor] Failed to clear restored range highlight:", error);
    }
  }

  function renderRestoredRangeOverlay(range) {
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .slice(0, 12);

    rects.forEach((rect) => {
      const overlay = document.createElement("span");
      overlay.className = "ask-anchor-restored-selection-overlay";
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      document.documentElement.appendChild(overlay);
    });
  }

  function brieflyHighlight(element) {
    if (!element || element === document.documentElement) {
      return;
    }

    element.classList.add(HIGHLIGHT_CLASS);
    window.setTimeout(() => {
      element.classList.remove(HIGHLIGHT_CLASS);
    }, 1400);
  }

  function getRangeHighlightTarget(range) {
    if (!range) {
      return null;
    }

    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

    return container?.closest?.("p, li, blockquote, pre, code, .markdown, .prose, [data-message-author-role], article, section, div") || container;
  }

      return {
        addAnchor,
        persistAnchorsToSession,
        loadAnchorsFromSession,
        getAnchorStorageKey,
        handleConversationRouteChange,
        ensureCurrentConversationAnchorsLoaded,
        createAnchorName,
        normalizeAnchorName,
        normalizeAnchorStatus,
        getAnchorStatusLabel,
        renderAnchorDock,
        renderAnchorItems,
        createAnchorItem,
        toggleAnchorStatus,
        deleteAnchor,
        startRenameAnchor,
        renameAnchor,
        stopAnchorControlEvent,
        handleAnchorListOutsidePointerDown,
        toggleAnchorList,
        closeAnchorList,
        toggleStandaloneAnchorPanel,
        getOrCreateStandaloneAnchorPanel,
        renderStandaloneAnchorPanel,
        returnToAnchor,
        getAnchorQuoteCardContent,
        clearAnchorQuoteCard,
        showAnchorQuoteCard,
        createSelectionMarker,
        serializeRange,
        createAnchorV2Snapshot,
        normalizeBlockLocator,
        normalizeSelectionLocator,
        resolveAnchorRange,
        resolveAnchorV2Range,
        resolveAnchorV2BlockTarget,
        resolveAnchorBlockCandidates,
        isTrustedRestoredRange,
        doesRestoredRangeContextMatch,
        scoreAnchorBlockMatch,
        createRangeFromSelectionLocator,
        isAnchorRangeUsable,
        getAnchorBlockForRange,
        collectAnchorTextBlocks,
        hashAnchorText,
        findRangeFromSelector,
        scoreSelectorMatch,
        normalizeTextWithOffsetMap,
        findAllTextMatches,
        getNearestOccurrenceIndex,
        collectVisibleText,
        isVisibleTextNode,
        getTextOffsetInNodes,
        getDirectChildContaining,
        createRangeFromOffsets,
        findTextPoint,
        scrollToSavedRange,
        captureAnchorScrollPosition,
        scrollToAnchorSavedPosition,
        isRangeUsable,
        scrollRectToCenter,
        findScrollContainerForRect,
        restoreSelectionHighlight,
        brieflyHighlight,
        getRangeHighlightTarget
      };
    }
  };
})(globalThis);
