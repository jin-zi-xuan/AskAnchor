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
      stableAttributes: [
        { name: " data-message-id ", value: " abc ", depth: 2, tag: "DIV" },
        { name: "", value: "missing-name" },
        null
      ],
      previousUserSummary: `hello\n${"x".repeat(300)}`,
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
    expect(locator.previousUserSummary).toHaveLength(220);
  });
});

describe("branch state normalization", () => {
  it("accepts only known persisted statuses", () => {
    expect(core.normalizeBranchStatus("sent")).toBe("sent");
    expect(core.normalizeBranchStatus("done")).toBe("done");
    expect(core.normalizeBranchStatus("queued")).toBe("draft");
    expect(core.normalizeBranchStatus(undefined)).toBe("draft");
  });

  it("normalizes empty and long titles", () => {
    expect(core.normalizeBranchTitle(" \n\t ")).toBe("未命名分支");
    expect(core.normalizeBranchTitle("  follow up  question  ")).toBe("follow up question");
    expect(core.normalizeBranchTitle("abcdefghijklmnopqrstuvwxyz0123456789")).toBe("abcdefghijklmnopqrstuvwxyz...");
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
