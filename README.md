# AskAnchor

AskAnchor 是一个 Chrome Extension Manifest V3 扩展，用来增强主流 AI 网页中的阅读、追问和原文回溯体验。

当前 MVP 不接 API、不打开新窗口、不弹解释面板。用户在 AI 回答里选中一段文字后，AskAnchor 会在选区旁生成“追问这一段”按钮；点击后会把轻量追问 prompt 填入当前 AI 的输入框，同时把选中的文字保存为可回跳锚点。

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
- 点击后生成只包含选中文本的轻量追问。
- 自动把追问 prompt 填入当前 AI 页面的输入框。
- 同时创建锚点，锚点名称默认使用用户选中文字，过长时自动截断。
- 用户发送追问后，AskAnchor 自动跳转到刚发送的那条追问问题。
- 右侧提供隐藏式 3D 小黑猫入口，点击可展开当前窗口解释过的内容。
- 锚点列表和时间轴都可以点击，点击后准确回到原来选中的文字位置。
- 锚点定位会保存“选中文字 + 前后文 + 文本偏移”，刷新后也会尽量恢复到原文位置。
- 如果暂时找不到输入框，会把 prompt 复制到剪贴板作为兜底。

## 交互设计

AskAnchor 借鉴了 `chatgpt-gemini-timeline` 的几个成熟思路，但没有复制其 GPL 代码：

- 选区追问：选中文字后出现轻量操作按钮。
- 文本定位：用 exact/prefix/suffix 这类文本锚点信息恢复原文位置。
- 时间轴导航：用侧边短刻度承载历史锚点，减少对聊天窗口的遮挡。
- 输入框跟随：3D 小黑猫会在当前 AI 输入框上方轻量移动，隐藏时缩到侧边只露出一部分。

## 本地安装

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择本项目文件夹。
5. 打开任一支持站点，在 AI 回答中选中文字，点击“追问这一段”。

修改代码后，需要在 `chrome://extensions` 里点击 AskAnchor 的 reload，然后刷新 AI 网页。

## 使用方式

1. 在 AI 回答中选中你想追问的文字。
2. 点击选区旁边的“追问这一段”。
3. AskAnchor 会把追问内容填入当前 AI 的输入框。
4. 你检查一下内容，然后点击当前 AI 页面的发送按钮。
5. 发送后页面会自动跳到刚发出的追问问题。
6. 需要回到原文时，点击小黑猫或侧边时间轴里的锚点。
7. 双击小黑猫可以把它隐藏到侧边，继续浏览页面。

## Prompt 格式

```text
请解释我在上文中选中的这段内容：

【选中内容】
...

请说明它的意思、和上文的关系，以及我应该如何理解它。
```

## 项目结构

- `manifest.json`: Chrome MV3 配置、权限和内容脚本匹配规则。
- `contentScript.js`: 文本选择监听、原地追问、锚点记录、发送后定位、时间轴和小猫入口。
- `background.js`: 预留的 MV3 service worker。
- `styles.css`: 选区按钮、小猫入口、锚点列表、时间轴、顶部提示和高亮样式。
- `panel.html` / `panel.js`: 早期面板方案文件，当前 MVP 主流程不再使用。

## License

MIT
