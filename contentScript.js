(function initAskAnchor() {
  const BUTTON_ID = "ask-anchor-explain-button";
  const DOCK_ID = "ask-anchor-anchor-dock";
  const LIST_ID = "ask-anchor-anchor-list";
  const TOAST_ID = "ask-anchor-toast";
  const HIGHLIGHT_CLASS = "ask-anchor-highlight";
  const MARKER_CLASS = "ask-anchor-selection-marker";
  const MAX_CONTEXT_MESSAGES = 6;
  const MIN_SELECTION_LENGTH = 2;
  const MAX_ANCHORS = 30;
  const ANCHOR_NAME_LENGTH = 28;

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
  let pendingFollowUp = null;
  let pendingFollowUpTimer = null;
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

  const conversationObserver = new MutationObserver(schedulePendingFollowUpCheck);
  conversationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

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
    const marker = createSelectionMarker(sourceRange);
    const anchor = addAnchor({
      text: selectionSnapshot.text,
      range: sourceRange,
      marker,
      element: selectionSnapshot.messageElement,
      scrollY: window.scrollY
    });
    const knownUserNodes = new Set(collectUserMessageElements());
    const prompt = buildFollowUpPrompt(selectionSnapshot.text, extractConversationContext(selectionSnapshot.messageElement));
    const filled = await fillCurrentAiInput(prompt);

    hideExplainButton();
    renderAnchorDock();

    if (filled) {
      watchForSentFollowUp({
        anchor,
        prompt,
        selectedText: selectionSnapshot.text,
        knownUserNodes
      });
      showToast(`\u5df2\u751f\u6210\u951a\u70b9\u300c${anchor.name}\u300d\uff0c\u5e76\u586b\u5165\u8ffd\u95ee`);
      return;
    }

    await copyPromptToClipboard(prompt);
    showToast(`\u5df2\u751f\u6210\u951a\u70b9\u300c${anchor.name}\u300d\uff0c\u672a\u627e\u5230\u8f93\u5165\u6846\uff0c\u5df2\u590d\u5236`);
  }

  function addAnchor({ text, range, marker, element, scrollY }) {
    const anchor = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: createAnchorName(text),
      text,
      range,
      marker,
      element,
      scrollY,
      createdAt: new Date()
    };

    anchors.unshift(anchor);
    anchors = anchors.slice(0, MAX_ANCHORS);
    return anchor;
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
        <button class="ask-anchor-dock-button" type="button" aria-expanded="false"></button>
        <div id="${LIST_ID}" class="ask-anchor-anchor-list" hidden></div>
      `;
      document.documentElement.appendChild(dock);

      dock.querySelector(".ask-anchor-dock-button").addEventListener("click", toggleAnchorList);
    }

    const button = dock.querySelector(".ask-anchor-dock-button");
    const list = dock.querySelector(`#${LIST_ID}`);
    button.textContent = "AskAnchor";
    button.title = `AskAnchor - ${anchors.length} \u4e2a\u951a\u70b9`;
    list.innerHTML = "";

    anchors.forEach((anchor, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ask-anchor-anchor-item";
      item.innerHTML = `
        <span class="ask-anchor-anchor-index">${index + 1}</span>
        <span class="ask-anchor-anchor-name"></span>
      `;
      item.querySelector(".ask-anchor-anchor-name").textContent = anchor.name;
      item.addEventListener("click", () => {
        closeAnchorList();
        returnToAnchor(anchor.id);
      });
      list.appendChild(item);
    });
  }

  function removeAnchorDock() {
    const dock = document.getElementById(DOCK_ID);
    if (dock) {
      dock.remove();
    }
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

  function returnToAnchor(id) {
    const anchor = anchors.find((item) => item.id === id);
    if (!anchor) {
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

  function watchForSentFollowUp({ anchor, prompt, selectedText, knownUserNodes }) {
    pendingFollowUp = {
      anchorId: anchor.id,
      prompt,
      selectedText,
      knownUserNodes,
      createdAt: Date.now()
    };
    schedulePendingFollowUpCheck();
  }

  function schedulePendingFollowUpCheck() {
    if (!pendingFollowUp || pendingFollowUpTimer) {
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

    if (Date.now() - pendingFollowUp.createdAt > 90 * 1000) {
      pendingFollowUp = null;
      return;
    }

    const sentQuestion = findSentFollowUpElement(pendingFollowUp);
    if (!sentQuestion) {
      return;
    }

    sentQuestion.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    brieflyHighlight(sentQuestion);
    pendingFollowUp = null;
  }

  function findSentFollowUpElement(followUp) {
    return collectUserMessageElements()
      .filter((node) => !followUp.knownUserNodes.has(node))
      .find((node) => isMatchingFollowUpText(node.innerText || node.textContent || "", followUp));
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

  function buildFollowUpPrompt(selectedText, context) {
    const contextText = context
      .map((item) => `${item.role}: ${item.text}`)
      .join("\n\n");

    return [
      "\u8bf7\u7ed3\u5408\u4e0a\u6587\uff0c\u89e3\u91ca\u6211\u9009\u4e2d\u7684\u8fd9\u6bb5\u5185\u5bb9\u3002",
      "",
      "\u3010\u9009\u4e2d\u5185\u5bb9\u3011",
      selectedText,
      "",
      "\u3010\u8fd1\u671f\u5bf9\u8bdd\u4e0a\u4e0b\u6587\u3011",
      contextText || "\u65e0",
      "",
      "\u8bf7\u8bf4\u660e\u5b83\u7684\u610f\u601d\u3001\u80cc\u540e\u903b\u8f91\u3001\u4e0e\u4e0a\u4e0b\u6587\u7684\u5173\u7cfb\uff0c\u5e76\u5c3d\u91cf\u7b80\u6d01\u3002"
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

  function scrollToSavedRange(range) {
    if (!range) {
      return false;
    }

    try {
      const rect = getRangeRect(range);
      if (!rect) {
        return false;
      }

      const top = rect.top + window.scrollY - window.innerHeight * 0.35;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return true;
    } catch (error) {
      console.debug("[AskAnchor] Failed to scroll to saved range:", error);
      return false;
    }
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

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
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

  function extractConversationContext(anchorElement) {
    const messages = extractMessagesFromAdapter();
    const fallbackText = anchorElement
      ? cleanText(anchorElement.innerText || anchorElement.textContent || "")
      : "";

    if (messages.length === 0 && fallbackText) {
      messages.push({ role: "assistant", text: fallbackText });
    }

    return messages
      .filter((message) => message.text)
      .slice(-MAX_CONTEXT_MESSAGES);
  }

  function extractMessagesFromAdapter() {
    const platformMessages = collectMessages(activeAdapter);
    if (platformMessages.length > 0) {
      return platformMessages;
    }

    return collectMessages({
      messageSelectors: [
        "[data-message-author-role]",
        "user-query",
        "model-response",
        "[data-testid*='message']",
        "[data-testid*='answer']",
        "[data-testid*='query']",
        "[class*='message']",
        "[class*='answer']",
        "[class*='question']",
        "[class*='response']"
      ],
      roleFromNode: (node) => inferRoleFromNode(node)
    });
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
      .filter((node) => cleanText(node.innerText || node.textContent || "").length > 1);
  }

  function collectMessages(adapter) {
    const selectors = adapter.messageSelectors || [];
    const nodes = uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));

    return nodes
      .filter((node) => !isInsideEditable(node))
      .map((node) => ({
        role: normalizeRole(adapter.roleFromNode ? adapter.roleFromNode(node) : inferRoleFromNode(node)),
        text: cleanText(node.innerText || node.textContent || "")
      }))
      .filter((message) => message.text && message.text.length > 1)
      .filter((message, index, list) => list.findIndex((item) => item.text === message.text) === index)
      .slice(-MAX_CONTEXT_MESSAGES);
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

  function normalizeRole(role) {
    return role === "user" ? "user" : "assistant";
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

  function cleanText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
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
