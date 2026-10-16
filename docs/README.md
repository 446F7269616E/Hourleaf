# Hourleaf 文档目录

功能与源码同步日期：2026-10-17。先按任务定位入口，只阅读受影响模块；修改行为后同步功能说明、开发契约及人工验收。

## 产品与使用

- [项目概览与安装](../README.md)、[完整功能说明](./FEATURES.md)。
- [更新日志](../CHANGELOG.md)、[0.6.0 当前版本说明](./releases/0.6.0.md)。
- [可选模块与导入](../optional-modules/README.md)。
- [隐私与权限](../PRIVACY.md)、[安全报告](../SECURITY.md)。

## 按功能定位开发模块

| 功能                     | 源码入口（相对 `src/`）                                                                                                        | 开发契约                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 网站与权限               | `core/sites.ts`、`shared/site-scope.ts`                                                                                        | [通用网站模型](./ARCHITECTURE.md#通用网站模型)                                                |
| 时间段、额度、分组、心流 | `shared/schedule.ts`、`shared/group-quota.ts`、`shared/period-runtime.ts`                                                      | [时间规则](./ARCHITECTURE.md#时间规则)                                                        |
| 实际用时与统计           | `background/tracker.ts`、`background/period-accounting.ts`、`shared/analytics.ts`                                              | [计时模型](./ARCHITECTURE.md#计时模型)                                                        |
| 标签页组白名单           | `shared/tab-group-whitelist.ts`、`background/tab-group-whitelist.ts`、`ui/tab-group-whitelist.ts`                              | [白名单契约](./ARCHITECTURE.md#标签页组白名单)                                                |
| 独立计划与访问会话       | `background/plan.ts`、`background/plan-visit.ts`、`background/plan-registration.ts`                                            | [计划契约](./ARCHITECTURE.md#计划)                                                            |
| 访问确认、暂停与关闭     | `background/visit-confirmation.ts`、`background/related-tabs.ts`、`shared/pause-access.ts`、`content/index.ts`、`end/index.ts` | [时间规则](./ARCHITECTURE.md#时间规则)                                                        |
| 模块导入、偏好与定时     | `modules/local/`、`ui/local-module-copy.ts`、`ui/filter-time-periods.ts`                                                       | [模块规范](./LOCAL_MODULES.md)、[开发准则](./MODULE_DEVELOPMENT.md)                           |
| 本地配置备份             | `shared/configuration-backup.ts`、`background/configuration-backup.ts`、`ui/configuration-backup.ts`                           | [存储与迁移](./ARCHITECTURE.md#存储与迁移)                                                    |
| 双栏目录与时段表单       | `ui/configuration-directory.ts`、`ui/configuration-workspace.ts`、`ui/time-period-controls.ts`、`ui/theme.ts`                  | [交互契约](./ARCHITECTURE.md#配置屏蔽和设置的目录与时段交互2026-10-15)、[样式](./UI_STYLE.md) |
| 设置与保护               | `home/index.ts`、`background/protected-actions.ts`                                                                             | [架构](./ARCHITECTURE.md)、[功能说明](./FEATURES.md#设置备份与删除)                           |
| 界面、主题、语言         | `ui/`、`styles/`、`shared/i18n.ts`                                                                                             | [样式](./UI_STYLE.md)、[文案](./UX_WRITING.md)、[图标](./ICONS.md)                            |

消息验证位于 `shared/messages.ts`，协调及串行状态边界位于 `background/index.ts`，浏览器端口位于 `shared/browser.ts`。保持领域、协调、存储与 UI 各层职责，复用共享组件。

## 开发与交付

- [贡献说明](../CONTRIBUTING.md)、[本地 Debug 构建](./LOCAL_DEBUG_BUILD.md)。
- [质量基线](./QUALITY.md)、[威胁模型](./THREAT_MODEL.md)、[发布清单](./RELEASE_CHECKLIST.md)。
- [人工验收](./MANUAL_ACCEPTANCE.md)：未勾选项不代表已验收。
- [站点研究记录](./SITE_MODULE_RESEARCH.md)：修改具体站点能力时查阅。

本地自动检查范围为 TypeScript 编译与构建，交互验证留给人工。GitHub Actions 保留现有格式、类型、Lint、单元覆盖、构建与打包流程；发布前核对对应提交的远端结果及人工验收记录。
