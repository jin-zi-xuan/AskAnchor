(function registerAskAnchorCore(global) {
  const SETTINGS_SCHEMA_VERSION = 1;
  const MESSAGE_LOCATOR_SUMMARY_LENGTH = 220;
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
      assistantTextHash: typeof locator.assistantTextHash === "string" ? locator.assistantTextHash.slice(0, 64) : "",
      stableAttributes: Array.isArray(locator.stableAttributes)
        ? locator.stableAttributes
          .map(normalizeStableAttribute)
          .filter(Boolean)
          .slice(0, 30)
        : [],
      previousUserSummary: normalizeComparableText(locator.previousUserSummary).slice(0, MESSAGE_LOCATOR_SUMMARY_LENGTH),
      previousUserHash: typeof locator.previousUserHash === "string" ? locator.previousUserHash.slice(0, 64) : "",
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

  function hashComparableText(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }

    let hash = 2166136261;
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function selectUniqueBestMatch(matches, minimumScore = 0, minimumMargin = 0) {
    const sorted = (Array.isArray(matches) ? matches : [])
      .filter((match) => match && Number.isFinite(match.score))
      .sort((left, right) => right.score - left.score);
    const best = sorted[0];
    if (!best || best.score < minimumScore) {
      return null;
    }

    const runnerUp = sorted[1];
    if (runnerUp && best.score - runnerUp.score < minimumMargin) {
      return null;
    }

    return best;
  }

  const api = {
    DEFAULT_SETTINGS,
    normalizeComparableText,
    normalizeEnabledPlatforms,
    normalizeSettings,
    normalizeMessageLocator,
    normalizeStableAttribute,
    scoreTextSimilarity,
    scoreSelectorContextPresence,
    findTextOccurrences,
    hashComparableText,
    selectUniqueBestMatch
  };

  global.AskAnchorCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
