# Safari App Store submission

Official references checked: 2026-10-19. Safari extensions are distributed with a host app. `dist/safari` and its ZIP are converter inputs, not App Store binaries.

<a id="xcode-准备"></a>

## Xcode preparation

Use macOS with current Xcode. Build resources, then supply the publisher's real reverse-DNS Bundle ID:

```sh
npm run build:safari
npm run prepare:safari -- <your-real-bundle-identifier>
```

Replace the placeholder, including brackets. Do not convert while identity remains blank. The script invokes Apple's `safari-web-extension-converter`, creates host/extension projects under ignored `safari/`, copies resources, and neither opens Xcode, signs, nor overwrites an existing project.

It also supplies `safari/PrivacyInfo.xcprivacy` and preparation notes. The initial template declares no tracking/collection. Add it to the host and extension targets' Copy Bundle Resources. Changes to native sources or added SDKs require a new Required Reason API/data review; do not retain empty arrays without checking.

<a id="xcode-人工配置"></a>

## Manual Xcode configuration

1. Open the generated `.xcodeproj` and resolve every converter compatibility warning.
2. Select the real Apple Developer Team; verify unique host/extension IDs, version/build, and deployment targets.
3. Review signatures/entitlements. Use App Sandbox for the Mac App Store; retain required generated configuration and only necessary capabilities.
4. Confirm privacy-file target membership and inspect the archive's aggregated privacy report.
5. Complete App Icon slots from an owned 1024px brand master; 128px extension icons are insufficient.
6. Replace host-app placeholder copy/company names with actual enablement instructions, support, and privacy links.
7. Compile without signing first; then archive/validate/upload with the real team. Keep certificates, profiles, and keys out of Git.

Select the generated macOS scheme in Xcode, or replace the project/scheme placeholders below:

```sh
xcodebuild -list -project <generated-project-path>
xcodebuild -project <generated-project-path> -scheme <macOS-scheme> -configuration Release -destination 'generic/platform=macOS' -derivedDataPath safari/DerivedData CODE_SIGNING_ALLOWED=NO build
```

## App Store Connect

- Name, localized subtitle/details: [LISTING.md](./LISTING.md); obey current field limits.
- [Support URL](https://github.com/446F7269616E/Hourleaf/issues).
- [Privacy URL](https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.md), with [Chinese policy](https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.zh-CN.md) available separately.
- App distribution uses Apple's standard EULA; source is MIT licensed. Do not introduce another project agreement.
- App Privacy: answer Data Not Collected using Apple's definition. On-device processing that does not leave the device is not developer collection. Template, archived report, and dashboard answers must agree.
- Publisher supplies copyright identity, contact/review email, age rating, content rights, regions, pricing, and export-compliance answers. Actual SDK/encryption behavior determines answers; do not preselect exemptions.
- Capture the final app on each submitted macOS/iOS device at the dashboard's current required sizes. Submit only supported, manually accepted platforms.

<a id="审核备注"></a>

## Review notes

Hourleaf is a Safari web extension for website schedules, usage budgets, focus plans, and on-device usage statistics. No account or sign-in is required. Enable the extension in Safari settings, add a test website, and grant access to that site. Settings > About contains privacy and MIT license links. Data stays on the device and is not sent to a developer server.

The Safari build does not import or execute user-provided scripts and does not request `userScripts`, `tabGroups`, or `idle`. Optional local customization accepts only declarative JSON/CSS, with no remote resource references or automatic downloads. Core code is contained in the submitted bundle. The containing app provides enablement instructions and support. Tab-group whitelist controls are unavailable in Safari.

<a id="官方依据"></a>

## Official references

- [Safari conversion](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
- [Safari distribution](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)
- [App Review Guidelines 2.5.2, 4.4, 5.1](https://developer.apple.com/app-store/review/guidelines/)
- [Privacy Manifest](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

Apple also offers the [App Store Connect Safari Web Extension Packager](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect). It still requires Developer Program membership, real app identity, and complete store materials. This repository's preparation entry uses local Xcode.
