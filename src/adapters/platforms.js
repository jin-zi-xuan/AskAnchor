(function registerAskAnchorPlatformAdapters(global) {
  function getPlatformHosts(platformId, fallbackHosts) {
    return global.AskAnchorPlatforms?.getPlatformById?.(platformId)?.hosts || fallbackHosts;
  }

  const PLATFORM_ADAPTERS = [
    createPlatformAdapter({
      name: "chatgpt",
      hosts: getPlatformHosts("chatgpt", ["chatgpt.com", "chat.openai.com"]),
      conversationRootSelectors: [
        "main",
        "[role='main']",
        "[data-testid='conversation-turn-list']"
      ],
      assistantSelectors: ["[data-message-author-role='assistant']"],
      userSelectors: ["[data-message-author-role='user']"],
      messageSelectors: ["[data-message-author-role]"],
      promptEditorSelectors: [
        "#prompt-textarea",
        "textarea[data-testid='prompt-textarea']",
        "[contenteditable='true'][data-lexical-editor='true']"
      ],
      sendButtonSelectors: [
        "[data-testid='send-button']",
        "button[aria-label*='Send' i]",
        "button[data-testid*='send' i]"
      ],
      roleFromNode: (node) => node.getAttribute("data-message-author-role")
    }),
    createPlatformAdapter({
      name: "gemini",
      hosts: getPlatformHosts("gemini", ["gemini.google.com"]),
      conversationRootSelectors: [
        "main",
        "[role='main']",
        "chat-window",
        ".conversation-container"
      ],
      assistantSelectors: ["model-response", ".model-response-text", "[class*='model-response']"],
      userSelectors: ["user-query", ".query-text", "[class*='user-query']"],
      messageSelectors: ["user-query", "model-response", ".query-text", ".model-response-text"],
      promptEditorSelectors: [
        "rich-textarea div[contenteditable='true']",
        "[contenteditable='true'][role='textbox']",
        "textarea"
      ],
      sendButtonSelectors: [
        "button[aria-label*='Send' i]",
        "button[aria-label*='Submit' i]",
        "button[data-test-id*='send' i]"
      ],
      roleFromNode: (node) => node.matches("user-query, .query-text, [class*='user-query']") ? "user" : "assistant"
    }),
    createPlatformAdapter({
      name: "claude",
      hosts: getPlatformHosts("claude", ["claude.ai"]),
      conversationRootSelectors: [
        "main",
        "[role='main']",
        "[data-testid*='conversation' i]"
      ],
      assistantSelectors: ["[data-testid*='assistant' i]", ".font-claude-message"],
      userSelectors: ["[data-testid*='user' i]", "[data-testid*='human' i]"],
      messageSelectors: ["[data-testid*='message' i]", ".font-claude-message"],
      promptEditorSelectors: [
        "div[contenteditable='true'][role='textbox']",
        "[data-testid*='chat-input' i] div[contenteditable='true']",
        "textarea"
      ],
      sendButtonSelectors: [
        "button[aria-label*='Send' i]",
        "button[data-testid*='send' i]"
      ]
    }),
    createPlatformAdapter({
      name: "perplexity",
      hosts: getPlatformHosts("perplexity", ["perplexity.ai", "www.perplexity.ai"]),
      conversationRootSelectors: [
        "main",
        "[role='main']",
        "[data-testid*='thread' i]",
        "[data-testid*='conversation' i]"
      ],
      assistantSelectors: ["[data-testid*='answer' i]", "article [class*='prose']"],
      userSelectors: ["[data-testid*='query' i]"],
      messageSelectors: ["[data-testid*='answer' i]", "[data-testid*='query' i]"],
      promptEditorSelectors: [
        "textarea",
        "[contenteditable='true'][role='textbox']"
      ],
      sendButtonSelectors: [
        "button[aria-label*='Submit' i]",
        "button[aria-label*='Send' i]"
      ]
    }),
    createPlatformAdapter({
      name: "poe",
      hosts: getPlatformHosts("poe", ["poe.com"]),
      conversationRootSelectors: [
        "main",
        "[role='main']",
        "[class*='ChatMessages']",
        "[class*='chatMessages']"
      ],
      assistantSelectors: ["[class*='ChatMessage_messageRow']", "[data-testid*='bot' i]"],
      userSelectors: ["[data-testid*='human' i]", "[class*='humanMessage']"],
      messageSelectors: ["[class*='ChatMessage']"],
      promptEditorSelectors: [
        "textarea",
        "[contenteditable='true'][role='textbox']"
      ],
      sendButtonSelectors: [
        "button[aria-label*='Send' i]",
        "button[class*='send' i]"
      ]
    }),
    createPlatformAdapter({
      name: "copilot",
      hosts: getPlatformHosts("copilot", ["copilot.microsoft.com"]),
      conversationRootSelectors: [
        "main",
        "[role='main']",
        "[data-testid*='conversation' i]",
        "[class*='conversation' i]"
      ],
      assistantSelectors: ["[data-content='ai-message']", "[data-testid*='ai-message' i]"],
      userSelectors: ["[data-content='user-message']", "[data-testid*='user-message' i]"],
      messageSelectors: ["[data-content]", "[data-testid*='message' i]"],
      promptEditorSelectors: [
        "textarea",
        "[contenteditable='true'][role='textbox']"
      ],
      sendButtonSelectors: [
        "button[aria-label*='Send' i]",
        "button[data-testid*='send' i]"
      ]
    }),
    createPlatformAdapter({
      name: "deepseek",
      hosts: getPlatformHosts("deepseek", ["chat.deepseek.com"]),
      conversationRootSelectors: [
        "main",
        "[role='main']",
        "[class*='chat' i]",
        "[class*='conversation' i]"
      ],
      assistantSelectors: ["[class*='ds-markdown']", "[data-role='assistant']"],
      userSelectors: ["[data-role='user']", "[class*='user-message' i]"],
      messageSelectors: ["[data-role]"],
      promptEditorSelectors: [
        "textarea",
        "[contenteditable='true'][role='textbox']"
      ],
      sendButtonSelectors: [
        "button[aria-label*='Send' i]",
        "button[aria-label*='发送']",
        "button[class*='send' i]"
      ]
    }),
    createPlatformAdapter({
      name: "kimi",
      hosts: getPlatformHosts("kimi", ["kimi.moonshot.cn"]),
      conversationRootSelectors: ["main", "[role='main']", "[class*='chat' i]", "[class*='conversation' i]"],
      assistantSelectors: ["[data-role='assistant']"],
      userSelectors: ["[data-role='user']", "[class*='user' i]"],
      messageSelectors: ["[data-role]"],
      promptEditorSelectors: ["textarea", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"],
      sendButtonSelectors: ["button[aria-label*='发送']", "button[aria-label*='Send' i]", "button[class*='send' i]"]
    }),
    createPlatformAdapter({
      name: "doubao",
      hosts: getPlatformHosts("doubao", ["doubao.com", "www.doubao.com"]),
      conversationRootSelectors: ["main", "[role='main']", "[class*='chat' i]", "[class*='conversation' i]"],
      assistantSelectors: ["[data-role='assistant']"],
      userSelectors: ["[data-role='user']", "[class*='user' i]"],
      messageSelectors: ["[data-role]"],
      promptEditorSelectors: ["textarea", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"],
      sendButtonSelectors: ["button[aria-label*='发送']", "button[aria-label*='Send' i]", "button[class*='send' i]"]
    }),
    createPlatformAdapter({
      name: "tongyi",
      hosts: getPlatformHosts("tongyi", ["tongyi.aliyun.com"]),
      conversationRootSelectors: ["main", "[role='main']", "[class*='chat' i]", "[class*='conversation' i]"],
      assistantSelectors: ["[data-role='assistant']"],
      userSelectors: ["[data-role='user']", "[class*='user' i]"],
      messageSelectors: ["[data-role]"],
      promptEditorSelectors: ["textarea", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"],
      sendButtonSelectors: ["button[aria-label*='发送']", "button[aria-label*='Send' i]", "button[class*='send' i]"]
    }),
    createPlatformAdapter({
      name: "yiyan",
      hosts: getPlatformHosts("yiyan", ["yiyan.baidu.com"]),
      conversationRootSelectors: ["main", "[role='main']", "[class*='chat' i]", "[class*='conversation' i]"],
      assistantSelectors: ["[data-role='assistant']"],
      userSelectors: ["[data-role='user']", "[class*='user' i]"],
      messageSelectors: ["[data-role]"],
      promptEditorSelectors: ["textarea", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"],
      sendButtonSelectors: ["button[aria-label*='发送']", "button[aria-label*='Send' i]", "button[class*='send' i]"]
    })
  ];

  function createPlatformAdapter(config) {
    const adapter = {
      conversationRootSelectors: [],
      assistantSelectors: [],
      userSelectors: [],
      messageSelectors: [],
      promptEditorSelectors: [],
      sendButtonSelectors: [],
      roleFromNode: inferRoleFromNode,
      getStableMessageId: getStableMessageIdFromAttributes,
      ...config
    };

    adapter.findConversationRoot = () => findFirstVisible(adapter.conversationRootSelectors, document);
    adapter.findPromptEditor = () => findFirstVisible(adapter.promptEditorSelectors, document, isPromptEditorCandidate);
    adapter.findAssistantMessageElement = (node) => findClosestMessage(node, adapter.assistantSelectors);
    adapter.collectUserMessageElements = () => collectMessages(adapter.userSelectors);
    adapter.collectAssistantMessageElements = () => collectMessages(adapter.assistantSelectors);
    adapter.isInsideUserMessage = (element) => Boolean(findClosestMessage(element, adapter.userSelectors));
    adapter.isSendButton = (element) => matchesAnySelector(element, adapter.sendButtonSelectors);
    return adapter;
  }

  function getActiveAdapter() {
    const hostname = global.location?.hostname || "";
    return PLATFORM_ADAPTERS.find((adapter) => adapter.hosts.includes(hostname)) || createFallbackAdapter();
  }

  function createFallbackAdapter() {
    return createPlatformAdapter({
      name: "fallback",
      hosts: [],
      conversationRootSelectors: ["main", "[role='main']"],
      assistantSelectors: [
        "[data-message-author-role='assistant']",
        "model-response",
        "[data-content='ai-message']"
      ],
      userSelectors: [
        "[data-message-author-role='user']",
        "user-query",
        "[data-content='user-message']"
      ],
      messageSelectors: [
        "[data-message-author-role]",
        "user-query",
        "model-response",
        "[data-content]"
      ],
      promptEditorSelectors: [
        "#prompt-textarea",
        "textarea[data-testid='prompt-textarea']",
        "textarea",
        "[contenteditable='true'][role='textbox']"
      ],
      sendButtonSelectors: [
        "button[aria-label*='Send' i]",
        "button[aria-label*='发送']"
      ]
    });
  }

  function collectMessages(selectors) {
    const root = findFirstVisible(selectors.length ? getActiveAdapter().conversationRootSelectors : [], document) || document;
    return uniqueElements(selectors.flatMap((selector) => queryAllSafe(selector, root)))
      .filter((node) => !isInsideEditable(node))
      .filter((node) => hasReadableText(node))
      .filter(isVisible);
  }

  function findClosestMessage(node, selectors) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!element || isInsideEditable(element)) {
      return null;
    }

    const root = getActiveAdapter().findConversationRoot?.();
    if (root && root !== document && !root.contains(element)) {
      return null;
    }

    return closestFromSelectors(element, selectors);
  }

  function findFirstVisible(selectors, root, predicate) {
    for (const selector of selectors) {
      const match = queryAllSafe(selector, root)
        .find((node) => (!predicate || predicate(node)) && isVisible(node));
      if (match) {
        return match;
      }
    }

    return null;
  }

  function queryAllSafe(selector, root) {
    try {
      return Array.from((root || document).querySelectorAll(selector));
    } catch (error) {
      return [];
    }
  }

  function closestFromSelectors(element, selectors) {
    for (const selector of selectors.filter(Boolean)) {
      try {
        const match = element.closest(selector);
        if (match) {
          return match;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  function matchesAnySelector(element, selectors) {
    return selectors.filter(Boolean).some((selector) => {
      try {
        return element.matches(selector);
      } catch (error) {
        return false;
      }
    });
  }

  function isPromptEditorCandidate(node) {
    return node.tagName === "TEXTAREA"
      || node.tagName === "INPUT"
      || node.getAttribute("contenteditable") === "true"
      || node.getAttribute("role") === "textbox";
  }

  function isInsideEditable(element) {
    return Boolean(element.closest?.([
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
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = global.getComputedStyle(node);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function hasReadableText(node) {
    return normalizeComparableText(node.innerText || node.textContent || "").length > 1;
  }

  function normalizeComparableText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements.filter(Boolean)));
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

  function getStableMessageIdFromAttributes(node) {
    return node?.getAttribute?.("data-message-id")
      || node?.getAttribute?.("data-testid")
      || node?.id
      || "";
  }

  global.AskAnchorPlatformAdapters = {
    getActiveAdapter,
    adapters: PLATFORM_ADAPTERS
  };
})(globalThis);
