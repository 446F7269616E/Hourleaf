# Chrome Web Store 提交

官方资料核对：2026-10-19。

## 上传与素材

上传 `dist/packages/hourleaf-0.6.0-chromium.zip`，ZIP 根目录直接包含 `manifest.json`。当前最低 Chrome 版本为 121。名称及描述由 `_locales` 提供。

使用 [LISTING.md](./LISTING.md) 的中英文介绍。准备 128 × 128 商店图标、至少 1 张 1280 × 800 或 640 × 400 实际截图，以及后台要求的小型推广图（440 × 280）；大型展示图（1400 × 560）按需提供。现有扩展图标位于 `public/icons/`，截图与推广图需按最终候选制作、人工核对。

## Single purpose

Help users manage website usage time through schedules, time budgets, focus plans, and on-device usage insights.

## Permission justification

| 权限              | 可用于后台的说明                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`         | Store website rules, settings, plans, and aggregated usage statistics on this device. No sync storage or developer server is used.                                                                                                          |
| `activeTab`       | Read the current site's origin only after the user clicks the toolbar button, to offer an add-site preview.                                                                                                                                 |
| `idle`            | Exclude device idle or locked periods from active-use accounting.                                                                                                                                                                           |
| `tabGroups`       | Read existing group metadata and tab membership for user-selected whitelist rules. Hourleaf does not need access to all browsing history.                                                                                                   |
| `scripting`       | Register bundled focus content scripts only for sites the user added and explicitly authorized.                                                                                                                                             |
| `userScripts`     | Run locally selected, user-provided website scripts through the User Scripts API in the isolated USER_SCRIPT world. The user controls import, enablement, and removal.                                                                      |
| 可选 HTTP(S) 来源 | Users can add arbitrary HTTP(S) sites, so the manifest defines a broad optional ceiling. Each permission request is limited to the exact site origins needed for the user's selection. No permanent host access is granted at installation. |

`web_accessible_resources.matches` 是页面访问结束页/计划页的匹配范围，不是安装时网站权限。

## Privacy practices

提供 [PRIVACY.md](https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.md) 的公开 URL。无账户、广告、遥测、数据出售或开发者服务器；设置及统计仅存本机。填写后台问卷时区分本地访问、处理和向开发者收集/传输，逐项按字段定义回答，不把“数据不外传”写成“没有访问网站数据”。不得宣称“不使用网站权限”。

用户主动打开 GitHub 文档会向 GitHub 发起常规网页请求；插件不附带统计或配置。不要把 GitHub 页面托管和用户浏览网站归为插件遥测。

## 审核备注

Hourleaf's primary purpose is website time management. The release package contains its complete core logic and no site-specific add-on files. It does not fetch or update executable code from URLs. Users may explicitly select local JSON/CSS files, and on Chromium local user-script files, from the optional content-customization page. Imports show the author, version, origins, and capabilities before confirmation. Scripts run only through `chrome.userScripts` in the `USER_SCRIPT` world on authorized origins. There is no `eval`, `Function`, remote script loader, or extension API bridge. Users can disable or remove an import. API access requires the browser's user-script setting; absence or revocation is handled without bypassing it.

Provide the matching review-source ZIP and point reviewers to `src/modules/local/`, `src/block/index.ts`, and `docs/LOCAL_MODULES.md`. Disclose this capability wherever the dashboard requests remote-code or user-provided-code details; do not assume a User Scripts API declaration guarantees approval.

人工审核路径：点击工具栏 → 添加演示网站并授权 → 设置网站时段/额度 → 打开网站 → 查看统计；在设置 → 关于查看条款。可选能力由屏蔽页进入；默认不安装任何内容包。

## 官方依据

- [发布流程](https://developer.chrome.com/docs/webstore/publish)
- [图片要求](https://developer.chrome.com/docs/webstore/images)
- [User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [MV3 附加要求](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [隐私政策与安全处理要求](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
