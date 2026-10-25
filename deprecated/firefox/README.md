# Firefox（已弃用 / Archived）

2026-10-25 起，项目专注于 Chrome（Chromium）与 Safari。Firefox 不再参与构建、打包、CI、当前浏览器验收或发布；`npm run build:firefox` 与 `node scripts/build.mjs firefox` 不再受支持。

Firefox has been removed from active build, packaging, browser acceptance, and release targets. These files are retained as historical references.

- `manifests/firefox.json`：原始 Manifest，保留稳定 Gecko ID。
- `build-target.json`：原构建目标、命令、输出路径及 Playwright 项目配置记录；当前脚本不会读取它。
- [Firefox AMO 说明](./docs/FIREFOX.md)与[发布清单](./docs/RELEASE_CHECKLIST.md)：历史发布参考，不代表当前支持。
- `artifacts/dist/firefox/`：本机原有 Firefox 构建目录（如有）。
- `artifacts/packages/`：本机原有 Firefox ZIP、含 Firefox 的旧审核源码 ZIP 与对应旧校验清单（如有）。这些产物不提交 Git，也不进入新的浏览器包、审核源码包或 CI 上传。

共享源码中的 Promise 浏览器适配、旧平台类型和拒绝脚本策略继续保留；Safari 仍使用其中的通用能力。恢复 Firefox 时须显式将目标重新接入 `scripts/browser-targets.mjs`、恢复 Manifest 与构建入口，并重新核对兼容性、商店要求及人工验收；本目录不提供自动恢复或发布命令。

当前入口：[项目说明](../../README.md) · [开发文档](../../docs/README.md)。
