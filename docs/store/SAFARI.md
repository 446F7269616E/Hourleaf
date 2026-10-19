# Safari App Store 提交

官方资料核对：2026-10-19。Safari 扩展通过承载 App 分发。`dist/safari` 和 Safari ZIP 是转换输入，不是 App Store 安装包。

## Xcode 准备

使用装有当前 Xcode 的 macOS。先构建扩展，再由发布者填写自有 Bundle ID：

```sh
npm run build:safari
npm run prepare:safari -- <开发者自有的反向域名BundleID>
```

将尖括号及其中说明替换为实际标识。标识暂留空时不运行转换命令。脚本使用 Apple 自带 `safari-web-extension-converter`，生成 `safari/` 下的承载 App 和 Web Extension 工程，复制资源，不打开 Xcode、不签名、不覆盖已有工程。该目录已在 Git 忽略规则中。

脚本同时提供 `safari/PrivacyInfo.xcprivacy` 和工程准备说明。该文件是声明不跟踪、不收集数据的初始模板；在 Xcode 中将它加入承载 App 与扩展 target 的 Copy Bundle Resources。若修改生成的原生代码或引入 SDK，必须重新核查 Required Reason API 与收集行为；不能只保留空数组。

## Xcode 人工配置

1. 打开生成的 `.xcodeproj`；逐一检查 converter 的兼容性提示。
2. 选择实际 Apple Developer Team，核对承载 App 与扩展的唯一 Bundle ID、版本、构建号及部署系统版本。
3. 检查各 target 的签名和 entitlements；macOS App Store 使用 App Sandbox。保留生成器要求的扩展配置，只申请实际需要的能力。
4. 确认隐私文件的 target membership，并在归档中查看聚合隐私报告。
5. 用自有 1024 像素品牌原图完善各 App Icon 槽位；现有 128 像素扩展图标不能替代完整 App 图标素材。
6. 将承载 App 的默认模板文字替换为实际启用步骤、支持及隐私/协议链接，不包含占位公司名称。
7. 先执行无签名编译检查；再用真实团队归档、验证并上传 App Store Connect。证书、profile 和签名密钥不进入仓库。

无签名编译可在 Xcode 的目标列表选择 macOS scheme，或使用以下命令并填写实际工程和 scheme：

```sh
xcodebuild -list -project <生成工程路径>
xcodebuild -project <生成工程路径> -scheme <macOS方案名> -configuration Release -destination 'generic/platform=macOS' -derivedDataPath safari/DerivedData CODE_SIGNING_ALLOWED=NO build
```

## App Store Connect

- 名称、中文/英文副标题与主介绍：[LISTING.md](./LISTING.md)；App 名称和副标题均应符合后台长度限制。
- 支持 URL：`https://github.com/446F7269616E/Hourleaf/issues`。
- 隐私 URL：`https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.md`。
- 使用协议 URL：`https://github.com/446F7269616E/Hourleaf/blob/main/TERMS.md`；除非已提交适用的自定义 EULA，App Store 的标准 EULA 仍按 Apple 的适用规则处理。
- App Privacy：按 Apple 对“收集”的定义填写 Data Not Collected；在设备上处理且不传出本机的统计不作为开发者收集。模板、归档隐私报告和后台回答必须一致。
- 发布者填写版权主体、联系邮箱、审核联系人、年龄分级、内容权利、地区、价格和出口合规问卷。第三方框架和加密的实际使用情况决定答案，不预填免责选项。
- 在对应 macOS/iOS 设备制作符合后台当前槽位尺寸的截图；仅提交实际支持且经过人工验收的平台。

## 审核备注

Hourleaf is a Safari web extension for website schedules, usage budgets, focus plans, and on-device usage statistics. No account or sign-in is required. Enable the extension in Safari settings, add a test website, and grant access to that site. Settings > About contains privacy and terms links. Data stays on the device and is not sent to a developer server.

The Safari build does not import or execute user-provided scripts and does not request `userScripts`, `tabGroups`, or `idle`. Optional local customization accepts only declarative JSON/CSS, with no remote resource references or automatic downloads. Core code is contained in the submitted bundle. The containing app provides enablement instructions and support. Tab-group whitelist controls are unavailable in Safari.

## 官方依据

- [Safari 打包转换](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
- [Safari 分发](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)
- [App Review Guidelines 2.5.2、4.4 与 5.1](https://developer.apple.com/app-store/review/guidelines/)
- [Privacy Manifest](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

Apple 也提供 [App Store Connect Safari Web Extension Packager](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)。该方式仍需 Apple Developer Program、真实应用身份和完整商店材料；当前工程准备入口使用本地 Xcode。
