# 浏览器兼容情况

当前测试版：0.2.1。安装包面向桌面版 Chrome / Edge，操作系统兼容性与浏览器兼容性分开记录。

| 环境 | 当前结论 |
| --- | --- |
| macOS + Chrome 153 | 14 个核心流程浏览器回归用例通过 |
| macOS + Edge 153 | 同一组 14 个浏览器回归用例通过 |
| Windows Server 2025 + Chrome 152.0.7977.83 | 14 个浏览器回归用例通过 |
| Windows Server 2025 + Edge 152.0.4191.66 | 同一组 14 个浏览器回归用例通过 |
| Firefox | 当前发布包不支持，不能直接当作 Firefox 安装包 |
| Safari | 未完成转换、签名和验证，不提供安装包 |

浏览器回归使用本地模拟聊天页面，包括加载全部生产内容脚本、保存锚点、重载、列表点击、回跳与高亮。通过这些测试不等于所有在线 AI 网站均已逐一验证。

Windows 验证在 GitHub 托管环境运行，另有 32 项单元测试和 ZIP 解压校验通过。[查看测试记录](https://github.com/jin-zi-xuan/AskAnchor/actions/runs/35194714597)。尚未在 Windows 10 / 11 实机上手动安装验收。

## 安装

下载 Release 附件 `AskAnchor-0.2.1-chromium.zip` 并解压。Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。开启开发者模式，点击“加载已解压的扩展程序”，选中包含 `manifest.json` 的文件夹，然后刷新 AI 页面。

不用安装开发依赖。更新时重新加载扩展，并刷新 AI 页面。

## 为什么暂时不承诺 Firefox

当前 manifest 使用 Chrome / Edge 的 `background.service_worker`。Firefox 的扩展后台需要 `background.scripts` 等适配，此外设置存储、快捷键和高亮等行为仍需单独验证。仓库旧的 `build-browser-targets.js` 只是生成目标目录，不能据此判定浏览器可用，本次发布不使用那些未经验证的目标。

参考：[MDN 后台配置说明](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)、[Microsoft Edge 扩展说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/)。

## 复查与打包

```sh
npm test
npm run test:browser
# macOS / Linux，已安装 Edge 时：
BROWSER_CHANNEL=msedge npm run test:browser
npm run package
```

Windows PowerShell 可以先设置 `$env:BROWSER_CHANNEL = "msedge"`，再运行浏览器测试。打包脚本需要 Python 3，安装插件本身不需要。
