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

本机源码工作空间已更名为 `/Users/digitalair/专注插件`；Debug 输出继续保留上述独立路径，因此已侧载 Debug 版只需在扩展管理页点击重新加载，再刷新 B 站页面。Bilibili 1.2.1 的 Shadow DOM 兼容需要同时更新核心与模块；Debug 重载会更新预置模块，正式版需手动重新导入对应模块文件。

自定义输出必须位于仓库外，或位于仓库内已忽略的 `.local-debug/`。构建器只会清空空目录或带有有效 `hourleaf.local-debug-build` 标记的旧产物，避免覆盖任意目录。随后在 Chromium 的扩展管理页打开开发者模式并“加载已解压的扩展程序”，选择该输出目录。

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
