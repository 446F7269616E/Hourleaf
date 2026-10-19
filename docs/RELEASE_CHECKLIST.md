# Hourleaf 公开发布清单

功能与文档同步：2026-10-19。候选行为按 [FEATURES.md](./FEATURES.md) 核对；本地仅编译/构建，远端 CI 与人工验收分别记录，不因文档更新勾选发布门禁。

操作入口及各平台材料见 [商店提交说明](./STORE_SUBMISSION.md)。Safari ZIP 仅供转换，不能直接提交 App Store。

## 候选冻结

- [ ] 版本、commit、变更日志、最低浏览器版本与 manifest 一致。
- [ ] clean checkout 可复现三平台单一扩展；记录所有 ZIP 的 SHA-256。
- [ ] 仓库和产物无 token、证书、profile、私钥、测试账号或用户数据。
- [ ] README、隐私政策、安全政策、许可证和商店文案与候选行为一致。

## 质量与隐私

- [ ] 静态检查、单元/组件/E2E 和三平台候选验收全部完成。
- [ ] 商店 ZIP 不包含网站专用模块、`optional-modules/`、远程脚本或远程更新清单。
- [ ] 可选网站范围没有转化为默认全站访问；每次请求为精确 origin。
- [ ] 没有远程 JS/Wasm、动态执行、CDN、生产 source map 或复杂远程指令。
- [ ] 本地模块在 UI/后台双重校验；远程 CSS、通配主机、任何非空 DNR 和超限内容被拒绝。
- [ ] Chromium 用户脚本只走 User Scripts API；Firefox 与 Safari 不声明该权限，UI/后台均拒绝含脚本导入，旧存储脚本不执行。
- [ ] 停用/删除模块会注销 User Scripts；初始化会清理 Hourleaf 旧版自有动态 DNR ID 范围。
- [ ] 升级迁移、权限拒绝/撤销、清空、删除网站、卸载和回滚已验证。
- [ ] `PRIVACY.md`、商店数据披露、Storage 和抓包结果一致。
- [ ] 无启用时间段的网站无限使用，屏蔽与每日屏蔽窗口仍有效。
- [ ] 独立计划不写普通用量/额度，到期重入无旧拦截；来源切换先结算，旧媒体回调不影响新访问。
- [ ] 标签页组白名单窗口、组销毁/移出、重启与恢复重绑符合会话边界；不改变计划截止或扩展网站权限。
- [ ] 普通关闭只关闭组外相关标签，未知分组候选保留；计划关闭按自身来源。
- [ ] 备份覆盖自定义预设、白名单时段、计划与同版本模块偏好，排除运行授权、统计、组绑定及源码。

## 公共素材

- [ ] 名称统一为 Hourleaf；站点模块清楚标注第三方非官方适配。
- [ ] 描述只承诺已实现功能，说明本地统计和按需网站权限。
- [ ] 截图来自候选版本，不含真实账号、头像、历史或其他个人数据。
- [ ] GitHub 商店候选 ZIP 与可选模块文件分开；不宣称可绕过商店正常安装。
- [ ] 本地 Debug 目录没有复制到 `dist/<platform>`，没有进入提交、Action artifact、GitHub Release 或商店上传；`npm run package` 的 Debug 门禁已通过。

## 平台

### Chrome / Chromium

- [ ] Chromium ZIP 根目录直接包含 `manifest.json`，且只发布一个扩展包。
- [ ] `userScripts` 与精确来源权限均有单一用途说明；manifest 不再申请 DNR 权限。
- [ ] `tabGroups` 仅用于用户绑定已有组及读取归属，不申请全量 `tabs`；会话失效后不自动重绑。
- [ ] Developer Dashboard 的 single purpose、permission justification、data usage 与隐私 URL 填写完成。
- [ ] 商店草稿安装后复测权限提示、Service Worker 恢复与升级。

### Firefox

- [ ] manifest 保留稳定 Gecko ID 和准确 `data_collection_permissions`。
- [ ] 不声明 `userScripts`，只接收不含用户脚本的 JSON/CSS 模块；升级前存储的脚本不执行。
- [ ] 在有/无组 API、会话存储的实际版本分别验证白名单可用性与安全降级，不能只根据 Firefox 名称承诺支持。
- [ ] `web-ext lint` 通过；构建说明和可审计源码按 AMO 要求提交。
- [ ] 使用最终 AMO 签名 XPI 验证安装、升级、禁用、启用和卸载。

### Safari

- [ ] 使用真实 Bundle ID 执行 `npm run prepare:safari -- <BundleID>` 转换 `dist/safari`，所有 warning 都有决议。
- [ ] 将 `PrivacyInfo.xcprivacy` 加入承载 App 和扩展 target；归档后隐私报告与 App Store Connect 声明一致。
- [ ] entitlements、网站权限和隐私信息只包含必要能力；签名资料不进 Git。
- [ ] Safari 候选导入 `.user.js` 时明确拒绝，包内不声明 `userScripts`。
- [ ] 不声明 `tabGroups` 或 `idle`；组白名单显示不可用且不放行，普通计时按已有可用信号运行。
- [ ] TestFlight/App Store 候选完成 macOS/iOS 权限拒绝、授权、撤销与升级。

## GitHub 与发布

- [x] `main` 已启用 PR、必需 `quality` 检查、最新分支、讨论解决、线性历史及管理员保护，禁止强推和删除。
- [ ] 最小维护权限和私密漏洞报告已核对。
- [ ] CI 先执行 `npm run package`，再上传 `dist/packages`；缺失产物时任务失败。
- [ ] 创建受保护 tag 和 GitHub Release，上传 Chromium/Firefox 商店候选包、Safari 转换输入 ZIP、可复现审核源码包、`dist/packages/SHA256SUMS`，以及与扩展包分离的 `dist/modules/` 模块 ZIP 和 `MODULE-SHA256SUMS`。
- [ ] Release 只记录产品变更、已知限制与平台状态，不包含内部协作说明或面向单个用户的建议。
- [ ] README、功能说明、文档目录、架构、模块规范、隐私和人工验收无过期功能约定；Unreleased 与已发布资产范围分清。
- [ ] 小比例发布后观察错误计时、权限和站点兼容问题；保留上一安全版本和数据兼容路径。
