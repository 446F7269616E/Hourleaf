# Firefox AMO 提交

官方资料核对：2026-10-19。

## 提交文件

- 扩展包：`dist/packages/hourleaf-0.6.0-firefox.zip`。
- 同版本源码：`dist/packages/hourleaf-0.6.0-review-source.zip`；包根的 `BUILDING.md` 给出重建步骤，`BUILD_ENVIRONMENT.json` 记录打包环境。
- 简介和详情：[LISTING.md](./LISTING.md)。
- 许可证选择与根 `LICENSE` 一致的自定义许可，附完整文本；不得选择与非商业限制相冲突的标准开源许可。
- 隐私链接：[PRIVACY.md](https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.md)。

保留已存在的 Gecko ID `bilifocus@opensource.local`。该值是扩展稳定身份，不是联系邮箱；已有安装不能通过改名生成新身份。

## 数据与版本

`browser_specific_settings.gecko.data_collection_permissions.required` 为 `["none"]`。插件不向开发者或第三方传输设置、计划和统计。新扩展按 AMO 要求声明内建数据同意字段。

最低 Firefox 仍为 121；内建数据同意界面从桌面 Firefox 140 开始支持，旧版不会显示这一界面。插件在旧版同样不收集或传输数据，因此不依赖该界面获得数据传输许可。标签页组能力按实际 API 可用性判断，不把所有 Firefox 121+ 版本写为支持组白名单。当前候选未承诺 Firefox Android；提交时只选择经过人工验收的平台。

## 审核备注

Hourleaf is a website time-management extension. Its executable core is bundled and built from TypeScript using esbuild. Please use the attached source archive and `BUILDING.md` to reproduce the package. It has no account, analytics, ads, remote executable loader, or data transmission.

Firefox store builds do not request or use `userScripts`. Local JSON/CSS customization is opt-in through the content-customization page and requires confirmation after displaying the file author, version, and exact origins. Imports containing user scripts are rejected by both the interface and background service. Previously stored user scripts are not registered. Existing registrations are removed when the old API permission remains available; users should reload already-open pages after upgrading because previously executed page effects cannot be undone by unregistering a script alone.

All host access is optional and requested for the user-selected site origins. The broad optional HTTP(S) patterns are only the request ceiling. `tabGroups` is used to read membership for user-selected rules; unavailable APIs fail closed for group whitelists.

## 商店验证与签名

在发布环境运行 AMO 提交验证或 `web-ext lint`，人工审阅每项错误和警告，不以构建成功替代审核。源码经打包工具处理，必须为每次版本提交附上匹配源码及构建说明。

上传后取得 AMO 签名 XPI。最终安装、升级、禁用、启用和卸载验收使用签名文件；普通 ZIP 和临时加载目录不是已签名分发文件。

## 官方依据

- [Add-on Policies 与 User Scripts 限制](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [源码提交要求](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [内建数据收集同意机制](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [提交步骤](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [签名和分发](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
