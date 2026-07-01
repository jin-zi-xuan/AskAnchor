const USE_MOCK_RESPONSE = true;
const EXAMPLE_ENDPOINT = "https://api.example.com/explain";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "ASK_ANCHOR_EXPLAIN") {
    return false;
  }

  generateExplanation(message.selectedText, message.context)
    .then((explanation) => sendResponse({ ok: true, explanation }))
    .catch((error) => {
      console.error("[AskAnchor] Explanation failed:", error);
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : "AI explanation failed."
      });
    });

  return true;
});

/**
 * AI interface layer. The MVP returns deterministic mock content by default.
 * To call a real API, set USE_MOCK_RESPONSE to false and adapt the endpoint
 * payload/headers for your provider.
 */
async function generateExplanation(selectedText, context) {
  const safeSelectedText = String(selectedText || "").trim();
  const safeContext = Array.isArray(context) ? context : [];

  if (USE_MOCK_RESPONSE) {
    await delay(450);
    const contextCount = safeContext.length;
    return [
      "这是 AskAnchor 的 mock 解释结果。",
      "",
      `你选中的内容是：${safeSelectedText}`,
      "",
      `我已读取最近 ${contextCount} 条上下文消息。实际接入 AI 接口后，这里会结合上下文解释术语、推理链路和潜在含义。`
    ].join("\n");
  }

  const response = await fetch(EXAMPLE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      selectedText: safeSelectedText,
      context: safeContext,
      prompt: buildPrompt(safeSelectedText, safeContext)
    })
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.explanation || data.text || "No explanation returned.";
}

function buildPrompt(selectedText, context) {
  const contextText = context
    .map((item) => `${item.role}: ${item.text}`)
    .join("\n\n");

  return [
    "请结合下面的对话上下文，解释用户选中的 AI 回答片段。",
    "",
    "【对话上下文】",
    contextText || "无",
    "",
    "【选中文本】",
    selectedText,
    "",
    "请用清晰、简洁、可操作的中文解释。"
  ].join("\n");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
