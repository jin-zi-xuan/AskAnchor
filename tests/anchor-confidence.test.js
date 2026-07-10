import { beforeEach, describe, expect, it } from "vitest";

const core = require("../src/core.js");

function createAnchors(overrides = {}) {
  globalThis.AskAnchorModules = {};
  globalThis.Node = { ELEMENT_NODE: 1 };
  delete require.cache[require.resolve("../src/content/anchors.js")];
  require("../src/content/anchors.js");

  return globalThis.AskAnchorModules.anchors({
    core,
    isInsideUserMessage: () => false,
    findAssistantMessageElement: () => ({}),
    ...overrides
  });
}

function createRange(text) {
  const parentElement = {};
  const textNode = { nodeType: 3, parentElement };
  return {
    startContainer: textNode,
    endContainer: textNode,
    commonAncestorContainer: textNode,
    toString: () => text
  };
}

function createDom() {
  globalThis.AskAnchorModules = {};
  delete require.cache[require.resolve("../src/content/dom.js")];
  require("../src/content/dom.js");
  return globalThis.AskAnchorModules.dom({ core });
}

describe("restored anchor confidence", () => {
  beforeEach(() => {
    delete globalThis.AskAnchorModules;
  });

  it("rejects a matching range inside a user message", () => {
    const anchors = createAnchors({ isInsideUserMessage: () => true });
    const range = createRange("需要注意的是");
    const messageRoot = { contains: () => true };

    expect(anchors.isTrustedRestoredRange(
      range,
      messageRoot,
      { normalizedText: "需要注意的是" },
      null
    )).toBe(false);
  });

  it("rejects a range whose restored text differs", () => {
    const anchors = createAnchors();
    const range = createRange("下一段内容");
    const messageRoot = { contains: () => true };

    expect(anchors.isTrustedRestoredRange(
      range,
      messageRoot,
      { normalizedText: "上面那段内容" },
      null
    )).toBe(false);
  });

  it("ignores dynamic data attributes as message identity", () => {
    const dom = createDom();

    expect(dom.isStableAttributeName("data-message-id")).toBe(true);
    expect(dom.isStableAttributeName("data-index")).toBe(false);
    expect(dom.isStableAttributeName("data-state")).toBe(false);
  });
});
