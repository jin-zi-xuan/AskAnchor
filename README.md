# AskAnchor

AskAnchor 是一个 Chrome Extension Manifest V3 扩展，用来增强主流 AI 网页里的阅读和追问体验。

现在的 MVP 不接 API、不打开新窗口、不弹出解释面板。用户在 AI 回答里选中一段文字后，AskAnchor 会在当前页面生成“追问这一段”按钮，点击后自动把追问 prompt 填入当前 AI 的输入框，并为选中的文字创建可回跳锚点。

## 支持站点

- ChatGPT: `chatgpt.com`, `chat.openai.com`
- Gemini: `gemini.google.com`
- Claude: `claude.ai`
- Perplexity: `perplexity.ai`
- Poe: `poe.com`
- Microsoft Copilot: `copilot.microsoft.com`
- DeepSeek: `chat.deepseek.com`
- Kimi: `kimi.moonshot.cn`
- 豆包: `doubao.com`
- 通义: `tongyi.aliyun.com`
- 文心一言: `yiyan.baidu.com`

## 当前功能

- 在 AI assistant 回答中选中文字。
- 只在有效选区附近显示“追问这一段”按钮。
- 点击后自动提取选中文本和最近对话上下文。
- 自动把追问 prompt 填入当前 AI 页面的输入框。
- 同时创建锚点，锚点名称默认使用用户选中文字；过长时自动截断。
- 右下角显示锚点入口，例如“锚点 3”。
- 点击锚点列表中的任意一项，可滚回原选中文字位置并短暂高亮。
- 如果暂时找不到输入框，会把 prompt 复制到剪贴板作为兜底。

## 本地安装

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择本项目文件夹。
5. 打开任一支持站点，在 AI 回答中选中文字，点击“追问这一段”。

## 使用方式

1. 在 AI 回答中选中你想追问的文字。
2. 点击选区旁边的“追问这一段”。
3. AskAnchor 会把追问内容填入当前 AI 的输入框。
4. 你检查一下内容，然后点击当前 AI 页面自己的发送按钮。
5. 需要回到原文时，点击右下角“锚点 N”，选择对应锚点。

## 项目结构

- `manifest.json`: Chrome MV3 配置、权限和内容脚本匹配规则。
- `contentScript.js`: 文本选择监听、原地追问、上下文提取、锚点记录与回跳。
- `background.js`: 预留的 MV3 service worker。
- `styles.css`: 选区按钮、锚点入口、锚点列表和高亮样式。
- `panel.html` / `panel.js`: 早期面板方案文件，当前 MVP 主流程不再使用。

## License

MIT
