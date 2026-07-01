// AskAnchor currently runs entirely in the content script.
// This service worker is kept so the extension structure can grow later
// without changing the manifest shape.
chrome.runtime.onInstalled.addListener(() => {
  console.info("[AskAnchor] Installed.");
});
