# Hourleaf local module specification

Protocol and core behavior synchronized: 2026-10-20. See the [component catalog](../optional-modules/README.md), [feature guide](./FEATURES.md), and [development index](./README.md).

## Distribution and trust boundary

Store packages contain the general focus core and local module importer. Hourleaf does not fetch logic from a GitHub directory, remote update manifest, or arbitrary URL. Users download files separately and explicitly select them for import.

A maximum of 32 local modules is supported. Each module can declare up to 32 exact HTTP(S) origins, 128 element selectors, 100 KB of CSS, and 150 KB of user script. Wildcard hosts, credential-bearing URLs, remote file references, nonempty DNR rules, and scripts in subframes are rejected.

Repository modules live in `optional-modules/<slug>/`. `npm run package` validates basic metadata and the referenced file set, then creates `dist/modules/hourleaf-module-<slug>-<version>.zip` and SHA-256 checksums. These are separate GitHub Release assets and never enter browser installation packages. Each ZIP includes the MIT `LICENSE` and a README; only the manifest and its referenced CSS/script files are import inputs.

Every import must declare a nonempty author and the exact format identifier `hourleaf.local-module`. The format is not inferred from an extension, and missing authors are not supplied for legacy files.

## Platform capabilities

| Capability                              | Chromium store build                                   | Firefox AMO build                       | Safari App Store build                  |
| --------------------------------------- | ------------------------------------------------------ | --------------------------------------- | --------------------------------------- |
| Exact-origin timing and domain policies | Supported                                              | Supported                               | Supported                               |
| Element hiding and CSS                  | Supported                                              | Supported                               | Supported                               |
| Local DNR rules                         | Disabled                                               | Disabled                                | Disabled                                |
| User scripts                            | User Scripts API only; user must enable browser access | Disabled; imported code is not executed | Disabled; imported code is not executed |

Chromium scripts run in the browser's isolated `USER_SCRIPT` world at `document_idle`, in the top frame only. They receive no access to Hourleaf storage, permissions, tabs, or other extension APIs. Imported text is never executed using `eval`, `Function`, a script element, or `scripting.executeScript({code})`.

## Display names and descriptions

The interface calls these blocking plugins. Repository components use website names without a “focus module” suffix. Descriptions state what is hidden; the shared import notice carries the unofficial status and source warning. Stable IDs map the five repository catalog entries to Chinese and English display text without requiring reimport. Unknown third-party entries retain author-provided names and descriptions. Website time settings use domains independently of component names.

## JSON manifest

```json
{
  "schemaVersion": 1,
  "format": "hourleaf.local-module",
  "id": "example.local.focus",
  "name": "Example Focus",
  "author": "Example Author",
  "version": "1.0.0",
  "description": "Optional description",
  "matches": ["https://example.com/*"],
  "domainPolicy": "timed",
  "hideSelectors": [],
  "filterGroups": [
    {
      "id": "home-recommendations",
      "name": "Home recommendations",
      "description": "Hide ordinary recommendation cards on the home page.",
      "selectors": [".recommendations > .card"]
    }
  ],
  "cssFiles": ["focus.css"],
  "userScriptFiles": ["focus.user.js"]
}
```

- `domainPolicy`: `timed`, `always-allow`, or `always-block`. Blocking takes precedence over allowing; both are suspended when the component is disabled.
- `format`: must be `hourleaf.local-module`. `author` must contain 1–100 characters of nonempty text.
- `hideSelectors`: generates only `display: none !important`. These selectors stay active whenever the module is enabled and suit a small set of fixed rules.
- `filterGroups`: optional user-controlled groups, up to 24 within the total 128-selector limit. IDs must be stable lowercase kebab-case; `name` and `description` appear on the Blocking page, and `selectors` must be nonempty. Groups default to enabled. Disabled IDs are saved with the installation; new groups are enabled after an update, and removed IDs are cleaned up.
- `shadowRoots`: optional array of up to eight entries such as `{ "hostSelector": "#site-root", "mountEvent": "siteMounted" }`. Host selectors retain the 300-character limit. Event names start with a letter and contain at most 64 letters, digits, underscores, colons, or hyphens. The core copies only this module's CSS and enabled group rules into declared open shadow roots. It does not mix modules, enter closed roots, or traverse iframes. Mount events trigger root discovery without reading their payload or executing code. Without an event, discovery follows inserted hosts and existing page-state refreshes. Legacy manifests do not enter shadow roots by default.
- `css` / `cssFiles`: inline CSS or local CSS files selected in the same import. `@import` and external resources through `url()` are rejected.
- `dnrRules`: may be omitted or an empty array for schema compatibility. Any nonempty rule is rejected. Browser DNR `initiatorDomains` includes subdomains and cannot enforce the exact scheme, host, and port boundary required here.
- `userScript` / `userScriptFiles`: registered through the User Scripts API on Chromium only.

Manifests cannot reference network URLs. All referenced files must be selected together with the manifest.

## Standalone CSS and user scripts

Without a JSON manifest, file headers must include `@format`, `@id`, `@name`, `@author`, `@version`, and at least one exact `@match`:

```text
// ==UserScript==
// @format  hourleaf.local-module
// @id      example.local.script
// @name    Example Script
// @author  Example Author
// @version 1.0.0
// @match   https://example.com/*
// ==/UserScript==
```

CSS can use the same metadata fields. Every selected standalone file needs the complete header. Format, ID, name, author, and version must match across the selection. Multiple selected files become one module; no external references are followed.

## Import confirmation and safety

The confirmation view must show the module name, author, format, version, exact website scope, and capabilities. Users must acknowledge that static checks are limited, do not certify third-party content, and require them to review and trust the source. No website permission request or import may precede acknowledgement.

`createLocalModuleImportPreview()` returns nonpersistent preview data: `author`, `format`, `version`, `matches`, `capabilities`, `hasUserScript`, and `riskDisclosure`. Its `code` is `review-content-and-assume-risk`, with `acknowledgementRequired: true`. Display localized text rather than internal codes or capability identifiers. `IMPORT_LOCAL_MODULE` must carry the same fixed acknowledgement code; the privileged boundary rejects missing or forged values.

A bounded linear scan of scripts up to 150 KB rejects obvious out-of-scope behavior:

- `eval`, `Function`, string timers, dynamic `import`, `importScripts`, and WebAssembly code generation;
- direct networking through `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or `sendBeacon`;
- common privileged extension API access, dynamic `<script>` injection, and `document.cookie` access.

The scanner recognizes string and comment boundaries before checking common dot/bracket member and qualified constructor forms. Comment markers inside strings cannot hide later code. It is not a general malware scanner: it does not unpack, deobfuscate, track aliases or data flow, or save reports. The importer and privileged boundary apply the same normalization. Accepted scripts still execute only in the browser's `USER_SCRIPT` world.

## Errors and recovery

`LocalModuleImportError` exposes a stable `code`, a short default message, and `recoverable: true`. The UI maps codes to localized guidance.

| Code                                                         | Recovery                                         |
| ------------------------------------------------------------ | ------------------------------------------------ |
| `selection-required` / `file-limit-exceeded`                 | Select 1–16 files again                          |
| `invalid-file` / `duplicate-file` / `unsupported-file-type`  | Fix names, sizes, duplicates, or types           |
| `multiple-manifests` / `invalid-json` / `invalid-manifest`   | Keep one valid manifest and correct its fields   |
| `invalid-reference` / `missing-reference`                    | Correct references or select the missing files   |
| `metadata-required` / `metadata-conflict`                    | Complete and align standalone headers            |
| `author-required` / `format-required` / `unsupported-format` | Supply an author and the canonical format        |
| `unsupported-dnr`                                            | Remove all nonempty DNR rules                    |
| `unsafe-css` / `unsafe-user-script`                          | Remove external resources or prohibited behavior |

## Migration

Required authors, the fixed format, and empty DNR rules tighten schema v1. Legacy installations missing `author` or `format: "hourleaf.local-module"`, or containing nonempty DNR rules, no longer run. Initialization clears the legacy Hourleaf DNR rule ID range. Authors must update source files and users must reimport them; Hourleaf does not invent authors or mark old files as trusted.

## Filter-group schedules

Each group card contains its description, switch, and active-period summary. Expanding the summary allows selection of saved periods for the matching website only. The shared site-scope rules match exact module origins to configured websites; the reviewed Bilibili domain family shares periods, while other websites use exact origins.

“All times” is the default. Selecting periods applies filtering during their daily start/end ranges only. Weekdays, enabled state, access policy, quota, and grouping are ignored. For example, 12:00–18:00 filters every day during that interval even if the source period is disabled. Turning off “All times” without selecting a period disables that filter. Schedules never override component or group switches.

Disabling every website period removes its time limit but preserves filter schedules. Deleting a referenced period invalidates that reference.

Installation preferences may contain `filterGroupSchedules`, shaped as `{ "group-id": [{ "targetId": "...", "periodId": "..." }] }`, with at most 64 references per group. A missing group key means all times; an empty array means no active times. This is a core-owned preference, not a manifest field. Normal and plan preferences remain separate and are included in configuration backups. Older installations or backups without this field retain their existing behavior.

Start/end edits take effect immediately. Weekday or enabled-state edits do not change filtering. Deleting a period or website, or changing a reference so it no longer belongs to the module's website, makes it inactive. Old cross-site references remain visible as invalid items that users can remove. All-invalid selections never fall back to all times. Equal start and end means the whole day; overnight intervals match both sides of midnight; end boundaries are exclusive. Documents and declared open shadow roots share the same effective selectors. Reimport preserves schedule references.

## Plan preferences

`planMode.enableAllBlocking` defaults to enabled. During a valid plan, installed modules default to `planPreferences: { enabled: true, disabledFilterGroupIds: [] }`. The existing Blocking controls edit only the current normal or plan context. Stopping, completing, or expiring a plan, or disabling this setting, restores normal preferences. Later plans retain previous plan adjustments.

Component updates preserve both preference sets and remove only deleted group IDs. Configuration backups include both sets of data, without script source. Existing website permissions and group schedules still apply. Plans do not install modules, request permissions, or override normal domain policies.

## Interface localization

`src/ui/local-module-copy.ts` maps stable module/group IDs to Chinese and English keys in `src/shared/i18n.ts`. Cards, filters, accessible names, deletion confirmation, and import previews use the same read-only display projection. Existing imports need no reinstall, and stored names, scripts, and selectors are unchanged. Unknown modules and groups retain the author's text. Update both languages and the ID map when catalog text changes.

## Access authorization and platform policy

Website periods, tab-group allowlists, and independent plans govern access and timing; they do not override explicit module domain blocking or content rules. Plans always use their own timer, and allowlists do not extend their deadlines. Neither expands manifest origins. A website without enabled time periods is unrestricted by its timer, while filtering and daily schedules remain active.

Backup restoration applies preferences only to locally installed modules at the same version. It contains no CSS, scripts, or execution state. Deleted website periods stay invalid rather than becoming all-times filters.

Firefox and Safari store builds reject script-bearing modules in both preview and the background service, and do not execute scripts stored before an upgrade. Authors must provide a separate script-free JSON/CSS edition for these platforms; users should not remove files from a verified package. The shared policy lives in `src/modules/local/capabilities.ts` and is used by the UI, permission entry points, and background.

AMO's [User Scripts policy](https://extensionworkshop.com/documentation/publish/add-on-policies/#user-scripts) reserves this API for script managers. Hourleaf's purpose is focus and website time management, so its Firefox store build does not request that permission. Chromium uses the [User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts) for files explicitly imported by users; review notes must disclose the full capability. Apple packages remain self-contained under [App Review Guidelines 2.5.2](https://developer.apple.com/app-store/review/guidelines/#software-requirements).

After an upgrade, the background makes a best-effort attempt to unregister Hourleaf's existing user-script registrations if the old permission remains available; it does not request the permission again. Unregistration stops future injection but cannot undo scripts already executed in a page. Refresh previously open pages after upgrading.
