# AskAnchor

AskAnchor 是一个 Chrome Extension Manifest V3 MVP，用于增强 AI 网页中的阅读和追问体验。

在支持的 AI 网页里选中回答片段后，AskAnchor 会显示“解释这一段”按钮，点击后在右侧浮窗中展示结合上下文生成的解释，并支持返回原位置。

## 支持站点

MVP 默认覆盖常见 AI 站点，而不是请求所有网站权限：

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

## 功能

- 在 AI 回答中选中文本。
- 仅在有效选区附近显示“解释这一段”按钮。
- 打开右侧浮动解释面板。
- 提取最近 3 轮对话上下文和当前选中文本。
- 默认使用 mock AI 解释结果。
- 点击“返回原位置”后滚回原回答位置并短暂高亮。

## 本地安装

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择本项目文件夹。
5. 打开任一支持站点，在 AI 回答中选中文本并点击“解释这一段”。

## API 接入

MVP 默认使用 mock 输出。要切换到真实接口：

1. 打开 `background.js`。
2. 将 `USE_MOCK_RESPONSE` 改为 `false`。
3. 替换 `EXAMPLE_ENDPOINT`，并根据你的 AI 服务调整请求头和请求体。

当前示例接口为：

```text
https://api.example.com/explain
```

## 项目结构

- `manifest.json`: Chrome MV3 配置、权限、内容脚本匹配规则。
- `contentScript.js`: 文本选择监听、按钮显示、上下文提取、位置记录、面板通信。
- `background.js`: `generateExplanation(selectedText, context)` AI 接口层。
- `panel.html`: 右侧浮窗结构。
- `panel.js`: 浮窗状态渲染和按钮事件。
- `styles.css`: 页面按钮、浮窗和高亮样式。

## License

MIT
