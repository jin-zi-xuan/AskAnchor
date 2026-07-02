(function initAskAnchor() {
  const BUTTON_ID = "ask-anchor-explain-button";
  const DOCK_ID = "ask-anchor-anchor-dock";
  const LIST_ID = "ask-anchor-anchor-list";
  const TIMELINE_ID = "ask-anchor-anchor-timeline";
  const TOAST_ID = "ask-anchor-toast";
  const HIGHLIGHT_CLASS = "ask-anchor-highlight";
  const MARKER_CLASS = "ask-anchor-selection-marker";
  const MIN_SELECTION_LENGTH = 2;
  const MAX_ANCHORS = 30;
  const ANCHOR_NAME_LENGTH = 28;
  const SELECTION_CONTEXT_LENGTH = 42;
  const STORAGE_KEY_PREFIX = "ask-anchor:anchors:";
  const CAT_POSITION_STORAGE_KEY = "ask-anchor:cat-position";
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

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
  let catAnimationFrame = null;
  let catDockTucked = false;
  let catDockPosition = loadCatDockPosition();
  let catDragState = null;
  let selectionTimer = null;

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

  const conversationObserver = new MutationObserver(schedulePendingFollowUpCheck);
  conversationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  window.setTimeout(loadAnchorsFromSession, 500);

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
      const raw = sessionStorage.getItem(getAnchorStorageKey());
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
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
    return `${STORAGE_KEY_PREFIX}${location.origin}${location.pathname}`;
  }

  function createAnchorName(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= ANCHOR_NAME_LENGTH) {
      return normalized || "\u672a\u547d\u540d\u951a\u70b9";
    }

    return `${normalized.slice(0, ANCHOR_NAME_LENGTH)}...`;
  }

  function renderAnchorDock() {
    if (anchors.length === 0) {
      removeAnchorDock();
      return;
    }

    let dock = document.getElementById(DOCK_ID);
    if (!dock) {
      dock = document.createElement("div");
      dock.id = DOCK_ID;
      dock.innerHTML = `
        <button class="ask-anchor-dock-button" type="button" aria-label="AskAnchor" aria-expanded="false">
          <canvas class="ask-anchor-cat-canvas" width="152" height="152" aria-hidden="true"></canvas>
        </button>
        <div id="${TIMELINE_ID}" class="ask-anchor-anchor-timeline" aria-label="AskAnchor timeline"></div>
        <div id="${LIST_ID}" class="ask-anchor-anchor-list" hidden></div>
      `;
      document.documentElement.appendChild(dock);

      const catButton = dock.querySelector(".ask-anchor-dock-button");
      catButton.addEventListener("click", handleCatClick);
      catButton.addEventListener("dblclick", tuckCatDock);
      catButton.addEventListener("pointerdown", startCatDrag);
      startCatMascotRenderer(dock);
    }

    const button = dock.querySelector(".ask-anchor-dock-button");
    const list = dock.querySelector(`#${LIST_ID}`);
    const timeline = dock.querySelector(`#${TIMELINE_ID}`);
    button.title = `AskAnchor - ${anchors.length} \u4e2a\u951a\u70b9`;
    list.innerHTML = "";
    timeline.innerHTML = "";

    anchors.forEach((anchor, index) => {
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = `ask-anchor-timeline-tick${anchor.id === activeAnchorId ? " is-active" : ""}`;
      tick.setAttribute("aria-label", `\u8fd4\u56de\u951a\u70b9 ${index + 1}\uff1a${anchor.name}`);
      tick.title = anchor.name;
      tick.addEventListener("click", (event) => {
        event.stopPropagation();
        closeAnchorList();
        returnToAnchor(anchor.id);
      });
      timeline.appendChild(tick);

      const item = document.createElement("button");
      item.type = "button";
      item.className = `ask-anchor-anchor-item${anchor.id === activeAnchorId ? " is-active" : ""}`;
      item.setAttribute("aria-label", `\u8fd4\u56de\u951a\u70b9 ${index + 1}\uff1a${anchor.name}`);
      item.innerHTML = `
        <span class="ask-anchor-anchor-index" aria-hidden="true">
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--one"></span>
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--two"></span>
          <span class="ask-anchor-paw__toe ask-anchor-paw__toe--three"></span>
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

    updateCatDockPosition();
  }

  function removeAnchorDock() {
    const dock = document.getElementById(DOCK_ID);
    if (dock) {
      dock.remove();
    }
    stopCatMascotRenderer();
  }

  function startCatMascotRenderer(dock) {
    stopCatMascotRenderer();

    const canvas = dock.querySelector(".ask-anchor-cat-canvas");
    const context = canvas?.getContext?.("2d");
    if (!canvas || !context) {
      return;
    }

    const render = (timestamp) => {
      if (!document.contains(canvas)) {
        stopCatMascotRenderer();
        return;
      }

      drawCatMascot(context, canvas, reducedMotionQuery.matches ? 0 : timestamp, catDockTucked);
      catAnimationFrame = window.requestAnimationFrame(render);
    };

    catAnimationFrame = window.requestAnimationFrame(render);
  }

  function stopCatMascotRenderer() {
    if (catAnimationFrame) {
      window.cancelAnimationFrame(catAnimationFrame);
      catAnimationFrame = null;
    }
  }

  function drawCatMascot(context, canvas, timestamp, tucked) {
    const width = canvas.width;
    const height = canvas.height;
    const t = timestamp / 1000;
    const bob = tucked ? 0 : Math.sin(t * 3.2) * 1.2;
    const blink = Math.sin(t * 2.6) > 0.975 ? 0.18 : 1;

    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width / 2, height / 2 + 4 + bob);
    context.rotate(tucked ? -0.22 : Math.sin(t * 0.9) * 0.012);
    context.scale(tucked ? 1.04 : 0.94, tucked ? 1.04 : 0.94);

    drawSoftShadow(context);
    drawSittingCatBody(context, t, tucked);
    drawCatHead(context, t, tucked);
    drawCatEyes(context, blink, tucked);
    drawCatWhiskers(context, tucked);

    context.restore();
  }

  function drawSoftShadow(context) {
    const shadow = context.createRadialGradient(0, 50, 3, 0, 50, 42);
    shadow.addColorStop(0, "rgba(15, 23, 42, 0.22)");
    shadow.addColorStop(1, "rgba(15, 23, 42, 0)");
    context.fillStyle = shadow;
    context.beginPath();
    context.ellipse(0, 51, 35, 8, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawSittingCatBody(context, t, tucked) {
    if (tucked) {
      return;
    }

    const bodyGradient = context.createRadialGradient(-16, 12, 5, 3, 32, 48);
    bodyGradient.addColorStop(0, "#20232c");
    bodyGradient.addColorStop(0.55, "#101218");
    bodyGradient.addColorStop(1, "#030407");

    context.save();
    context.fillStyle = bodyGradient;
    context.shadowColor = "rgba(15, 23, 42, 0.24)";
    context.shadowBlur = 12;
    context.shadowOffsetY = 5;

    context.beginPath();
    context.moveTo(-28, 12);
    context.bezierCurveTo(-34, 31, -26, 51, -4, 54);
    context.bezierCurveTo(22, 57, 34, 40, 27, 16);
    context.bezierCurveTo(20, -5, -19, -7, -28, 12);
    context.fill();

    context.shadowColor = "transparent";
    context.strokeStyle = "#08090d";
    context.lineWidth = 11;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(23, 37);
    context.bezierCurveTo(43, 36, 47, 12 + Math.sin(t * 1.5) * 2, 28, 8);
    context.stroke();

    context.fillStyle = "#08090d";
    context.beginPath();
    context.ellipse(-14, 51, 12, 6, -0.18, 0, Math.PI * 2);
    context.ellipse(13, 51, 12, 6, 0.18, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(255, 255, 255, 0.035)";
    context.beginPath();
    context.ellipse(-3, 27, 11, 19, -0.1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawCatHead(context, t, tucked) {
    const furGradient = context.createRadialGradient(-18, -24, 8, 2, -9, 54);
    furGradient.addColorStop(0, "#242735");
    furGradient.addColorStop(0.45, "#11131b");
    furGradient.addColorStop(1, "#030407");

    context.save();
    context.shadowColor = "rgba(15, 23, 42, 0.34)";
    context.shadowBlur = 12;
    context.shadowOffsetY = 5;

    drawEar(context, -28, -32, -43, -67, -5, -45, furGradient);
    drawEar(context, 24, -33, 42, -66, 4, -45, furGradient);

    context.fillStyle = furGradient;
    context.beginPath();
    context.moveTo(-42, -13);
    context.bezierCurveTo(-42, -42, -25, -56, 1, -56);
    context.bezierCurveTo(28, -56, 45, -40, 43, -11);
    context.bezierCurveTo(42, 15, 26, 30, 1, 31);
    context.bezierCurveTo(-26, 32, -43, 13, -42, -13);
    context.fill();

    context.shadowColor = "transparent";
    context.strokeStyle = "rgba(255, 255, 255, 0.075)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-31, -38);
    context.bezierCurveTo(-11, -56, 23, -51, 34, -28);
    context.stroke();

    const cheek = context.createRadialGradient(-23, -2, 2, -23, -2, 22);
    cheek.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    cheek.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = cheek;
    context.beginPath();
    context.ellipse(-23, -2, 20, 14, -0.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawEar(context, ax, ay, bx, by, cx, cy, fillStyle) {
    context.fillStyle = fillStyle;
    context.beginPath();
    context.moveTo(ax, ay);
    context.quadraticCurveTo(bx, by, cx, cy);
    context.quadraticCurveTo(ax + (cx - ax) * 0.26, ay - 4, ax, ay);
    context.fill();

    const inner = context.createLinearGradient(bx, by, cx, cy);
    inner.addColorStop(0, "rgba(204, 137, 103, 0.84)");
    inner.addColorStop(1, "rgba(74, 45, 47, 0.6)");
    context.fillStyle = inner;
    context.beginPath();
    context.moveTo(ax * 0.88, ay - 3);
    context.quadraticCurveTo(bx * 0.9, by + 14, cx * 0.9, cy + 8);
    context.quadraticCurveTo(ax * 0.9 + (cx - ax) * 0.16, ay - 1, ax * 0.88, ay - 3);
    context.fill();
  }

  function drawCatEyes(context, blink, tucked) {
    const eyeY = tucked ? -20 : -19;
    drawEye(context, -15, eyeY, blink);
    drawEye(context, 16, eyeY, blink);

    context.fillStyle = "#1f1517";
    context.beginPath();
    context.moveTo(0, -3);
    context.quadraticCurveTo(4, -2, 0, 1);
    context.quadraticCurveTo(-4, -2, 0, -3);
    context.fill();
  }

  function drawEye(context, x, y, blink) {
    const gold = context.createRadialGradient(x - 2, y - 3, 2, x, y, 13);
    gold.addColorStop(0, "#ffe59a");
    gold.addColorStop(0.58, "#e2ad45");
    gold.addColorStop(1, "#94621f");

    context.save();
    context.translate(x, y);
    context.scale(1, blink);

    context.fillStyle = gold;
    context.beginPath();
    context.ellipse(0, 0, 11, 8, -0.12, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#05060a";
    context.beginPath();
    context.ellipse(2, 0, 6, 7, -0.05, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(5, -3, 2.1, 0, Math.PI * 2);
    context.fill();

    context.restore();
  }

  function drawCatWhiskers(context, tucked) {
    if (tucked) {
      return;
    }

    context.strokeStyle = "rgba(12, 14, 20, 0.72)";
    context.lineWidth = 1.5;
    context.lineCap = "round";

    [
      [-8, -1, -37, -7],
      [-8, 3, -38, 5],
      [8, -1, 37, -7],
      [8, 3, 38, 5]
    ].forEach(([x1, y1, x2, y2]) => {
      context.beginPath();
      context.moveTo(x1, y1);
      context.quadraticCurveTo((x1 + x2) / 2, y1 - 4, x2, y2);
      context.stroke();
    });
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

    const width = dock.offsetWidth || 58;
    const height = dock.offsetHeight || 58;
    const left = clamp(event.clientX - catDragState.offsetX, 4, window.innerWidth - width - 4);
    const top = clamp(event.clientY - catDragState.offsetY, 4, window.innerHeight - height - 4);
    catDockPosition = { left, top };
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
      dock.style.removeProperty("--ask-anchor-cat-walk");
      return;
    }

    if (catDockPosition) {
      const safePosition = {
        left: clamp(catDockPosition.left, 4, window.innerWidth - 58),
        top: clamp(catDockPosition.top, 4, window.innerHeight - 58)
      };
      catDockPosition = safePosition;
      applyCatDockPosition(dock, safePosition);
      return;
    }

    const editor = findPromptEditor();
    if (!editor) {
      dock.style.removeProperty("--ask-anchor-cat-left");
      dock.style.removeProperty("--ask-anchor-cat-right");
      dock.style.removeProperty("--ask-anchor-cat-top");
      dock.style.removeProperty("--ask-anchor-cat-walk");
      return;
    }

    const rect = editor.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const catWidth = 56;
    const left = Math.min(window.innerWidth - catWidth - 8, Math.max(8, rect.right - catWidth - 12));
    const top = Math.min(window.innerHeight - 64, Math.max(8, rect.top - 54));
    dock.style.setProperty("--ask-anchor-cat-left", `${left}px`);
    dock.style.setProperty("--ask-anchor-cat-right", "auto");
    dock.style.setProperty("--ask-anchor-cat-top", `${top}px`);
    dock.style.setProperty("--ask-anchor-cat-walk", "0px");
  }

  function applyCatDockPosition(dock, position) {
    dock.style.setProperty("--ask-anchor-cat-left", `${position.left}px`);
    dock.style.setProperty("--ask-anchor-cat-right", "auto");
    dock.style.setProperty("--ask-anchor-cat-top", `${position.top}px`);
    dock.style.setProperty("--ask-anchor-cat-walk", "0px");
  }

  function loadCatDockPosition() {
    try {
      const raw = localStorage.getItem(CAT_POSITION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const value = JSON.parse(raw);
      if (typeof value?.left !== "number" || typeof value?.top !== "number") {
        return null;
      }
      return value;
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
