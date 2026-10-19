# Contributing to Hourleaf

感谢你帮助改进 Hourleaf。请先搜索已有 issue；较大的功能、权限或数据模型变更应先创建提案，避免在产品边界未达成共识前投入大量实现。

参与即表示你同意遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。安全问题不要公开提交，请使用 [SECURITY.md](./SECURITY.md) 的私密渠道。

## 开发准备

需要 Node.js 22 或更高版本、npm 和相应浏览器；Safari 构建转换需要 macOS 与 Xcode。先阅读 [文档目录](./docs/README.md)，定位受影响功能的 [架构契约](./docs/ARCHITECTURE.md)，再开始修改。完整产品行为见 [功能说明](./docs/FEATURES.md)。

```bash
npm ci
npm run typecheck
npm run build
```

以根 `package.json` 中实际脚本为准。不要绕过锁文件，不要提交 `dist`、测试 trace、浏览器 profile、签名证书、provisioning profile、`.env` 或任何 token。

本地自动检查仅执行编译与构建，交互与浏览器效果留给人工；现有单元/E2E 脚本不作为本地自动必跑流程。GitHub Actions 仍执行格式、类型、Lint、单元覆盖、构建和打包，不因本地范围调整而移除远端检查。

## 设计原则

- 本地优先、单一用途、最小权限；不添加遥测、远程代码、广告或站外追踪。
- 领域逻辑与浏览器 API 解耦，新增平台差异放入 adapter/build 层。
- 可复用逻辑模块化；对 URL/时间/storage/message 等外部输入做运行时验证。
- 普通额度、标签页组白名单和独立计划保留各自生命周期，来源切换先结算旧计时段；网站权限与显式域名阻断不因授权来源改变而扩大。
- UI 使用语义 HTML、可见焦点和明确 label；不得只用颜色表达状态。
- 所有用户可见文案必须通过 [UX writing 规范](./docs/UX_WRITING.md)；隐私行为、权限和数据 schema 变更同步更新文档。
- 可选网站模块遵守 [模块开发准则](./docs/MODULE_DEVELOPMENT.md) 和 [本地模块协议](./docs/LOCAL_MODULES.md)，不得预装、联网更新或扩大清单声明的来源权限。

## 提交变更

1. 从最新默认分支创建范围单一的分支。`main` 必须通过 PR 合并；GitHub Actions 的 `quality` 检查须通过，分支保持最新，所有讨论已解决。管理员同样受保护规则约束，不允许强推或删除主分支。单维护者阶段不强制第二人批准。
2. 根据开发文档定位领域、协调、存储及 UI 层，复用已有模块；完成后更新对应契约和人工验收条目。
3. 整理改动格式，执行 TypeScript 编译与受影响构建；保留远端 CI 的现有检查。
4. 按 [MANUAL_ACCEPTANCE.md](./docs/MANUAL_ACCEPTANCE.md) 人工验证受影响浏览器，明确记录尚未执行的项目。
5. PR 描述说明问题、最终行为、编译/构建结果及人工验收状态；涉及权限、数据或平台差异时提供相应证据。

请保持 commit 可审阅，避免把无关格式化、生成文件或依赖升级混在功能提交中。PR 可能需要变更请求；请解决 review 对话而不是只将其标记为 resolved。

## 特殊变更门禁

以下变更在实现前必须获得维护者同意并更新 `docs/QUALITY.md`、`docs/THREAT_MODEL.md` 与 `PRIVACY.md`：新权限/站点、账户或同步、任何网络服务/遥测/第三方 SDK、数据导入导出、存储 schema 破坏性迁移、远程配置、商店身份或签名流程。

## Bug 与功能报告

提供版本、浏览器/系统、期望/实际结果和最小复现。截图与日志必须移除账号、头像、URL 参数、浏览历史和其他个人数据。功能提案应说明如何服务“按用户规则管理网站使用时间并减少分心内容”的单一用途。

贡献按项目 [MIT 许可证](./LICENSE) 提供；请确保有权提交并保留第三方版权及许可声明。
