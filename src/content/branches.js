(function registerAskAnchorBranchesModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.branches = function createAskAnchorBranchesModule(ctx) {
    with (ctx) {
  function createBranch(anchorId, selectedText, templateId = DEFAULT_FOLLOW_UP_TEMPLATE_ID) {
    const now = Date.now();
    const branch = {
      id: `${now}-${Math.random().toString(16).slice(2)}`,
      anchorId,
      title: createBranchTitle(selectedText),
      prompt: buildFollowUpPrompt(selectedText, templateId),
      status: BRANCH_STATUS_DRAFT,
      createdAt: now,
      updatedAt: now
    };

    branches.unshift(branch);
    branches = branches.slice(0, MAX_BRANCHES);
    activeBranchId = branch.id;
    activeBranchAnchorId = anchorId;
    persistBranchesToSession();
    renderAnchorDock();
    renderBranchPanel();
    return branch;
  }

  function updateBranchPrompt(branchId, prompt) {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) {
      return null;
    }

    branch.prompt = String(prompt || "");
    branch.updatedAt = Date.now();
    if (branch.status === BRANCH_STATUS_DONE) {
      branch.status = BRANCH_STATUS_SENT;
    }
    persistBranchesToSession();
    return branch;
  }

  function updateBranchTitle(branchId, title) {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) {
      return null;
    }

    branch.title = normalizeBranchTitle(title);
    branch.updatedAt = Date.now();
    persistBranchesToSession();
    return branch;
  }

  function markBranchSent(branchId) {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) {
      return null;
    }

    branch.status = BRANCH_STATUS_SENT;
    branch.updatedAt = Date.now();
    activeBranchId = branch.id;
    activeBranchAnchorId = branch.anchorId;
    persistBranchesToSession();
    renderAnchorDock();
    renderBranchPanel();
    return branch;
  }

  function markBranchDone(branchId) {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) {
      return null;
    }

    branch.status = BRANCH_STATUS_DONE;
    branch.updatedAt = Date.now();
    persistBranchesToSession();
    renderAnchorDock();
    renderBranchPanel();
    return branch;
  }

  function deleteBranch(branchId) {
    const nextBranches = branches.filter((branch) => branch.id !== branchId);
    if (nextBranches.length === branches.length) {
      return;
    }

    branches = nextBranches;
    if (activeBranchId === branchId) {
      activeBranchId = null;
    }
    if (editingBranchId === branchId) {
      editingBranchId = null;
    }
    persistBranchesToSession();
    renderAnchorDock();
    renderBranchPanel();
  }

  function getBranchesByAnchor(anchorId) {
    return branches
      .filter((branch) => branch.anchorId === anchorId)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  function getActiveBranch() {
    return branches.find((branch) => branch.id === activeBranchId) || null;
  }

  function persistBranchesToSession() {
    try {
      const payload = branches.slice(0, MAX_BRANCHES).map((branch) => ({
        id: branch.id,
        anchorId: branch.anchorId,
        title: branch.title,
        prompt: branch.prompt,
        status: normalizeBranchStatus(branch.status),
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt
      }));
      sessionStorage.setItem(getBranchStorageKey(), JSON.stringify(payload));
    } catch (error) {
      console.debug("[AskAnchor] Failed to persist branches:", error);
    }
  }

  function loadBranchesFromSession() {
    try {
      activeBranchStorageKey = getBranchStorageKey();
      const raw = sessionStorage.getItem(getBranchStorageKey());
      if (!raw) {
        branches = [];
        activeBranchId = null;
        activeBranchAnchorId = null;
        renderAnchorDock();
        renderBranchPanel();
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        branches = [];
        activeBranchId = null;
        activeBranchAnchorId = null;
        renderAnchorDock();
        renderBranchPanel();
        return;
      }

      branches = parsed
        .slice(0, MAX_BRANCHES)
        .map(normalizeBranch)
        .filter(Boolean);
      if (activeBranchId && !branches.some((branch) => branch.id === activeBranchId)) {
        activeBranchId = null;
      }
      renderAnchorDock();
      renderBranchPanel();
    } catch (error) {
      console.debug("[AskAnchor] Failed to load branches:", error);
    }
  }

  function normalizeBranch(item) {
    if (!item || typeof item !== "object" || !item.anchorId) {
      return null;
    }

    const now = Date.now();
    const prompt = String(item.prompt || "");
    return {
      id: item.id || `${now}-${Math.random().toString(16).slice(2)}`,
      anchorId: item.anchorId,
      title: normalizeBranchTitle(item.title || item.prompt || item.anchorId),
      prompt,
      status: normalizeBranchStatus(item.status),
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : now,
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : now
    };
  }

  function normalizeBranchStatus(status) {
    return core.normalizeBranchStatus(status);
  }

  function getBranchStatusLabel(status) {
    const normalized = normalizeBranchStatus(status);
    if (normalized === BRANCH_STATUS_DONE) {
      return "\u5df2\u5b8c\u6210";
    }
    return normalized === BRANCH_STATUS_SENT ? "\u5df2\u53d1\u9001" : "\u8349\u7a3f";
  }

  function createBranchTitle(text) {
    return normalizeBranchTitle(`\u8ffd\u95ee\uff1a${createAnchorName(text)}`);
  }

  function normalizeBranchTitle(title) {
    return core.normalizeBranchTitle(title);
  }

  function getBranchPanelAnchor() {
    return anchors.find((anchor) => anchor.id === activeBranchAnchorId)
      || anchors.find((anchor) => anchor.id === activeAnchorId)
      || anchors[0]
      || null;
  }

  function openBranchPanel(anchorId) {
    const anchor = anchors.find((item) => item.id === anchorId) || getBranchPanelAnchor();
    if (!anchor) {
      showToast("\u8bf7\u5148\u521b\u5efa AskAnchor \u951a\u70b9");
      return;
    }

    activeBranchAnchorId = anchor.id;
    const panel = getOrCreateBranchPanel();
    renderBranchPanel();
    closeAnchorList();
    panel.hidden = false;
    panel.querySelector(".ask-anchor-branch-new")?.focus();
  }

  function closeBranchPanel() {
    const panel = document.getElementById(BRANCH_PANEL_ID);
    if (panel) {
      panel.hidden = true;
    }
    editingBranchId = null;
  }

  function getOrCreateBranchPanel() {
    let panel = document.getElementById(BRANCH_PANEL_ID);
    if (panel) {
      return panel;
    }

    panel = document.createElement("section");
    panel.id = BRANCH_PANEL_ID;
    panel.className = "ask-anchor-branch-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="ask-anchor-branch-panel__header">
        <div>
          <div class="ask-anchor-branch-panel__title">\u8ffd\u95ee\u5206\u652f</div>
          <div class="ask-anchor-branch-panel__meta"></div>
        </div>
        <div class="ask-anchor-branch-panel__tools">
          <button class="ask-anchor-branch-new" type="button">\u65b0\u5efa\u5206\u652f</button>
          <button class="ask-anchor-branch-close" type="button" aria-label="\u5173\u95ed\u8ffd\u95ee\u5206\u652f" title="\u5173\u95ed">\u00d7</button>
        </div>
      </div>
      <div class="ask-anchor-branch-panel__anchor"></div>
      <div id="${BRANCH_LIST_ID}" class="ask-anchor-branch-list"></div>
    `;

    panel.querySelector(".ask-anchor-branch-close").addEventListener("click", closeBranchPanel);
    panel.querySelector(".ask-anchor-branch-new").addEventListener("click", createBranchForPanelAnchor);
    panel.addEventListener("pointerdown", stopAnchorControlEvent);
    panel.addEventListener("mousedown", stopAnchorControlEvent);
    document.documentElement.appendChild(panel);
    return panel;
  }

  function renderBranchPanel() {
    const panel = document.getElementById(BRANCH_PANEL_ID);
    if (!panel) {
      return;
    }

    const anchor = getBranchPanelAnchor();
    if (!anchor) {
      panel.hidden = true;
      return;
    }

    activeBranchAnchorId = anchor.id;
    const anchorBranches = getBranchesByAnchor(anchor.id);
    panel.querySelector(".ask-anchor-branch-panel__meta").textContent = `${anchorBranches.length} \u4e2a\u5206\u652f`;
    panel.querySelector(".ask-anchor-branch-panel__anchor").textContent = anchor.name;

    const list = panel.querySelector(`#${BRANCH_LIST_ID}`);
    list.innerHTML = "";
    if (anchorBranches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ask-anchor-branch-empty";
      empty.textContent = "\u5f53\u524d\u951a\u70b9\u8fd8\u6ca1\u6709\u8ffd\u95ee\u5206\u652f";
      list.appendChild(empty);
      return;
    }

    anchorBranches.forEach((branch) => {
      list.appendChild(createBranchItem(branch));
    });
  }

  function createBranchForPanelAnchor(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const anchor = getBranchPanelAnchor();
    if (!anchor) {
      return;
    }

    const branch = createBranch(anchor.id, anchor.text || anchor.name);
    editingBranchId = branch.id;
    renderBranchPanel();
  }

  function createBranchItem(branch) {
    const item = document.createElement("div");
    item.className = [
      "ask-anchor-branch-item",
      branch.id === activeBranchId ? "is-active" : "",
      branch.id === editingBranchId ? "is-editing" : "",
      `is-${normalizeBranchStatus(branch.status)}`
    ].filter(Boolean).join(" ");

    if (branch.id === editingBranchId) {
      item.innerHTML = `
        <div class="ask-anchor-branch-edit">
          <input class="ask-anchor-branch-title-input" type="text" aria-label="\u5206\u652f\u6807\u9898">
          <textarea class="ask-anchor-branch-prompt-input" rows="7" aria-label="\u5206\u652f prompt"></textarea>
          <div class="ask-anchor-branch-edit__actions">
            <button class="ask-anchor-branch-save" type="button">\u4fdd\u5b58</button>
            <button class="ask-anchor-branch-send" type="button">\u53d1\u9001\u5230\u8f93\u5165\u6846</button>
            <button class="ask-anchor-branch-cancel" type="button">\u53d6\u6d88</button>
          </div>
        </div>
      `;

      const titleInput = item.querySelector(".ask-anchor-branch-title-input");
      const promptInput = item.querySelector(".ask-anchor-branch-prompt-input");
      titleInput.value = branch.title;
      promptInput.value = branch.prompt;
      titleInput.addEventListener("click", stopAnchorControlEvent);
      promptInput.addEventListener("click", stopAnchorControlEvent);
      item.querySelector(".ask-anchor-branch-save").addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveBranchEdit(branch.id, item);
        editingBranchId = null;
        renderBranchPanel();
      });
      item.querySelector(".ask-anchor-branch-send").addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveBranchEdit(branch.id, item);
        editingBranchId = null;
        await sendBranchToInput(branch.id);
      });
      item.querySelector(".ask-anchor-branch-cancel").addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        editingBranchId = null;
        renderBranchPanel();
      });
      return item;
    }

    item.innerHTML = `
      <button class="ask-anchor-branch-main" type="button">
        <span class="ask-anchor-branch-title"></span>
        <span class="ask-anchor-branch-prompt-preview"></span>
      </button>
      <div class="ask-anchor-branch-actions">
        <span class="ask-anchor-branch-status"></span>
        <button class="ask-anchor-branch-edit-button" type="button">\u7f16\u8f91</button>
        <button class="ask-anchor-branch-send" type="button">\u53d1\u9001\u5230\u8f93\u5165\u6846</button>
        <button class="ask-anchor-branch-delete" type="button" aria-label="\u5220\u9664\u5206\u652f" title="\u5220\u9664">\u00d7</button>
      </div>
    `;

    item.querySelector(".ask-anchor-branch-title").textContent = branch.title;
    item.querySelector(".ask-anchor-branch-prompt-preview").textContent = createBranchPromptPreview(branch.prompt);
    item.querySelector(".ask-anchor-branch-status").textContent = getBranchStatusLabel(branch.status);
    item.querySelector(".ask-anchor-branch-main").addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await sendBranchToInput(branch.id);
    });
    item.querySelector(".ask-anchor-branch-edit-button").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      editingBranchId = branch.id;
      renderBranchPanel();
    });
    item.querySelector(".ask-anchor-branch-send").addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await sendBranchToInput(branch.id);
    });
    item.querySelector(".ask-anchor-branch-delete").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteBranch(branch.id);
    });

    return item;
  }

  function saveBranchEdit(branchId, item) {
    const title = item.querySelector(".ask-anchor-branch-title-input")?.value;
    const prompt = item.querySelector(".ask-anchor-branch-prompt-input")?.value;
    updateBranchTitle(branchId, title);
    updateBranchPrompt(branchId, prompt);
  }

  async function sendBranchToInput(branchId) {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) {
      return;
    }

    const filled = await fillCurrentAiInput(branch.prompt);
    if (!filled) {
      await copyPromptToClipboard(branch.prompt);
      showToast("\u672a\u627e\u5230\u8f93\u5165\u6846\uff0c\u5df2\u590d\u5236\u5206\u652f prompt");
      return;
    }

    markBranchSent(branch.id);
    showToast("\u5df2\u5c06\u8ffd\u95ee\u5206\u652f\u53d1\u9001\u5230\u5f53\u524d\u8f93\u5165\u6846");
  }

  function createBranchPromptPreview(prompt) {
    const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "\u7a7a prompt";
    }
    return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized;
  }

  function watchForSentFollowUp({ anchor, branchId, prompt, selectedText, knownUserNodes, knownUserTexts }) {
    pendingFollowUp = {
      anchorId: anchor.id,
      branchId,
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
    if (pendingFollowUp.branchId) {
      markBranchDone(pendingFollowUp.branchId);
    }
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
      && !platformEditor.closest(`#${DOCK_ID}, #${PANEL_ID}, #${BRANCH_PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`)
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
        && !node.closest(`#${DOCK_ID}, #${PANEL_ID}, #${BRANCH_PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`)
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
        createBranch,
        updateBranchPrompt,
        updateBranchTitle,
        markBranchSent,
        markBranchDone,
        deleteBranch,
        getBranchesByAnchor,
        getActiveBranch,
        persistBranchesToSession,
        loadBranchesFromSession,
        normalizeBranch,
        normalizeBranchStatus,
        getBranchStatusLabel,
        createBranchTitle,
        normalizeBranchTitle,
        getBranchPanelAnchor,
        openBranchPanel,
        closeBranchPanel,
        getOrCreateBranchPanel,
        renderBranchPanel,
        createBranchForPanelAnchor,
        createBranchItem,
        saveBranchEdit,
        sendBranchToInput,
        createBranchPromptPreview,
        watchForSentFollowUp,
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
