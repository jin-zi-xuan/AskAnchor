(function registerAskAnchorFollowUpModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.followup = function createAskAnchorFollowUpModule(ctx) {
    with (ctx) {
  function watchForSentFollowUp({ anchorDraft, prompt, selectedText, knownUserNodes, knownUserTexts }) {
    pendingFollowUp = {
      anchorDraft,
      anchorId: null,
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

    const anchor = createAnchorFromPendingFollowUp(pendingFollowUp);
    if (anchor) {
      activeAnchorId = anchor.id;
      renderAnchorDock();
      showToast(`\u5df2\u53d1\u9001\u8ffd\u95ee\uff0c\u5e76\u521b\u5efa\u951a\u70b9\u300c${anchor.name}\u300d`);
    }

    focusSentQuestion(sentQuestion);
    clearPendingFollowUp();
  }

  function createAnchorFromPendingFollowUp(followUp) {
    const draft = followUp?.anchorDraft;
    if (!draft) {
      return null;
    }

    const sourceRange = resolveAnchorRange({
      range: draft.range,
      selector: draft.selector,
      messageLocator: draft.messageLocator,
      element: draft.element
    }) || (draft.range?.cloneRange ? draft.range.cloneRange() : draft.range);
    const marker = sourceRange ? createSelectionMarker(sourceRange.cloneRange()) : null;
    const anchorElement = sourceRange
      ? getRangeHighlightTarget(sourceRange) || draft.element
      : draft.element;

    return addAnchor({
      text: draft.text,
      range: sourceRange,
      selector: draft.selector,
      messageLocator: draft.messageLocator,
      marker,
      element: anchorElement,
      scrollY: draft.scrollY
    });
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
    if (activeAdapter.isSendButton?.(element)) {
      return true;
    }

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

  function buildFollowUpPrompt(selectedText, templateId = DEFAULT_FOLLOW_UP_TEMPLATE_ID) {
    const template = FOLLOW_UP_TEMPLATES.find((item) => item.id === templateId)
      || FOLLOW_UP_TEMPLATES.find((item) => item.id === DEFAULT_FOLLOW_UP_TEMPLATE_ID);
    const promptSelectedText = formatSelectedTextForPrompt(selectedText);

    if (template?.custom) {
      return [
        "\u3010\u9009\u4e2d\u5185\u5bb9\u3011",
        promptSelectedText,
        "",
        "\u6211\u7684\u95ee\u9898\uff1a"
      ].join("\n");
    }

    return [
      "\u3010\u9009\u4e2d\u5185\u5bb9\u3011",
      promptSelectedText,
      "",
      template.instruction
    ].join("\n");
  }

  function formatSelectedTextForPrompt(text) {
    const normalized = String(text || "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!normalized) {
      return "";
    }

    const lines = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length <= 1 || looksLikeIntentionalMultilineText(normalized, lines)) {
      return normalized;
    }

    return lines.join(" ");
  }

  function looksLikeIntentionalMultilineText(text, lines) {
    const averageLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    const shortLineRatio = lines.filter((line) => line.length <= 3).length / lines.length;
    if (lines.length >= 4 && averageLineLength <= 4 && shortLineRatio >= 0.65) {
      return false;
    }

    return /```|[{};]|\b(function|const|let|var|if|for|while|return|class|import|export)\b/.test(text)
      || lines.some((line) => /^[\s>*\-+]\s+/.test(line));
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
    const platformEditor = activeAdapter.findPromptEditor?.();
    if (
      platformEditor
      && isPromptEditorCandidate(platformEditor)
      && !platformEditor.closest(`#${DOCK_ID}, #${PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`)
      && isVisible(platformEditor)
    ) {
      return platformEditor;
    }

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
        && !node.closest(`#${DOCK_ID}, #${PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`)
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

      return {
        watchForSentFollowUp,
        createAnchorFromPendingFollowUp,
        schedulePendingFollowUpCheck,
        checkPendingFollowUp,
        findSentFollowUpElement,
        isMatchingFollowUpText,
        startPendingFollowUpPolling,
        markPendingFollowUpSent,
        handlePossibleSendClick,
        handlePossibleSendKeydown,
        isSendControl,
        clearPendingFollowUp,
        isPromptEditorCleared,
        getEditorText,
        focusSentQuestion,
        buildFollowUpPrompt,
        formatSelectedTextForPrompt,
        looksLikeIntentionalMultilineText,
        fillCurrentAiInput,
        waitForPromptEditor,
        findPromptEditor,
        isPromptEditorCandidate,
        fillPromptEditor,
        copyPromptToClipboard
      };
    }
  };
})(globalThis);
