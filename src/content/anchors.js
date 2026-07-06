(function registerAskAnchorAnchorsModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.anchors = function createAskAnchorAnchorsModule(ctx) {
    with (ctx) {
  function addAnchor({ text, range, selector, messageLocator, marker, element, scrollY }) {
    const anchor = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: createAnchorName(text),
      text,
      range,
      selector,
      messageLocator,
      marker,
      element,
      scrollY,
      createdAt: new Date(),
      status: ANCHOR_STATUS_UNRESOLVED
    };

    anchors.unshift(anchor);
    anchors = anchors.slice(0, MAX_ANCHORS);
    persistAnchorsToSession();
    return anchor;
  }

  function serializeAnchorsForStorage() {
    return anchors.map((anchor) => ({
      id: anchor.id,
      name: anchor.name,
      text: anchor.text,
      selector: anchor.selector,
      messageLocator: anchor.messageLocator || null,
      scrollY: anchor.scrollY,
      createdAt: anchor.createdAt instanceof Date ? anchor.createdAt.toISOString() : anchor.createdAt,
      status: normalizeAnchorStatus(anchor.status)
    }));
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

    anchors = storedAnchors.slice(0, MAX_ANCHORS).map((item) => ({
        id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: item.name || createAnchorName(item.text),
        text: item.text || "",
        selector: item.selector || null,
        messageLocator: normalizeMessageLocator(item.messageLocator),
        scrollY: typeof item.scrollY === "number" ? item.scrollY : window.scrollY,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        status: normalizeAnchorStatus(item.status),
        range: null,
        marker: null,
        element: document.body
      }));
    if (activeAnchorId && !anchors.some((anchor) => anchor.id === activeAnchorId)) {
      activeAnchorId = null;
    }
    return true;
  }

  function getAnchorStorageKey() {
    return `${STORAGE_KEY_PREFIX}${location.origin}${location.pathname}${location.search}`;
  }

  function handleConversationRouteChange() {
    const nextKey = getAnchorStorageKey();
    if (nextKey === activeAnchorStorageKey) {
      observeConversationRoot();
      return;
    }

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


  function returnToAnchor(id) {
    const anchor = anchors.find((item) => item.id === id);
    if (!anchor) {
      return;
    }

    activeAnchorId = id;
    renderAnchorDock();

    const restoredRange = resolveAnchorRange(anchor);
    if (restoredRange && scrollToSavedRange(restoredRange)) {
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
      restoreSelectionHighlight(anchor.range);
      return;
    }

    if (scrollToSavedRange(anchor.range)) {
      restoreSelectionHighlight(anchor.range);
      brieflyHighlight(target || document.documentElement);
      return;
    }

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      brieflyHighlight(target);
      showToast("\u672a\u80fd\u7cbe\u786e\u5339\u914d\u539f\u6587\uff0c\u5df2\u5b9a\u4f4d\u5230\u5bf9\u5e94\u56de\u7b54");
      return;
    }

    window.scrollTo({ top: anchor.scrollY, behavior: "smooth" });
    showToast("\u672a\u80fd\u7cbe\u786e\u5339\u914d\u539f\u6587\uff0c\u5df2\u56de\u5230\u4fdd\u5b58\u65f6\u7684\u6eda\u52a8\u4f4d\u7f6e");
  }

  function getAnchorFallbackTarget(anchor) {
    if (
      anchor.element
      && document.contains(anchor.element)
      && anchor.element !== document.body
      && anchor.element !== document.documentElement
    ) {
      return anchor.element;
    }

    return resolveMessageElement(anchor.messageLocator, anchor.selector);
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

  function resolveAnchorRange(anchor) {
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
    const roots = [];
    if (
      anchor.element
      && document.contains(anchor.element)
      && anchor.element !== document.body
      && anchor.element !== document.documentElement
      && !isInsideUserMessage(anchor.element)
    ) {
      roots.push(anchor.element);
    }

    roots.push(...collectAssistantMessageElements());
    return uniqueElements(roots);
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
    const candidates = [];
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

    if (selector.prefix && prefix.endsWith(selector.prefix)) {
      score += 3;
    }
    if (selector.suffix && suffix.startsWith(selector.suffix)) {
      score += 3;
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
    let total = 0;
    for (const node of nodes) {
      if (node === container) {
        return total + offset;
      }
      if (container.nodeType === Node.ELEMENT_NODE && container.contains(node)) {
        const child = getDirectChildContaining(container, node);
        const childIndex = child ? Array.prototype.indexOf.call(container.childNodes, child) : -1;
        if (childIndex >= offset) {
          return total;
        }
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
    if (!range) {
      return false;
    }

    try {
      const rect = getRangeRect(range);
      if (!rect) {
        return false;
      }

      scrollRectToCenter(rect);
      return true;
    } catch (error) {
      console.debug("[AskAnchor] Failed to scroll to saved range:", error);
      return false;
    }
  }

  function isRangeUsable(range) {
    try {
      return Boolean(range && getRangeRect(range) && document.contains(range.commonAncestorContainer));
    } catch (error) {
      return false;
    }
  }

  function scrollRectToCenter(rect) {
    const container = findScrollContainerForRect(rect);
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

  function findScrollContainerForRect(rect) {
    const centerX = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const centerY = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
    let element = document.elementFromPoint(centerX, centerY);

    while (element && element !== document.documentElement) {
      const style = window.getComputedStyle(element);
      const canScroll = /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`);
      if (canScroll && element.scrollHeight > element.clientHeight + 8) {
        return element;
      }
      element = element.parentElement;
    }

    return document.scrollingElement || document.documentElement;
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
        createSelectionMarker,
        serializeRange,
        resolveAnchorRange,
        findRangeFromSelector,
        scoreSelectorMatch,
        collectVisibleText,
        isVisibleTextNode,
        getTextOffsetInNodes,
        getDirectChildContaining,
        createRangeFromOffsets,
        findTextPoint,
        scrollToSavedRange,
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
