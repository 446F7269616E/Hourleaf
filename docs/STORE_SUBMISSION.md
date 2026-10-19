# Hourleaf 商店提交

准备日期：2026-10-19。当前版本：0.6.0。发布状态以对应商店后台为准；构建产物不表示已经审核、签名或上架。

## 材料目录

| 材料                        | 文件                                           |
| --------------------------- | ---------------------------------------------- |
| 中英文产品介绍              | [LISTING.md](./store/LISTING.md)               |
| Chrome 字段、权限与审核备注 | [CHROME.md](./store/CHROME.md)                 |
| Firefox 字段、源码与签名    | [FIREFOX.md](./store/FIREFOX.md)               |
| Safari 承载 App、隐私与签名 | [SAFARI.md](./store/SAFARI.md)                 |
| 可复现源码构建说明          | [SOURCE_BUILD.md](./store/SOURCE_BUILD.md)     |
| 逐项发布记录                | [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) |

## 构建与打包

要求 Node.js 22 或更新版本、npm，以及系统 `zip`。在仓库根目录执行：

```sh
npm ci
npm run typecheck
npm run build
npm run package
```

| 产物                                             | 用途                                                  |
| ------------------------------------------------ | ----------------------------------------------------- |
| `dist/packages/hourleaf-0.6.0-chromium.zip`      | Chrome Web Store 上传包                               |
| `dist/packages/hourleaf-0.6.0-firefox.zip`       | AMO 上传包，签名后由 AMO 提供 XPI                     |
| `dist/packages/hourleaf-0.6.0-safari.zip`        | Safari Web Extension 转换输入，不能直接上传 App Store |
| `dist/packages/hourleaf-0.6.0-review-source.zip` | 本版本可审计源码、条款、锁文件与构建说明              |
| `dist/packages/SHA256SUMS`                       | 上述文件的校验值                                      |
| `dist/modules/`                                  | 单独分发的模块文件与校验值                            |

源码包记录打包机器的 Node/npm 版本及系统架构，不包含依赖目录、Git 数据、签名资料或本机数据。每次提交应使用同一次构建与打包产生的扩展包和源码包。

## 链接与账户资料

- 项目和支持：`https://github.com/446F7269616E/Hourleaf`、`https://github.com/446F7269616E/Hourleaf/issues`。
- 隐私：`https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.md`。
- 源码许可：`https://github.com/446F7269616E/Hourleaf/blob/main/LICENSE`。
- 模块说明、下载与免责声明：`https://github.com/446F7269616E/Hourleaf/tree/main/optional-modules`。

提交前确认这些链接已随 GitHub 默认分支发布且无需登录。商店联系邮箱、开发者法定身份、地区、税务/收款资料、Apple Team、Bundle ID 和商店条目 ID 由发布者填写。仓库不预设这些值。

## 仍需发布者完成

- 使用开发者账户创建三家商店条目，完成身份及联系信息核验。
- 使用最终候选版本截取产品画面，检查授权素材、图标和商店展示。
- 在目标浏览器、设备及实际操作系统上完成人工验收。
- Firefox 执行商店验证并取得 AMO 签名；Apple 填写真实 Bundle ID、团队和签名，再归档上传。
- 在各商店填写数据、权限、年龄、内容分级、地区和加密等问卷，确认最终预览后提交审核。

公开产品简介聚焦专注功能。权限表、完整行为说明和审核备注仍须如实披露所有可选能力；不能通过单独链接隐去商店要求披露的信息。
