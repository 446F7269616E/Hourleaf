# Hourleaf 本地 Debug 构建

本地 Debug 版用于对当前仓库中的网站模块和常用网站规则做侧载测试，不是发布产物。它与 Chromium 正式版使用同一套 `src/`、`static/`、样式和 manifest 基线；差异只由构建期注入，正式构建不会读取或打包 Debug 预置内容。

## 构建与加载

```bash
npm run build:debug
```

默认输出到仓库同级的 `/Users/digitalair/b站插件debug`。这是本机已经预留的独立目录，不在 Git 仓库内。需要其他本地路径时可运行：

```bash
npm run build:debug -- /absolute/path/to/hourleaf-debug
```

本机源码工作空间已更名为 `/Users/digitalair/专注插件`；Debug 输出继续保留上述独立路径，因此已侧载 Debug 版只需在扩展管理页点击重新加载，再刷新 B 站页面。当前 Bilibili 1.2.4 包含 Shadow DOM 兼容、播放结束推荐、相关视频屏蔽时关闭自动连播及动态悬停弹窗/热搜榜及动态/消息角标联动；阻止续播需要启用浏览器用户脚本能力；Debug 重载会更新预置模块，正式版需手动重新导入对应模块文件。

自定义输出必须位于仓库外，或位于仓库内已忽略的 `.local-debug/`。构建器保留输出目录本身，只会清空空目录或带有有效 `hourleaf.local-debug-build` 标记目录中的旧产物，避免覆盖任意目录。随后在 Chromium 的扩展管理页打开开发者模式并“加载已解压的扩展程序”，选择该输出目录。

Debug manifest 使用 `Hourleaf Debug` 名称，并把当前 `optional-modules/*` 清单声明的网站范围作为固定 `host_permissions`。这是为了让预置网站不经过逐个授权即可复现；该权限只存在于本地 Debug manifest，正式三平台 manifest 仍使用按需的 `optional_host_permissions`。

Debug 与正式版共用已选定 C 版的 `public/icons/`，包括工具栏小尺寸专用资源；不再使用旧候选图回退。详见 [图标规范](./ICONS.md)。

## 预置与更新语义

- 构建时读取 `optional-modules/` 下的所有当前模块，将清单、CSS 和用户脚本文本内联到本地 Debug bundle；运行时不联网获取模块。
- 每个模块的首个精确来源会创建一条常用受管网站规则；Bilibili 沿用经过审核的站点家族范围。
- 首次出现的 Debug 预置模块默认启用。已有模块在重建时更新内容，但保留测试者的启停和分组选择。
- `hourleaf.debug-seed.v1` 只记录由 Debug 构建预置过的模块 ID。新版不再提供某个预置模块时，仅删除这个记录中对应的陈旧模块；不在记录中的手动导入模块不会被清理。
- 已创建的网站规则保留为普通用户配置，构建更新不删除网站或撤销权限。

## 发布隔离

- Debug 默认目录位于 Git 仓库外；仓库内备用目录 `.local-debug/`、`debug-build/` 和 `dist/` 均被忽略。
- `npm run build` 只生成 `dist/chromium`、`dist/firefox`、`dist/safari`，不会读取 Debug 输出。
- `npm run package` 拒绝含 `debug-build.json`、Debug 名称、`version_name` 或固定 `host_permissions` 的商店候选。
- CI 不运行或上传 `build:debug`，GitHub artifact 和 Release 只接收 `dist/packages` 与独立的 `dist/modules`。

提交或发布前不得把本地 Debug 目录复制到 `dist/<platform>`，也不得把它作为 GitHub Release、Action artifact 或商店候选上传。

## 暂停页和额度测试工具（2026-09-28）

Debug 工具栏新增以下操作，正式构建的 UI 不展示，后台也拒绝执行 DEBUG_ACTION：

1. **配置测试网站（3 组 × 1 分钟）**：配置 `https://example.com` 与 `http://localhost:4173`，将这两个专用测试网站设为 3 分钟、3 组、心流模式。仅覆盖这两个测试站的时间段，不覆盖其他网站。
2. **快速查看当前暂停页**：显示当前配置网站的真实状态；没有 HTTP 页面时默认预览 Example 测试网站，不制造用量。
3. **消耗当前组**：把当前组剩余额度补记到今天的测试用量，原网页下一次检查触发真实暂停流程。
4. **消耗整个时段**：补记时段剩余额度，检查最后一组、宽容/心流/严格到期行为。

消耗操作会写入统计；查看页面不执行解锁。若选择心流“播放结束”，请回到原网站上自动出现的暂停覆盖页操作，独立预览页没有原视频，因此不显示视频结束按钮。

本地视频测试站启动命令：

```bash
npm run debug:site
```

打开 `http://localhost:4173` 后生成一段 8 秒的视频（canvas + MediaRecorder，全程本地），播放视频并通过 Debug 工具消耗当前组。服务只监听 127.0.0.1:4173，Ctrl+C 结束。测试站 HTML 位于 `scripts/fixtures/focus-test.html`，不会进入商店包。Debug manifest 额外固定授予以上两个测试来源；正式版仍只有可选来源权限。

清空数据或恢复默认设置后，Debug 自动预置暂停，防止后台重启重新添加数据。重新点击“配置测试网站”可以恢复测试环境。运行此次开发验收时只做 TypeScript 与正式/Debug 构建，未执行单元、E2E 或浏览器交互测试。

## 工具栏尺寸（2026-10-01）

工具栏采用固定 380px 宽度和最大 600px 高度，超长内容自然滚动。上述四个 Debug 操作位于可展开的 Debug 区域，默认折叠；本次弹窗的展开状态在数据刷新时保留，避免默认高度超过浏览器弹窗上限。
