import { beforeEach, describe, expect, it } from "vitest";

describe("platform catalog", () => {
  beforeEach(() => {
    delete globalThis.AskAnchorPlatforms;
    delete require.cache[require.resolve("../src/platforms.js")];
    require("../src/platforms.js");
  });

  it("registers all supported platforms with enabled defaults", () => {
    const defaults = globalThis.AskAnchorPlatforms.getDefaultEnabledPlatforms();

    expect(globalThis.AskAnchorPlatforms.platforms).toHaveLength(11);
    expect(Object.values(defaults)).toEqual(Array(11).fill(true));
  });

  it("looks up known platforms by id and exact host", () => {
    expect(globalThis.AskAnchorPlatforms.getPlatformById("chatgpt")).toMatchObject({
      id: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"]
    });
    expect(globalThis.AskAnchorPlatforms.getPlatformForHost("claude.ai")).toMatchObject({
      id: "claude"
    });
  });

  it("returns null for unsupported ids and hosts", () => {
    expect(globalThis.AskAnchorPlatforms.getPlatformById("unknown")).toBeNull();
    expect(globalThis.AskAnchorPlatforms.getPlatformForHost("example.com")).toBeNull();
  });
});
