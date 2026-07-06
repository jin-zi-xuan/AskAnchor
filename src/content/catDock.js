(function registerAskAnchorCatDockModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.catDock = function createAskAnchorCatDockModule(ctx) {
    with (ctx) {
  let promptEditorResizeObserver = null;
  let promptEditorTrackingFrame = null;
  let promptEditorTrackingBurstFrame = null;
  let promptEditorTrackingBurstUntil = 0;
  let trackedPromptEditor = null;
  let trackedPromptTargets = [];
  const CAT_DOCK_WIDTH = 76;
  const CAT_DOCK_HEIGHT = 44;
  const CAT_IMAGE_BOTTOM_OFFSET = 46;
  const CAT_EDITOR_RIGHT_INSET = 96;
  const CAT_RIGHT_TOP_OFFSET = 96;
  const CAT_POSITION_ANCHOR_VERSION = "prompt-shell-v2";

  function ensureCatFaceLayers(dock) {
    const button = dock.querySelector(".ask-anchor-dock-button");
    const catImage = dock.querySelector(".ask-anchor-cat-image");
    if (!button || !catImage) {
      return;
    }

    if (!button.querySelector(".ask-anchor-cat-eye--left")) {
      const leftEye = createCatEye("left");
      catImage.insertAdjacentElement("afterend", leftEye);
    }

    if (!button.querySelector(".ask-anchor-cat-eye--right")) {
      const rightEye = createCatEye("right");
      const leftEye = button.querySelector(".ask-anchor-cat-eye--left");
      (leftEye || catImage).insertAdjacentElement("afterend", rightEye);
    }
  }

  function createCatEye(side) {
    const eye = document.createElement("span");
    eye.className = `ask-anchor-cat-eye ask-anchor-cat-eye--${side}`;
    eye.setAttribute("aria-hidden", "true");

    const pupil = document.createElement("span");
    pupil.className = "ask-anchor-cat-pupil";
    eye.appendChild(pupil);
    return eye;
  }

  function handleCatEyePointerMove(event) {
    if (!askAnchorSettings.eyeTracking || !askAnchorSettings.showCat || event.pointerType === "touch") {
      return;
    }

    catEyePointer = {
      x: event.clientX,
      y: event.clientY
    };
    scheduleCatEyeUpdate();
  }

  function scheduleCatEyeUpdate() {
    if (catEyeFrame) {
      return;
    }

    catEyeFrame = window.requestAnimationFrame(() => {
      catEyeFrame = null;
      updateCatEyes();
    });
  }

  function updateCatEyes() {
    const dock = document.getElementById(DOCK_ID);
    if (!dock || !catEyePointer) {
      resetCatEyes();
      return;
    }

    dock.querySelectorAll(".ask-anchor-cat-eye").forEach((eye) => {
      const rect = eye.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = catEyePointer.x - centerX;
      const dy = catEyePointer.y - centerY;
      const distance = Math.hypot(dx, dy) || 1;
      const maxX = rect.width * 0.17;
      const maxY = rect.height * 0.15;
      const scale = Math.min(1, Math.max(maxX, maxY) / distance);

      eye.style.setProperty("--ask-anchor-eye-x", `${dx * scale}px`);
      eye.style.setProperty("--ask-anchor-eye-y", `${dy * scale}px`);
    });
  }

  function resetCatEyes() {
    catEyePointer = null;
    if (catEyeFrame) {
      window.cancelAnimationFrame(catEyeFrame);
      catEyeFrame = null;
    }

    const dock = document.getElementById(DOCK_ID);
    if (!dock) {
      return;
    }

    dock.querySelectorAll(".ask-anchor-cat-eye").forEach((eye) => {
      eye.style.setProperty("--ask-anchor-eye-x", "0px");
      eye.style.setProperty("--ask-anchor-eye-y", "0px");
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
    if (askAnchorSettings.catDefaultPosition !== "custom") {
      catDockPosition = null;
      saveCatDockPosition(null);
    }
    closeAnchorList();
    updateCatDockPosition();
  }

  function untuckCatDock() {
    catDockTucked = false;
    updateCatDockPosition();
  }

  function startCatDrag(event) {
    if (!askAnchorSettings.showCat || event.button !== 0) {
      return;
    }

    const dock = document.getElementById(DOCK_ID);
    if (!dock) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = dock.getBoundingClientRect();
    catDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      tucked: catDockTucked,
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

    if (catDragState.tucked) {
      const height = dock.offsetHeight || 84;
      tuckedCatTop = clamp(event.clientY - catDragState.offsetY, 8, window.innerHeight - height - 8);
      applyTuckedCatDockPosition(dock);
      return;
    }

    const editor = findPromptEditor();
    const editorRect = getPromptEditorAnchorRect(editor);

    if (askAnchorSettings.catDefaultPosition === "right") {
      catDockPosition = createRightEdgePositionFromPointer(event, dock);
      applyRightCatDockPosition(dock, catDockPosition);
      return;
    }

    if (editorRect && editorRect.width > 0 && editorRect.height > 0) {
      catDockPosition = askAnchorSettings.catDefaultPosition === "custom"
        ? createCatWorkspacePositionFromPointer(event, getCatCustomMoveBounds(editorRect))
        : createCatPositionFromPointer(event, editorRect);
      applyCatDockPosition(dock, getCatDockViewportPosition(catDockPosition, editorRect));
      return;
    }

    if (askAnchorSettings.catDefaultPosition !== "custom") {
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

    if (catDragState.moved && catDragState.tucked) {
      saveTuckedCatTop(tuckedCatTop);
      window.setTimeout(() => {
        catDragState = null;
      }, 0);
    } else if (catDragState.moved && catDockPosition) {
      saveCatDockPosition(catDockPosition);
      if (askAnchorSettings.catDefaultPosition === "custom") {
        updateStoredSettings({ catDefaultPosition: "custom" });
      }
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

  function updateCatDockPosition() {
    const dock = document.getElementById(DOCK_ID);
    if (!dock) {
      return;
    }

    dock.hidden = !askAnchorSettings.showCat;
    dock.classList.toggle("is-eye-tracking-disabled", !askAnchorSettings.eyeTracking);
    if (!askAnchorSettings.showCat) {
      resetCatEyes();
      return;
    }

    observePromptEditorForCatDock();
    dock.classList.toggle("is-tucked", catDockTucked);
    updateCatImage(dock);
    updateCatHint(dock);
    if (catDockTucked) {
      applyTuckedCatDockPosition(dock);
      return;
    }

    if (askAnchorSettings.catDefaultPosition === "right") {
      applyRightCatDockPosition(dock, catDockPosition);
      return;
    }

    if (askAnchorSettings.catDefaultPosition === "custom" && catDockPosition) {
      const editor = findPromptEditor();
      const editorRect = getPromptEditorAnchorRect(editor);
      if (catDockPosition.mode === "editor-edge" || catDockPosition.mode === "editor-workspace" || catDockPosition.mode === "editor-box" || !editorRect) {
        const safePosition = getCatDockViewportPosition(catDockPosition, editorRect);
        applyCatDockPosition(dock, safePosition);
        return;
      }
    }

    const editor = findPromptEditor();
    if (!editor) {
      dock.style.removeProperty("--ask-anchor-cat-left");
      dock.style.removeProperty("--ask-anchor-cat-right");
      dock.style.removeProperty("--ask-anchor-cat-top");
      dock.style.removeProperty("--ask-anchor-cat-shift");
      dock.style.removeProperty("bottom");
      return;
    }

    const rect = getPromptEditorAnchorRect(editor);
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    if (catDockPosition?.mode === "editor-edge") {
      applyCatDockPosition(dock, getCatDockViewportPosition(catDockPosition, rect));
      return;
    }

    const left = Math.min(window.innerWidth - CAT_DOCK_WIDTH - 8, Math.max(8, rect.right - CAT_DOCK_WIDTH - CAT_EDITOR_RIGHT_INSET));
    const top = Math.min(window.innerHeight - CAT_DOCK_HEIGHT - 4, Math.max(4, rect.top - getCatDockAnchorBottomOffset(dock)));
    dock.style.setProperty("--ask-anchor-cat-left", `${left}px`);
    dock.style.setProperty("--ask-anchor-cat-right", "auto");
    dock.style.setProperty("--ask-anchor-cat-top", `${top}px`);
    dock.style.setProperty("--ask-anchor-cat-shift", "0px");
    dock.style.removeProperty("bottom");
  }

  function installPromptEditorTracking() {
    if ("ResizeObserver" in window && !promptEditorResizeObserver) {
      promptEditorResizeObserver = new ResizeObserver(schedulePromptEditorTrackingUpdate);
    }

    document.addEventListener("input", handlePromptEditorTrackingEvent, true);
    document.addEventListener("keyup", handlePromptEditorTrackingEvent, true);
    document.addEventListener("compositionend", handlePromptEditorTrackingEvent, true);
    window.addEventListener("focus", handlePromptEditorTrackingEvent);
    observePromptEditorForCatDock();
    schedulePromptEditorTrackingUpdate();
  }

  function uninstallPromptEditorTracking() {
    document.removeEventListener("input", handlePromptEditorTrackingEvent, true);
    document.removeEventListener("keyup", handlePromptEditorTrackingEvent, true);
    document.removeEventListener("compositionend", handlePromptEditorTrackingEvent, true);
    window.removeEventListener("focus", handlePromptEditorTrackingEvent);

    if (promptEditorResizeObserver) {
      promptEditorResizeObserver.disconnect();
      promptEditorResizeObserver = null;
    }

    if (promptEditorTrackingFrame) {
      window.cancelAnimationFrame(promptEditorTrackingFrame);
      promptEditorTrackingFrame = null;
    }

    if (promptEditorTrackingBurstFrame) {
      window.cancelAnimationFrame(promptEditorTrackingBurstFrame);
      promptEditorTrackingBurstFrame = null;
    }
    promptEditorTrackingBurstUntil = 0;

    trackedPromptEditor = null;
    trackedPromptTargets = [];
  }

  function handlePromptEditorTrackingEvent() {
    updatePromptEditorTracking();
    startPromptEditorTrackingBurst();
  }

  function schedulePromptEditorTrackingUpdate() {
    if (promptEditorTrackingFrame) {
      return;
    }

    promptEditorTrackingFrame = window.requestAnimationFrame(() => {
      promptEditorTrackingFrame = null;
      updatePromptEditorTracking();
    });
  }

  function startPromptEditorTrackingBurst() {
    promptEditorTrackingBurstUntil = Date.now() + 260;
    if (promptEditorTrackingBurstFrame) {
      return;
    }

    promptEditorTrackingBurstFrame = window.requestAnimationFrame(runPromptEditorTrackingBurst);
  }

  function runPromptEditorTrackingBurst() {
    promptEditorTrackingBurstFrame = null;
    updatePromptEditorTracking();
    if (Date.now() >= promptEditorTrackingBurstUntil) {
      promptEditorTrackingBurstUntil = 0;
      return;
    }

    promptEditorTrackingBurstFrame = window.requestAnimationFrame(runPromptEditorTrackingBurst);
  }

  function updatePromptEditorTracking() {
    observePromptEditorForCatDock();
    updateCatDockPosition();
  }

  function observePromptEditorForCatDock() {
    const editor = findPromptEditor();
    if (editor === trackedPromptEditor && trackedPromptTargets.every((target) => document.contains(target))) {
      return;
    }

    trackedPromptEditor = editor || null;
    trackedPromptTargets = getPromptEditorTrackingTargets(editor);
    if (!promptEditorResizeObserver) {
      return;
    }

    promptEditorResizeObserver.disconnect();
    trackedPromptTargets.forEach((target) => {
      try {
        promptEditorResizeObserver.observe(target);
      } catch (error) {
        console.debug("[AskAnchor] Failed to observe prompt editor:", error);
      }
    });
  }

  function getPromptEditorTrackingTargets(editor) {
    if (!editor || !document.contains(editor)) {
      return [];
    }

    const targets = [editor];
    const container = editor.closest([
      "form",
      "[role='form']",
      "[data-testid*='composer' i]",
      "[data-testid*='chat-input' i]",
      "[class*='composer' i]",
      "[class*='chat-input' i]",
      "[class*='input' i]"
    ].join(","));
    if (container && container !== editor) {
      targets.push(container);
    }

    let parent = editor.parentElement;
    let depth = 0;
    while (parent && parent !== document.body && depth < 8) {
      if (!targets.includes(parent)) {
        targets.push(parent);
      }
      parent = parent.parentElement;
      depth += 1;
    }

    return targets;
  }

  function getPromptEditorAnchorRect(editor) {
    if (!editor || !document.contains(editor)) {
      return null;
    }

    const candidates = getPromptEditorTrackingTargets(editor)
      .map((target) => ({
        target,
        rect: target.getBoundingClientRect?.()
      }))
      .filter(({ rect }) => rect && rect.width > 0 && rect.height > 0)
      .filter(({ target, rect }) => isPromptDockAnchorCandidate(target, editor, rect));

    const shellCandidate = candidates
      .filter((candidate) => isPromptInputShellCandidate(candidate, editor))
      .sort((left, right) => comparePromptInputShellCandidates(left, right, editor))[0];

    return shellCandidate?.rect
      || candidates.sort((left, right) => scorePromptDockAnchorCandidate(right, editor) - scorePromptDockAnchorCandidate(left, editor))[0]?.rect
      || editor.getBoundingClientRect();
  }

  function isPromptDockAnchorCandidate(target, editor, rect) {
    if (target === document.body || target === document.documentElement) {
      return false;
    }

    if (!target.contains(editor)) {
      return false;
    }

    if (rect.width < 160 || rect.height < 38 || rect.width > window.innerWidth - 8 || rect.height > window.innerHeight * 0.65) {
      return false;
    }

    return true;
  }

  function isPromptInputShellCandidate(candidate, editor) {
    const { target, rect } = candidate;
    const editorRect = editor.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    const topGap = editorRect.top - rect.top;
    const horizontalInset = editorRect.left - rect.left;
    const radius = getMaxBorderRadius(style);

    return (
      topGap >= 0
      && topGap <= 64
      && horizontalInset >= 0
      && horizontalInset <= 160
      && rect.bottom >= editorRect.bottom
      && rect.width >= editorRect.width
      && rect.height <= Math.max(180, editorRect.height + 96)
      && (radius >= 16 || hasVisibleInputChrome(style))
    );
  }

  function comparePromptInputShellCandidates(left, right, editor) {
    const leftScore = scorePromptInputShellCandidate(left, editor);
    const rightScore = scorePromptInputShellCandidate(right, editor);
    return rightScore - leftScore;
  }

  function scorePromptInputShellCandidate(candidate, editor) {
    const { target, rect } = candidate;
    const editorRect = editor.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    const topGap = editorRect.top - rect.top;
    const horizontalInset = editorRect.left - rect.left;
    const radius = getMaxBorderRadius(style);
    let score = 0;

    if (radius >= 20) {
      score += 120;
    } else if (radius >= 12) {
      score += 48;
    }
    if (hasVisibleInputChrome(style)) {
      score += 80;
    }
    if (target.matches?.("form, [role='form'], [data-testid*='composer' i], [data-testid*='chat-input' i], [class*='composer' i], [class*='chat-input' i]")) {
      score += 24;
    }
    if (rect.width > editorRect.width) {
      score += Math.min(36, (rect.width - editorRect.width) / 12);
    }
    if (horizontalInset >= 12 && horizontalInset <= 120) {
      score += 24;
    }
    if (topGap >= 10 && topGap <= 56) {
      score += 28;
    }

    return score - rect.height * 0.45 - Math.abs(topGap - 30) * 1.2;
  }

  function scorePromptDockAnchorCandidate(candidate, editor) {
    const { target, rect } = candidate;
    const editorRect = editor.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    const topGap = editorRect.top - rect.top;
    const horizontalInset = editorRect.left - rect.left;
    const radius = getMaxBorderRadius(style);
    let score = 0;

    if (target.matches?.("form, [role='form'], [data-testid*='composer' i], [data-testid*='chat-input' i], [class*='composer' i], [class*='chat-input' i]")) {
      score += 36;
    }
    if (hasVisibleInputChrome(style)) {
      score += 70;
    }
    if (radius >= 16) {
      score += 80;
    } else if (radius > 0) {
      score += 24;
    }
    if (rect.top <= editorRect.top && rect.bottom >= editorRect.bottom) {
      score += 16;
    }
    if (rect.width > editorRect.width) {
      score += Math.min(20, (rect.width - editorRect.width) / 20);
    }
    if (topGap >= 12 && topGap <= 80) {
      score += 30;
    }
    if (horizontalInset >= 16 && horizontalInset <= 120) {
      score += 18;
    }

    return score - Math.max(0, topGap - 96) * 0.7;
  }

  function getMaxBorderRadius(style) {
    return Math.max(
      parseCssPixelValue(style.borderTopLeftRadius),
      parseCssPixelValue(style.borderTopRightRadius),
      parseCssPixelValue(style.borderBottomLeftRadius),
      parseCssPixelValue(style.borderBottomRightRadius),
      parseCssPixelValue(style.borderRadius)
    );
  }

  function hasVisibleInputChrome(style) {
    return parseCssPixelValue(style.borderTopWidth) > 0
      || parseCssPixelValue(style.borderBottomWidth) > 0
      || style.boxShadow && style.boxShadow !== "none"
      || hasVisibleBackground(style.backgroundColor);
  }

  function parseCssPixelValue(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function hasVisibleBackground(value) {
    if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") {
      return false;
    }

    const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
    if (!rgba) {
      return true;
    }

    const parts = rgba[1].split(",").map((part) => part.trim());
    return parts.length < 4 || Number.parseFloat(parts[3]) > 0.05;
  }

  function applyRightCatDockPosition(dock, position = catDockPosition) {
    const height = dock.offsetHeight || 44;
    const top = clamp(
      position?.mode === "right-edge" ? position.top : CAT_RIGHT_TOP_OFFSET,
      8,
      window.innerHeight - height - 8
    );
    dock.style.removeProperty("--ask-anchor-cat-left");
    dock.style.setProperty("--ask-anchor-cat-right", "0px");
    dock.style.setProperty("--ask-anchor-cat-top", `${top}px`);
    dock.style.setProperty("--ask-anchor-cat-shift", "0px");
    dock.style.removeProperty("bottom");
    if (catEyePointer) {
      scheduleCatEyeUpdate();
    }
  }

  function captureCurrentCatDockPosition() {
    const dock = document.getElementById(DOCK_ID);
    const rect = dock?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      const editorRect = getPromptEditorAnchorRect(findPromptEditor());
      if (editorRect && editorRect.width > 0 && editorRect.height > 0) {
        return createCatPositionFromDockRect(rect, editorRect);
      }

      return {
        mode: "free",
        left: clamp(rect.left, 4, window.innerWidth - rect.width - 4),
        top: clamp(rect.top, 4, window.innerHeight - rect.height - 4)
      };
    }

    return {
      mode: "free",
      left: Math.max(4, window.innerWidth - 96),
      top: Math.max(4, window.innerHeight - 120)
    };
  }

  function createRightEdgePositionFromPointer(event, dock) {
    const height = dock?.offsetHeight || CAT_DOCK_HEIGHT;
    return {
      mode: "right-edge",
      anchorVersion: CAT_POSITION_ANCHOR_VERSION,
      top: clamp(event.clientY - catDragState.offsetY, 8, window.innerHeight - height - 8)
    };
  }

  function createCatPositionFromPointer(event, editorRect) {
    const x = clamp(event.clientX - catDragState.offsetX + CAT_DOCK_WIDTH / 2, editorRect.left + 28, editorRect.right - 28);
    const ratio = editorRect.width > 0 ? (x - editorRect.left) / editorRect.width : 0.82;

    return {
      mode: "editor-edge",
      anchorVersion: CAT_POSITION_ANCHOR_VERSION,
      ratio: clamp(ratio, 0.08, 0.92),
      offsetY: 0
    };
  }

  function createCatBoxPositionFromPointer(event, editorRect) {
    const widthRange = Math.max(1, editorRect.width - CAT_DOCK_WIDTH);
    const heightRange = Math.max(1, editorRect.height - CAT_DOCK_HEIGHT);
    const left = clamp(event.clientX - catDragState.offsetX, editorRect.left, editorRect.left + widthRange);
    const top = clamp(event.clientY - catDragState.offsetY, editorRect.top, editorRect.top + heightRange);

    return {
      mode: "editor-box",
      anchorVersion: CAT_POSITION_ANCHOR_VERSION,
      xRatio: clamp((left - editorRect.left) / widthRange, 0, 1),
      yRatio: clamp((top - editorRect.top) / heightRange, 0, 1)
    };
  }

  function createCatWorkspacePositionFromPointer(event, bounds) {
    const widthRange = Math.max(1, bounds.right - bounds.left - CAT_DOCK_WIDTH);
    const heightRange = Math.max(1, bounds.bottom - bounds.top - CAT_DOCK_HEIGHT);
    const left = clamp(event.clientX - catDragState.offsetX, bounds.left, bounds.left + widthRange);
    const top = clamp(event.clientY - catDragState.offsetY, bounds.top, bounds.top + heightRange);

    return {
      mode: "editor-workspace",
      anchorVersion: CAT_POSITION_ANCHOR_VERSION,
      xRatio: clamp((left - bounds.left) / widthRange, 0, 1),
      yRatio: clamp((top - bounds.top) / heightRange, 0, 1)
    };
  }

  function getCatDockViewportPosition(position, editorRect) {
    if (position?.mode === "editor-edge" && editorRect && editorRect.width > 0 && editorRect.height > 0) {
      const ratio = clamp(position.ratio ?? 0.82, 0.08, 0.92);
      const left = clamp(editorRect.left + editorRect.width * ratio - CAT_DOCK_WIDTH / 2, 4, window.innerWidth - CAT_DOCK_WIDTH - 4);
      const top = clamp(editorRect.top - getCatDockAnchorBottomOffset() + (position.offsetY || 0), 4, window.innerHeight - CAT_DOCK_HEIGHT - 4);
      return { left, top };
    }

    if (position?.mode === "editor-workspace" && editorRect && editorRect.width > 0 && editorRect.height > 0) {
      const bounds = getCatCustomMoveBounds(editorRect);
      const widthRange = Math.max(1, bounds.right - bounds.left - CAT_DOCK_WIDTH);
      const heightRange = Math.max(1, bounds.bottom - bounds.top - CAT_DOCK_HEIGHT);
      const left = clamp(bounds.left + widthRange * clamp(position.xRatio ?? 0.82, 0, 1), 4, window.innerWidth - CAT_DOCK_WIDTH - 4);
      const top = clamp(bounds.top + heightRange * clamp(position.yRatio ?? 0, 0, 1), 4, window.innerHeight - CAT_DOCK_HEIGHT - 4);
      return { left, top };
    }

    if (position?.mode === "editor-box" && editorRect && editorRect.width > 0 && editorRect.height > 0) {
      const widthRange = Math.max(1, editorRect.width - CAT_DOCK_WIDTH);
      const heightRange = Math.max(1, editorRect.height - CAT_DOCK_HEIGHT);
      const left = clamp(editorRect.left + widthRange * clamp(position.xRatio ?? 0.82, 0, 1), 4, window.innerWidth - CAT_DOCK_WIDTH - 4);
      const top = clamp(editorRect.top + heightRange * clamp(position.yRatio ?? 0, 0, 1), 4, window.innerHeight - CAT_DOCK_HEIGHT - 4);
      return { left, top };
    }

    if (position?.mode === "right-edge") {
      return {
        left: clamp(window.innerWidth - CAT_DOCK_WIDTH, 4, window.innerWidth - CAT_DOCK_WIDTH - 4),
        top: clamp(position.top ?? CAT_RIGHT_TOP_OFFSET, 8, window.innerHeight - CAT_DOCK_HEIGHT - 8)
      };
    }

    return {
      left: clamp(position?.left ?? window.innerWidth - 96, 4, window.innerWidth - CAT_DOCK_WIDTH),
      top: clamp(position?.top ?? window.innerHeight - 120, 4, window.innerHeight - CAT_DOCK_HEIGHT)
    };
  }

  function getCatCustomMoveBounds(editorRect) {
    const conversationRoot = typeof findConversationRoot === "function" ? findConversationRoot() : null;
    const rootRect = conversationRoot?.getBoundingClientRect?.();
    const left = rootRect && rootRect.width > CAT_DOCK_WIDTH
      ? Math.max(4, rootRect.left)
      : 4;
    const right = rootRect && rootRect.width > CAT_DOCK_WIDTH
      ? Math.min(window.innerWidth - 4, rootRect.right)
      : window.innerWidth - 4;
    const top = rootRect && rootRect.height > CAT_DOCK_HEIGHT
      ? Math.min(Math.max(4, rootRect.top), editorRect.top)
      : 4;
    const bottom = Math.max(top + CAT_DOCK_HEIGHT, Math.min(window.innerHeight - 4, Math.max(editorRect.bottom, editorRect.top + CAT_DOCK_HEIGHT)));

    return {
      left: clamp(left, 4, window.innerWidth - CAT_DOCK_WIDTH - 4),
      right: clamp(right, left + CAT_DOCK_WIDTH, window.innerWidth - 4),
      top,
      bottom
    };
  }

  function createCatPositionFromDockRect(dockRect, editorRect) {
    const centerX = dockRect.left + dockRect.width / 2;
    const ratio = editorRect.width > 0 ? (centerX - editorRect.left) / editorRect.width : 0.82;
    const offsetY = dockRect.top - (editorRect.top - getCatDockAnchorBottomOffset());

    return {
      mode: "editor-edge",
      anchorVersion: CAT_POSITION_ANCHOR_VERSION,
      ratio: clamp(ratio, 0.08, 0.92),
      offsetY: clamp(offsetY, -6, 6)
    };
  }

  function applyCatDockPosition(dock, position) {
    dock.style.setProperty("--ask-anchor-cat-left", `${position.left}px`);
    dock.style.setProperty("--ask-anchor-cat-right", "auto");
    dock.style.setProperty("--ask-anchor-cat-top", `${position.top}px`);
    dock.style.setProperty("--ask-anchor-cat-shift", "0px");
    dock.style.removeProperty("bottom");
    if (catEyePointer) {
      scheduleCatEyeUpdate();
    }
  }

  function getCatDockAnchorBottomOffset(dock = document.getElementById(DOCK_ID)) {
    const dockRect = dock?.getBoundingClientRect?.();
    const catRect = dock?.querySelector?.(".ask-anchor-cat-image")?.getBoundingClientRect?.();
    if (dockRect && catRect && catRect.height > 0) {
      return catRect.bottom - dockRect.top;
    }

    return CAT_IMAGE_BOTTOM_OFFSET;
  }

  function applyTuckedCatDockPosition(dock) {
    const height = dock.offsetHeight || 84;
    const top = clamp(tuckedCatTop ?? window.innerHeight - height - 86, 8, window.innerHeight - height - 8);
    tuckedCatTop = top;
    dock.style.removeProperty("--ask-anchor-cat-left");
    dock.style.setProperty("--ask-anchor-cat-right", "-8px");
    dock.style.setProperty("--ask-anchor-cat-top", `${top}px`);
    dock.style.setProperty("--ask-anchor-cat-shift", "0px");
    dock.style.removeProperty("bottom");
    if (catEyePointer) {
      scheduleCatEyeUpdate();
    }
  }

  function updateCatImage(dock) {
    const catImage = dock.querySelector(".ask-anchor-cat-image");
    if (!catImage) {
      return;
    }

    const nextSrc = catDockTucked ? CAT_PEEK_IMAGE_URL : CAT_IMAGE_URL;
    if (catImage.src !== nextSrc) {
      catImage.src = nextSrc;
    }
  }

  function updateCatHint(dock) {
    const hint = dock.querySelector(".ask-anchor-cat-hint");
    if (!hint) {
      return;
    }

    hint.textContent = catDockTucked ? "点击唤回" : "双击隐藏小猫";
  }

  function loadCatDockPosition() {
    try {
      const raw = localStorage.getItem(CAT_POSITION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const value = JSON.parse(raw);
      if (
        value?.mode === "right-edge"
        && typeof value.top === "number"
      ) {
        return {
          mode: "right-edge",
          anchorVersion: CAT_POSITION_ANCHOR_VERSION,
          top: value.top
        };
      }
      if (
        value?.mode === "editor-workspace"
        && typeof value.xRatio === "number"
        && typeof value.yRatio === "number"
      ) {
        return {
          mode: "editor-workspace",
          anchorVersion: CAT_POSITION_ANCHOR_VERSION,
          xRatio: clamp(value.xRatio, 0, 1),
          yRatio: clamp(value.yRatio, 0, 1)
        };
      }
      if (
        value?.mode === "editor-box"
        && typeof value.xRatio === "number"
        && typeof value.yRatio === "number"
      ) {
        return {
          mode: "editor-box",
          anchorVersion: CAT_POSITION_ANCHOR_VERSION,
          xRatio: clamp(value.xRatio, 0, 1),
          yRatio: clamp(value.yRatio, 0, 1)
        };
      }
      if (
        value?.mode === "editor-edge"
        && typeof value.ratio === "number"
        && typeof value.offsetY === "number"
      ) {
        return {
          mode: "editor-edge",
          anchorVersion: CAT_POSITION_ANCHOR_VERSION,
          ratio: value.ratio,
          offsetY: value.anchorVersion === CAT_POSITION_ANCHOR_VERSION ? value.offsetY : 0
        };
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

  function loadTuckedCatTop() {
    try {
      const value = Number(localStorage.getItem(TUCKED_CAT_TOP_STORAGE_KEY));
      return Number.isFinite(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function saveTuckedCatTop(top) {
    try {
      if (!Number.isFinite(top)) {
        localStorage.removeItem(TUCKED_CAT_TOP_STORAGE_KEY);
        return;
      }
      localStorage.setItem(TUCKED_CAT_TOP_STORAGE_KEY, String(Math.round(top)));
    } catch (error) {
      console.debug("[AskAnchor] Failed to save tucked cat position:", error);
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

      return {
        ensureCatFaceLayers,
        createCatEye,
        handleCatEyePointerMove,
        scheduleCatEyeUpdate,
        updateCatEyes,
        resetCatEyes,
        handleCatClick,
        tuckCatDock,
        untuckCatDock,
        startCatDrag,
        moveCatDrag,
        endCatDrag,
        updateCatDockPosition,
        installPromptEditorTracking,
        uninstallPromptEditorTracking,
        schedulePromptEditorTrackingUpdate,
        updatePromptEditorTracking,
        observePromptEditorForCatDock,
        getPromptEditorAnchorRect,
        applyRightCatDockPosition,
        captureCurrentCatDockPosition,
        createRightEdgePositionFromPointer,
        createCatPositionFromDockRect,
        createCatPositionFromPointer,
        createCatBoxPositionFromPointer,
        createCatWorkspacePositionFromPointer,
        getCatCustomMoveBounds,
        getCatDockViewportPosition,
        applyCatDockPosition,
        applyTuckedCatDockPosition,
        updateCatImage,
        updateCatHint,
        loadCatDockPosition,
        saveCatDockPosition,
        loadTuckedCatTop,
        saveTuckedCatTop,
        clamp
      };
    }
  };
})(globalThis);
