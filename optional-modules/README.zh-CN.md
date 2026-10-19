# Hourleaf 屏蔽组件

[English](./README.md) · 简体中文

这些网站适配组件与 Hourleaf 分开发布，不包含在浏览器商店包中，也不会自动下载或更新。

## 下载

以下文件对应 [Hourleaf v1.0.0](https://github.com/446F7269616E/Hourleaf/releases/tag/v1.0.0)，组件版本独立于扩展版本。Release 处于草稿状态时，公开下载链接须等正式发布后才可访问。

| 组件     | 版本  | 导入文件            | 支持的商店版本            | 下载                                                                                                           |
| -------- | ----- | ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Bilibili | 1.2.5 | JSON、CSS、用户脚本 | Chromium                  | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-bilibili-1.2.5.zip)    |
| 小红书   | 1.0.1 | JSON、用户脚本      | Chromium                  | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-xiaohongshu-1.0.1.zip) |
| X        | 1.0.1 | JSON                | Chromium、Firefox、Safari | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-x-1.0.1.zip)           |
| YouTube  | 1.0.1 | JSON                | Chromium、Firefox、Safari | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-youtube-1.0.1.zip)     |
| 百度贴吧 | 1.0.1 | JSON                | Chromium、Firefox、Safari | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-baidu-tieba-1.0.1.zip) |

请与同一版本的 [MODULE-SHA256SUMS](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/MODULE-SHA256SUMS) 核对校验值。`main` 可能与发布文件不同；本目录保留源码，执行 `npm run build` 后再运行 `npm run package` 可在 `dist/modules/` 生成独立组件包。

## 功能

- **Bilibili：**隐藏首页推荐、动态信息流及悬停弹窗、热搜榜、更新与消息提醒标识、侧栏和片尾相关视频、评论及动态卡片精选评论。脚本支持按 `/` 聚焦搜索，并在相关视频过滤生效时临时关闭相关推荐自动连播。声明网站为 HTTPS 下的 `www.bilibili.com`、`live.bilibili.com`、`t.bilibili.com` 和 `search.bilibili.com`。
- **小红书：**隐藏网页版首页和探索首页的推荐笔记，脚本标记当前页面范围。声明网站为 HTTPS 下的 `www.xiaohongshu.com`。
- **X：**隐藏网页版主页时间线中的普通帖子。声明网站为 HTTPS 下的 `x.com`。
- **YouTube：**分别控制首页推荐、Shorts、相关视频与评论。声明网站为 HTTPS 下的 `www.youtube.com`。
- **百度贴吧：**隐藏网页版首页推荐帖子。声明网站为 HTTPS 下的 `tieba.baidu.com`。

五个组件的名称、说明及过滤分组随 Hourleaf 界面语言切换；未知第三方组件保留作者文案。网站时间设置独立使用域名，不采用组件名称。

## 导入

1. 下载并解压所选 ZIP。
2. 阅读 `hourleaf-module.json` 及全部引用的 CSS、`.user.js` 文件。
3. 在 Hourleaf“屏蔽”页面一次选择清单和全部引用文件。不要选择 `LICENSE`、`README.md`，它们是分发说明。
4. 核对作者、版本、网站范围和能力后，主动授予网站权限并启用。

Chromium 仅通过隔离的 User Scripts API 运行用户脚本，需要浏览器支持及用户授权。Firefox 与 Safari 商店版拒绝整个含脚本组件；Bilibili 和小红书组件不能原样导入这两个平台，不应通过删除已校验文件来绕过限制。

## 开关与时间

组件和内容分组可分别启停。分组默认不限时间，也可选择对应网站已保存的时间段：仅按起止时间每天生效，忽略星期、启停、额度和访问方式。删除引用后该项失效；全部引用失效时不会回退为全天屏蔽。停用网站全部时间段会解除网站时间限制，但组件定时仍然生效。

普通与计划偏好独立保存。计划默认使用已安装组件的计划偏好，仍受网站权限和分组定时约束；结束后恢复普通偏好，下次计划保留之前的调整。重新导入新版保留有效偏好，配置备份只包含兼容偏好，不包含 CSS 或脚本文件。显式域名阻断与标签页组白名单独立生效。

开发组件请阅读[开发准则](../docs/MODULE_DEVELOPMENT.md)与[本地模块规范](../docs/LOCAL_MODULES.md)。

## 免责声明

安装前请自行确认来源可靠，并核对发布者、版本、内容和校验值。静态校验不保证安全，网站更新可能使组件失效或影响页面功能。

组件供交流、学习和提升效率使用，属于非官方适配，与网站运营者无隶属或授权关系；名称和商标归各自权利人所有。使用时应遵守适用法律、网站规则及第三方权利。

组件按现状提供，责任限制适用 [MIT 许可证](../LICENSE)，不排除依法不能免除的责任。合法权益问题请[联系开发者](https://github.com/446F7269616E/Hourleaf/issues)，安全问题使用[私密报告渠道](../SECURITY.md)，请勿公开敏感材料。

[隐私政策](../PRIVACY.md) · [MIT 许可证](../LICENSE)
