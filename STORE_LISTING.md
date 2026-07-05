# AskAnchor Store Listing Notes

## Privacy and Permissions

AskAnchor runs on supported AI chat websites so it can add follow-up and anchor
controls directly inside the page.

AskAnchor does not upload chat history. It has no backend service and does not
send chat content to a remote server.

Stored data stays in the browser:

- Anchors are saved in the current page session storage.
- The cat position is saved in page local storage.
- Enabled platform settings are saved in extension local storage.

AskAnchor defaults to enabled on supported platforms. Users can open the
extension settings page and turn off any platform. When a platform is disabled,
AskAnchor does not show its button, cat, anchor list, or timeline on that site.

The `clipboardWrite` permission is used only as a fallback: if AskAnchor cannot
find the current AI page input box, it copies the follow-up prompt that the user
explicitly generated.

## Supported Platforms

- ChatGPT: `chatgpt.com`, `chat.openai.com`
- Claude: `claude.ai`
- DeepSeek: `chat.deepseek.com`
- Gemini: `gemini.google.com`
- Poe: `poe.com`
- Perplexity: `perplexity.ai`, `www.perplexity.ai`
- Microsoft Copilot: `copilot.microsoft.com`
- Kimi: `kimi.moonshot.cn`
- 豆包: `doubao.com`, `www.doubao.com`
- 通义: `tongyi.aliyun.com`
- 文心一言: `yiyan.baidu.com`
