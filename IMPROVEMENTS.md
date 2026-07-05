# AskAnchor 项目改进建议

> 审查范围：`contentScript.js`、`background.js`、`settings.js`、`src/`、`styles.css`、`manifest.json`、HTML 及构建脚本
> 审查时间：2026-07-04

## 一、按优先级总览

| 优先级 | 方向 | 核心问题 |
|--------|------|----------|
| 🔴 P0 | 测试缺失 | 6000+ 行 DOM 操作代码，零自动化测试 |
| 🔴 P0 | 巨型文件 | `contentScript.js` 单文件 3986 行 / 128KB |
| 🟠 P1 | 工程化缺失 | 无 `package.json`、无 ESLint/Prettier、无构建链 |
| 🟠 P1 | manifest 三重重复 | 11 个站点域名在 3 处重复维护 |
| 🟠 P1 | 无国际化 | 1469 处硬编码中文字符串，无法本地化 |
| 🟡 P2 | 可访问性 | 弹层/时间轴/小猫的键盘与屏幕阅读器支持薄弱 |
| 🟡 P2 | 生产日志噪声 | `contentScript.js` 有 22 处 `console.*` |
| 🟡 P2 | 类型安全 | 复杂状态机无 TypeScript，重构风险高 |
| 🟢 P3 | 发布流程 | 无 CHANGELOG、无 CI、无自动打包 |
| 🟢 P3 | 文档 | 缺架构说明与 CONTRIBUTING |

---

## 二、P0：必须优先解决

### 1. 零测试覆盖

**现状**：项目里没有任何 `.test.js` / `.spec.js`，没有测试框架，没有 `package.json`。

**为什么严重**：这是一个在 **11 个第三方 AI 平台**上做 DOM 注入和文本定位的扩展。平台改版会直接破坏选择器，而你现在只能靠手动逐站验证。锚点定位（exact/prefix/suffix 匹配）、分支状态机、设置归一化这些纯逻辑是最容易回归、也最容易写单测的部分。

**建议**：
- 引入 Vitest（轻量、零配置、对纯函数友好）。
- 优先给这些纯函数加测试：
  - `normalizeSettings` / `normalizeEnabledPlatforms`（设置迁移）
  - `normalizeBranch` / `normalizeBranchStatus`（分支状态归一化）
  - `createAnchorName` / `normalizeComparableText`（文本截断与归一）
  - `getStableMessageId`、锚点定位的文本匹配逻辑
- DOM 相关逻辑用 `jsdom` 或 `happy-dom` 起一个最小 fixture，覆盖「选区→生成锚点→刷新后恢复」主链路。
- 适配器选择器可以用 fixture HTML 做快照测试，平台改版时一眼能看出哪个挂了。

### 2. `contentScript.js` 巨型文件

**现状**：单个 IIFE 里塞了 ~120 个函数，涵盖选区监听、追问菜单、锚点 CRUD、分支管理、时间轴、小猫 dock、设置、路由监听、DOM 工具。3986 行。

**为什么严重**：任何改动都要在巨型文件里上下翻找，函数间隐式共享闭包变量（`anchors`、`branches`、`catDockPosition` 等几十个 `let`），重构成本极高，也是 bug 温床。

**建议拆分方向**（按职责）：
```
src/
  core/state.js          # 全局状态容器
  core/settings.js       # 设置加载/归一化/持久化
  core/storage.js        # sessionStorage / localStorage 封装
  selection/             # 选区监听、追问按钮、追问菜单
  anchors/               # 锚点 CRUD、定位、恢复
  branches/              # 分支状态机
  timeline/              # 时间轴渲染与观察
  cat-dock/              # 小猫 dock、拖拽、眨眼
  dom/                   # utils: isVisible, closestFromSelectors...
  bootstrap.js           # 入口编排
```
迁移路径：先抽纯工具函数（`dom/`、`core/storage.js`），再抽状态机（`branches/`），最后动 UI 模块。每抽一块补一块测试。

---

## 三、P1：强烈建议

### 3. 工程化基线缺失

**现状**：没有 `package.json`，没有 lint/format 配置，构建只有一个 `scripts/build-browser-targets.js` 拷贝脚本。`dist/` 已在 `.gitignore` 里（这点做对了）。

**建议**：
- 加 `package.json`，至少管理：`lint`、`format`、`test`、`build` 脚本。
- ESLint + Prettier：统一代码风格， catch 未使用变量、隐式全局。
- 引入 esbuild/rollup 做打包：支持 ES Module（告别 IIFE + 脚本加载顺序依赖）、可选压缩、source map，体积能降不少。
- 构建脚本里做一遍 `manifest.json` 校验，避免改漏。

### 4. `manifest.json` 三重重复

**现状**：11 个站点的 match pattern 在 `host_permissions`、`content_scripts[0].matches`、`web_accessible_resources[0].matches` 里各写了一遍，共 9+ 处重复。`ADAPTERS.md` 也承认加平台要改 3 个地方。

**风险**：漏改一处会导致权限缺失或资源加载失败，且很难发现。

**建议**：
- 把站点列表做成单一数据源（`src/platforms.js` 已经有了 `PLATFORM_CATALOG`），构建脚本从它**生成** `manifest.json` 的三段。`src/platforms.js` 是真相，manifest 是产物。
- 这样加平台只改一处，构建时自动同步。

### 5. 无国际化

**现状**：UI 文案硬编码，`contentScript.js` 里有 1469 处 `\uXXXX` 转义的中文字符串。`popup.html` 也是直接写死中文。

**影响**：Chrome Web Store 上架后无法服务英文用户；改文案要在代码里搜转义码，体验差。

**建议**：
- 建立 `_locales/zh_CN/messages.json` 和 `_locales/en/messages.json`。
- 用 `chrome.i18n.getMessage('askanchor_follow_up')` 替换硬编码。
- 借重构机会把字符串集中到常量模块，即便不上 i18n 也便于维护。

---

## 四、P2：质量与体验

### 6. 可访问性（A11y）

**现状**：`contentScript.js` 里 `aria-`/`role=` 出现 53 次（对一个 4000 行 UI 文件偏少），追问菜单、小猫 dock、时间轴的键盘可达性未系统处理。

**建议**：
- 追问菜单、锚点列表、分支面板：加 `role="dialog"`/`role="menu"`、`aria-modal`、焦点陷阱（打开时聚焦、关闭时归还）。
- 小猫 dock：加 `role="button"`、`aria-label`、`tabindex="0"`，支持 Enter/Space 触发、Esc 关闭面板。
- 时间轴刻度：`role="tablist"` + 方向键导航。
- 确认所有交互元素有可见 focus 样式（`styles.css` 里补 `:focus-visible`）。

### 7. 生产环境日志噪声

**现状**：`contentScript.js` 有 22 处 `console.debug`/`console.warn`，多在选择器匹配失败时输出。

**建议**：
- 包一层 `logger`，按 settings 控制 verbose 等级；生产默认静默。
- 或在构建时用 esbuild 的 `drop` 选项剔除 `console.debug`。

### 8. 类型安全

**现状**：纯 JS，分支/锚点有复杂状态（`draft`/`sent`/`done`、`unresolved`/`understood`），全靠常量字符串 + 手动归一化。

**建议**：迁移到 TypeScript（哪怕先 `allowJs` 渐进迁移）。状态枚举、适配器接口（`ADAPTERS.md` 已经定义了契约）用类型固化，重构和加平台会踏实很多。

---

## 五、P3：锦上添花

### 9. 发布与版本管理
- 加 `CHANGELOG.md`，记录每个版本的功能与修复。
- CI（GitHub Actions）：PR 上跑 lint + test + 构建校验。
- 自动打包脚本：生成各浏览器 zip，避免手抖。

### 10. 文档
- `CONTRIBUTING.md`：本地开发、调试、加平台流程（`ADAPTERS.md` 已有雏形）。
- 一份 `ARCHITECTURE.md`：画清 contentScript 各模块如何协作，新人接手不用读 4000 行。

### 11. 体验增强（可选）
- 锚点导出/导入：用户跨会话保留重要锚点（当前只存 sessionStorage）。
- 小猫资源考虑 SVG：体积更小、可随站点主题适配明暗。
- 追问模板支持用户自定义并持久化（目前模板写死在 `FOLLOW_UP_TEMPLATES`）。

---

## 六、建议落地顺序

1. **第一周**：建 `package.json` + ESLint + Vitest 骨架；给纯函数（设置/分支/文本归一）补首批单测。
2. **第二周**：构建脚本从 `src/platforms.js` 生成 `manifest.json`，消除三重重复。
3. **第三周起**：按 `dom/ → core/ → branches/ → 其余 UI 模块` 顺序拆分 `contentScript.js`，每拆一块补测试。
4. **并行**：抽字符串常量 + i18n；补 A11y 焦点管理。

> 原则：**先立护栏（lint + test + 构建校验），再动结构**。没有测试保护的大文件重构风险很高，顺序不能反。
