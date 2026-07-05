(function registerAskAnchorCore(global) {
  const SETTINGS_SCHEMA_VERSION = 1;
  const MESSAGE_LOCATOR_SUMMARY_LENGTH = 220;
  const BRANCH_TITLE_LENGTH = 26;
  const BRANCH_STATUSES = Object.freeze({
    DRAFT: "draft",
    SENT: "sent",
    DONE: "done"
  });
  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    showCat: true,
    catDefaultPosition: "editor",
    timelineMode: "auto",
    eyeTracking: true,
    enabledPlatforms: {}
  });

  function normalizeComparableText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
  }

  function normalizeEnabledPlatforms(value, platformApi = global.AskAnchorPlatforms) {
    const defaultEnabledPlatforms = platformApi?.getDefaultEnabledPlatforms?.() || {};
    const enabledPlatforms = {
      ...defaultEnabledPlatforms,
      ...(value && typeof value === "object" ? value : {})
    };

    platformApi?.platforms?.forEach?.((platform) => {
      enabledPlatforms[platform.id] = enabledPlatforms[platform.id] !== false;
    });

    return enabledPlatforms;
  }

  function normalizeSettings(value, platformApi = global.AskAnchorPlatforms) {
    const source = value && typeof value === "object" ? value : {};
    return {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      showCat: typeof source.showCat === "boolean" ? source.showCat : DEFAULT_SETTINGS.showCat,
      catDefaultPosition: ["editor", "right", "custom"].includes(source.catDefaultPosition)
        ? source.catDefaultPosition
        : DEFAULT_SETTINGS.catDefaultPosition,
      timelineMode: ["auto", "on", "off"].includes(source.timelineMode)
        ? source.timelineMode
        : DEFAULT_SETTINGS.timelineMode,
      eyeTracking: typeof source.eyeTracking === "boolean" ? source.eyeTracking : DEFAULT_SETTINGS.eyeTracking,
      enabledPlatforms: normalizeEnabledPlatforms(source.enabledPlatforms, platformApi)
    };
  }

  function normalizeBranchStatus(status) {
    return status === BRANCH_STATUSES.SENT || status === BRANCH_STATUSES.DONE
      ? status
      : BRANCH_STATUSES.DRAFT;
  }

  function normalizeBranchTitle(title) {
    const normalized = String(title || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "\u672a\u547d\u540d\u5206\u652f";
    }
    if (normalized.length <= BRANCH_TITLE_LENGTH) {
      return normalized;
    }
    return `${normalized.slice(0, BRANCH_TITLE_LENGTH)}...`;
  }

  function normalizeStableAttribute(attribute) {
    if (!attribute || typeof attribute !== "object") {
      return null;
    }

    const name = String(attribute.name || "").trim();
    const value = String(attribute.value || "").trim();
    if (!name || !value) {
      return null;
    }

    return {
      name,
      value: value.slice(0, 220),
      depth: Number.isFinite(attribute.depth) ? attribute.depth : 0,
      tag: String(attribute.tag || "").trim().toLowerCase()
    };
  }

  function normalizeMessageLocator(locator) {
    if (!locator || typeof locator !== "object") {
      return null;
    }

    return {
      platform: typeof locator.platform === "string" ? locator.platform : "",
      conversationUrl: typeof locator.conversationUrl === "string" ? locator.conversationUrl : "",
      assistantIndex: Number.isFinite(locator.assistantIndex) && locator.assistantIndex >= 0 ? locator.assistantIndex : -1,
      stableMessageId: typeof locator.stableMessageId === "string" ? locator.stableMessageId.slice(0, 220) : "",
      stableAttributes: Array.isArray(locator.stableAttributes)
        ? locator.stableAttributes
          .map(normalizeStableAttribute)
          .filter(Boolean)
          .slice(0, 30)
        : [],
      previousUserSummary: normalizeComparableText(locator.previousUserSummary).slice(0, MESSAGE_LOCATOR_SUMMARY_LENGTH),
      selectedStart: Number.isFinite(locator.selectedStart) ? locator.selectedStart : null,
      selectedEnd: Number.isFinite(locator.selectedEnd) ? locator.selectedEnd : null
    };
  }

  function scoreTextSimilarity(currentText, savedText, maxScore) {
    const current = normalizeComparableText(currentText);
    const saved = normalizeComparableText(savedText);
    if (!current || !saved) {
      return 0;
    }
    if (current === saved) {
      return maxScore;
    }

    const fragment = saved.slice(0, Math.min(80, saved.length));
    if (fragment && current.includes(fragment)) {
      return maxScore * 0.7;
    }

    const currentFragment = current.slice(0, Math.min(80, current.length));
    return currentFragment && saved.includes(currentFragment) ? maxScore * 0.5 : 0;
  }

  function scoreSelectorContextPresence(text, selector) {
    let score = 0;
    if (selector?.prefix && text.includes(selector.prefix)) {
      score += 1.5;
    }
    if (selector?.suffix && text.includes(selector.suffix)) {
      score += 1.5;
    }
    return score;
  }

  function findTextOccurrences(text, exact) {
    const starts = [];
    if (!text || !exact) {
      return starts;
    }

    let index = text.indexOf(exact);
    while (index !== -1) {
      starts.push(index);
      index = text.indexOf(exact, index + 1);
    }
    return starts;
  }

  const api = {
    DEFAULT_SETTINGS,
    BRANCH_STATUSES,
    normalizeComparableText,
    normalizeEnabledPlatforms,
    normalizeSettings,
    normalizeBranchStatus,
    normalizeBranchTitle,
    normalizeMessageLocator,
    normalizeStableAttribute,
    scoreTextSimilarity,
    scoreSelectorContextPresence,
    findTextOccurrences
  };

  global.AskAnchorCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
