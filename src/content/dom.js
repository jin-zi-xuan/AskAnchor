(function registerAskAnchorDomModule(global) {
  global.AskAnchorModules = global.AskAnchorModules || {};

  global.AskAnchorModules.dom = function createAskAnchorDomModule(ctx) {
    with (ctx) {
  function createMessageLocator(messageElement, selector) {
    if (!messageElement) {
      return null;
    }

    const assistantMessages = collectAssistantMessageElements();
    const matchedMessage = findMatchingMessageElement(messageElement, assistantMessages) || messageElement;
    const assistantIndex = assistantMessages.indexOf(matchedMessage);
    const previousUserMessage = findPreviousUserMessageForAssistant(matchedMessage);

    return {
      platform: activeAdapter.name,
      conversationUrl: getConversationUrl(),
      assistantIndex,
      stableMessageId: getStableMessageId(matchedMessage),
      stableAttributes: extractStableAttributes(matchedMessage),
      previousUserSummary: createMessageSummary(previousUserMessage),
      selectedStart: typeof selector?.start === "number" ? selector.start : null,
      selectedEnd: typeof selector?.end === "number" ? selector.end : null
    };
  }

  function normalizeMessageLocator(locator) {
    return core.normalizeMessageLocator(locator);
  }

  function normalizeStableAttribute(attribute) {
    return core.normalizeStableAttribute(attribute);
  }

  function resolveMessageElement(locator, selector) {
    return resolveMessageElements(locator, selector)[0] || null;
  }

  function resolveMessageElements(locator, selector) {
    const normalizedLocator = normalizeMessageLocator(locator);
    if (!normalizedLocator) {
      return [];
    }

    if (normalizedLocator.platform && normalizedLocator.platform !== activeAdapter.name) {
      return [];
    }
    if (normalizedLocator.conversationUrl && normalizedLocator.conversationUrl !== getConversationUrl()) {
      return [];
    }

    const assistantMessages = collectAssistantMessageElements();
    if (assistantMessages.length === 0) {
      return [];
    }

    const scoredMatches = assistantMessages
      .map((message, index) => ({
        message,
        score: scoreMessageLocatorMatch(message, index, normalizedLocator, selector)
      }))
      .filter((match) => match.score >= 3)
      .sort((a, b) => b.score - a.score);

    if (scoredMatches.length > 0) {
      return scoredMatches.map((match) => match.message);
    }

    if (selector?.exact) {
      return assistantMessages
        .map((message) => ({
          message,
          exactStarts: findTextOccurrences(collectVisibleText(message).text, selector.exact)
        }))
        .filter((match) => match.exactStarts.length > 0)
        .sort((a, b) => (
          getBestOffsetDistance(a.exactStarts, normalizedLocator.selectedStart)
          - getBestOffsetDistance(b.exactStarts, normalizedLocator.selectedStart)
        ))
        .map((match) => match.message);
    }

    return [];
  }

  function scoreMessageLocatorMatch(message, index, locator, selector) {
    let score = 0;
    const hasAssistantIndex = Number.isFinite(locator.assistantIndex) && locator.assistantIndex >= 0;
    const indexDistance = hasAssistantIndex
      ? Math.abs(index - locator.assistantIndex)
      : Number.POSITIVE_INFINITY;

    if (indexDistance === 0) {
      score += 3;
    } else if (indexDistance <= 2) {
      score += 2 - indexDistance * 0.5;
    } else if (Number.isFinite(indexDistance)) {
      score -= Math.min(3, indexDistance / 6);
    }

    score += scoreStableAttributeMatches(message, locator.stableAttributes);
    if (locator.stableMessageId && getStableMessageId(message) === locator.stableMessageId) {
      score += 6;
    }

    const previousUserSummary = createMessageSummary(findPreviousUserMessageForAssistant(message));
    score += scoreTextSimilarity(previousUserSummary, locator.previousUserSummary, 7);

    if (selector?.exact) {
      const snapshot = collectVisibleText(message);
      const exactStarts = findTextOccurrences(snapshot.text, selector.exact);
      if (exactStarts.length > 0) {
        score += 4;
        score += scoreSelectorContextPresence(snapshot.text, selector);

        if (Number.isFinite(locator.selectedStart)) {
          const bestDistance = Math.min(...exactStarts.map((start) => Math.abs(start - locator.selectedStart)));
          score += Math.max(0, 2 - bestDistance / 350);
        }
      } else {
        score -= 5;
      }
    }

    return score;
  }

  function scoreStableAttributeMatches(message, stableAttributes) {
    if (!stableAttributes || stableAttributes.length === 0) {
      return 0;
    }

    return stableAttributes.reduce((score, attribute) => {
      const exactDepthElement = getAncestorAtDepth(message, attribute.depth);
      const weight = getStableAttributeWeight(attribute);
      if (exactDepthElement && exactDepthElement.getAttribute(attribute.name) === attribute.value) {
        return score + weight;
      }

      const nearbyMatch = getAncestorChain(message, MESSAGE_LOCATOR_ATTRIBUTE_DEPTH + 2)
        .some((element) => element.getAttribute(attribute.name) === attribute.value);
      return nearbyMatch ? score + weight / 2 : score;
    }, 0);
  }

  function getStableMessageId(message) {
    const adapterId = activeAdapter.getStableMessageId?.(message);
    if (adapterId) {
      return String(adapterId);
    }

    return message?.getAttribute?.("data-message-id")
      || message?.getAttribute?.("data-testid")
      || message?.id
      || "";
  }

  function getStableAttributeWeight(attribute) {
    if (attribute.name === "id") {
      return 5;
    }
    if (/^data-(message|turn|conversation|test)/.test(attribute.name)) {
      return 4;
    }
    if (attribute.name === "data-content") {
      return 2;
    }
    if (attribute.name === "aria-label") {
      return 1.5;
    }
    if (attribute.name === "data-message-author-role") {
      return 0.5;
    }
    return attribute.name.startsWith("data-") ? 2 : 1;
  }

  function scoreTextSimilarity(currentText, savedText, maxScore) {
    return core.scoreTextSimilarity(currentText, savedText, maxScore);
  }

  function scoreSelectorContextPresence(text, selector) {
    return core.scoreSelectorContextPresence(text, selector);
  }

  function findTextOccurrences(text, exact) {
    return core.findTextOccurrences(text, exact);
  }

  function getBestOffsetDistance(starts, selectedStart) {
    if (!Number.isFinite(selectedStart)) {
      return 0;
    }

    return Math.min(...starts.map((start) => Math.abs(start - selectedStart)));
  }

  function collectAssistantMessageElements() {
    const platformMatches = activeAdapter.collectAssistantMessageElements?.() || [];
    const selectors = getAssistantMessageSelectors();
    const selectorMatches = selectors.flatMap((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector));
      } catch (error) {
        console.debug("[AskAnchor] Ignored invalid assistant selector:", selector, error);
        return [];
      }
    });

    return removeNestedMessageElements(uniqueElements([...platformMatches, ...selectorMatches])
      .filter((node) => !isInsideEditable(node))
      .filter((node) => !isInsideUserMessage(node))
      .filter((node) => !node.closest(`#${DOCK_ID}, #${PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`))
      .filter((node) => isVisible(node))
      .filter((node) => normalizeComparableText(node.innerText || node.textContent || "").length > 1));
  }

  function getAssistantMessageSelectors() {
    const platformSelectors = [
      ...activeAdapter.assistantSelectors,
      "[data-message-author-role='assistant']",
      "model-response",
      "[data-content='ai-message']"
    ];

    if (activeAdapter.name === "fallback") {
      platformSelectors.push(
        "[data-testid*='assistant']",
        "[data-testid*='answer']",
        ".markdown",
        ".prose",
        "[class*='assistant']",
        "[class*='answer']",
        "[class*='response']",
        "[class*='markdown']"
      );
    }

    return platformSelectors;
  }

  function removeNestedMessageElements(elements) {
    return elements.filter((element) => !elements.some((other) => other !== element && other.contains(element)));
  }

  function findMatchingMessageElement(messageElement, assistantMessages) {
    return assistantMessages.find((message) => message === messageElement)
      || assistantMessages.find((message) => message.contains(messageElement))
      || assistantMessages.find((message) => messageElement.contains(message))
      || null;
  }

  function findPreviousUserMessageForAssistant(messageElement) {
    if (!messageElement) {
      return null;
    }

    return collectUserMessageElements()
      .filter((userMessage) => isElementBefore(userMessage, messageElement))
      .pop() || null;
  }

  function isElementBefore(left, right) {
    if (!left || !right || left === right) {
      return false;
    }

    return Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function extractStableAttributes(element) {
    const seen = new Set();
    return getAncestorChain(element, MESSAGE_LOCATOR_ATTRIBUTE_DEPTH)
      .flatMap((node, depth) => getStableAttributesForElement(node, depth))
      .filter((attribute) => {
        const key = `${attribute.depth}:${attribute.name}:${attribute.value}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 30);
  }

  function getStableAttributesForElement(element, depth) {
    if (!element?.attributes) {
      return [];
    }

    return Array.from(element.attributes)
      .filter((attribute) => isStableAttributeName(attribute.name))
      .map((attribute) => ({
        name: attribute.name,
        value: String(attribute.value || "").trim().slice(0, 220),
        depth,
        tag: element.tagName.toLowerCase()
      }))
      .filter((attribute) => attribute.value.length > 0);
  }

  function isStableAttributeName(name) {
    return name === "id"
      || name === "aria-label"
      || name === "data-testid"
      || name === "data-message-author-role"
      || name === "data-content"
      || name.startsWith("data-");
  }

  function getAncestorChain(element, maxDepth) {
    const chain = [];
    let current = element;
    let depth = 0;
    while (current && depth <= maxDepth) {
      chain.push(current);
      current = current.parentElement;
      depth += 1;
    }
    return chain;
  }

  function getAncestorAtDepth(element, targetDepth) {
    let current = element;
    let depth = 0;
    while (current && depth < targetDepth) {
      current = current.parentElement;
      depth += 1;
    }
    return current || null;
  }

  function createMessageSummary(messageElement) {
    return normalizeComparableText(messageElement?.innerText || messageElement?.textContent || "")
      .slice(0, MESSAGE_LOCATOR_SUMMARY_LENGTH);
  }

  function getConversationUrl() {
    return `${location.origin}${location.pathname}${location.search}`;
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
    if (!element || isInsideEditable(element) || element.closest(`#${DOCK_ID}, #${PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`)) {
      return null;
    }

    const adapterMatch = activeAdapter.findAssistantMessageElement?.(element);
    if (adapterMatch && !isInsideUserMessage(adapterMatch)) {
      return adapterMatch;
    }

    const platformMatch = closestFromSelectors(element, activeAdapter.assistantSelectors);
    if (platformMatch && !isInsideUserMessage(platformMatch)) {
      return platformMatch;
    }

    const fallbackMatch = closestFromSelectors(element, [
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

    if (
      fallbackMatch
      && !isInsideUserMessage(fallbackMatch)
      && !isInsideEditable(fallbackMatch)
      && !fallbackMatch.closest(`#${DOCK_ID}, #${PANEL_ID}, #${BUTTON_ID}, #${TOAST_ID}`)
    ) {
      return fallbackMatch;
    }

    return null;
  }

  function collectUserMessageElements() {
    const platformMatches = activeAdapter.collectUserMessageElements?.() || [];
    const selectors = [
      ...activeAdapter.userSelectors,
      "[data-message-author-role='user']",
      "user-query",
      "[data-content='user-message']"
    ];

    if (activeAdapter.name === "fallback") {
      selectors.push(
      "[data-testid*='user']",
      "[data-testid*='query']",
      "[class*='user']",
      "[class*='human']",
      "[class*='question']",
      "[class*='query']"
      );
    }

    const selectorMatches = selectors.flatMap((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector));
      } catch (error) {
        console.debug("[AskAnchor] Ignored invalid user selector:", selector, error);
        return [];
      }
    });

    return uniqueElements([...platformMatches, ...selectorMatches])
      .filter((node) => !isInsideEditable(node))
      .filter((node) => normalizeComparableText(node.innerText || node.textContent || "").length > 1);
  }

  function getActiveAdapter() {
    return globalThis.AskAnchorPlatformAdapters?.getActiveAdapter?.() || {
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
    if (activeAdapter.isInsideUserMessage?.(element)) {
      return true;
    }

    const userSelectors = [
      ...activeAdapter.userSelectors,
      "[data-message-author-role='user']",
      "user-query",
      "[data-content='user-message']"
    ];

    if (activeAdapter.name === "fallback" || activeAdapter.name === "generic") {
      userSelectors.push(
      "[data-testid*='user']",
      "[data-testid*='query']",
      "[class*='user']",
      "[class*='human']",
      "[class*='question']",
      "[class*='query']"
      );
    }

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

  function matchesAnySelector(element, selectors) {
    return selectors.filter(Boolean).some((selector) => {
      try {
        return element.matches(selector);
      } catch (error) {
        console.debug("[AskAnchor] Ignored invalid selector:", selector, error);
        return false;
      }
    });
  }

  function hasDescendantMatchingAnySelector(element, selectors) {
    return selectors.filter(Boolean).some((selector) => {
      try {
        return Boolean(element.querySelector(selector));
      } catch (error) {
        console.debug("[AskAnchor] Ignored invalid selector:", selector, error);
        return false;
      }
    });
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
    return core.normalizeComparableText(text);
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

      return {
        createMessageLocator,
        normalizeMessageLocator,
        normalizeStableAttribute,
        resolveMessageElement,
        resolveMessageElements,
        scoreMessageLocatorMatch,
        scoreStableAttributeMatches,
        getStableMessageId,
        getStableAttributeWeight,
        scoreTextSimilarity,
        scoreSelectorContextPresence,
        findTextOccurrences,
        getBestOffsetDistance,
        collectAssistantMessageElements,
        getAssistantMessageSelectors,
        removeNestedMessageElements,
        findMatchingMessageElement,
        findPreviousUserMessageForAssistant,
        isElementBefore,
        extractStableAttributes,
        getStableAttributesForElement,
        isStableAttributeName,
        getAncestorChain,
        getAncestorAtDepth,
        createMessageSummary,
        getConversationUrl,
        showToast,
        findAssistantMessageElement,
        collectUserMessageElements,
        getActiveAdapter,
        inferRoleFromNode,
        isInsideUserMessage,
        isInsideEditable,
        isVisible,
        closestFromSelectors,
        matchesAnySelector,
        hasDescendantMatchingAnySelector,
        uniqueElements,
        getRangeRect,
        normalizeComparableText,
        delay
      };
    }
  };
})(globalThis);
