import { beforeEach, describe, expect, it } from "vitest";

const core = require("../src/core.js");

function installBrowserGlobals() {
  const session = new Map();

  class FakeElement {
    constructor(id = "") {
      this.id = id;
      this.children = [];
      this.className = "";
      this.hidden = false;
      this.style = {};
      this.dataset = {};
      this.classList = {
        add() {},
        remove() {},
        toggle() {}
      };
    }

    appendChild(child) {
      this.children.push(child);
      return child;
    }

    addEventListener() {}

    setAttribute(name, value) {
      this[name] = value;
    }

    querySelector() {
      return new FakeElement();
    }

    closest() {
      return null;
    }
  }

  const dock = new FakeElement("ask-anchor-anchor-dock");
  const elements = new Map([
    ["ask-anchor-anchor-dock", dock]
  ]);

  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      origin: "https://chatgpt.com",
      pathname: "/c/abc",
      search: "?model=test"
    }
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => session.get(key) || null,
      setItem: (key, value) => session.set(key, String(value)),
      removeItem: (key) => session.delete(key),
      clear: () => session.clear()
    }
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      scrollY: 320
    }
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: new FakeElement("body"),
      documentElement: new FakeElement("html"),
      getElementById: (id) => elements.get(id) || null,
      createElement: () => new FakeElement()
    }
  });

  return session;
}

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

function loadContentModule(modulePath, moduleName) {
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
  return globalThis.AskAnchorModules[moduleName];
}

function createBaseCtx(localStore) {
  return {
    MAX_ANCHORS: 50,
    ANCHOR_STATUS_UNRESOLVED: "unresolved",
    ANCHOR_STATUS_UNDERSTOOD: "understood",
    UNNAMED_ANCHOR_NAME: "Unnamed anchor",
    ANCHOR_NAME_LENGTH: 28,
    STORAGE_KEY_PREFIX: "ask-anchor:anchors:",
    DOCK_ID: "ask-anchor-anchor-dock",
    LIST_ID: "ask-anchor-anchor-list",
    PANEL_ID: "ask-anchor-anchor-panel",
    PANEL_LIST_ID: "ask-anchor-anchor-panel-list",
    BUTTON_ID: "ask-anchor-explain-button",
    TOAST_ID: "ask-anchor-toast",
    DEFAULT_FOLLOW_UP_TEMPLATE_ID: "explain",
    anchors: [],
    activeAnchorId: null,
    activeAnchorStorageKey: null,
    core,
    getExtensionStorageArea: () => ({ get() {}, set() {} }),
    getPersistentStorageItem: (key) => Promise.resolve({ [key]: localStore.get(key) }),
    setPersistentStorageItem: (key, value) => {
      localStore.set(key, value);
    },
    normalizeMessageLocator: core.normalizeMessageLocator,
    renderAnchorDock() {},
    closeAnchorList() {},
    resetConversationTimeline() {},
    observeConversationRoot() {},
    scheduleConversationTimelineRender() {},
    ensureCatFaceLayers() {},
    updateConversationTimeline() {},
    updateCatDockPosition() {},
    showToast() {}
  };
}

describe("anchor persistence", () => {
  let localStore;
  let session;
  let anchorsModule;

  beforeEach(() => {
    localStore = new Map();
    session = installBrowserGlobals();
    globalThis.AskAnchorModules = {};
    anchorsModule = loadContentModule("../src/content/anchors.js", "anchors");
  });

  it("persists anchors to extension storage as the durable source", () => {
    const ctx = createBaseCtx(localStore);
    const anchors = anchorsModule(ctx);
    const key = anchors.getAnchorStorageKey();

    ctx.anchors = [{
      id: "a1",
      name: "Anchor one",
      text: "selected text",
      selector: { exact: "selected text" },
      messageLocator: null,
      scrollY: 42,
      createdAt: new Date("2026-07-06T00:00:00.000Z"),
      status: "understood"
    }];

    anchors.persistAnchorsToSession();

    expect(JSON.parse(session.get(key))).toHaveLength(1);
    expect(localStore.get(key)).toEqual([{
      id: "a1",
      name: "Anchor one",
      text: "selected text",
      selector: { exact: "selected text" },
      messageLocator: null,
      scrollY: 42,
      createdAt: "2026-07-06T00:00:00.000Z",
      status: "understood"
    }]);
  });

  it("persists deterministic message and selection identity", () => {
    const ctx = createBaseCtx(localStore);
    const anchors = anchorsModule(ctx);
    const key = anchors.getAnchorStorageKey();
    ctx.anchors = [{
      id: "v2-anchor",
      name: "Repeated text",
      text: "需要注意的是",
      selector: { exact: "需要注意的是", prefix: "第一段", suffix: "后文", start: 20, end: 27 },
      messageLocator: {
        platform: "chatgpt",
        conversationUrl: "https://chatgpt.com/c/abc?model=test",
        assistantIndex: 2,
        assistantTextHash: "answer-hash",
        previousUserHash: "question-hash"
      },
      anchorVersion: 2,
      blockLocator: { tag: "p", index: 3, textHash: "block-hash" },
      selectionLocator: {
        normalizedText: "需要注意的是",
        normalizedStart: 4,
        occurrenceIndexInBlock: 1,
        occurrenceCountInBlock: 2
      },
      scrollY: 120,
      createdAt: new Date("2026-07-06T00:00:00.000Z"),
      status: "unresolved"
    }];

    anchors.persistAnchorsToSession();

    expect(localStore.get(key)[0]).toMatchObject({
      anchorVersion: 2,
      messageLocator: {
        assistantTextHash: "answer-hash",
        previousUserHash: "question-hash"
      },
      blockLocator: { textHash: "block-hash" },
      selectionLocator: {
        occurrenceIndexInBlock: 1,
        occurrenceCountInBlock: 2
      }
    });
  });

  it("restores anchors from extension storage when session storage is empty", async () => {
    const ctx = createBaseCtx(localStore);
    const anchors = anchorsModule(ctx);
    const key = anchors.getAnchorStorageKey();
    localStore.set(key, [{
      id: "a2",
      name: "Restored",
      text: "saved text",
      selector: null,
      scrollY: 9,
      createdAt: "2026-07-06T00:00:00.000Z",
      status: "unresolved"
    }]);

    anchors.loadAnchorsFromSession();
    await flushPromises();

    expect(ctx.anchors).toHaveLength(1);
    expect(ctx.anchors[0]).toMatchObject({
      id: "a2",
      name: "Restored",
      text: "saved text",
      status: "unresolved"
    });
  });

  it("migrates legacy session anchors into extension storage", async () => {
    const ctx = createBaseCtx(localStore);
    const anchors = anchorsModule(ctx);
    const key = anchors.getAnchorStorageKey();
    session.set(key, JSON.stringify([{
      id: "legacy-a",
      name: "Legacy",
      text: "legacy text",
      selector: null,
      scrollY: 11,
      createdAt: "2026-07-06T00:00:00.000Z",
      status: "understood"
    }]));

    anchors.loadAnchorsFromSession();
    await flushPromises();

    expect(ctx.anchors[0]).toMatchObject({ id: "legacy-a", name: "Legacy" });
    expect(localStore.get(key)).toHaveLength(1);
    expect(localStore.get(key)[0]).toMatchObject({ id: "legacy-a", status: "understood" });
  });
});
