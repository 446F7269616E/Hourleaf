# Hourleaf blocking components

English · [简体中文](./README.zh-CN.md)

These optional website adaptations are distributed separately from Hourleaf. They are not included in browser store packages and are never downloaded or updated automatically.

## Downloads

The following files belong to [Hourleaf v1.0.0](https://github.com/446F7269616E/Hourleaf/releases/tag/v1.0.0). Component versions are independent of the extension version. While the release is a draft, the public download links become available only after publication.

| Component   | Version | Files to import        | Supported store builds    | Download                                                                                                       |
| ----------- | ------- | ---------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Bilibili    | 1.2.5   | JSON, CSS, user script | Chromium                  | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-bilibili-1.2.5.zip)    |
| Xiaohongshu | 1.0.1   | JSON, user script      | Chromium                  | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-xiaohongshu-1.0.1.zip) |
| X           | 1.0.1   | JSON                   | Chromium, Firefox, Safari | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-x-1.0.1.zip)           |
| YouTube     | 1.0.1   | JSON                   | Chromium, Firefox, Safari | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-youtube-1.0.1.zip)     |
| Baidu Tieba | 1.0.1   | JSON                   | Chromium, Firefox, Safari | [ZIP](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/hourleaf-module-baidu-tieba-1.0.1.zip) |

Check each archive against [MODULE-SHA256SUMS](https://github.com/446F7269616E/Hourleaf/releases/download/v1.0.0/MODULE-SHA256SUMS) from the same release. The `main` branch may differ from released files. Source files are available in this directory; `npm run build` followed by `npm run package` produces separate archives in `dist/modules/`.

## Features

- **Bilibili:** hides home recommendations, dynamic feeds and hover panels, trending lists, update and message badges, related videos in the sidebar and ending panel, and comments including comment previews on dynamic cards. The script focuses search with `/` and temporarily disables related-video autoplay while that filter is active. Declared websites: `www.bilibili.com`, `live.bilibili.com`, `t.bilibili.com`, and `search.bilibili.com` over HTTPS.
- **Xiaohongshu:** hides recommended notes on the web home and explore landing pages. The script marks the current page scope. Declared website: `www.xiaohongshu.com` over HTTPS.
- **X:** hides ordinary posts in the web home timeline. Declared website: `x.com` over HTTPS.
- **YouTube:** separate controls for home recommendations, Shorts, related videos, and comments. Declared website: `www.youtube.com` over HTTPS.
- **Baidu Tieba:** hides recommended posts on the web home page. Declared website: `tieba.baidu.com` over HTTPS.

The five component names, descriptions, and filter groups follow Hourleaf's interface language. Unknown third-party components retain their authors' text. Website time settings use domain names independently of component names.

## Import

1. Download and extract the chosen ZIP.
2. Read `hourleaf-module.json` and every referenced CSS or `.user.js` file.
3. In Hourleaf's **Blocking** page, select the manifest and all referenced files together. Do not select `LICENSE` or `README.md`; they are distribution notices.
4. Confirm the author, version, website scope, and capabilities, then grant the requested website access and enable the component.

Chromium runs user scripts only through its isolated User Scripts API and requires browser support and user permission. Firefox and Safari store builds reject entire components containing scripts. Bilibili and Xiaohongshu packages cannot be imported unchanged on those platforms; do not remove files from a verified archive to bypass this restriction.

## Controls and schedules

Components and filter groups can be enabled separately. Groups are active at all times by default. Optionally select saved time periods for the same website: only their start and end times apply, every day, regardless of weekdays, enabled state, quotas, or access mode. Deleted references become inactive; if every reference is invalid, filtering does not resume at all times. Disabling all website time periods removes its time limit while component schedules remain effective.

Normal and plan preferences are stored separately. Plans use the installed components' plan preferences by default, subject to website permission and group schedules. Ending a plan restores normal preferences; later plans retain previous adjustments. Reimporting a newer component preserves valid preferences. Configuration backups contain compatible preferences, not CSS or script files. Explicit domain blocking remains effective independently of tab-group allowlists.

For authoring, see the [development guidelines](../docs/MODULE_DEVELOPMENT.md) and [local module specification](../docs/LOCAL_MODULES.md).

## Disclaimer

Before installation, confirm that the source is reliable and check the publisher, version, contents, and checksum. Static validation does not guarantee safety. Website changes may break components or affect page behavior.

These unofficial adaptations are provided for discussion, learning, and productivity. They are not affiliated with or endorsed by the website operators; names and trademarks belong to their owners. Use must comply with applicable law, website rules, and third-party rights.

Components are provided as is under the [MIT license](../LICENSE). Its liability limits do not exclude liability that cannot lawfully be excluded. For rights concerns, [contact the developer](https://github.com/446F7269616E/Hourleaf/issues); report security issues through the [private reporting channel](../SECURITY.md). Do not post sensitive material publicly.

[Privacy policy](../PRIVACY.md) · [MIT license](../LICENSE)
