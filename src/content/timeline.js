(function registerAskAnchorTimelineModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.timeline = function createAskAnchorTimelineModule(ctx) {
    with (ctx) {
  function scheduleConversationTimelineRender() {
    if (askAnchorSettings.timelineMode === "off") {
      resetConversationTimeline();
      return;
    }

    if (conversationTimelineTimer) {
      return;
    }

    conversationTimelineTimer = window.setTimeout(() => {
      conversationTimelineTimer = null;
      updateConversationTimeline();
    }, CONVERSATION_TIMELINE_RENDER_DELAY);
  }

  function updateConversationTimeline() {
    let timeline = document.getElementById(TIMELINE_ID);
    if (askAnchorSettings.timelineMode === "off") {
      resetConversationTimeline();
      return;
    }

    if (askAnchorSettings.timelineMode === "auto" && hasNativeConversationTimeline()) {
      resetConversationTimeline();
      return;
    }

    const messages = collectDistinctTimelineMessageElements();
    if (messages.length === 0) {
      resetConversationTimeline();
      return;
    }

    if (!timeline) {
      timeline = document.createElement("div");
      timeline.id = TIMELINE_ID;
      timeline.className = "ask-anchor-anchor-timeline";
      timeline.setAttribute("aria-label", "AskAnchor timeline");
      document.documentElement.appendChild(timeline);
    }

    ensureTimelineIntersectionObserver();
    syncTimelineTicks(timeline, messages);
    updateActiveTimelineFromViewport();
  }

  function syncTimelineTicks(timeline, messages) {
    const currentMessages = new Set(messages);
    Array.from(timelineState.messageToTick.entries()).forEach(([message, tick]) => {
      if (!currentMessages.has(message) || !document.contains(message)) {
        removeTimelineTick(message, tick);
      }
    });

    messages.forEach((message, index) => {
      let tick = timelineState.messageToTick.get(message);
      if (!tick) {
        tick = createTimelineTick(message);
        timelineState.messageToTick.set(message, tick);
        timelineState.tickToMessage.set(tick, message);
        if (timelineState.observer) {
          timelineState.observer.observe(message);
        }
      }

      tick.setAttribute("aria-label", `\u5b9a\u4f4d\u5230\u95ee\u9898 ${index + 1}`);
      timeline.appendChild(tick);
    });
  }

  function createTimelineTick(message) {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "ask-anchor-timeline-tick";
    tick.addEventListener("click", (event) => {
      event.stopPropagation();
      closeAnchorList();
      const currentMessage = timelineState.tickToMessage.get(tick) || message;
      scrollToConversationMessage(currentMessage);
      setActiveTimelineMessage(currentMessage);
    });
    tick.addEventListener("mouseenter", () => showTimelinePreview(tick, createTimelinePreview(message, getTimelineTickIndex(tick))));
    tick.addEventListener("focus", () => showTimelinePreview(tick, createTimelinePreview(message, getTimelineTickIndex(tick))));
    tick.addEventListener("mouseleave", hideTimelinePreview);
    tick.addEventListener("blur", hideTimelinePreview);
    return tick;
  }

  function removeTimelineTick(message, tick) {
    if (timelineState.observer) {
      timelineState.observer.unobserve(message);
    }
    if (tick?.parentNode) {
      tick.remove();
    }
    timelineState.messageToTick.delete(message);
    timelineState.tickToMessage.delete(tick);
    if (timelineState.activeMessage === message) {
      timelineState.activeMessage = null;
    }
  }

  function resetConversationTimeline() {
    hideTimelinePreview();
    const timeline = document.getElementById(TIMELINE_ID);
    if (timeline) {
      timeline.remove();
    }

    if (timelineState.observer) {
      timelineState.observer.disconnect();
      timelineState.observer = null;
    }
    timelineState.messageToTick.clear();
    timelineState.tickToMessage.clear();
    timelineState.activeMessage = null;
  }

  function ensureTimelineIntersectionObserver() {
    if (timelineState.observer || !("IntersectionObserver" in window)) {
      return;
    }

    timelineState.observer = new IntersectionObserver(handleTimelineIntersections, {
      root: null,
      rootMargin: "-35% 0px -55% 0px",
      threshold: [0, 0.01, 0.2, 0.5]
    });
  }

  function handleTimelineIntersections(entries) {
    const visibleEntries = entries
      .filter((entry) => entry.isIntersecting && timelineState.messageToTick.has(entry.target))
      .sort((left, right) => (
        right.intersectionRatio - left.intersectionRatio
        || Math.abs(left.boundingClientRect.top) - Math.abs(right.boundingClientRect.top)
      ));

    if (visibleEntries.length > 0) {
      setActiveTimelineMessage(visibleEntries[0].target);
    }
  }

  function updateActiveTimelineFromViewport() {
    const messages = Array.from(timelineState.messageToTick.keys())
      .filter((message) => document.contains(message));
    if (messages.length === 0) {
      setActiveTimelineMessage(null);
      return;
    }

    const viewportAnchor = window.innerHeight * 0.42;
    const bestMessage = messages
      .map((message) => {
        const rect = message.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const inViewport = rect.bottom >= 0 && rect.top <= window.innerHeight;
        return {
          message,
          score: inViewport ? Math.abs(center - viewportAnchor) : Number.POSITIVE_INFINITY
        };
      })
      .sort((left, right) => left.score - right.score)[0]?.message || messages[0];

    setActiveTimelineMessage(bestMessage);
  }

  function setActiveTimelineMessage(message) {
    if (timelineState.activeMessage === message) {
      return;
    }

    const previousTick = timelineState.messageToTick.get(timelineState.activeMessage);
    if (previousTick) {
      previousTick.classList.remove("is-active");
    }

    timelineState.activeMessage = message;
    const nextTick = timelineState.messageToTick.get(message);
    if (nextTick) {
      nextTick.classList.add("is-active");
    }
  }

  function getTimelineTickIndex(tick) {
    if (!tick?.parentElement) {
      return 0;
    }

    return Array.prototype.indexOf.call(tick.parentElement.children, tick);
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
          .some((node) => !node.closest(`#${DOCK_ID}, #${PANEL_ID}, #${TIMELINE_ID}, #${TIMELINE_PREVIEW_ID}`) && isVisible(node));
      } catch (error) {
        return false;
      }
    });
  }

  function collectDistinctTimelineMessageElements() {
    return getDistinctTimelineMessages(collectTimelineMessageElements());
  }

  function getDistinctTimelineMessages(messages) {
    const distinctMessages = [];
    const seenTexts = new Set();

    messages.forEach((message) => {
      const text = normalizeTimelineQuestionText(message);
      if (!text) {
        return;
      }

      const existingIndex = distinctMessages.findIndex((existingMessage) => (
        existingMessage.contains(message) || message.contains(existingMessage)
      ));
      if (existingIndex !== -1) {
        const existingMessage = distinctMessages[existingIndex];
        const preferredMessage = chooseTimelineMessageRoot(existingMessage, message);
        distinctMessages[existingIndex] = preferredMessage;
        seenTexts.add(text);
        return;
      }

      if (seenTexts.has(text)) {
        return;
      }

      distinctMessages.push(message);
      seenTexts.add(text);
    });

    return distinctMessages;
  }

  function chooseTimelineMessageRoot(left, right) {
    if (left.contains(right)) {
      return left;
    }
    if (right.contains(left)) {
      return right;
    }
    return left;
  }

  function normalizeTimelineQuestionText(message) {
    return normalizeComparableText(message?.innerText || message?.textContent || "")
      .toLowerCase();
  }

  function collectTimelineMessageElements() {
    const userMessages = collectUserMessageElements()
      .filter((node) => document.contains(node))
      .filter((node) => isVisible(node));

    if (userMessages.length > 0) {
      return userMessages.slice(0, 100);
    }

    return uniqueElements(getTimelineMessageSelectors().flatMap((selector) => {
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

  function getTimelineMessageSelectors() {
    const platformSelectors = [
      ...activeAdapter.messageSelectors,
      ...activeAdapter.userSelectors,
      "[data-message-author-role]",
      "user-query",
      "model-response",
      "[data-content='user-message']",
      "[data-content='ai-message']"
    ];

    if (activeAdapter.name === "fallback") {
      platformSelectors.push(
        "[data-testid*='message']",
        "[data-testid*='query']",
        "[class*='message']"
      );
    }

    return platformSelectors;
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

      return {
        scheduleConversationTimelineRender,
        updateConversationTimeline,
        syncTimelineTicks,
        createTimelineTick,
        removeTimelineTick,
        resetConversationTimeline,
        ensureTimelineIntersectionObserver,
        handleTimelineIntersections,
        updateActiveTimelineFromViewport,
        setActiveTimelineMessage,
        getTimelineTickIndex,
        hasNativeConversationTimeline,
        collectDistinctTimelineMessageElements,
        getDistinctTimelineMessages,
        chooseTimelineMessageRoot,
        normalizeTimelineQuestionText,
        collectTimelineMessageElements,
        getTimelineMessageSelectors,
        createTimelinePreview,
        showTimelinePreview,
        hideTimelinePreview,
        scrollToConversationMessage
      };
    }
  };
})(globalThis);
