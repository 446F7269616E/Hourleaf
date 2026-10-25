# Hourleaf store submissions

Platform scope updated: 2026-10-25. Current version: 1.0.0. Store dashboards determine publication status; generated artifacts do not imply review, signing, or availability.

<a id="材料目录"></a>

## Materials

| Material                                   | File                                           |
| ------------------------------------------ | ---------------------------------------------- |
| English/Chinese product descriptions       | [LISTING.md](./store/LISTING.md)               |
| Chrome metadata, permissions, review notes | [CHROME.md](./store/CHROME.md)                 |
| Safari host app, privacy, signing          | [SAFARI.md](./store/SAFARI.md)                 |
| Reproducible source instructions           | [SOURCE_BUILD.md](./store/SOURCE_BUILD.md)     |
| Release gates                              | [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) |

<a id="构建与打包"></a>

Firefox submission files are retained in [the deprecated archive](../deprecated/firefox/README.md) and are outside current release requirements.

## Build and package

Requirements: Node.js 22 or newer, npm, and system `zip`. From the repository root:

```sh
npm ci
npm run typecheck
npm run build
npm run package
```

| Artifact                                         | Purpose                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `dist/packages/hourleaf-1.0.0-chromium.zip`      | Chrome Web Store upload                                                              |
| `dist/packages/hourleaf-1.0.0-safari.zip`        | Safari converter input, not an App Store upload                                      |
| `dist/packages/hourleaf-1.0.0-review-source.zip` | Matching source, MIT license, bilingual README/privacy, lockfile, build instructions |
| `dist/packages/SHA256SUMS`                       | Checksums of the files above                                                         |
| `dist/modules/`                                  | Separately distributed modules and checksums                                         |

Review source records the packaging machine's Node/npm versions and architecture, excludes dependencies/Git/signing/user data, and must match the submitted candidate. Browser packages retain the MIT license and English/Chinese privacy notices; source additionally includes `README.md` and `README.zh-CN.md`. Independent module ZIPs include their own README/disclaimer and MIT notice.

<a id="链接与账户资料"></a>

## Public links and account details

- [Project](https://github.com/446F7269616E/Hourleaf) · [Support](https://github.com/446F7269616E/Hourleaf/issues).
- [Privacy policy](https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.md) · [隐私政策](https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.zh-CN.md).
- [MIT license](https://github.com/446F7269616E/Hourleaf/blob/main/LICENSE).
- [Module descriptions, downloads, and disclaimer](https://github.com/446F7269616E/Hourleaf/tree/main/optional-modules).

Verify default-branch links are public without sign-in. The publisher supplies store email, legal identity, regions, tax/payment details, Apple Team, Bundle ID, and listing IDs. Do not invent these values or introduce a separate project user agreement; source licensing remains MIT.

<a id="仍需发布者完成"></a>

## Publisher actions still required

- Create listings through developer accounts and complete identity/contact verification.
- Capture final-candidate screenshots and review authorized imagery/icons/store previews.
- Manually accept the target browsers, devices, and OS versions.
- Supply real Apple identifiers/team/signatures, archive, and upload.
- Complete store data, permissions, age/content, region, and encryption questionnaires; verify final preview and submit for review.

Main introductions describe the focus product. Permission fields, full behavior disclosures, and review notes must still disclose every optional capability wherever required; separate documentation cannot conceal required information.
