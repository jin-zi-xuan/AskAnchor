const selectedEl = document.getElementById("ask-anchor-selected");
const resultEl = document.getElementById("ask-anchor-result");
const closeButton = document.getElementById("ask-anchor-close");
const returnButton = document.getElementById("ask-anchor-return");

window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "ASK_ANCHOR_PANEL_STATE") {
    return;
  }

  selectedEl.textContent = data.selectedText || "暂无选中文本";
  resultEl.textContent = data.explanation || "";
  resultEl.dataset.loading = data.loading ? "true" : "false";
  resultEl.dataset.error = data.error ? "true" : "false";
});

closeButton.addEventListener("click", () => {
  window.parent.postMessage({ type: "ASK_ANCHOR_CLOSE_PANEL" }, "*");
});

returnButton.addEventListener("click", () => {
  window.parent.postMessage({ type: "ASK_ANCHOR_RETURN_TO_SOURCE" }, "*");
});
