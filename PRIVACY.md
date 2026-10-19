# Hourleaf Privacy Policy

English · [简体中文](./PRIVACY.zh-CN.md)

Effective date: October 19, 2026

Hourleaf runs locally. It does not collect or upload user data to the developer or third parties. It has no accounts, cloud sync, telemetry, advertising, or third-party analytics.

## Local data and purposes

To apply focus rules, manage plans, and display usage, Hourleaf stores the following in the browser's local storage:

- Website, time-window, allowance, whitelist, and interface settings.
- Ordinary group and Flow runtime state, including extension deadlines.
- Plan URLs, titles, notes, and completion status you enter.
- Usage totals by date, hour, website, and time window; no visit-by-visit browsing history.
- Files and settings for components you import, and SHA-256 verifiers for optional unlock passwords. Passwords are not stored in plain text.
- Tab-group details and a combined digest of member URLs for restoring bindings. Member URLs are not stored in plain text.

Plan access grants and access-confirmation state remain in browser session storage or memory. Ordinary tracking does not retain full URLs, page titles, or page contents. It does not save search terms, forms, cookies, accounts, or private messages from webpages. Content you enter stays on your device.

## Permissions and data use

`storage` saves local data; `activeTab` previews the current page when you click the extension; `scripting` applies focus rules on authorized websites; `idle` pauses tracking when the device is idle or locked; `tabGroups` supports the group whitelist. Website permissions are requested as needed and can be revoked.

Available permissions vary by browser. Chromium uses `userScripts` for local scripts you explicitly import. Firefox and Safari store builds reject script imports and accept only components without scripts. Hourleaf does not automatically download components or remote code.

Data accessed through browser APIs is used only for these features, in accordance with the [Chrome Web Store User Data Policy and Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use). It is not sold, shared, or used for advertising.

## Retention, backup, and deletion

Data remains until you delete it, clear it, or uninstall the extension. You can delete websites, plans, and components separately. Restore defaults retains usage, plans, and imported components. Usage records are deleted through Clear all data, together with the other application data. Cleanup after uninstall is subject to browser and device backup behavior.

Configuration backups are exported to your device at your request. They contain settings, plans, and compatible component preferences, excluding usage statistics, temporary grants, group bindings, and component source code. You must delete exported files yourself. Revoking website permission stops the corresponding features but does not automatically delete existing local data. Maintainers cannot remotely read or delete data on your device.

## External links and contact

When you open GitHub, a store, or another external link, that service handles the request under its own policy. Hourleaf does not attach local settings, plans, or statistics. Maintainers receive information you choose to submit through GitHub; do not post personal or sensitive material publicly.

Maintainer: [446F7269616E](https://github.com/446F7269616E). Contact the developer through [Issues](https://github.com/446F7269616E/Hourleaf/issues) for privacy questions. Report vulnerabilities privately under the [security policy](./SECURITY.md).

This policy will be updated if data handling changes, with explicit consent obtained where required.
