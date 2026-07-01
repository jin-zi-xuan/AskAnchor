(function initAskAnchor() {
  const BUTTON_ID = "ask-anchor-explain-button";
  const PANEL_ID = "ask-anchor-panel-frame";
  const HIGHLIGHT_CLASS = "ask-anchor-highlight";
  const MARKER_CLASS = "ask-anchor-selection-marker";
  const MAX_CONTEXT_MESSAGES = 6;
  const MIN_SELECTION_LENGTH = 2;

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
  let anchorState = null;
  let panelFrame = null;
  let selectionTimer = null;

  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(handleSelectionChange, 120);
  });

  document.addEventListener("mouseup", handleSelectionChange);
  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") {
      hideExplainButton();
      return;
    }

    handleSelectionChange();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== (panelFrame && panelFrame.contentWindow)) {
      return;
    }

    if (event.data && event.data.type === "ASK_ANCHOR_CLOSE_PANEL") {
      closePanel();
    }

    if (event.data && event.data.type === "ASK_ANCHOR_RETURN_TO_SOURCE") {
      returnToSource();
    }
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
      button.textContent = "\u89e3\u91ca\u8fd9\u4e00\u6bb5";
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", handleExplainClick);
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

  async function handleExplainClick(event) {
    event.preventDefault();

    if (!currentSelection) {
      return;
    }

    const selectedText = currentSelection.text;
    const sourceRange = currentSelection.range.cloneRange();
    const marker = createSelectionMarker(sourceRange);
    const context = extractConversationContext(currentSelection.messageElement);

    anchorState = {
      element: currentSelection.messageElement,
      marker,
      range: sourceRange,
      rect: currentSelection.rect,
      scrollY: window.scrollY,
      text: selectedText
    };

    hideExplainButton();
    openPanel({
      selectedText,
      explanation: "\u6b63\u5728\u751f\u6210\u89e3\u91ca...",
      loading: true
    });

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ASK_ANCHOR_EXPLAIN",
        selectedText,
        context
      });

      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "\u89e3\u91ca\u751f\u6210\u5931\u8d25");
      }

      postPanelState({
        selectedText,
        explanation: response.explanation,
        loading: false
      });
    } catch (error) {
      postPanelState({
        selectedText,
        explanation: `\u89e3\u91ca\u751f\u6210\u5931\u8d25\uff1a${error.message}`,
        loading: false,
        error: true
      });
    }
  }

  function openPanel(state) {
    if (!panelFrame) {
      panelFrame = document.createElement("iframe");
      panelFrame.id = PANEL_ID;
      panelFrame.title = "AskAnchor explanation panel";
      panelFrame.src = chrome.runtime.getURL("panel.html");
      panelFrame.addEventListener("load", () => postPanelState(state));
      document.documentElement.appendChild(panelFrame);
    }

    panelFrame.hidden = false;
    postPanelState(state);
  }

  function closePanel() {
    if (panelFrame) {
      panelFrame.hidden = true;
    }
  }

  function postPanelState(state) {
    if (!panelFrame || !panelFrame.contentWindow) {
      return;
    }

    panelFrame.contentWindow.postMessage({
      type: "ASK_ANCHOR_PANEL_STATE",
      ...state
    }, "*");
  }

  function returnToSource() {
    if (!anchorState) {
      return;
    }

    const marker = anchorState.marker && document.contains(anchorState.marker)
      ? anchorState.marker
      : null;
    const target = anchorState.element && document.contains(anchorState.element)
      ? anchorState.element
      : null;

    if (marker) {
      marker.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      restoreSelectionHighlight(anchorState.range);
      brieflyHighlight(marker);
    } else if (scrollToSavedRange(anchorState.range)) {
      restoreSelectionHighlight(anchorState.range);
    } else if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      brieflyHighlight(target);
    } else {
      window.scrollTo({ top: anchorState.scrollY, behavior: "smooth" });
    }
  }

  function createSelectionMarker(range) {
    removeExistingMarkers();

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

  function removeExistingMarkers() {
    document.querySelectorAll(`.${MARKER_CLASS}`).forEach((marker) => marker.remove());
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
    element.classList.add(HIGHLIGHT_CLASS);
    window.setTimeout(() => {
      element.classList.remove(HIGHLIGHT_CLASS);
    }, 1400);
  }

  function findAssistantMessageElement(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element || isInsideEditable(element)) {
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
})();
