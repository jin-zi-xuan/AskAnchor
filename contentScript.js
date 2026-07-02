(function initAskAnchor() {
  const BUTTON_ID = "ask-anchor-explain-button";
  const DOCK_ID = "ask-anchor-anchor-dock";
  const LIST_ID = "ask-anchor-anchor-list";
  const TIMELINE_ID = "ask-anchor-anchor-timeline";
  const TIMELINE_PREVIEW_ID = "ask-anchor-timeline-preview";
  const TOAST_ID = "ask-anchor-toast";
  const HIGHLIGHT_CLASS = "ask-anchor-highlight";
  const MARKER_CLASS = "ask-anchor-selection-marker";
  const MIN_SELECTION_LENGTH = 2;
  const MAX_ANCHORS = 30;
  const ANCHOR_NAME_LENGTH = 28;
  const SELECTION_CONTEXT_LENGTH = 42;
  const STORAGE_KEY_PREFIX = "ask-anchor:anchors:";
  const CAT_POSITION_STORAGE_KEY = "ask-anchor:cat-position";
  const CAT_IMAGE_URL = chrome.runtime.getURL("assets/askanchor-cat-perch.png");

  const PLATFORM_ADAPTERS = [
    {
      name: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"],
      assistantSelectors: ["[data-message-author-role='assistant']"],
      userSelectors: ["[data-message-author-role='user']"],
      messageSelectors: ["[data-message-author-role]"],
      roleFromNode: (node) => node.getAttribute("data-message-author-role")
    },
    {
      name: "gemini",
      hosts: ["gemini.google.com"],
      assistantSelectors: ["model-response", ".model-response-text", "[class*='model-response']"],
      userSelectors: ["user-query", ".query-text", "[class*='user-query']"],
      messageSelectors: ["user-query", "model-response", ".query-text", ".model-response-text"],
      roleFromNode: (node) => node.matches("user-query, .query-text, [class*='user-query']") ? "user" : "assistant"
    },
    {
      name: "claude",
      hosts: ["claude.ai"],
      assistantSelectors: ["[data-testid*='assistant']", "[class*='assistant']", ".font-claude-message"],
      userSelectors: ["[data-testid*='user']", "[class*='human']", "[class*='user']"],
      messageSelectors: ["[data-testid*='message']", ".font-claude-message", "[class*='message']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    },
    {
      name: "perplexity",
      hosts: ["perplexity.ai", "www.perplexity.ai"],
      assistantSelectors: ["[data-testid*='answer']", "[class*='answer']", "[class*='prose']"],
      userSelectors: ["[data-testid*='query']", "[class*='query']", "[class*='user']"],
      messageSelectors: ["[data-testid*='answer']", "[data-testid*='query']", "[class*='answer']", "[class*='query']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    },
    {
      name: "poe",
      hosts: ["poe.com"],
      assistantSelectors: ["[class*='ChatMessage_messageRow']", "[class*='bot']", "[class*='assistant']"],
      userSelectors: ["[class*='human']", "[class*='user']"],
      messageSelectors: ["[class*='ChatMessage']", "[class*='message']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    },
    {
      name: "copilot",
      hosts: ["copilot.microsoft.com"],
      assistantSelectors: ["[data-content='ai-message']", "[class*='response']", "[class*='assistant']"],
      userSelectors: ["[data-content='user-message']", "[class*='user-message']"],
      messageSelectors: ["[data-content]", "[class*='message']", "[class*='response']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    },
    {
      name: "deepseek",
      hosts: ["chat.deepseek.com"],
      assistantSelectors: ["[class*='ds-markdown']", "[class*='assistant']", "[class*='answer']"],
      userSelectors: ["[class*='user']", "[class*='question']"],
      messageSelectors: ["[class*='message']", "[class*='markdown']", "[class*='chat']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    },
    {
      name: "kimi",
      hosts: ["kimi.moonshot.cn"],
      assistantSelectors: ["[class*='assistant']", "[class*='markdown']", "[class*='answer']"],
      userSelectors: ["[class*='user']", "[class*='question']"],
      messageSelectors: ["[class*='message']", "[class*='chat']", "[class*='markdown']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    },
    {
      name: "doubao",
      hosts: ["doubao.com", "www.doubao.com"],
      assistantSelectors: ["[class*='assistant']", "[class*='answer']", "[class*='markdown']"],
      userSelectors: ["[class*='user']", "[class*='question']"],
      messageSelectors: ["[class*='message']", "[class*='chat']", "[class*='markdown']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    },
    {
      name: "tongyi",
      hosts: ["tongyi.aliyun.com"],
      assistantSelectors: ["[class*='assistant']", "[class*='answer']", "[class*='markdown']"],
      userSelectors: ["[class*='user']", "[class*='question']"],
      messageSelectors: ["[class*='message']", "[class*='chat']", "[class*='markdown']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    },
    {
      name: "yiyan",
      hosts: ["yiyan.baidu.com"],
      assistantSelectors: ["[class*='assistant']", "[class*='answer']", "[class*='markdown']"],
      userSelectors: ["[class*='user']", "[class*='question']"],
      messageSelectors: ["[class*='message']", "[class*='chat']", "[class*='markdown']"],
      roleFromNode: (node) => inferRoleFromNode(node)
    }
  ];

  const activeAdapter = getActiveAdapter();
  let currentSelection = null;
  let lastValidSelection = null;
  let anchors = [];
  let activeAnchorId = null;
  let pendingFollowUp = null;
  let pendingFollowUpTimer = null;
  let pendingFollowUpPollTimer = null;
  let sentQuestionStabilizeTimer = null;
  let catDockTucked = false;
  let catDockPosition = loadCatDockPosition();
  let catDragState = null;
  let selectionTimer = null;
  let activeAnchorStorageKey = getAnchorStorageKey();
  let conversationTimelineTimer = null;

  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(handleSelectionChange, 120);
  });
  document.addEventListener("mouseup", handleSelectionChange);
  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") {
      hideExplainButton();
      closeAnchorList();
      return;
    }

    handleSelectionChange();
  });
  document.addEventListener("click", handlePossibleSendClick, true);
  document.addEventListener("keydown", handlePossibleSendKeydown, true);
  window.addEventListener("resize", updateCatDockPosition);
  window.addEventListener("scroll", updateCatDockPosition, { passive: true });
  document.addEventListener("scroll", updateCatDockPosition, { passive: true, capture: true });

  const conversationObserver = new MutationObserver(() => {
    schedulePendingFollowUpCheck();
    scheduleConversationTimelineRender();
  });
  conversationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  renderAnchorDock();
  window.setTimeout(loadAnchorsFromSession, 500);
  window.setTimeout(renderConversationTimeline, 900);
  window.setInterval(handleConversationRouteChange, 800);

  function handleSelectionChange() {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";

    if (!selection || selection.rangeCount === 0 || text.length < MIN_SELECTION_LENGTH) {
      hideExplainButton();
      currentSelection = null;
      return;
    }

    const range = selection.getRangeAt(0);
    const messageElement = findAssistantMessageElement(range.commonAncestorContainer);
    if (!messageElement) {
      hideExplainButton();
      currentSelection = null;
      return;
    }

    currentSelection = {
      text,
      range: range.cloneRange(),
      messageElement,
      rect: getRangeRect(range)
    };
    lastValidSelection = currentSelection;

    showExplainButton(currentSelection.rect);
  }

  function showExplainButton(rect) {
    if (!rect) {
      return;
    }

    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.textContent = "\u8ffd\u95ee\u8fd9\u4e00\u6bb5";
      button.addEventListener("pointerdown", keepSelectionForButton);
      button.addEventListener("mousedown", keepSelectionForButton);
      button.addEventListener("click", handleAskClick);
      document.documentElement.appendChild(button);
    }

    const left = Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 128);
    const top = rect.bottom + window.scrollY + 8;
    button.style.left = `${Math.max(window.scrollX + 8, left)}px`;
    button.style.top = `${top}px`;
    button.hidden = false;
  }

  function hideExplainButton() {
    const button = document.getElementById(BUTTON_ID);
    if (button) {
      button.hidden = true;
    }
  }

  function keepSelectionForButton(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function handleAskClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const selectionSnapshot = currentSelection || lastValidSelection;
    if (!selectionSnapshot) {
      return;
    }

    const sourceRange = selectionSnapshot.range.cloneRange();
    const selector = serializeRange(sourceRange, selectionSnapshot.messageElement);
    const marker = createSelectionMarker(sourceRange);
    const anchor = addAnchor({
      text: selectionSnapshot.text,
      range: sourceRange,
      selector,
      marker,
      element: selectionSnapshot.messageElement,
      scrollY: window.scrollY
    });
    const knownUserElements = collectUserMessageElements();
    const knownUserNodes = new Set(knownUserElements);
    const knownUserTexts = new Set(knownUserElements.map((node) => normalizeComparableText(node.innerText || node.textContent || "")));
    const prompt = buildFollowUpPrompt(selectionSnapshot.text);
    const filled = await fillCurrentAiInput(prompt);

    hideExplainButton();
    renderAnchorDock();

    if (filled) {
      watchForSentFollowUp({
        anchor,
        prompt,
        selectedText: selectionSnapshot.text,
        knownUserNodes,
        knownUserTexts
      });
      showToast(`\u5df2\u751f\u6210\u951a\u70b9\u300c${anchor.name}\u300d\uff0c\u5e76\u586b\u5165\u8ffd\u95ee`);
      return;
    }

    await copyPromptToClipboard(prompt);
    showToast(`\u5df2\u751f\u6210\u951a\u70b9\u300c${anchor.name}\u300d\uff0c\u672a\u627e\u5230\u8f93\u5165\u6846\uff0c\u5df2\u590d\u5236`);
  }

  function addAnchor({ text, range, selector, marker, element, scrollY }) {
    const anchor = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: createAnchorName(text),
      text,
      range,
      selector,
      marker,
      element,
      scrollY,
      createdAt: new Date()
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
        scrollY: anchor.scrollY,
        createdAt: anchor.createdAt instanceof Date ? anchor.createdAt.toISOString() : anchor.createdAt
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
        scrollY: typeof item.scrollY === "number" ? item.scrollY : window.scrollY,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
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

  function handleConversationRouteChange() {
    const nextKey = getAnchorStorageKey();
    if (nextKey === activeAnchorStorageKey) {
      return;
    }

    activeAnchorStorageKey = nextKey;
    closeAnchorList();
    loadAnchorsFromSession();
    scheduleConversationTimelineRender();
  }

  function createAnchorName(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= ANCHOR_NAME_LENGTH) {
      return normalized || "\u672a\u547d\u540d\u951a\u70b9";
    }

    return `${normalized.slice(0, ANCHOR_NAME_LENGTH)}...`;
  }

  function renderAnchorDock() {
    let dock = document.getElementById(DOCK_ID);
    if (!dock) {
      dock = document.createElement("div");
      dock.id = DOCK_ID;
      dock.innerHTML = `
        <button class="ask-anchor-dock-button" type="button" aria-label="AskAnchor" aria-expanded="false">
          <img class="ask-anchor-cat-image" alt="" aria-hidden="true">
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

    const button = dock.querySelector(".ask-anchor-dock-button");
    const list = dock.querySelector(`#${LIST_ID}`);
    button.title = `AskAnchor - ${anchors.length} \u4e2a\u951a\u70b9`;
    list.innerHTML = "";

    anchors.forEach((anchor, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `ask-anchor-anchor-item${anchor.id === activeAnchorId ? " is-active" : ""}`;
      item.setAttribute("aria-label", `\u8fd4\u56de\u951a\u70b9 ${index + 1}\uff1a${anchor.name}`);
      item.innerHTML = `
        <span class="ask-anchor-anchor-index" aria-hidden="true">
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--one"></span>
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--two"></span>
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--three"></span>
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--four"></span>
          <span class="ask-anchor-paw__pad"></span>
        </span>
        <span class="ask-anchor-anchor-name"></span>
      `;
      item.querySelector(".ask-anchor-anchor-name").textContent = anchor.name;
      item.addEventListener("click", () => {
        closeAnchorList();
        returnToAnchor(anchor.id);
      });
      list.appendChild(item);
    });

    renderConversationTimeline();
    updateCatDockPosition();
  }

  function scheduleConversationTimelineRender() {
    if (conversationTimelineTimer) {
      return;
    }

    conversationTimelineTimer = window.setTimeout(() => {
      conversationTimelineTimer = null;
      renderConversationTimeline();
    }, 350);
  }

  function renderConversationTimeline() {
    let timeline = document.getElementById(TIMELINE_ID);
    if (hasNativeConversationTimeline()) {
      hideTimelinePreview();
      if (timeline) {
        timeline.remove();
      }
      return;
    }

    const messages = collectTimelineMessageElements();
    if (messages.length === 0) {
      hideTimelinePreview();
      if (timeline) {
        timeline.remove();
      }
      return;
    }

    if (!timeline) {
      timeline = document.createElement("div");
      timeline.id = TIMELINE_ID;
      timeline.className = "ask-anchor-anchor-timeline";
      timeline.setAttribute("aria-label", "AskAnchor timeline");
      document.documentElement.appendChild(timeline);
    }

    timeline.innerHTML = "";
    messages.forEach((message, index) => {
      const preview = createTimelinePreview(message, index);
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = "ask-anchor-timeline-tick";
      tick.setAttribute("aria-label", `\u5b9a\u4f4d\u5230\u5bf9\u8bdd ${index + 1}\uff1a${preview.title}`);
      tick.addEventListener("click", (event) => {
        event.stopPropagation();
        closeAnchorList();
        scrollToConversationMessage(message);
      });
      tick.addEventListener("mouseenter", () => showTimelinePreview(tick, preview));
      tick.addEventListener("focus", () => showTimelinePreview(tick, preview));
      tick.addEventListener("mouseleave", hideTimelinePreview);
      tick.addEventListener("blur", hideTimelinePreview);
      timeline.appendChild(tick);
    });
  }

  function hasNativeConversationTimeline() {
    if (activeAdapter.name === "chatgpt") {
      return true;
    }

    const nativeSelectors = [
      "[data-testid*='timeline']",
      "[aria-label*='timeline' i]",
      "[aria-label*='\u65f6\u95f4\u8f74']",
      "[class*='timeline' i]",
      "[class*='conversation-nav' i]",
      "[class*='scroll-spy' i]"
    ];

    return nativeSelectors.some((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector))
          .some((node) => !node.closest(`#${DOCK_ID}, #${TIMELINE_ID}, #${TIMELINE_PREVIEW_ID}`) && isVisible(node));
      } catch (error) {
        return false;
      }
    });
  }

  function collectTimelineMessageElements() {
    const userMessages = collectUserMessageElements()
      .filter((node) => document.contains(node))
      .filter((node) => isVisible(node));

    if (userMessages.length > 0) {
      return userMessages.slice(0, 100);
    }

    return uniqueElements([
      ...activeAdapter.messageSelectors,
      "[data-message-author-role]",
      "user-query",
      "model-response",
      "[data-testid*='message']",
      "[class*='message']"
    ].flatMap((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector));
      } catch (error) {
        return [];
      }
    }))
      .filter((node) => !isInsideEditable(node))
      .filter((node) => isVisible(node))
      .filter((node) => normalizeComparableText(node.innerText || node.textContent || "").length > 1)
      .slice(0, 100);
  }

  function createTimelinePreview(message, index) {
    const text = normalizeComparableText(message.innerText || message.textContent || "");
    const fallbackTitle = `\u5bf9\u8bdd ${index + 1}`;
    const title = text ? createAnchorName(text) : fallbackTitle;
    const excerpt = text.length > 88 ? `${text.slice(0, 88)}...` : text;
    return {
      title,
      excerpt: excerpt || fallbackTitle
    };
  }

  function showTimelinePreview(tick, preview) {
    let previewEl = document.getElementById(TIMELINE_PREVIEW_ID);
    if (!previewEl) {
      previewEl = document.createElement("div");
      previewEl.id = TIMELINE_PREVIEW_ID;
      previewEl.innerHTML = `
        <div class="ask-anchor-timeline-preview__title"></div>
        <div class="ask-anchor-timeline-preview__excerpt"></div>
      `;
      document.documentElement.appendChild(previewEl);
    }

    previewEl.querySelector(".ask-anchor-timeline-preview__title").textContent = preview.title;
    previewEl.querySelector(".ask-anchor-timeline-preview__excerpt").textContent = preview.excerpt;

    const rect = tick.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 32);
    const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.left - width - 18));
    const top = Math.max(16, Math.min(window.innerHeight - 120, rect.top - 42));

    previewEl.style.width = `${width}px`;
    previewEl.style.left = `${left}px`;
    previewEl.style.top = `${top}px`;
    previewEl.classList.add("is-visible");
  }

  function hideTimelinePreview() {
    const previewEl = document.getElementById(TIMELINE_PREVIEW_ID);
    if (previewEl) {
      previewEl.classList.remove("is-visible");
    }
  }

  function scrollToConversationMessage(message) {
    if (!message || !document.contains(message)) {
      return;
    }

    message.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });
    brieflyHighlight(message);
  }

  function handleCatClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (catDragState?.moved) {
      return;
    }

    if (catDockTucked) {
      untuckCatDock();
      return;
    }

    toggleAnchorList();
  }

  function tuckCatDock(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    catDockTucked = true;
    catDockPosition = null;
    saveCatDockPosition(null);
    closeAnchorList();
    updateCatDockPosition();
  }

  function untuckCatDock() {
    catDockTucked = false;
    updateCatDockPosition();
  }

  function startCatDrag(event) {
    if (event.button !== 0) {
      return;
    }

    const dock = document.getElementById(DOCK_ID);
    if (!dock) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (catDockTucked) {
      catDockTucked = false;
      dock.classList.remove("is-tucked");
    }

    const rect = dock.getBoundingClientRect();
    catDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false
    };

    dock.classList.add("is-dragging");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", moveCatDrag, true);
    window.addEventListener("pointerup", endCatDrag, true);
    window.addEventListener("pointercancel", endCatDrag, true);
  }

  function moveCatDrag(event) {
    if (!catDragState || event.pointerId !== catDragState.pointerId) {
      return;
    }

    const dx = event.clientX - catDragState.startX;
    const dy = event.clientY - catDragState.startY;
    if (Math.hypot(dx, dy) > 4) {
      catDragState.moved = true;
    }

    const dock = document.getElementById(DOCK_ID);
    if (!dock) {
      return;
    }

    const editor = findPromptEditor();
    const editorRect = editor?.getBoundingClientRect?.();

    if (editorRect && editorRect.width > 0 && editorRect.height > 0) {
      catDockPosition = createCatPositionFromPointer(event, editorRect);
      applyCatDockPosition(dock, getCatDockViewportPosition(catDockPosition, editorRect));
      return;
    }

    const width = dock.offsetWidth || 76;
    const height = dock.offsetHeight || 44;
    const left = clamp(event.clientX - catDragState.offsetX, 4, window.innerWidth - width - 4);
    const top = clamp(event.clientY - catDragState.offsetY, 4, window.innerHeight - height - 4);
    catDockPosition = { mode: "free", left, top };
    applyCatDockPosition(dock, catDockPosition);
  }

  function endCatDrag(event) {
    if (!catDragState || event.pointerId !== catDragState.pointerId) {
      return;
    }

    const dock = document.getElementById(DOCK_ID);
    if (dock) {
      dock.classList.remove("is-dragging");
    }

    if (catDragState.moved && catDockPosition) {
      saveCatDockPosition(catDockPosition);
      window.setTimeout(() => {
        catDragState = null;
      }, 0);
    } else {
      catDragState = null;
    }

    window.removeEventListener("pointermove", moveCatDrag, true);
    window.removeEventListener("pointerup", endCatDrag, true);
    window.removeEventListener("pointercancel", endCatDrag, true);
  }

  function toggleAnchorList() {
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
    if (!dock) {
      return;
    }

    const button = dock.querySelector(".ask-anchor-dock-button");
    const list = dock.querySelector(`#${LIST_ID}`);
    if (list) {
      list.hidden = true;
    }
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  }

  function updateCatDockPosition() {
    const dock = document.getElementById(DOCK_ID);
    if (!dock) {
      return;
    }

    dock.classList.toggle("is-tucked", catDockTucked);
    if (catDockTucked) {
      dock.style.removeProperty("--ask-anchor-cat-left");
      dock.style.removeProperty("--ask-anchor-cat-right");
      dock.style.removeProperty("--ask-anchor-cat-top");
      return;
    }

    if (catDockPosition) {
      const editor = findPromptEditor();
      const editorRect = editor?.getBoundingClientRect?.();
      const safePosition = getCatDockViewportPosition(catDockPosition, editorRect);
      applyCatDockPosition(dock, safePosition);
      return;
    }

    const editor = findPromptEditor();
    if (!editor) {
      dock.style.removeProperty("--ask-anchor-cat-left");
      dock.style.removeProperty("--ask-anchor-cat-right");
      dock.style.removeProperty("--ask-anchor-cat-top");
      dock.style.removeProperty("bottom");
      return;
    }

    const rect = editor.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const catWidth = 76;
    const left = Math.min(window.innerWidth - catWidth - 8, Math.max(8, rect.right - catWidth - 96));
    const top = Math.min(window.innerHeight - 50, Math.max(8, rect.top - 40));
    dock.style.setProperty("--ask-anchor-cat-left", `${left}px`);
    dock.style.setProperty("--ask-anchor-cat-right", "auto");
    dock.style.setProperty("--ask-anchor-cat-top", `${top}px`);
    dock.style.removeProperty("bottom");
  }

  function createCatPositionFromPointer(event, editorRect) {
    const catWidth = 76;
    const x = clamp(event.clientX - catDragState.offsetX + catWidth / 2, editorRect.left + 28, editorRect.right - 28);
    const ratio = editorRect.width > 0 ? (x - editorRect.left) / editorRect.width : 0.82;
    const rawOffsetY = event.clientY - catDragState.offsetY - (editorRect.top - 40);
    const offsetY = clamp(rawOffsetY, -6, 6);

    return {
      mode: "editor-edge",
      ratio: clamp(ratio, 0.08, 0.92),
      offsetY
    };
  }

  function getCatDockViewportPosition(position, editorRect) {
    if (position?.mode === "editor-edge" && editorRect && editorRect.width > 0 && editorRect.height > 0) {
      const catWidth = 76;
      const ratio = clamp(position.ratio ?? 0.82, 0.08, 0.92);
      const left = clamp(editorRect.left + editorRect.width * ratio - catWidth / 2, 4, window.innerWidth - catWidth - 4);
      const top = clamp(editorRect.top - 40 + (position.offsetY || 0), 4, window.innerHeight - 44 - 4);
      return { left, top };
    }

    return {
      left: clamp(position?.left ?? window.innerWidth - 96, 4, window.innerWidth - 76),
      top: clamp(position?.top ?? window.innerHeight - 120, 4, window.innerHeight - 44)
    };
  }

  function applyCatDockPosition(dock, position) {
    dock.style.setProperty("--ask-anchor-cat-left", `${position.left}px`);
    dock.style.setProperty("--ask-anchor-cat-right", "auto");
    dock.style.setProperty("--ask-anchor-cat-top", `${position.top}px`);
    dock.style.removeProperty("bottom");
  }

  function loadCatDockPosition() {
    try {
      const raw = localStorage.getItem(CAT_POSITION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const value = JSON.parse(raw);
      if (
        value?.mode === "editor-edge"
        && typeof value.ratio === "number"
        && typeof value.offsetY === "number"
      ) {
        return value;
      }
      if (typeof value?.left !== "number" || typeof value?.top !== "number") {
        return null;
      }
      return { mode: "free", left: value.left, top: value.top };
    } catch (error) {
      return null;
    }
  }

  function saveCatDockPosition(position) {
    try {
      if (!position) {
        localStorage.removeItem(CAT_POSITION_STORAGE_KEY);
        return;
      }
      localStorage.setItem(CAT_POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch (error) {
      console.debug("[AskAnchor] Failed to save cat position:", error);
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

  function watchForSentFollowUp({ anchor, prompt, selectedText, knownUserNodes, knownUserTexts }) {
    pendingFollowUp = {
      anchorId: anchor.id,
      prompt,
      selectedText,
      knownUserNodes,
      knownUserTexts,
      editor: findPromptEditor(),
      waitingForSend: true,
      createdAt: Date.now()
    };
  }

  function schedulePendingFollowUpCheck() {
    if (!pendingFollowUp || pendingFollowUp.waitingForSend || pendingFollowUpTimer) {
      return;
    }

    pendingFollowUpTimer = window.setTimeout(() => {
      pendingFollowUpTimer = null;
      checkPendingFollowUp();
    }, 180);
  }

  function checkPendingFollowUp() {
    if (!pendingFollowUp) {
      return;
    }

    const searchStartedAt = pendingFollowUp.sentAt || pendingFollowUp.createdAt;
    if (Date.now() - searchStartedAt > 90 * 1000) {
      clearPendingFollowUp();
      return;
    }

    const sentQuestion = findSentFollowUpElement(pendingFollowUp);
    if (!sentQuestion) {
      return;
    }

    focusSentQuestion(sentQuestion);
    clearPendingFollowUp();
  }

  function findSentFollowUpElement(followUp) {
    const userMessages = collectUserMessageElements();
    const matchingNode = userMessages
      .filter((node) => !followUp.knownUserNodes.has(node))
      .find((node) => isMatchingFollowUpText(node.innerText || node.textContent || "", followUp));

    if (matchingNode) {
      return matchingNode;
    }

    const newMessages = userMessages.filter((node) => {
      const text = normalizeComparableText(node.innerText || node.textContent || "");
      return !followUp.knownUserNodes.has(node) && !followUp.knownUserTexts.has(text);
    });

    if (newMessages.length > 0 && isPromptEditorCleared(followUp.editor)) {
      return newMessages[newMessages.length - 1];
    }

    return null;
  }

  function isMatchingFollowUpText(text, followUp) {
    const normalizedText = normalizeComparableText(text);
    if (!normalizedText) {
      return false;
    }

    const selectedText = normalizeComparableText(followUp.selectedText);
    const selectedFragment = selectedText.slice(0, Math.min(80, selectedText.length));
    const promptHead = normalizeComparableText(followUp.prompt).slice(0, 80);

    return Boolean(
      selectedFragment && normalizedText.includes(selectedFragment)
      || promptHead && normalizedText.includes(promptHead)
    );
  }

  function startPendingFollowUpPolling() {
    window.clearInterval(pendingFollowUpPollTimer);
    pendingFollowUpPollTimer = window.setInterval(() => {
      if (!pendingFollowUp) {
        window.clearInterval(pendingFollowUpPollTimer);
        pendingFollowUpPollTimer = null;
        return;
      }

      checkPendingFollowUp();
    }, 700);
  }

  function markPendingFollowUpSent() {
    if (!pendingFollowUp || !pendingFollowUp.waitingForSend) {
      return;
    }

    pendingFollowUp.waitingForSend = false;
    pendingFollowUp.sentAt = Date.now();
    schedulePendingFollowUpCheck();
    startPendingFollowUpPolling();
  }

  function handlePossibleSendClick(event) {
    if (!pendingFollowUp || !pendingFollowUp.waitingForSend) {
      return;
    }

    const button = event.target && event.target.closest ? event.target.closest("button, [role='button']") : null;
    if (button && isSendControl(button)) {
      window.setTimeout(markPendingFollowUpSent, 120);
    }
  }

  function handlePossibleSendKeydown(event) {
    if (!pendingFollowUp || !pendingFollowUp.waitingForSend) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      const editor = pendingFollowUp.editor && document.contains(pendingFollowUp.editor)
        ? pendingFollowUp.editor
        : findPromptEditor();

      if (editor && (event.target === editor || editor.contains(event.target))) {
        window.setTimeout(markPendingFollowUpSent, 120);
      }
    }
  }

  function isSendControl(element) {
    const haystack = [
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("title"),
      element.textContent,
      element.className,
      element.id
    ].join(" ").toLowerCase();

    return /send|submit|arrow-up|paper-airplane|\u53d1\u9001|\u9001\u51fa|\u63d0\u4ea4/.test(haystack);
  }

  function clearPendingFollowUp() {
    pendingFollowUp = null;
    window.clearTimeout(pendingFollowUpTimer);
    window.clearInterval(pendingFollowUpPollTimer);
    pendingFollowUpTimer = null;
    pendingFollowUpPollTimer = null;
  }

  function isPromptEditorCleared(editor) {
    if (!editor || !document.contains(editor)) {
      editor = findPromptEditor();
    }

    return normalizeComparableText(getEditorText(editor)).length < 2;
  }

  function getEditorText(editor) {
    if (!editor) {
      return "";
    }

    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      return editor.value || "";
    }

    return editor.innerText || editor.textContent || "";
  }

  function focusSentQuestion(element) {
    window.clearInterval(sentQuestionStabilizeTimer);

    let attempts = 0;
    const keepInView = () => {
      if (!element || !document.contains(element)) {
        window.clearInterval(sentQuestionStabilizeTimer);
        sentQuestionStabilizeTimer = null;
        return;
      }

      element.scrollIntoView({
        behavior: attempts === 0 ? "smooth" : "auto",
        block: "center",
        inline: "nearest"
      });

      if (attempts === 0) {
        brieflyHighlight(element);
      }

      attempts += 1;
      if (attempts >= 6) {
        window.clearInterval(sentQuestionStabilizeTimer);
        sentQuestionStabilizeTimer = null;
      }
    };

    keepInView();
    sentQuestionStabilizeTimer = window.setInterval(keepInView, 450);
  }

  function buildFollowUpPrompt(selectedText) {
    return [
      "\u8bf7\u89e3\u91ca\u6211\u5728\u4e0a\u6587\u4e2d\u9009\u4e2d\u7684\u8fd9\u6bb5\u5185\u5bb9\uff1a",
      "",
      "\u3010\u9009\u4e2d\u5185\u5bb9\u3011",
      selectedText,
      "",
      "\u8bf7\u8bf4\u660e\u5b83\u7684\u610f\u601d\u3001\u548c\u4e0a\u6587\u7684\u5173\u7cfb\uff0c\u4ee5\u53ca\u6211\u5e94\u8be5\u5982\u4f55\u7406\u89e3\u5b83\u3002"
    ].join("\n");
  }

  async function fillCurrentAiInput(prompt) {
    const editor = await waitForPromptEditor();
    if (!editor) {
      return false;
    }

    fillPromptEditor(editor, prompt);
    return true;
  }

  async function waitForPromptEditor() {
    const deadline = Date.now() + 3500;
    while (Date.now() < deadline) {
      const editor = findPromptEditor();
      if (editor) {
        return editor;
      }

      await delay(180);
    }

    return null;
  }

  function findPromptEditor() {
    const selectors = [
      "#prompt-textarea",
      "textarea[data-testid='prompt-textarea']",
      "[data-testid='chat-input'] textarea",
      "[data-testid='composer'] textarea",
      "[aria-label*='Message']",
      "[aria-label*='Ask']",
      "[aria-label*='Send']",
      "[aria-label*='\u8f93\u5165']",
      "[aria-label*='\u63d0\u95ee']",
      "[placeholder*='Message']",
      "[placeholder*='Ask']",
      "[placeholder*='\u8f93\u5165']",
      "[placeholder*='\u63d0\u95ee']",
      "textarea",
      "[contenteditable='true'][data-lexical-editor='true']",
      "[contenteditable='true'][role='textbox']",
      "[contenteditable='true']"
    ];

    return selectors
      .map((selector) => document.querySelector(selector))
      .find((node) => (
        node
        && isPromptEditorCandidate(node)
        && !node.closest(`#${DOCK_ID}, #${BUTTON_ID}, #${TOAST_ID}`)
        && isVisible(node)
      ));
  }

  function isPromptEditorCandidate(node) {
    return node.tagName === "TEXTAREA"
      || node.tagName === "INPUT"
      || node.getAttribute("contenteditable") === "true"
      || node.getAttribute("role") === "textbox";
  }

  function fillPromptEditor(editor, prompt) {
    editor.focus();

    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(editor.constructor.prototype, "value")?.set;
      if (setter) {
        setter.call(editor, prompt);
      } else {
        editor.value = prompt;
      }

      editor.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: prompt
      }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    editor.textContent = "";
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);

    if (!document.execCommand("insertText", false, prompt)) {
      editor.textContent = prompt;
    }

    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: prompt
    }));
  }

  async function copyPromptToClipboard(prompt) {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch (error) {
      console.debug("[AskAnchor] Clipboard fallback failed:", error);
    }
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
      if (element.closest?.(`#${DOCK_ID}, #${BUTTON_ID}, #${TOAST_ID}`)) {
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

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.hidden = false;
    toast.classList.remove("is-hiding");
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    window.clearTimeout(showToast.hideTimer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.add("is-hiding");
      toast.classList.remove("is-visible");
    }, 3600);
    showToast.hideTimer = window.setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove("is-hiding");
    }, 4000);
  }

  function findAssistantMessageElement(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element || isInsideEditable(element) || element.closest(`#${DOCK_ID}, #${BUTTON_ID}, #${TOAST_ID}`)) {
      return null;
    }

    const platformMatch = closestFromSelectors(element, activeAdapter.assistantSelectors);
    if (platformMatch && !isInsideUserMessage(platformMatch)) {
      return platformMatch;
    }

    const genericMatch = closestFromSelectors(element, [
      "[data-message-author-role='assistant']",
      "model-response",
      "[data-testid*='assistant']",
      "[data-testid*='answer']",
      "[data-content='ai-message']",
      ".markdown",
      ".prose",
      "[class*='assistant']",
      "[class*='answer']",
      "[class*='response']",
      "[class*='markdown']"
    ]);

    if (genericMatch && !isInsideUserMessage(genericMatch) && !isInsideEditable(genericMatch)) {
      return genericMatch;
    }

    return null;
  }

  function collectUserMessageElements() {
    const selectors = [
      ...activeAdapter.userSelectors,
      "[data-message-author-role='user']",
      "user-query",
      "[data-content='user-message']",
      "[data-testid*='user']",
      "[data-testid*='query']",
      "[class*='user']",
      "[class*='human']",
      "[class*='question']",
      "[class*='query']"
    ];

    return uniqueElements(selectors.flatMap((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector));
      } catch (error) {
        console.debug("[AskAnchor] Ignored invalid user selector:", selector, error);
        return [];
      }
    }))
      .filter((node) => !isInsideEditable(node))
      .filter((node) => normalizeComparableText(node.innerText || node.textContent || "").length > 1);
  }

  function getActiveAdapter() {
    const hostname = location.hostname;
    return PLATFORM_ADAPTERS.find((adapter) => adapter.hosts.includes(hostname)) || {
      name: "generic",
      assistantSelectors: [],
      userSelectors: [],
      messageSelectors: [],
      roleFromNode: (node) => inferRoleFromNode(node)
    };
  }

  function inferRoleFromNode(node) {
    const haystack = [
      node.getAttribute("data-message-author-role"),
      node.getAttribute("data-testid"),
      node.getAttribute("data-content"),
      node.getAttribute("aria-label"),
      node.className,
      node.id
    ].join(" ").toLowerCase();

    if (/(user|human|query|question|prompt)/.test(haystack)) {
      return "user";
    }

    if (/(assistant|bot|ai|answer|response|model)/.test(haystack)) {
      return "assistant";
    }

    return "assistant";
  }

  function isInsideUserMessage(element) {
    const userSelectors = [
      ...activeAdapter.userSelectors,
      "[data-message-author-role='user']",
      "user-query",
      "[data-content='user-message']",
      "[data-testid*='user']",
      "[data-testid*='query']",
      "[class*='user']",
      "[class*='human']",
      "[class*='question']",
      "[class*='query']"
    ];

    return Boolean(closestFromSelectors(element, userSelectors));
  }

  function isInsideEditable(element) {
    return Boolean(element.closest([
      "textarea",
      "input",
      "select",
      "button",
      "[contenteditable='true']",
      "[role='textbox']",
      "[data-lexical-editor='true']"
    ].join(",")));
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function closestFromSelectors(element, selectors) {
    for (const selector of selectors.filter(Boolean)) {
      try {
        const match = element.closest(selector);
        if (match) {
          return match;
        }
      } catch (error) {
        console.debug("[AskAnchor] Ignored invalid selector:", selector, error);
      }
    }

    return null;
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements)).sort((a, b) => {
      if (a === b) {
        return 0;
      }

      const position = a.compareDocumentPosition(b);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function getRangeRect(range) {
    const rect = range.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return rect;
    }

    const rects = Array.from(range.getClientRects());
    return rects.find((item) => item.width > 0 && item.height > 0) || null;
  }

  function normalizeComparableText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
