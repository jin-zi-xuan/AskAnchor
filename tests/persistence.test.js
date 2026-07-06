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
    MAX_BRANCHES: 20,
    ANCHOR_STATUS_UNRESOLVED: "unresolved",
    ANCHOR_STATUS_UNDERSTOOD: "understood",
    UNNAMED_ANCHOR_NAME: "未命名锚点",
    ANCHOR_NAME_LENGTH: 28,
    STORAGE_KEY_PREFIX: "ask-anchor:anchors:",
    BRANCH_STORAGE_KEY_PREFIX: "ask-anchor:branches:",
    DOCK_ID: "ask-anchor-anchor-dock",
    LIST_ID: "ask-anchor-anchor-list",
    PANEL_ID: "ask-anchor-anchor-panel",
    PANEL_LIST_ID: "ask-anchor-anchor-panel-list",
    BUTTON_ID: "ask-anchor-explain-button",
    TOAST_ID: "ask-anchor-toast",
    BRANCH_PANEL_ID: "ask-anchor-branch-panel",
    BRANCH_LIST_ID: "ask-anchor-branch-list",
    DEFAULT_FOLLOW_UP_TEMPLATE_ID: "explain",
    BRANCH_STATUS_DRAFT: "draft",
    BRANCH_STATUS_SENT: "sent",
    BRANCH_STATUS_DONE: "done",
    anchors: [],
    branches: [],
    activeAnchorId: null,
    activeBranchId: null,
    activeBranchAnchorId: null,
    editingBranchId: null,
    activeAnchorStorageKey: null,
    activeBranchStorageKey: null,
    core,
    getExtensionStorageArea: () => ({ get() {}, set() {} }),
    getPersistentStorageItem: (key) => Promise.resolve({ [key]: localStore.get(key) }),
    setPersistentStorageItem: (key, value) => {
      localStore.set(key, value);
    },
    normalizeMessageLocator: core.normalizeMessageLocator,
    renderAnchorDock() {},
    renderBranchPanel() {},
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

describe("branch persistence", () => {
  let localStore;
  let session;
  let branchesModule;

  beforeEach(() => {
    localStore = new Map();
    session = installBrowserGlobals();
    globalThis.AskAnchorModules = {};
    branchesModule = loadContentModule("../src/content/branches.js", "branches");
  });

  it("persists branches to extension storage", () => {
    const ctx = createBaseCtx(localStore);
    const branches = branchesModule(ctx);
    const key = branches.getBranchStorageKey();

    ctx.branches = [{
      id: "b1",
      anchorId: "a1",
      title: "Branch one",
      prompt: "Explain this",
      status: "sent",
      createdAt: 1,
      updatedAt: 2
    }];

    branches.persistBranchesToSession();

    expect(JSON.parse(session.get(key))).toHaveLength(1);
    expect(localStore.get(key)).toEqual([{
      id: "b1",
      anchorId: "a1",
      title: "Branch one",
      prompt: "Explain this",
      status: "sent",
      createdAt: 1,
      updatedAt: 2
    }]);
  });

  it("restores branches from extension storage when session storage is empty", async () => {
    const ctx = createBaseCtx(localStore);
    const branches = branchesModule(ctx);
    const key = branches.getBranchStorageKey();
    localStore.set(key, [{
      id: "b2",
      anchorId: "a2",
      title: "Restored branch",
      prompt: "Continue",
      status: "done",
      createdAt: 3,
      updatedAt: 4
    }]);

    branches.loadBranchesFromSession();
    await flushPromises();

    expect(ctx.branches).toHaveLength(1);
    expect(ctx.branches[0]).toMatchObject({
      id: "b2",
      anchorId: "a2",
      status: "done"
    });
  });

  it("migrates legacy session branches into extension storage", async () => {
    const ctx = createBaseCtx(localStore);
    const branches = branchesModule(ctx);
    const key = branches.getBranchStorageKey();
    session.set(key, JSON.stringify([{
      id: "legacy-b",
      anchorId: "legacy-a",
      title: "Legacy branch",
      prompt: "Old prompt",
      status: "sent",
      createdAt: 5,
      updatedAt: 6
    }]));

    branches.loadBranchesFromSession();
    await flushPromises();

    expect(ctx.branches[0]).toMatchObject({ id: "legacy-b", anchorId: "legacy-a" });
    expect(localStore.get(key)).toHaveLength(1);
    expect(localStore.get(key)[0]).toMatchObject({ id: "legacy-b", status: "sent" });
  });
});
