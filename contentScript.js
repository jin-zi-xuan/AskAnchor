(function initAskAnchor() {
  const BUTTON_ID = "ask-anchor-explain-button";
  const FOLLOW_UP_MENU_ID = "ask-anchor-follow-up-menu";
  const DOCK_ID = "ask-anchor-anchor-dock";
  const LIST_ID = "ask-anchor-anchor-list";
  const PANEL_ID = "ask-anchor-anchor-panel";
  const PANEL_LIST_ID = "ask-anchor-anchor-panel-list";
  const TIMELINE_ID = "ask-anchor-anchor-timeline";
  const TIMELINE_PREVIEW_ID = "ask-anchor-timeline-preview";
  const TOAST_ID = "ask-anchor-toast";
  const HIGHLIGHT_CLASS = "ask-anchor-highlight";
  const MARKER_CLASS = "ask-anchor-selection-marker";
  const MIN_SELECTION_LENGTH = 2;
  const MAX_ANCHORS = 50;
  const ANCHOR_NAME_LENGTH = 28;
  const SELECTION_CONTEXT_LENGTH = 100;
  const ANCHOR_STATUS_UNRESOLVED = "unresolved";
  const ANCHOR_STATUS_UNDERSTOOD = "understood";
  const UNNAMED_ANCHOR_NAME = "\u672a\u547d\u540d\u951a\u70b9";
  const MESSAGE_LOCATOR_SUMMARY_LENGTH = 220;
  const MESSAGE_LOCATOR_ATTRIBUTE_DEPTH = 2;
  const CONVERSATION_ROOT_REFRESH_DELAY = 900;
  const CONVERSATION_TIMELINE_RENDER_DELAY = 450;
  const STORAGE_KEY_PREFIX = "ask-anchor:anchors:";
  const SETTINGS_STORAGE_KEY = "askAnchorSettings";
  const LEGACY_SETTINGS_STORAGE_KEY = "ask-anchor:settings";
  const SETTINGS_SCHEMA_VERSION = 1;
  const CAT_POSITION_STORAGE_KEY = "ask-anchor:cat-position";
  const TUCKED_CAT_TOP_STORAGE_KEY = "ask-anchor:tucked-cat-top";
  const DEFAULT_FOLLOW_UP_TEMPLATE_ID = "explain";
  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    showCat: true,
    catDefaultPosition: "editor",
    timelineMode: "auto",
    eyeTracking: true,
    enabledPlatforms: {}
  });
  const COMMANDS = Object.freeze({
    OPEN_ANCHORS: "askanchor-open-anchors",
    FOLLOW_UP_SELECTION: "askanchor-follow-up-selection"
  });
  const core = globalThis.AskAnchorCore;
  const FOLLOW_UP_TEMPLATES = [
    {
      id: "explain",
      label: "\u89e3\u91ca\u6982\u5ff5",
      instruction: "\u8bf7\u89e3\u91ca\u6211\u5728\u4e0a\u6587\u4e2d\u9009\u4e2d\u7684\u8fd9\u6bb5\u5185\u5bb9\uff0c\u5e76\u8bf4\u660e\u5b83\u548c\u4e0a\u4e0b\u6587\u7684\u5173\u7cfb\u3002"
    },
    {
      id: "example",
      label: "\u4e3e\u4e2a\u4f8b\u5b50",
      instruction: "\u8bf7\u7528\u4e00\u4e2a\u7b80\u5355\u4f8b\u5b50\u89e3\u91ca\u6211\u9009\u4e2d\u7684\u8fd9\u6bb5\u5185\u5bb9\uff0c\u5e76\u8bf4\u660e\u5b83\u5728\u539f\u56de\u7b54\u4e2d\u8d77\u4ec0\u4e48\u4f5c\u7528\u3002"
    },
    {
      id: "context",
      label: "\u7ed3\u5408\u4e0a\u4e0b\u6587\u8bb2",
      instruction: "\u8bf7\u7ed3\u5408\u4e0a\u6587\u89e3\u91ca\u6211\u9009\u4e2d\u7684\u8fd9\u6bb5\u5185\u5bb9\uff1a\u5b83\u627f\u63a5\u4e86\u4ec0\u4e48\u3001\u8865\u5145\u4e86\u4ec0\u4e48\uff0c\u4ee5\u53ca\u6211\u5e94\u8be5\u600e\u4e48\u7406\u89e3\u5b83\u3002"
    },
    {
      id: "rephrase",
      label: "\u6362\u4e00\u79cd\u8bf4\u6cd5",
      instruction: "\u8bf7\u628a\u6211\u9009\u4e2d\u7684\u8fd9\u6bb5\u5185\u5bb9\u6362\u4e00\u79cd\u66f4\u5bb9\u6613\u7406\u89e3\u7684\u8bf4\u6cd5\uff0c\u5e76\u5c3d\u91cf\u4fdd\u7559\u539f\u610f\u3002"
    },
    {
      id: "code",
      label: "\u89e3\u91ca\u4ee3\u7801\u95ee\u9898",
      instruction: "\u8bf7\u7ed3\u5408\u4e0a\u4e0b\u6587\u89e3\u91ca\u8fd9\u6bb5\u4ee3\u7801\u7684\u4f5c\u7528\u3001\u8f93\u5165\u8f93\u51fa\u3001\u8fd0\u884c\u903b\u8f91\u548c\u53ef\u80fd\u7684\u95ee\u9898\u3002"
    },
    {
      id: "translate",
      label: "\u7ffb\u8bd1\u5e76\u89e3\u91ca",
      instruction: "\u8bf7\u5148\u628a\u6211\u9009\u4e2d\u7684\u5185\u5bb9\u7ffb\u8bd1\u6210\u901a\u4fd7\u4e2d\u6587\uff0c\u518d\u89e3\u91ca\u5176\u4e2d\u7684\u5173\u952e\u672f\u8bed\u548c\u4e0a\u4e0b\u6587\u542b\u4e49\u3002"
    },
    {
      id: "critique",
      label: "\u53cd\u9a73\u6216\u68c0\u67e5\u8fd9\u6bb5\u8bdd",
      instruction: "\u8bf7\u53cd\u9a73\u6216\u68c0\u67e5\u6211\u9009\u4e2d\u7684\u8fd9\u6bb5\u8bdd\uff1a\u6307\u51fa\u5b83\u7684\u5047\u8bbe\u3001\u53ef\u80fd\u6f0f\u6d1e\u3001\u9700\u8981\u8865\u5145\u8bc1\u636e\u7684\u5730\u65b9\uff0c\u4ee5\u53ca\u5b83\u662f\u5426\u548c\u4e0a\u4e0b\u6587\u4e00\u81f4\u3002"
    },
    {
      id: "custom",
      label: "\u81ea\u5b9a\u4e49\u63d0\u95ee",
      custom: true
    }
  ];

  let activeAdapter = null;
  let currentSelection = null;
  let lastValidSelection = null;
  let anchors = [];
  let activeAnchorId = null;
  let pendingFollowUp = null;
  let pendingFollowUpTimer = null;
  let pendingFollowUpPollTimer = null;
  let sentQuestionStabilizeTimer = null;
  let catDockTucked = false;
  let catDockPosition = null;
  let tuckedCatTop = null;
  let catDragState = null;
  let catEyePointer = null;
  let catEyeFrame = null;
  let askAnchorSettings = { ...DEFAULT_SETTINGS };
  let selectionTimer = null;
  let activeAnchorStorageKey = null;
  let conversationTimelineTimer = null;
  let conversationRootRefreshTimer = null;
  let routePollTimer = null;
  let anchorLoadTimer = null;
  let initialTimelineTimer = null;
  let askAnchorStarted = false;
  let platformDisabledBySettings = false;
  let observedConversationRoot = null;
  let lastObservedUrl = location.href;
  const timelineState = {
    messageToTick: new Map(),
    tickToMessage: new Map(),
    activeMessage: null,
    observer: null
  };

  function getExtensionUrl(path) {
    const runtime = getExtensionApi()?.runtime;
    if (runtime?.getURL) {
      return runtime.getURL(path);
    }

    return path;
  }

  function getExtensionApi() {
    return globalThis.browser || globalThis.chrome || null;
  }

  const CAT_IMAGE_URL = getExtensionUrl("assets/askanchor-cat-perch.png");
  const CAT_PEEK_IMAGE_URL = getExtensionUrl("assets/askanchor-cat-peek-right.png");

  const ctx = {
    BUTTON_ID,
    FOLLOW_UP_MENU_ID,
    DOCK_ID,
    LIST_ID,
    PANEL_ID,
    PANEL_LIST_ID,
    TIMELINE_ID,
    TIMELINE_PREVIEW_ID,
    TOAST_ID,
    HIGHLIGHT_CLASS,
    MARKER_CLASS,
    MIN_SELECTION_LENGTH,
    MAX_ANCHORS,
    ANCHOR_NAME_LENGTH,
    SELECTION_CONTEXT_LENGTH,
    ANCHOR_STATUS_UNRESOLVED,
    ANCHOR_STATUS_UNDERSTOOD,
    UNNAMED_ANCHOR_NAME,
    MESSAGE_LOCATOR_SUMMARY_LENGTH,
    MESSAGE_LOCATOR_ATTRIBUTE_DEPTH,
    CONVERSATION_ROOT_REFRESH_DELAY,
    CONVERSATION_TIMELINE_RENDER_DELAY,
    STORAGE_KEY_PREFIX,
    SETTINGS_STORAGE_KEY,
    LEGACY_SETTINGS_STORAGE_KEY,
    SETTINGS_SCHEMA_VERSION,
    CAT_POSITION_STORAGE_KEY,
    TUCKED_CAT_TOP_STORAGE_KEY,
    CAT_IMAGE_URL,
    CAT_PEEK_IMAGE_URL,
    DEFAULT_FOLLOW_UP_TEMPLATE_ID,
    DEFAULT_SETTINGS,
    COMMANDS,
    core,
    FOLLOW_UP_TEMPLATES,
    timelineState,
    getExtensionUrl,
    getExtensionApi
  };

  Object.defineProperties(ctx, {
    activeAdapter: { get: () => activeAdapter, set: (value) => { activeAdapter = value; } },
    currentSelection: { get: () => currentSelection, set: (value) => { currentSelection = value; } },
    lastValidSelection: { get: () => lastValidSelection, set: (value) => { lastValidSelection = value; } },
    anchors: { get: () => anchors, set: (value) => { anchors = value; } },
    activeAnchorId: { get: () => activeAnchorId, set: (value) => { activeAnchorId = value; } },
    pendingFollowUp: { get: () => pendingFollowUp, set: (value) => { pendingFollowUp = value; } },
    pendingFollowUpTimer: { get: () => pendingFollowUpTimer, set: (value) => { pendingFollowUpTimer = value; } },
    pendingFollowUpPollTimer: { get: () => pendingFollowUpPollTimer, set: (value) => { pendingFollowUpPollTimer = value; } },
    sentQuestionStabilizeTimer: { get: () => sentQuestionStabilizeTimer, set: (value) => { sentQuestionStabilizeTimer = value; } },
    catDockTucked: { get: () => catDockTucked, set: (value) => { catDockTucked = value; } },
    catDockPosition: { get: () => catDockPosition, set: (value) => { catDockPosition = value; } },
    tuckedCatTop: { get: () => tuckedCatTop, set: (value) => { tuckedCatTop = value; } },
    catDragState: { get: () => catDragState, set: (value) => { catDragState = value; } },
    catEyePointer: { get: () => catEyePointer, set: (value) => { catEyePointer = value; } },
    catEyeFrame: { get: () => catEyeFrame, set: (value) => { catEyeFrame = value; } },
    askAnchorSettings: { get: () => askAnchorSettings, set: (value) => { askAnchorSettings = value; } },
    selectionTimer: { get: () => selectionTimer, set: (value) => { selectionTimer = value; } },
    activeAnchorStorageKey: { get: () => activeAnchorStorageKey, set: (value) => { activeAnchorStorageKey = value; } },
    conversationTimelineTimer: { get: () => conversationTimelineTimer, set: (value) => { conversationTimelineTimer = value; } },
    conversationRootRefreshTimer: { get: () => conversationRootRefreshTimer, set: (value) => { conversationRootRefreshTimer = value; } },
    routePollTimer: { get: () => routePollTimer, set: (value) => { routePollTimer = value; } },
    anchorLoadTimer: { get: () => anchorLoadTimer, set: (value) => { anchorLoadTimer = value; } },
    initialTimelineTimer: { get: () => initialTimelineTimer, set: (value) => { initialTimelineTimer = value; } },
    askAnchorStarted: { get: () => askAnchorStarted, set: (value) => { askAnchorStarted = value; } },
    platformDisabledBySettings: { get: () => platformDisabledBySettings, set: (value) => { platformDisabledBySettings = value; } },
    observedConversationRoot: { get: () => observedConversationRoot, set: (value) => { observedConversationRoot = value; } },
    lastObservedUrl: { get: () => lastObservedUrl, set: (value) => { lastObservedUrl = value; } }
  });

  const modules = globalThis.AskAnchorModules || {};
  [
    modules.core,
    modules.selection,
    modules.followup,
    modules.anchors,
    modules.timeline,
    modules.catDock,
    modules.dom
  ].forEach((createModule) => {
    if (typeof createModule === "function") {
      Object.assign(ctx, createModule(ctx));
    }
  });

  activeAdapter = ctx.getActiveAdapter();
  catDockPosition = ctx.loadCatDockPosition();
  tuckedCatTop = ctx.loadTuckedCatTop();
  activeAnchorStorageKey = ctx.getAnchorStorageKey();

  ctx.installExtensionMessageListeners();
  ctx.loadSettingsFromStorage();
})();
