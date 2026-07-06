(function registerAskAnchorSelectionModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.selection = function createAskAnchorSelectionModule(ctx) {
    with (ctx) {
  function handleSelectionChangeDebounced() {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(handleSelectionChange, 120);
  }

  function handleDocumentKeyup(event) {
    if (event.key === "Escape") {
      hideExplainButton();
      closeFollowUpMenu();
      closeAnchorList();
      return;
    }

    handleSelectionChange();
  }

  function handleSelectionChange() {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";

    if (!selection || selection.rangeCount === 0 || text.length < MIN_SELECTION_LENGTH) {
      hideExplainButton();
      closeFollowUpMenu();
      currentSelection = null;
      return;
    }

    const range = selection.getRangeAt(0);
    const messageElement = findAssistantMessageElement(range.commonAncestorContainer);
    if (!messageElement) {
      hideExplainButton();
      closeFollowUpMenu();
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
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
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
      button.setAttribute("aria-expanded", "false");
    }
    closeFollowUpMenu();
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

    toggleFollowUpMenu(selectionSnapshot.rect);
  }

  function handleExtensionCommand(command) {
    if (!askAnchorStarted || !isCurrentPlatformEnabled()) {
      return;
    }

    if (command === COMMANDS.OPEN_ANCHORS) {
      toggleAnchorList();
      return;
    }

    if (command === COMMANDS.FOLLOW_UP_SELECTION) {
      openFollowUpMenuForShortcut();
    }
  }

  function openFollowUpMenuForShortcut() {
    handleSelectionChange();
    const selectionSnapshot = currentSelection;
    if (!selectionSnapshot) {
      closeFollowUpMenu();
      showToast("\u8bf7\u5148\u9009\u4e2d AI \u56de\u7b54\u91cc\u60f3\u8ffd\u95ee\u7684\u5185\u5bb9");
      return;
    }

    showExplainButton(selectionSnapshot.rect);
    showFollowUpMenu(selectionSnapshot.rect);
    const firstItem = getOrCreateFollowUpMenu().querySelector("[data-follow-up-template-id]");
    firstItem?.focus();
  }

  async function handleTemplateSelect(templateId) {
    const selectionSnapshot = currentSelection || lastValidSelection;
    if (!selectionSnapshot) {
      closeFollowUpMenu();
      return;
    }

    const sourceRange = selectionSnapshot.range.cloneRange();
    const selector = serializeRange(sourceRange, selectionSnapshot.messageElement);
    const messageLocator = createMessageLocator(selectionSnapshot.messageElement, selector);
    const anchorDraft = {
      text: selectionSnapshot.text,
      range: sourceRange,
      selector,
      messageLocator,
      element: selectionSnapshot.messageElement,
      scrollY: window.scrollY
    };
    const knownUserElements = collectUserMessageElements();
    const knownUserNodes = new Set(knownUserElements);
    const knownUserTexts = new Set(knownUserElements.map((node) => normalizeComparableText(node.innerText || node.textContent || "")));
    const prompt = buildFollowUpPrompt(selectionSnapshot.text, templateId);
    const filled = await fillCurrentAiInput(prompt);

    hideExplainButton();

    if (filled) {
      watchForSentFollowUp({
        anchorDraft,
        prompt,
        selectedText: selectionSnapshot.text,
        knownUserNodes,
        knownUserTexts
      });
      showToast("\u5df2\u586b\u5165\u8ffd\u95ee\uff0c\u53d1\u9001\u540e\u518d\u521b\u5efa\u951a\u70b9");
      return;
    }

    await copyPromptToClipboard(prompt);
    showToast("\u672a\u627e\u5230\u8f93\u5165\u6846\uff0c\u5df2\u590d\u5236\u8ffd\u95ee\uff1b\u672c\u6b21\u4e0d\u4f1a\u81ea\u52a8\u521b\u5efa\u951a\u70b9");
  }

  function toggleFollowUpMenu(selectionRect) {
    const menu = getOrCreateFollowUpMenu();
    if (!menu.hidden) {
      closeFollowUpMenu();
      return;
    }

    showFollowUpMenu(selectionRect);
  }

  function showFollowUpMenu(selectionRect) {
    const menu = getOrCreateFollowUpMenu();
    const button = document.getElementById(BUTTON_ID);
    if (!button || button.hidden) {
      return;
    }

    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    positionFollowUpMenu(menu, button, selectionRect);
  }

  function getOrCreateFollowUpMenu() {
    let menu = document.getElementById(FOLLOW_UP_MENU_ID);
    if (menu) {
      return menu;
    }

    menu = document.createElement("div");
    menu.id = FOLLOW_UP_MENU_ID;
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    menu.addEventListener("pointerdown", keepSelectionForButton);
    menu.addEventListener("mousedown", keepSelectionForButton);
    menu.addEventListener("click", handleFollowUpMenuClick);

    FOLLOW_UP_TEMPLATES.forEach((template) => {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = template.label;
      item.setAttribute("role", "menuitem");
      item.dataset.followUpTemplateId = template.id;
      menu.appendChild(item);
    });

    document.documentElement.appendChild(menu);
    return menu;
  }

  function positionFollowUpMenu(menu, button, selectionRect) {
    const buttonRect = button.getBoundingClientRect();
    const anchorRect = selectionRect || buttonRect;
    const margin = 8;
    const maxLeft = window.scrollX + window.innerWidth - menu.offsetWidth - margin;
    const left = Math.max(window.scrollX + margin, Math.min(anchorRect.left + window.scrollX, maxLeft));
    let top = buttonRect.bottom + window.scrollY + margin;

    if (top + menu.offsetHeight > window.scrollY + window.innerHeight - margin) {
      top = buttonRect.top + window.scrollY - menu.offsetHeight - margin;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(window.scrollY + margin, top)}px`;
  }

  function closeFollowUpMenu() {
    const menu = document.getElementById(FOLLOW_UP_MENU_ID);
    if (menu) {
      menu.hidden = true;
    }

    const button = document.getElementById(BUTTON_ID);
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  }

  function handleFollowUpMenuClick(event) {
    const item = event.target && event.target.closest
      ? event.target.closest("[data-follow-up-template-id]")
      : null;
    if (!item) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleTemplateSelect(item.dataset.followUpTemplateId);
  }

  function handleDocumentClick(event) {
    const target = event.target;
    if (!target || !target.closest) {
      return;
    }

    if (target.closest(`#${BUTTON_ID}`) || target.closest(`#${FOLLOW_UP_MENU_ID}`)) {
      return;
    }

    closeFollowUpMenu();

    if (!target.closest(`#${PANEL_ID}`) && !target.closest(`#${DOCK_ID}`)) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.hidden = true;
      }
    }
  }

      return {
        handleSelectionChangeDebounced,
        handleDocumentKeyup,
        handleSelectionChange,
        showExplainButton,
        hideExplainButton,
        keepSelectionForButton,
        handleAskClick,
        handleExtensionCommand,
        openFollowUpMenuForShortcut,
        handleTemplateSelect,
        toggleFollowUpMenu,
        showFollowUpMenu,
        getOrCreateFollowUpMenu,
        positionFollowUpMenu,
        closeFollowUpMenu,
        handleFollowUpMenuClick,
        handleDocumentClick
      };
    }
  };
})(globalThis);
