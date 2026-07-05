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

  function persistAnchorsToSession() {
    try {
      const payload = anchors.map((anchor) => ({
        id: anchor.id,
        name: anchor.name,
        text: anchor.text,
        selector: anchor.selector,
        messageLocator: anchor.messageLocator || null,
        scrollY: anchor.scrollY,
        createdAt: anchor.createdAt instanceof Date ? anchor.createdAt.toISOString() : anchor.createdAt,
        status: normalizeAnchorStatus(anchor.status)
      }));
      sessionStorage.setItem(getAnchorStorageKey(), JSON.stringify(payload));
    } catch (error) {
      console.debug("[AskAnchor] Failed to persist anchors:", error);
    }
  }

  function loadAnchorsFromSession() {
    try {
      activeAnchorStorageKey = getAnchorStorageKey();
      const raw = sessionStorage.getItem(getAnchorStorageKey());
      if (!raw) {
        anchors = [];
        activeAnchorId = null;
        renderAnchorDock();
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        anchors = [];
        activeAnchorId = null;
        renderAnchorDock();
        return;
      }

      anchors = parsed.slice(0, MAX_ANCHORS).map((item) => ({
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
      renderAnchorDock();
    } catch (error) {
      console.debug("[AskAnchor] Failed to load anchors:", error);
    }
  }

  function getAnchorStorageKey() {
    return `${STORAGE_KEY_PREFIX}${location.origin}${location.pathname}${location.search}`;
  }

  function getBranchStorageKey() {
    return `${BRANCH_STORAGE_KEY_PREFIX}${location.origin}${location.pathname}${location.search}`;
  }


  function handleConversationRouteChange() {
    const nextKey = getAnchorStorageKey();
    if (nextKey === activeAnchorStorageKey) {
      observeConversationRoot();
      return;
    }

    activeAnchorStorageKey = nextKey;
    activeBranchStorageKey = getBranchStorageKey();
    closeAnchorList();
    closeBranchPanel();
    resetConversationTimeline();
    observeConversationRoot();
    loadAnchorsFromSession();
    loadBranchesFromSession();
    scheduleConversationTimelineRender();
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
    if (anchors.length > 0) {
      list.appendChild(createBranchToolbar());
    }
    anchors.forEach((anchor, index) => {
      list.appendChild(createAnchorItem(anchor, index));
    });
  }

  function createBranchToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "ask-anchor-branch-toolbar";

    const anchor = getBranchPanelAnchor() || anchors[0];
    const branchCount = anchor ? getBranchesByAnchor(anchor.id).length : 0;
    toolbar.innerHTML = `
      <button class="ask-anchor-branch-open" type="button">
        <span>\u8ffd\u95ee\u5206\u652f</span>
        <span class="ask-anchor-branch-open__count"></span>
      </button>
    `;

    const button = toolbar.querySelector(".ask-anchor-branch-open");
    button.querySelector(".ask-anchor-branch-open__count").textContent = String(branchCount);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openBranchPanel(anchor?.id);
    });

    return toolbar;
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
        <button class="ask-anchor-anchor-action ask-anchor-anchor-branches" type="button" aria-label="\u6253\u5f00\u8ffd\u95ee\u5206\u652f" title="\u8ffd\u95ee\u5206\u652f">\u5206</button>
        <button class="ask-anchor-anchor-action ask-anchor-anchor-rename" type="button" aria-label="\u91cd\u547d\u540d\u951a\u70b9" title="\u91cd\u547d\u540d">\u270e</button>
        <button class="ask-anchor-anchor-action ask-anchor-anchor-delete" type="button" aria-label="\u5220\u9664\u951a\u70b9" title="\u5220\u9664">\u00d7</button>
      </div>
    `;

    item.querySelector(".ask-anchor-anchor-name").textContent = anchor.name;
    const mainButton = item.querySelector(".ask-anchor-anchor-main");
    mainButton.setAttribute("aria-label", `\u8fd4\u56de\u951a\u70b9 ${index + 1}\uff1a${anchor.name}`);
    mainButton.addEventListener("click", () => {
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

    const branchesButton = item.querySelector(".ask-anchor-anchor-branches");
    branchesButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openBranchPanel(anchor.id);
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


  function toggleAnchorList() {
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
    const target = anchor.element && document.contains(anchor.element) ? anchor.element : null;

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
      return;
    }

    window.scrollTo({ top: anchor.scrollY, behavior: "smooth" });
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
    if (anchor.range && isRangeUsable(anchor.range)) {
      return anchor.range.cloneRange();
    }

    if (!anchor.selector) {
      return null;
    }

    const messageRoot = resolveMessageElement(anchor.messageLocator, anchor.selector);
    if (messageRoot) {
      anchor.element = messageRoot;
      const scopedRange = findRangeFromSelector(anchor.selector, messageRoot);
      if (scopedRange) {
        return scopedRange;
      }
    }

    const root = anchor.element && document.contains(anchor.element) ? anchor.element : document.body;
    return findRangeFromSelector(anchor.selector, root) || findRangeFromSelector(anchor.selector, document.body);
  }


  function findRangeFromSelector(selector, root) {
    const snapshot = collectVisibleText(root);
    if (!selector || !selector.exact || !snapshot.text) {
      return null;
    }

    const normalizedStartRange = Math.max(0, Math.min(selector.start || 0, snapshot.text.length));
    const candidates = [];
    let index = snapshot.text.indexOf(selector.exact, Math.max(0, normalizedStartRange - 500));
    while (index !== -1) {
      candidates.push(index);
      index = snapshot.text.indexOf(selector.exact, index + 1);
    }

    if (candidates.length === 0) {
      index = snapshot.text.indexOf(selector.exact);
      while (index !== -1) {
        candidates.push(index);
        index = snapshot.text.indexOf(selector.exact, index + 1);
      }
    }

    const bestStart = candidates
      .map((start) => ({
        start,
        score: scoreSelectorMatch(snapshot.text, selector, start)
      }))
      .sort((a, b) => b.score - a.score || Math.abs(a.start - normalizedStartRange) - Math.abs(b.start - normalizedStartRange))[0]?.start;

    if (typeof bestStart !== "number") {
      return null;
    }

    return createRangeFromOffsets(snapshot.nodes, bestStart, bestStart + selector.exact.length);
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
    score -= Math.min(2, Math.abs(start - (selector.start || 0)) / 1000);
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
      if (element.closest?.(`#${DOCK_ID}, #${PANEL_ID}, #${BRANCH_PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`)) {
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
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      console.debug("[AskAnchor] Failed to restore selection:", error);
    }
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
        getBranchStorageKey,
        handleConversationRouteChange,
        createAnchorName,
        normalizeAnchorName,
        normalizeAnchorStatus,
        getAnchorStatusLabel,
        renderAnchorDock,
        renderAnchorItems,
        createBranchToolbar,
        createAnchorItem,
        toggleAnchorStatus,
        deleteAnchor,
        startRenameAnchor,
        renameAnchor,
        stopAnchorControlEvent,
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
