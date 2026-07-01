const selectedEl = document.getElementById("ask-anchor-selected");
const resultEl = document.getElementById("ask-anchor-result");
const hideButton = document.getElementById("ask-anchor-hide");
const closeButton = document.getElementById("ask-anchor-close");
const returnButton = document.getElementById("ask-anchor-return");
const currentTab = document.getElementById("ask-anchor-tab-current");
const historyTab = document.getElementById("ask-anchor-tab-history");
const currentView = document.getElementById("ask-anchor-current-view");
const historyView = document.getElementById("ask-anchor-history-view");
const historyList = document.getElementById("ask-anchor-history-list");
const clearHistoryButton = document.getElementById("ask-anchor-clear-history");

let historyItems = [];
let activeHistoryId = null;

window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "ASK_ANCHOR_PANEL_STATE") {
    return;
  }

  if (Array.isArray(data.history)) {
    historyItems = data.history;
  }

  activeHistoryId = data.activeHistoryId || activeHistoryId;
  selectedEl.textContent = data.selectedText || "\u6682\u65e0\u9009\u4e2d\u6587\u672c";
  resultEl.textContent = data.explanation || "";
  resultEl.dataset.loading = data.loading ? "true" : "false";
  resultEl.dataset.error = data.error ? "true" : "false";
  renderHistory();
});

hideButton.addEventListener("click", () => {
  window.parent.postMessage({ type: "ASK_ANCHOR_HIDE_PANEL" }, "*");
});

closeButton.addEventListener("click", () => {
  window.parent.postMessage({ type: "ASK_ANCHOR_CLOSE_PANEL" }, "*");
});

returnButton.addEventListener("click", () => {
  window.parent.postMessage({ type: "ASK_ANCHOR_RETURN_TO_SOURCE" }, "*");
});

currentTab.addEventListener("click", () => {
  setView("current");
});

historyTab.addEventListener("click", () => {
  setView("history");
});

clearHistoryButton.addEventListener("click", () => {
  window.parent.postMessage({ type: "ASK_ANCHOR_CLEAR_HISTORY" }, "*");
  historyItems = [];
  activeHistoryId = null;
  renderHistory();
});

function setView(viewName) {
  const showHistory = viewName === "history";
  currentView.hidden = showHistory;
  historyView.hidden = !showHistory;
  currentTab.classList.toggle("is-active", !showHistory);
  historyTab.classList.toggle("is-active", showHistory);
}

function renderHistory() {
  historyList.textContent = "";

  if (historyItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ask-anchor-history-empty";
    empty.textContent = "\u6682\u65e0\u5386\u53f2\u8bb0\u5f55";
    historyList.appendChild(empty);
    return;
  }

  for (const item of historyItems) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ask-anchor-history-item";
    button.classList.toggle("is-active", item.id === activeHistoryId || item.active);
    button.addEventListener("click", () => {
      activeHistoryId = item.id;
      selectedEl.textContent = item.selectedText;
      resultEl.textContent = item.explanation;
      resultEl.dataset.error = item.error ? "true" : "false";
      resultEl.dataset.loading = "false";
      setView("current");
      renderHistory();
      window.parent.postMessage({ type: "ASK_ANCHOR_SELECT_HISTORY", id: item.id }, "*");
    });

    const time = document.createElement("span");
    time.className = "ask-anchor-history-time";
    time.textContent = formatTime(item.createdAt);

    const text = document.createElement("span");
    text.className = "ask-anchor-history-text";
    text.textContent = item.selectedText;

    button.append(time, text);
    historyList.appendChild(button);
  }
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
