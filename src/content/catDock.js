(function registerAskAnchorCatDockModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.catDock = function createAskAnchorCatDockModule(ctx) {
    with (ctx) {
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

    if (catDragState.moved && catDragState.tucked) {
      saveTuckedCatTop(tuckedCatTop);
      window.setTimeout(() => {
        catDragState = null;
      }, 0);
    } else if (catDragState.moved && catDockPosition) {
      saveCatDockPosition(catDockPosition);
      updateStoredSettings({ catDefaultPosition: "custom" });
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

    dock.classList.toggle("is-tucked", catDockTucked);
    updateCatImage(dock);
    updateCatHint(dock);
    if (catDockTucked) {
      applyTuckedCatDockPosition(dock);
      return;
    }

    if (askAnchorSettings.catDefaultPosition === "right") {
      applyRightCatDockPosition(dock);
      return;
    }

    if (askAnchorSettings.catDefaultPosition === "custom" && catDockPosition) {
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

  function applyRightCatDockPosition(dock) {
    const height = dock.offsetHeight || 44;
    const top = Math.round((window.innerHeight - height) / 2);
    dock.style.removeProperty("--ask-anchor-cat-left");
    dock.style.setProperty("--ask-anchor-cat-right", "0px");
    dock.style.setProperty("--ask-anchor-cat-top", `${clamp(top, 8, window.innerHeight - height - 8)}px`);
    dock.style.removeProperty("bottom");
    if (catEyePointer) {
      scheduleCatEyeUpdate();
    }
  }

  function captureCurrentCatDockPosition() {
    const dock = document.getElementById(DOCK_ID);
    const rect = dock?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
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
    if (catEyePointer) {
      scheduleCatEyeUpdate();
    }
  }

  function applyTuckedCatDockPosition(dock) {
    const height = dock.offsetHeight || 84;
    const top = clamp(tuckedCatTop ?? window.innerHeight - height - 86, 8, window.innerHeight - height - 8);
    tuckedCatTop = top;
    dock.style.removeProperty("--ask-anchor-cat-left");
    dock.style.setProperty("--ask-anchor-cat-right", "-8px");
    dock.style.setProperty("--ask-anchor-cat-top", `${top}px`);
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
        applyRightCatDockPosition,
        captureCurrentCatDockPosition,
        createCatPositionFromPointer,
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
