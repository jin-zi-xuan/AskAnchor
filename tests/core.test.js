import { describe, expect, it } from "vitest";

const core = require("../src/core.js");

const platformApi = {
  platforms: [
    { id: "chatgpt" },
    { id: "claude" },
    { id: "gemini" }
  ],
  getDefaultEnabledPlatforms() {
    return {
      chatgpt: true,
      claude: true,
      gemini: true
    };
  }
};

describe("settings normalization", () => {
  it("falls back to defaults for missing or invalid settings", () => {
    expect(core.normalizeSettings(null, platformApi)).toEqual({
      schemaVersion: 1,
      showCat: true,
      catDefaultPosition: "editor",
      timelineMode: "auto",
      eyeTracking: true,
      enabledPlatforms: {
        chatgpt: true,
        claude: true,
        gemini: true
      }
    });

    expect(core.normalizeSettings({
      showCat: "yes",
      catDefaultPosition: "floating",
      timelineMode: "sometimes",
      eyeTracking: 1
    }, platformApi)).toMatchObject({
      showCat: true,
      catDefaultPosition: "editor",
      timelineMode: "auto",
      eyeTracking: true
    });
  });

  it("preserves valid settings and normalizes supported platform switches", () => {
    expect(core.normalizeSettings({
      showCat: false,
      catDefaultPosition: "custom",
      timelineMode: "off",
      eyeTracking: false,
      enabledPlatforms: {
        claude: false,
        unknown: false
      }
    }, platformApi)).toEqual({
      schemaVersion: 1,
      showCat: false,
      catDefaultPosition: "custom",
      timelineMode: "off",
      eyeTracking: false,
      enabledPlatforms: {
        chatgpt: true,
        claude: false,
        gemini: true,
        unknown: false
      }
    });
  });
});

describe("message locator normalization", () => {
  it("sanitizes locator fields and stable attributes", () => {
    const locator = core.normalizeMessageLocator({
      platform: "chatgpt",
      conversationUrl: 42,
      assistantIndex: -3,
      stableMessageId: "x".repeat(230),
      assistantTextHash: "a".repeat(80),
      stableAttributes: [
        { name: " data-message-id ", value: " abc ", depth: 2, tag: "DIV" },
        { name: "", value: "missing-name" },
        null
      ],
      previousUserSummary: `hello\n${"x".repeat(300)}`,
      previousUserHash: "p".repeat(80),
      selectedStart: 12,
      selectedEnd: Number.NaN
    });

    expect(locator).toMatchObject({
      platform: "chatgpt",
      conversationUrl: "",
      assistantIndex: -1,
      stableAttributes: [
        { name: "data-message-id", value: "abc", depth: 2, tag: "div" }
      ],
      selectedStart: 12,
      selectedEnd: null
    });
    expect(locator.stableMessageId).toHaveLength(220);
    expect(locator.assistantTextHash).toHaveLength(64);
    expect(locator.previousUserSummary).toHaveLength(220);
    expect(locator.previousUserHash).toHaveLength(64);
  });
});

describe("text matching helpers", () => {
  it("normalizes comparable text with whitespace collapse and length cap", () => {
    expect(core.normalizeComparableText("  one\n\n two\tthree  ")).toBe("one two three");
    expect(core.normalizeComparableText("x".repeat(6000))).toHaveLength(5000);
  });

  it("finds all non-overlapping exact text occurrences", () => {
    expect(core.findTextOccurrences("alpha beta alpha", "alpha")).toEqual([0, 11]);
    expect(core.findTextOccurrences("aaaa", "aa")).toEqual([0, 1, 2]);
    expect(core.findTextOccurrences("", "aa")).toEqual([]);
  });

  it("hashes the complete normalized text", () => {
    const sharedPrefix = "x".repeat(140);
    expect(core.hashComparableText(`${sharedPrefix} first`))
      .not.toBe(core.hashComparableText(`${sharedPrefix} second`));
    expect(core.hashComparableText(" one\n two ")).toBe(core.hashComparableText("one two"));
  });

  it("rejects an ambiguous best match", () => {
    const match = core.selectUniqueBestMatch([
      { id: "first", score: 12 },
      { id: "second", score: 11 }
    ], 7, 2);

    expect(match).toBeNull();
  });

  it("accepts a uniquely stronger match", () => {
    const match = core.selectUniqueBestMatch([
      { id: "first", score: 14 },
      { id: "second", score: 10 }
    ], 7, 2);

    expect(match?.id).toBe("first");
  });

  it("rejects a sole low-confidence match", () => {
    expect(core.selectUniqueBestMatch([
      { id: "only", score: 6 }
    ], 7, 2)).toBeNull();
  });

  it("scores exact, saved-fragment, current-fragment, and missing similarity", () => {
    expect(core.scoreTextSimilarity("same text", "same text", 4)).toBe(4);
    expect(core.scoreTextSimilarity("prefix saved fragment suffix", "saved fragment", 4)).toBeCloseTo(2.8);
    expect(core.scoreTextSimilarity("saved fragment", "prefix saved fragment suffix", 4)).toBe(2);
    expect(core.scoreTextSimilarity("alpha", "omega", 4)).toBe(0);
  });

  it("scores selector context presence independently", () => {
    expect(core.scoreSelectorContextPresence("before exact after", {
      prefix: "before",
      suffix: "after"
    })).toBe(3);
    expect(core.scoreSelectorContextPresence("before exact", {
      prefix: "before",
      suffix: "after"
    })).toBe(1.5);
  });
});
