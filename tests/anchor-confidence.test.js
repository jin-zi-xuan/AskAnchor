import { beforeEach, describe, expect, it, vi } from "vitest";

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

function installQuoteCardDocument() {
  const elements = new Map();

  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.className = "";
      this.textContent = "";
    }

    appendChild(child) {
      this.children.push(child);
      return child;
    }

    append(...children) {
      children.forEach((child) => this.appendChild(child));
    }

    setAttribute() {}

    addEventListener() {}

    remove() {
      if (this.id) elements.delete(this.id);
    }
  }

  const documentElement = new FakeElement("html");
  const appendChild = documentElement.appendChild.bind(documentElement);
  documentElement.appendChild = (child) => {
    appendChild(child);
    if (child.id) elements.set(child.id, child);
    return child;
  };
  globalThis.document = {
    documentElement,
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => elements.get(id) || null
  };
  return elements;
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

  it("builds a fallback quote from the saved selection and context", () => {
    const anchors = createAnchors();

    expect(anchors.getAnchorQuoteCardContent({
      text: "选中的原文",
      selector: { exact: "选中的原文", prefix: "前文", suffix: "后文" }
    }, "message")).toEqual({
      text: "选中的原文",
      prefix: "前文",
      suffix: "后文",
      locationLabel: "已回到对应回答"
    });
  });

  it("labels a restored reading position honestly", () => {
    const anchors = createAnchors();

    expect(anchors.getAnchorQuoteCardContent({ text: "旧锚点原文" }, "scroll"))
      .toEqual({
        text: "旧锚点原文",
        prefix: "",
        suffix: "",
        locationLabel: "已恢复保存时的阅读位置"
      });
  });

  it("does not claim a scroll fallback restored the reading position", () => {
    const anchors = createAnchors();

    expect(anchors.getAnchorQuoteCardContent({ text: "旧锚点原文" }, "unavailable"))
      .toMatchObject({ locationLabel: "未能恢复页面阅读位置" });
  });

  it("restores the live chat scroll container before the window", () => {
    const anchors = createAnchors();
    const containerScrollTo = vi.fn(({ top }) => { container.scrollTop = top; });
    const windowScrollTo = vi.fn();
    const container = { scrollTop: 100, scrollTo: containerScrollTo };
    globalThis.document = { contains: (node) => node === container };
    globalThis.window = { scrollY: 0, scrollTo: windowScrollTo };

    expect(anchors.scrollToAnchorSavedPosition({
      scrollPosition: { container, containerTop: 420, windowTop: 0 }
    })).toBe(true);
    expect(containerScrollTo).toHaveBeenCalledWith({ top: 420, behavior: "instant" });
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("renders one dismissible quote card from saved anchor text", () => {
    const elements = installQuoteCardDocument();
    const anchors = createAnchors();

    const card = anchors.showAnchorQuoteCard({
      text: "保存的原文",
      selector: { prefix: "前文", suffix: "后文" }
    }, "message");

    expect(elements.get("ask-anchor-quote-card")).toBe(card);
    expect(card.children[1].textContent).toBe("保存的原文");
    anchors.clearAnchorQuoteCard();
    expect(elements.get("ask-anchor-quote-card")).toBeUndefined();
  });

  it("accepts a stable selection when one context side is reformatted", () => {
    const anchors = createAnchors({ SELECTION_CONTEXT_LENGTH: 80 });
    const messageRoot = {
      closest: () => null,
      parentElement: null,
      tagName: "DIV"
    };
    const textNode = {
      nodeType: 3,
      textContent: "正确的前文重复文本错误的后文",
      parentElement: messageRoot
    };
    const range = {
      startContainer: textNode,
      startOffset: 5,
      endContainer: textNode,
      endOffset: 9,
      toString: () => "重复文本"
    };
    const documentElement = {};
    messageRoot.parentElement = documentElement;
    globalThis.NodeFilter = {
      SHOW_TEXT: 4,
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2
    };
    globalThis.document = {
      documentElement,
      createTreeWalker: () => {
        let visited = false;
        return {
          nextNode: () => {
            if (visited) return null;
            visited = true;
            return textNode;
          }
        };
      }
    };
    globalThis.window = {
      getComputedStyle: () => ({ display: "block", visibility: "visible" })
    };

    expect(anchors.doesRestoredRangeContextMatch(range, messageRoot, {
      prefix: "正确的前文",
      suffix: "原来的后文"
    })).toBe(true);
  });

  it("ignores dynamic data attributes as message identity", () => {
    const dom = createDom();

    expect(dom.isStableAttributeName("data-message-id")).toBe(true);
    expect(dom.isStableAttributeName("data-index")).toBe(false);
    expect(dom.isStableAttributeName("data-state")).toBe(false);
  });
});
