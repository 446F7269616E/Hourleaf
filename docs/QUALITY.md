# Hourleaf quality and store-compliance baseline

> Status: release gate
> Source/documentation synchronized: 2026-10-25. Platform acceptance is recorded separately.

<a id="单一用途"></a>

## Single purpose

Hourleaf helps users manage website time under their own rules and reduce distracting content.

- Timing, schedules, budgets, plans, statistics, and site adaptations must serve that purpose.
- No injected advertising, data sales, browsing profiles, or unrelated analytics.
- No requirement to install another extension, and no automatic module downloads from GitHub or other URLs.
- Store descriptions, permission reasons, privacy disclosures, and behavior must agree.

<a id="权限预算"></a>

## Permission budget

| Capability                    | Permission                  | Boundary                                                                                                                                             |
| ----------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local settings and statistics | `storage`                   | No cloud sync or telemetry                                                                                                                           |
| Current-site toolbar preview  | `activeTab`                 | Read the origin only after a toolbar click; do not retain the page URL                                                                               |
| Exclude time away             | `idle`, where supported     | Use only active/idle/locked state                                                                                                                    |
| Tab-group whitelist           | `tabGroups`, Chromium       | Read metadata and membership; validate session IDs and restore only unique feature matches; fail closed without group/session APIs; absent on Safari |
| Register authorized sites     | `scripting`                 | Only configured, authorized site scopes                                                                                                              |
| User-selected sites           | `optional_host_permissions` | HTTP(S) wildcards are the request ceiling; request exact origins, except explicitly reviewed site families in `shared/site-scope.ts`                 |
| Local user scripts            | `userScripts`               | Chromium only, with the browser's user-script setting enabled; absent on Safari                                                                      |

Persistent `tabs`, `history`, `cookies`, `identity`, `webRequest`, `downloads`, `management`, `nativeMessaging`, `debugger`, and `unlimitedStorage` permissions are outside the budget. New permissions require an implemented need, product disclosure, and a Chrome/Safari review; do not reserve permissions for future features.

Register content scripts only for configured sites with valid permissions. Rejection or revocation must stop the affected behavior safely, without repeated prompts or broader permission requests.

<a id="本地模块与远程代码"></a>

## Local modules and executable code

- No remote JavaScript/Wasm execution, `eval`, `new Function`, remote dynamic imports, or downloaded instruction interpreters.
- Store packages contain neither `optional-modules/` nor site-specific executable modules. Modules are distributed separately as GitHub source assets.
- Imports require an explicit local file selection. No URL installation, remote updates, or background downloads.
- CSS is self-contained. Reject nonempty DNR rules because they cannot preserve the exact-origin boundary.
- User scripts use the browser User Scripts API in its isolated world, never general script injection.
- Safari store builds reject script-bearing imports in both UI and background and do not register previously stored scripts.
- `src/modules/local/capabilities.ts` supplies the shared policy for import, runtime, UI, and permission requests. Old storage and backup restoration cannot bypass it.
- Main product descriptions focus on time management. Complete permission explanations and review notes must disclose optional capabilities and platform restrictions wherever the store requires them.

Official boundaries: [Chrome MV3 remote code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code), [Chrome distribution](https://developer.chrome.com/docs/extensions/how-to/distribute), [Safari distribution](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension).

<a id="数据最小化"></a>

## Data minimization

- Ordinary usage stores configured site/target IDs, dates, and aggregated seconds; site settings store validated origins, hostnames, labels, and rules.
- Do not persist ordinary browsing URLs, page titles, searches, page text, cookies, or accounts.
- Plans retain URLs, titles, goals, order, status, duration, and end behavior explicitly entered by the user. Active grants, end notices, and tab bindings are session-only, or background-memory-only without session storage.
- Whitelist settings retain names, weekdays, and time windows. Local recovery records retain random identities and combined feature hashes; active group IDs are session-validated. Do not save plaintext member URLs or browser page titles, restore by name alone, or include bindings in backups.
- Modules may classify pages in memory but must not write matching content into history.
- Clearing statistics, deleting sites, and restoring settings must clean the corresponding local state.
- No telemetry, advertising, accounts, cloud backup, or third-party analytics.
- Configuration backups are explicit local file operations under Data management, without network/cloud/`downloads` API calls. They include rules, named presets, whitelist windows, plans, and ordinary/plan module preferences and schedule references. They exclude usage history, live grants, bindings, and module source. Restore module preferences only for an installed, identical module version.

<a id="跨浏览器产物"></a>

## Browser artifacts

| Platform | Extension directory | Public distribution                                                                   |
| -------- | ------------------- | ------------------------------------------------------------------------------------- |
| Chromium | `dist/chromium`     | Chrome Web Store review; unpacked loading for development                             |
| Safari   | `dist/safari`       | Xcode host app, appropriate signing, and notarization/review for the selected channel |

Business logic and UI are shared. Manifests contain only supported permissions/APIs. Optional module directories never enter `dist/<platform>`. Unsupported Safari capabilities must degrade explicitly without breaking extension pages.

<a id="静态与手工门禁"></a>

## Static and manual gates

Run only compilation/builds locally. Keep existing CI formatting, typing, lint, unit coverage, build, and packaging gates. A successful build does not complete any unchecked acceptance item.

- [ ] TypeScript, ESLint, Prettier, and all browser builds pass.
- [ ] Manifests stay within the permission budget; CSP has no remote execution sources.
- [ ] Store ZIPs exclude site modules and remote executable module URLs; read-only release/source/development links are permitted.
- [ ] Site permissions require explicit action; rejection and revocation are recoverable.
- [ ] Visibility, focus, idle, sleep, midnight, and SPA routing do not duplicate or inflate usage.
- [ ] Period overlap, independent budgets, daily reset, and overnight ranges follow the domain contract.
- [ ] No enabled periods means unlimited ordinary access with actual-use recording; content schedules and explicit domain blocks remain active.
- [ ] Plans remain independent; origin changes, tab closure, browser restarts, and post-expiry navigation clear old authorization without charging ordinary budgets.
- [ ] Whitelists cover only authorized managed sites in the bound group; window end restores ordinary state; only unique recovery matches restore bindings; dissolution/backup restore clears them; plan deadlines do not change.
- [ ] Ordinary close preserves grouped and unknown-membership tabs; plan close uses the item's exact origin.
- [ ] Flexible/flow/strict semantics hold; one flow extension per group, with 1–15 minutes or explicit video-end behavior.
- [ ] Waiting, equations, calculus, passwords, and return paths cannot bypass target/period boundaries.
- [ ] Chinese, English, and system-language modes have complete copy and usable layouts.
- [ ] The single extension loads; disabling/removing modules restores ordinary behavior.
- [ ] Stale selectors leave unknown page content visible.
- [ ] Centered sticky navigation, keyboard access, 200% zoom, and accessible names work.
- [ ] Privacy policy, store disclosures, storage inspection, and observed network traffic agree.
- [ ] Repository/artifacts contain no secrets, certificates, profiles, accounts, or user test data.
- [ ] Backups pass same-version round trips, malformed/oversized input rejection, zero-write permission refusal, atomic replacement, and running-session boundary checks.
- [ ] Candidates exclude Debug markers, names, `version_name`, fixed host grants, and inlined Debug modules; Debug output is absent from Git/CI/Release assets.

See [manual acceptance](./MANUAL_ACCEPTANCE.md) and the [release checklist](./RELEASE_CHECKLIST.md).
