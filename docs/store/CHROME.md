# Chrome Web Store submission

Official references checked: 2026-10-19.

<a id="上传与素材"></a>

## Upload and assets

Upload `dist/packages/hourleaf-1.0.0-chromium.zip`, with `manifest.json` directly at the ZIP root. Minimum Chrome version: 121. `_locales` supplies the extension name and description.

Use the bilingual copy in [LISTING.md](./LISTING.md). Prepare a 128 × 128 store icon, at least one actual 1280 × 800 or 640 × 400 screenshot, and the dashboard-required small promotional image (440 × 280); supply a 1400 × 560 marquee if needed. Existing extension icons are in `public/icons/`. Create and manually review screenshots/promotional images from the final candidate.

## Single purpose

Help users manage website usage time through schedules, time budgets, focus plans, and on-device usage insights.

## Permission justification

| Permission               | Dashboard explanation                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                | Store website rules, settings, plans, and aggregated usage statistics on this device. No sync storage or developer server is used.                                                                                                          |
| `activeTab`              | Read the current site's origin only after the user clicks the toolbar button, to offer an add-site preview.                                                                                                                                 |
| `idle`                   | Exclude device idle or locked periods from active-use accounting.                                                                                                                                                                           |
| `tabGroups`              | Read existing group metadata and tab membership for user-selected whitelist rules. Hourleaf does not need access to all browsing history.                                                                                                   |
| `scripting`              | Register bundled focus content scripts only for sites the user added and explicitly authorized.                                                                                                                                             |
| `userScripts`            | Run locally selected, user-provided website scripts through the User Scripts API in the isolated USER_SCRIPT world. The user controls import, enablement, and removal.                                                                      |
| Optional HTTP(S) origins | Users can add arbitrary HTTP(S) sites, so the manifest defines a broad optional ceiling. Each permission request is limited to the exact site origins needed for the user's selection. No permanent host access is granted at installation. |

`web_accessible_resources.matches` allows matching pages to access end/plan resources; it is not an installation-time host grant.

## Privacy practices

Provide the public [privacy URL](https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.md). There are no accounts, advertising, telemetry, data sales, or developer servers; settings/statistics remain local. Answer each field using its definition, distinguishing local access/processing from developer collection/transmission. Do not describe no transmission as no website-data access or no host permissions.

Opening a GitHub document makes an ordinary browser request to GitHub without attaching statistics/settings. Document hosting and ordinary user browsing are distinct from extension telemetry.

<a id="审核备注"></a>

## Review notes

Hourleaf's primary purpose is website time management. The release package contains its complete core logic and no site-specific add-on files. It does not fetch or update executable code from URLs. Users may explicitly select local JSON/CSS files, and on Chromium local user-script files, from the optional content-customization page. Imports show the author, version, origins, and capabilities before confirmation. Scripts run only through `chrome.userScripts` in the `USER_SCRIPT` world on authorized origins. There is no `eval`, `Function`, remote script loader, or extension API bridge. Users can disable or remove an import. API access requires the browser's user-script setting; absence or revocation is handled without bypassing it.

Provide the matching review-source ZIP and point reviewers to `src/modules/local/`, `src/block/index.ts`, and `docs/LOCAL_MODULES.md`. Disclose this capability wherever the dashboard requests remote-code or user-provided-code details; do not assume a User Scripts API declaration guarantees approval.

Manual path: toolbar -> add/authorize a demo site -> set a period/budget -> open the site -> inspect statistics. Settings -> About links to privacy and the MIT license. Optional customization is under Filtering; no content package is installed by default.

<a id="官方依据"></a>

## Official references

- [Publication](https://developer.chrome.com/docs/webstore/publish)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [Additional MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Privacy and secure handling](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
