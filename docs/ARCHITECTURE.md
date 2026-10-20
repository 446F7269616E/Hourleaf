# Hourleaf architecture and data contracts

Domain contracts were synchronized on 2026-10-14; the dated history records changes through 2026-10-19. The current contracts below take precedence over superseded historical layouts or lifecycle rules. See [features](./FEATURES.md) for product behavior and the [index](./README.md) for implementation entry points.

<a id="目标"></a>

## Goals

Hourleaf is a local-first, cross-browser website-focus extension. Keep timing accurate, rule evaluation deterministic, site access optional, and site adaptations separate from the generic core.

<a id="分层"></a>

## Layers

```text
popup / dashboard / plan / options / block / home / end
                         |
                 application services
                  /                 \
        generic focus core    local module gateway
                  |            /                 \
                  |       CSS/selectors      User Scripts API
                  \______________  ______________/
                                 \/
              storage / permissions / scripting / idle
                                 |
                 Chromium / Firefox / Safari adapters
```

- `src/shared` and `src/core`: domain models, messages, browser ports.
- `src/background`: recoverable coordination, without requiring a persistent Service Worker.
- `src/content`: visibility/focus/routing reports and core focus UI.
- `src/modules/local`: bounded formats, importer/background validation, storage, platform execution.
- `optional-modules`: repository-side examples, excluded from store packages and runtime network access.
- UI uses versioned messages rather than arbitrary storage keys. Browser ports and manifests own platform differences; business logic does not branch on user-agent strings.
- Branding uses the selected C-series leaf hourglass through `src/ui/brand-mark.ts`; see [icons](./ICONS.md).

<a id="通用网站模型"></a>

## Site model

Settings schema v5 distinguishes `SiteId` (authorized site scope), `TargetId` (independent rule target within a site), and `SiteModuleId` (reviewed optional adaptation).

Store origins, hostnames, and validated patterns, not ordinary paths, queries, or page titles. Permission requests require explicit action. Ordinary sites use exact `${origin}/*`; only reviewed families registered in `src/shared/site-scope.ts` may expand scope. Bilibili uses `https://*.bilibili.com/*` for its HTTPS family. Never infer eTLD+1 or broaden arbitrary input across tenants.

Permissions, URL resolution, timing, popup, confirmation, and tab closing reuse the same scope helpers. Register dynamic content scripts only while permission exists. Adding/reconciling a site also safely injects the same script into already-open matching tabs. An isolated-world entry marker prevents duplicate listeners/heartbeats. Revocation/deletion stops timing and interception. Ordinary sites have one whole-site target; optional targets cannot add undeclared hosts.

<a id="商店核心与本地模块协议"></a>

## Store core and local modules

Store packages contain no executable site modules. Legacy `SiteModuleDescriptor` remains for migration/source compatibility, but release catalogs are empty and builds emit no `modules/<site>.js`.

`LocalModuleDefinition` normalizes an ID, version, name, exact HTTP(S) origins, `timed | always-allow | always-block` policy, bounded selectors, self-contained CSS, and optional user-script text. Reject nonempty DNR because it cannot express the required exact-origin boundary.

Only `.json`, `.css`, and `.user.js` files selected together enter the importer. There is no remote dependency, URL installer, GitHub API loader, auto-update, `eval`, `Function`, remote `import`, or instruction interpreter.

- One Hourleaf extension per browser; no second extension requirement.
- Show selected files/author/version/sites/capabilities and require explicit acknowledgement before requesting site permission. `ui/local-module-guidance.ts` shares import requirements, documentation URLs, and disclaimer/contact/license notices. Changing the file selection clears acknowledgement; only the latest read may populate the preview, and submission locks the selection.
- Generic content scripts apply selectors/CSS; reject CSS external-resource syntax.
- `content/local-page-rules.ts` owns document/open-shadow-root styles. Respect each module's `shadowRoots`; scan declared hosts and added subtrees, handle late roots through declared events and page-state refresh, and clean removed hosts/disabled rules. Do not reactivate legacy adapters.
- Chromium scripts run in isolated `USER_SCRIPT`, top frame, at `document_idle`.
- Firefox AMO/Safari reject script-bearing imports at preview, permission, and background boundaries and do not register stored scripts. `modules/local/capabilities.ts` is the shared policy; unknown platforms fail closed.
- Disable/delete unregisters scripts; delete removes source. Initialization cleans Hourleaf's legacy DNR range. Unregistering cannot undo already-executed page effects; refresh affected pages after upgrading.

Debug shares the builder but inlines current repository modules and test sites at build time. Its separate name, fixed test hosts, marker, and outside-repository output never enter release candidates. Seeds remove only their own obsolete IDs, not unrelated manual imports. See [Debug](./LOCAL_DEBUG_BUILD.md) and [module format](./LOCAL_MODULES.md).

<a id="计时模型"></a>

## Timing and accounting

Accrue time only for a configured, authorized, enabled target while its page is visible, its window focused, the device active where supported, and access unblocked. Content sends `start / heartbeat / route / stop`; background serializes events, deduplicates session IDs, and bounds heartbeat gaps.

Before responding to a session event, persist the previous `TargetId + TimePeriodId` interval so the following decision sees authoritative usage. Split at local minute/hour/midnight boundaries; daily buckets feed week/month/year summaries without ordinary URL history. Retain fractional seconds in storage and aggregation; round only for presentation. Hour buckets contain actual seconds, never a second copy of flow annotations. Repeated DST clock hours share one hour bucket. Daily usage retention is 400 days.

`background/period-accounting.ts` separates actual `byTarget` usage from quota `byPeriod[periodId]`. `extra:<periodId>` and `extra:<periodId>:gN` are total/group extra-time annotations; `free:<periodId>` records uncharged extra time. Do not sum annotations into quota or double-count mirrored extras.

`shared/group-quota.ts` alone computes boundaries: convert budget to integer milliseconds; cumulative group N ends at `ceil(totalMilliseconds × N / groupCount)`. The last boundary equals the total exactly; partial groups remain available. Recorder writes serialize read/clip/write and reselect periods at local minute boundaries. Ordinary timing caps at the authorized group; always-allow and whitelist usage records actual time without quota.

`UsageTracker.flush` waits for pending writes even with no new accrual. `withSessionBoundary` settles and clears the old session before mutation, preventing heartbeat restart during a source change. Ordinary/whitelist/plan intervals never share ownership or media callbacks. A whitelist-owned interval stops at the window boundary rather than converting its remainder into ordinary quota.

<a id="时间规则"></a>

## Time rules

Pure evaluation: `weekday + local time + target settings + period usage + runtime -> allow | block | defer`.

- New targets default to daily `00:00–00:00`, unlimited quota, one group, local-midnight reset.
- Site/target `enabled` fields are compatibility mirrors normalized to true. User-visible enablement belongs to individual periods.
- Match weekdays and half-open HH:mm ranges. Equal endpoints mean the entire selected day; overnight ranges follow the starting weekday.
- Overlap priority: `always-allow > always-block > timed`. No periods/all disabled means unlimited ordinary access with actual timing and no period charge. Enabled periods with no current match mean unavailable. Explicit domain blocks and filter schedules remain effective.
- Timed periods have independent budgets and 1–24 equal groups. Runtime is separate from durable configuration.
- Every group boundary uses `end.html`. Flexible mode allows explicit continuation after total exhaustion; strict ends access; flow allows one extension per group, either 1–15 minutes or explicit video-end authorization.
- `endPage.flowConsumesNextGroup` defaults false and snapshots to `flowConsumesQuota` on each grant. When enabled, extra time consumes later quota; unlocking skips exhausted groups and cannot exceed the final budget. Starting flow clears waiting; ending flow restarts it. Only opening a new group resets the one-use flow allowance.
- Pause/unlock/video-end/cleanup first settle timing. Pause-page waiting is not usage. Midnight uses a new daily bucket/runtime; quota calculations retain millisecond precision.
- A name-only edit preserves runtime. Budget/group/day/range edits invalidate incompatible unlock state; mode edits revoke incompatible flow/flexible grants; unlock-method edits clear waits/challenges. All mutations use the same background state queue and failures do not block subsequent work.
- Flow grants retain `flowGrantId`, `flowStartedAt`, and `flowConsumesQuota`; stale, duplicate, cross-group/day callbacks cannot change a new grant. Popup extrapolation uses the grant's captured charging policy and is bounded at the current group. Normalize runtime keys/date/target/period and retain newest entries with capacity for all configured target×period combinations; prune runtime older than 35 days, not an arbitrary first 512 entries.

### Presets

`shared/time-period-presets.ts` produces fresh ordinary periods with independent runtime IDs/budgets. Replace only an untouched system all-day period; append otherwise. Built-in provenance is not stored. Named `customTimePeriodPresets` in schema v5 allow 32 presets, 16 periods each, and round-trip through backup.

| Preset                        | Periods                                 | Budget/groups per period |
| ----------------------------- | --------------------------------------- | ------------------------ |
| Meals                         | 07:00–09:00, 12:00–14:00, 18:00–20:00   | 30 minutes / 1           |
| Two-part split                | 06:00–12:00, 12:00–18:00                | 30 minutes / 2           |
| Morning / Afternoon / Evening | 06:00–12:00 / 12:00–18:00 / 18:00–00:00 | 60 minutes / 3           |
| Early bird                    | 00:00–06:00, 06:00–12:00                | 30 minutes / 2           |
| Night owl                     | 12:00–18:00, 18:00–00:00                | 30 minutes / 2           |

## Confirmation and pause

First entry requires confirmation. By default, confirmed access is shared across the same site's current available scope; new tabs/re-entry do not repeat it. `endPage.repeatConfirmationInNewTabs` defaults false; when true, each tab confirms and loses its grant on origin departure/close. Completed shared confirmations survive closing the original tab within their scope.

`visitConfirmation.promptEnabled` controls only optional text visibility, preserves `prompt` while off, and does not disable confirmation. New sites default off; old records/backup infer the flag from nonempty text. Obsolete independent wait/enable fields no longer authorize access.

Ordinary entry and next-group unlock share `endPage.groupUnlock`: default 30 seconds, adjustable 1–10800 seconds, immediate confirmation, random equation/calculus, or password. Countdown expiry still requires a click. Preserve explicit old choices; migrate minute values to seconds. `shared/unlock-challenge.ts` generates integer-coefficient equations or derivatives/integrals without eval. Persist seeds per visit/day-group; refresh does not change the question. Compute answers in background. Local SHA-256 password hashes are self-discipline friction, not an account-security boundary.

Challenges bind `tabId + SiteId + origin + policy version + available-period scope`. `createVisitAccessContext` includes local date, relevant period/settings, unlock rules, and repeat mode. Day/period/policy changes invalidate confirmations; unrelated theme edits do not. `byTab` challenges and `bySite` grants live in session storage, or memory without it. Validate the extension confirmation page, its own tab, return URL, permission, and challenge/wait. Chromium may omit `sender.tab` or tab URL without broad `tabs`; verify supplied self-tab identity and reject available conflicting URLs, not missing optional metadata. Group waits begin only at a true boundary without active flow.

Ordinary pauses show usage, groups, remaining quota, today's site totals, and optional messages; legacy `endPage.view` cannot hide core feedback. Plan pauses show item duration/goal/actions separately. Flow uses an `end.html` iframe over the original page, pauses media, marks body inert, and preserves position. Ordinary entry/end may use a top-level extension page.

`ui/flow-choice.ts` offers minutes/video end, then one confirm button. Only an embedded pause with valid video context offers video end. After grant submission, recovery retry never grants time again. Real playing/unended main video before the pause selects video end initially; paused/ended/video-element-only/audio/standalone cases use minutes.

`RESUME_PAUSE_FRAME` travels through runtime -> background -> `tabs.sendMessage(frameId: 0)`. Check extension sender, real tab, validated return URL, random mount channel, original target, current instance/URL/permissions/confirmation/plan. This relay stays outside the mutation queue to avoid deadlock with content's authoritative queries. Bind valid replacement media before resuming. A missing reply after 10 seconds or failed check offers retry; mutually exclusive fieldsets prevent simultaneous flow/next/close actions. Late responses cannot restore a replacement instance. Do not depend solely on `postMessage` source identity in extension contexts; see [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#using_window.postmessage_in_extensions).

Ordinary close removes only related, ungrouped tabs in the configured scope; preserve every grouped tab, including the initiating pause, and unknown membership. Recheck live membership immediately before removal; do not call remove for an empty set. Plans close by exact item origin. Revoke associated live grants and return visible close counts. Top-level extension pages provide self-tab IDs for background verification.

<a id="标签页组白名单"></a>

## Tab-group whitelists

`tabGroupWhitelist: TabGroupWhitelistRule[]` in schema v5 defaults empty for old data/backups. Limit 64 rules, each with a stable ID and up to 64 uniquely identified periods (name, enabled, 1–7 unique weekdays, start/end). `tabGroupWhitelistPeriods()` projects legacy single-period fields only when `timePeriods` is absent. Empty/all-off/no-match grants nothing; enabled periods form a union using the ordinary weekday/all-day/overnight/half-open semantics.

| Module                                                       | Responsibility                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `shared/tab-group-whitelist.ts`                              | Bounded parsing, normalization, schedule matching, message state                 |
| `background/tab-group-whitelist.ts`                          | Real group queries, removal classification, rebind/revoke                        |
| `background/tab-group-bindings.ts`                           | Serialized persistent recovery records and binding transactions                  |
| `ui/tab-group-whitelist.ts`                                  | Independent directory/detail, add/edit periods, invalid bindings                 |
| `ui/configuration-directory.ts`, `configuration-controls.ts` | Shared counts, summaries, selection, accessible navigation/fields                |
| `background/index.ts`                                        | Merge plan/domain/confirmation/toolbar decisions and notifications               |
| `background/tracker.ts`, `period-accounting.ts`              | Snapshot/settle source before changes, minute boundaries, actual-only accounting |
| `content/index.ts`, `end/index.ts`                           | Membership/minute rechecks, ordinary recovery, plan-pause protection             |

Bindings are separate from settings. `hourleaf.tab-group-bindings.v2` in local storage maps rules to random original-group identities, recovery feature hashes, session markers, and active IDs. `hourleaf.tab-group-binding-session.v1` stores a random session marker. Trust numeric IDs only with the same marker and a real current group.

Recovery hashes combine name, color, member count, and the multiset of currently permission-readable member URLs using SHA-256. Ignore tab order, retain duplicates, and store no plaintext URLs/page titles. No automatic signature for private groups or groups without readable HTTP(S) members. Own `end.html` pages contribute their validated return sites. With no configured rules, do not scan members; coalesce group/member events and write only changed records.

`tabGroups.onRemoved` immediately revokes active access. Use `tabs.onRemoved.isWindowClosing`, window events, and existence queries to distinguish closing a window from dissolving a group in an open one. Window closure retains recovery hashes with no active ID; dissolution/last-member removal deletes the binding. Startup, restoration, group creation, and member/URL/color/title updates reconcile records. Rules for the same original group share random identity.

Restore atomically only when both source and complete candidate signature are unique. Same names, different members, duplicate candidates, or competing identities never justify guessing. APIs expose no persistent GUID: an otherwise unique fully identical copy cannot be distinguished with certainty. This is a feature-matching strategy, not browser identity authentication.

Every grant rereads real tab membership. If a tab lacks `groupId`, query distinct bound groups and continue only for a unique membership. Closed windows, revoked/missing/ambiguous membership, query failure, unavailable group/session APIs, and incomplete recovery fail closed. Pending rules may be explicitly rebound. Rebinding revokes old records first and atomically writes the new binding; concurrent removal/window closure cancels it without reviving the old group. Upgrade old v1 records only for groups still open. Clear matching records on rule deletion, backup restore, defaults, and clear-data. Backups retain periods, never hashes/identities/group IDs.

| Overlap                                                        | Result                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Extension off                                                  | No whitelist timing or enforced restrictions                                                                     |
| Module domain block                                            | Still blocked; CSS/filtering also remain                                                                         |
| Valid plan                                                     | Plan deadlines, end mode, and media-end pause remain; only the plan owns timing and no ordinary quota is charged |
| Ordinary unavailable/budget exhausted/group pause/confirmation | Authorized configured sites in the bound group get unlimited ordinary access without changing quota/runtime      |
| Window ends or tab leaves                                      | Re-evaluate ordinary rules/confirmation; other groups/ungrouped tabs never inherit access                        |

Chromium/Firefox declare read-only-use `tabGroups`, not broad `tabs`; no group create/move/close operations. Safari shows unavailable state while preserving rules. Whitelists do not inject into unauthorized pages. API references: [Chrome](https://developer.chrome.com/docs/extensions/reference/api/tabGroups), [MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups), [MDN identity caveats](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups/TabGroup).

<a id="计划"></a>

## Plans

Persist user-entered normalized HTTP(S) URLs/origins, titles, optional goals up to 500 characters, order, completion, per-item duration, and completion mode. Adding/bulk importing requests no site permission. Start requests only that item's exact origin, then opens the common confirmation pause. Create authorization only after confirming duration/goal.

`background/plan-visit.ts` binds `itemId + visitId + tabId + origin + expiresAt + completionMode`. Use the confirmation page's verified tab, never an inferred active tab. All same-tab/same-origin path/query/fragment/pagination/SPA navigation keeps the deadline, even different content. Other tabs/origins do not inherit it. `shared/plan-navigation.ts` retains resource matching only for legacy unbound grants until they end; restarting creates new visit identity without rewriting saved URLs.

`plan-registration.ts` uses one fixed active-grant registration of `content.js` after background permission revalidation. Never register the whole queue or overwrite focus registrations. Reconcile on stop/delete/complete/edit/expiry and restore current-session bound visits after worker sleep. An expired notice can retain its registration only for the original page to display it. `autoCompleteOnStart` defaults false.

Plans always time independently and do not write ordinary target/period usage. `independentAccessTiming` normalizes to true for old data/backups and has no UI switch. Only explicit Start enters plan access; obsolete `PlanModeSettings.enabled` remains a compatibility/runtime mirror.

Flexible/flow/strict end behavior remains. A plan flow extension is once-only; minutes are 1–15. Video end is explicit authorization rather than a minute deadline; `Number.MAX_SAFE_INTEGER` is its persisted sentinel, replacing legacy fifteen-minute video grants. Optional `pauseOnVideoEnd` copies to the grant and is distinct from post-expiry video-end flow. STOP validates item, visit, sender tab, origin, and flag. Route/media replacement removes old listeners; stale ended events cannot stop a new page/grant.

Active grants, one pending `endedGrant` notice, and visits are session-only, or shared background memory without session storage. Notices grant no timing. Preserve the original page's notice even if popup reads expiry first. Clear notices on confirm/close or post-expiry navigation, including same-URL reload. Origin departure, tab close, stop/replace/edit/delete/complete, global disable, restore, and reset revoke runtime. Full browser restart restores the durable queue, not grants; clear legacy local grants at startup. Valid same-origin refresh keeps an unexpired deadline. Own pause pages retain the visit for confirmation. Other tabs' navigation cannot terminate it.

Plan queries and mutation/session heartbeats serialize appropriately. Accounting/badges/context projection use read-only queries (`reconcile: false` where required), avoiding revocation in a partially written transition. Missing/nonmatching items return disabled/allowed and ordinary site rules continue; never redirect ordinary browsing automatically to the plan list. Pause recovery returns the original tab's current validated same-origin page, not the queue's initial URL.

The list uses responsive cards; completed items sit below/outside both list and mind-map canvases, initially collapsed with session-local expansion. Only pending items contribute to the map's signature/fit. Measure real node heights/centers, use equal column width, two-line links, blank-space panning, pointer-centered zoom, keyboard movement/fit, and padding around actual scene bounds. Fit up to 500 items; normal wheel scrolls the page and Ctrl/Command-wheel zooms. Editing completed items does not reset viewport. Avoid heavyweight graph-editor dependencies.

<a id="存储与迁移"></a>

## Storage and migration

Keep legacy `bilifocus.*` keys for installation compatibility; branding alone does not rename storage.

| Key                                     | Contract                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `bilifocus.settings.v1`                 | Schema v5 settings                                                              |
| `bilifocus.usage.v1`                    | Schema v3 `byTarget`, `byPeriod`, optional `days[date].byHour[0..23][targetId]` |
| `bilifocus.temporary-access.v1`         | Schema v2                                                                       |
| `bilifocus.plan-queue.v1`               | Durable per-item plan queue                                                     |
| `hourleaf.period-runtime.v1`            | Daily unlock/once-only flow runtime, schema v1                                  |
| `hourleaf.modules.v1`                   | Legacy preinstalled migration state, cleared in store initialization            |
| `hourleaf.local-modules.v1`             | Normalized imports and preferences, schema v1                                   |
| `bilifocus.plan-access.v1`              | Session active plan/end notice                                                  |
| `hourleaf.plan-visit.v1`                | Session visit tab/origin                                                        |
| `hourleaf.visit-confirmation.v1`        | Session challenge and confirmed scopes                                          |
| `hourleaf.tab-group-bindings.v1`        | Legacy session-binding migration input                                          |
| `hourleaf.tab-group-bindings.v2`        | Local recovery identities/hashes plus session-validated active IDs              |
| `hourleaf.tab-group-binding-session.v1` | Session marker                                                                  |
| `hourleaf.plan.view`                    | `list                                                                           | mindmap` preference |

Without session APIs, plans/confirmation use memory and whitelists do not grant access. Migrations are bounded/idempotent, retain unrecognized compatibility capsules, and fall back safely for corruption. Legacy Bilibili/plan/filter capsules remain read-only; store builds do not activate old adapters.

Data management exports/imports `hourleaf.configuration-backup`, schema v1, maximum 16 MiB, using one strict validator. Include normalized settings, named presets, whitelist periods, plans, and module ID/version plus ordinary/plan enable/group/schedule preferences. Exclude usage, built-in provenance, temporary/active grants, group runtime, confirmations, bindings, and CSS/script source.

On explicit restore confirmation, request backup-site scopes and scopes for identical-version installed modules that will be enabled. Any missing permission means zero writes. Wait for in-flight settings saves; settle old timing; clear group bindings (failure aborts replacement); atomically replace settings/queue/safe preferences in one `storage.local.set`. Exit plan mode and reset temporary/group runtime, then clear session grants/confirmation and reconcile sites/scripts/plan registrations/toolbar. Return reconciliation failures as warnings after successful persistence. Skip absent/different-version module preferences; never install or replace code from backup. Restore cannot replace active disable protection or disable a protected extension.

Retain browser-granted hosts no longer in configuration because other explicit module permissions may need them; remove their dynamic registrations immediately. Users can revoke retained permission in browser settings.

<a id="消息边界"></a>

## Message boundaries

Use `{version, requestId, type, payload}`. Validate sender, extension/page URL, origin, permissions, types, lengths, enums, and array bounds. Only privileged extension pages may import modules, manage sites/plans, unlock groups, or clear data. Confirmation must come from its own verified same-tab extension page and valid scope/wait.

Site flow messages additionally validate tab origin/target/period. Plan decision/extension/STOP validate sender/current-origin permission without requiring a focus-site entry; `PlanService` validates item/visit/tab. Normalize module input at importer and background boundaries. Content reads only its current URL's merged CSS/selectors, never all modules, user scripts, settings/history, arbitrary APIs, or storage keys.

All settings changes, including site/module CRUD and manifest application, use one `SettingsRepository` read-modify-write queue. Never read outside the transaction then submit a stale full snapshot. Mode changes modify mode only, without replaying module manifests or rebuilding unrelated registrations.

## Module preferences and schedules

`planMode.enableAllBlocking` defaults true. `LocalModuleInstallation.planPreferences` missing means all content groups enabled/unlimited in plans; ordinary `enabled / disabledFilterGroupIds` remain intact. `modules/local/profiles.ts` projects read-only preferences. Filtering UI edits current context, sends its captured `profile`, and background rejects stale-context writes. Updates/restarts/backups preserve both profiles; new plan groups default on. Domain policy uses ordinary enablement so plan content preferences do not accidentally block the destination. Profile changes refresh document/shadow CSS and serially reconcile authorized Chromium scripts without auto-installation/permissions.

`modules/local/schedules.ts` references configured periods by `targetId + periodId`, matched through shared site-scope helpers; only reviewed families share subdomain periods. `filterGroupSchedules[groupId]` absent means unlimited, empty means inactive, maximum 64 references. Ordinary/plan schedules are independent.

Only saved start/end times determine daily filtering via `isDailyTimeRangeActive()`: start inclusive, end exclusive, overnight on both sides, equal endpoints all day. Ignore referenced period weekday/enabled/budget/groups/access policy. Access rules continue using `isTimePeriodActive()`. Deleted/cross-site references remain removable but inactive, never expand to all day. Reimport retains schedules for surviving groups; backups preserve them; older missing fields remain unlimited.

`SET_LOCAL_MODULE_FILTER_SCHEDULE` is extension-only, validates context/module/group and new references; serialize writes. `ui/filter-time-periods.ts` exposes corresponding-site names/ranges only, shows invalid references without leaking other-site names, lazily builds expanded lists, preserves summary focus/scroll, disables during save, and restores on failure. `nextScheduleCheckAt` triggers local daily boundaries even for disabled access periods; all-day adds no unnecessary timer. Heartbeat/config/visibility refresh are fallbacks, and leave-page cleanup removes timers. Base CSS/scripts/domain policy are unchanged.

Repository module names/descriptions/groups are projected by stable IDs through `ui/local-module-copy.ts` and i18n, without storing translations or matching Chinese prose in logic. Unknown third-party IDs/groups retain author copy. Existing installs switch language without reimport. Bilibili's optional script reads a content-free DOM marker for native related-autoplay suppression; it restores only controls it changed and leaves unknown/commercial content alone. Site-specific evidence belongs in [research](./SITE_MODULE_RESEARCH.md).

## Protected actions

`disableProtection` defaults `method=none`; optional wait allows only 1/3/5/10 minutes, or a dedicated password separate from group passwords. `background/protected-actions.ts` serializes one-use tickets bound to action, sender page, original protection, server deadline, and one-hour expiry. Direct settings writes cannot bypass old protection; use `ui/protected-action-dialog.ts`.

Clear-all/reset require a fixed 120-second background wait plus the full requested confirmation text. Cancel writes nothing; reopening restarts waiting; consumed/old tickets cannot be reused. No legacy `CLEAR_USAGE` bypass.

- Clear all: unregister sites/modules; delete usage, sites, plans, modules, business keys; write defaults.
- Restore defaults: clear site rules, group runtime, active plan/temporary grants, passwords; retain statistics, queue, and imports.
- Both clear the disable password while retaining browser host permissions.
- Debug retains only a seed-suppression marker until explicit reconfiguration.
- Global disable stops timing/plan access/ordinary filtering and future user-script registrations; existing page script effects may need refresh.

<a id="ui-与文案"></a>

## UI and settings

[UI_STYLE.md](./UI_STYLE.md) owns dimensions/layout; [UX_WRITING.md](./UX_WRITING.md) owns copy. Shared tokens/base controls remain separate from page density. Site modules do not own a visual system.

Centered sticky navigation is Dashboard, Plans, Configuration, Filtering, Settings, with brand left/actions right and a rightmost help button. Narrow screens retain five equal navigation slots. Five-page titles align; configuration/filtering/settings omit repeated subtitles. Dashboard is read-only statistics, plans own queue/map, configuration owns site periods, filtering owns imports/preferences/download links, and settings owns global behavior/data/About.

Configuration autosaves through one coalescing serialized loop. Edits during a write are saved next; report errors visibly without manual Save or navigation save buttons. `UPDATE_MANAGED_SITE` changes mode; `UPDATE_SITE_TARGET` changes periods, never a stale global settings snapshot. Presets show left selection/custom editing and a right 24-hour strip/text preview with a persistent Add preset action; gray means unavailable. Custom presets require names and multiple editable periods; reject overflow atomically.

Directories share `configuration-directory.ts`, `configuration-workspace.ts`, and `configuration.css`; stable detail IDs plus `aria-controls`/`aria-current` associate selection. Retain scroll/focus on redraw; independent desktop sidebar scrolling uses actual navigation/grid/shell geometry and returns to document flow at width ≤860px or height ≤360px. Settings has seven categories and a description/control grid; data import/export appear only under Data management. Whitelist period edits have a separate serialized latest-value queue, not ordinary site draft autosave.

Default/invalid theme is `ocean`; preserve existing valid themes. Five high-saturation light/dark palettes provide accent/foreground tokens and fixed `--palette-*` swatches. `showSidebarIcons` defaults false and survives clone/reset/backup; `applyAppearance()` updates theme/icon root attributes and listens for settings. Site/whole-site target names derive from canonical hostname; dedicated target names remain. Old backup migration changes only these labels/missing preference before strict validation.

Use shared 24-hour `ui/clock-input.ts` across periods/presets/whitelists, including `0900` normalization; plan timestamps use `hourCycle: h23`. Dashboard date selectors and plan layout selectors have visible View radio-group labels.

Popup refreshes active tab/plan on activation, URL, visibility, and settings changes. Align authoritative data at most every five seconds; increment locally only while confirmed timing, without per-second writes. Show at most three ordered pending items plus remaining count and a Plans primary action. Single-group sites show one remaining value; multi-group sites show current group/period/today's limited-period remainder from active period usage, not obsolete target limits. Flow/temporary minutes use authoritative expiry; video-end grants show no misleading zero/huge number.

`showRemainingMinutesOnIcon` defaults true. Recompute each active tab's rounded-up minute badge after grant/usage/settings changes. Plans display independent remaining time; whitelists display no ordinary quota countdown. Clear for unconfigured/unlimited/non-HTTP(S)/globally paused/disabled display. Popup width is 380px, max height 600px, natural scroll; Debug section expansion survives refresh.

About links point to public privacy policy, MIT license, and Issues, using `ui/external-link.ts`, native new-tab links, `rel="noopener noreferrer"`, and an external-link icon. Do not embed/prefetch documents or run remote scripts. No new settings/message fields; About does not introduce other add-ons.

## Cross-tab pause updates

`shared/pause-access.ts` centralizes relevant storage changes, plan-end protection, deadlines, and coalesced rechecks. Watch settings, unlock/flow/flexible grants, temporary access, module policies, plan grants, and bindings. Only completed confirmation changes trigger confirmation notifications; waits/questions and usage heartbeats do not create self-refresh loops. Filter runtime changes by target and use `STORAGE_KEYS.visitConfirmation` without changing storage format.

`background/website-access.ts` sends `HOURLEAF_WEBSITE_ACCESS_CHANGED` after committed ordinary grants/revokes/unlocks/flexible confirmations/visit confirmations. Scope content queries through `siteMatchPatterns()` and filter extension-page notices by `siteId`. Dispatch without waiting for receiving pages' authoritative queries or badge completion; do not hold a mutation queue waiting on itself. Extension pause listeners use synchronous no-response notification handlers.

Content and pause pages re-read authoritative eligibility and original expiry. Embedded ordinary pauses may remove overlays/initialize timing in background tabs but resume media only when visible. Standalone hidden pauses update state then recheck before navigating on visibility. Plans never inherit ordinary recovery or another item's old iframe.

Coalesce short notices into 30ms batches; queue a follow-up if events arrive during a check. Concurrent recovery shares one Promise. Validate current URL/instance/channel/target/permissions/confirmation/plan before restoration; clean frame state on removal and recheck BFCache. Late responses cannot resume new pages. Redraw only when relevant access/configuration changes; retain inputs/waits for checkpoint-only changes and defer while actions run. Existing visibility/storage/deadline timers remain fallbacks; no periodic full-tab scan or forced page refresh.

## Statistics and pause data

`shared/usage-insights.ts` computes usage, daily average, elapsed/recorded days, peak day, and flow extras without side effects. Average over elapsed local calendar dates from range start through today, including zero days and excluding the future; never divide milliseconds by 24 hours. Sum only `extra:<periodId>`, not group mirrors; extras remain part of actual total.

`shared/screen-time.ts` aggregates hour buckets across selected dates by target, then site. Preserve removed/unknown targets under Other websites and retain missing-hour historical totals without inventing a distribution. Site filters share the all-site scale and total. Website lists paginate three entries; changing page retains selection. Long names retain accessible full labels; prompts paginate by Unicode characters.

`ui/hourly-usage-chart.ts`/`styles/usage-charts.css` share scales, peak defaults, explicit hour readings, 24-hour labels, and keyboard selection. `dashboard/index.ts` owns range cards/trends/site shares: today hourly, week/month daily, year monthly. Ranking percentages use actual range total; current sites use canonical domains. `dashboard/usage-panels.ts` shows the entire current plan because queue items have no completion-date attribution; completion is item-count-based, pending duration sums scheduled durations.

Visible dashboard refresh remains five seconds with one in-flight request and a generation guard for range changes. Defer active-region replacement, preserve expansions/list scroll/hour selection, and retain last good data on read failure.

The current ordinary pause uses equal-height, equal-width usage/actions/statistics frames, max width 1180px and a minimum 960px horizontal-scrolling layout. `centerPauseActions()` centers initial actions. Navigation scrolls only; prior single-visible-panel and two-row layouts are obsolete. `ui/group-progress.ts` retains segment counts/accessibility but no visible hollow/solid legend. `dashboard/total-time-card.ts` uses separate localized digits/units and keeps timing/test IDs without the old dark card.

`ui/pause-details.ts` reuses authoritative quota helpers for active period/group detail and computes today's site share/peak without scores or new collection. `ui/pause-layout.ts` supplies a separate messages slot; empty messages disappear, content rows flex, controls sit at the bottom, and long text expands all equal frames. A populated message area reserves at least 88px.

`shared/next-available-period.ts` enumerates local dates and boundaries in the next week through `selectActiveTimePeriod()`. Respect weekday/all-day/overnight/priority rules, skip disabled/always-block/zero/exhausted current-day periods, evaluate future-day independent quotas, and show the effective interval truncated by higher-priority periods. Only display next-period details when no enabled period currently matches. No valid future interval means an explicit empty state; the display never authorizes access. Existing minute rechecks redraw it.

<a id="自律交互依据"></a>

## Self-discipline design references

Use visible usage feedback, explicit goals, advance choice, and deliberate reconfirmation; no shaming or automatic countdown admission. Example prompts may describe finishing a concrete task before leaving.

References: [implementation intentions](https://doi.org/10.1016/S0065-2601%2806%2938002-1), [screen-time friction field experiment](https://pubmed.ncbi.nlm.nih.gov/36577008/), [feedback research](https://www.nature.com/articles/s41598-024-53388-3). These support design directions, not the effectiveness of this extension, its 30-second/120-second waits, or calculus questions. Do not claim treatment or guaranteed outcomes.

<a id="访问确认与计划屏蔽更新2026-09-12"></a>
<a id="bilibili-片尾自动续播抑制2026-10-04"></a>
<a id="屏蔽选项的启用时间段2026-10-04"></a>
<a id="关闭保护与数据操作2026-09-28"></a>
<a id="暂停页分组与屏幕时间视图2026-09-30"></a>
<a id="分组记账一致性2026-09-30"></a>
<a id="新标签页访问确认2026-09-30"></a>
<a id="暂停页自适应布局与时长圆环2026-09-30"></a>
<a id="暂停页比例与心流恢复链路2026-09-30"></a>
<a id="计划导航暂停通知与主题修复2026-10-01"></a>
<a id="同标签页通用计划访问2026-10-07"></a>
<a id="普通网站误跳计划页修复2026-10-07"></a>
<a id="主分支同步与提交检查2026-10-08"></a>
<a id="无启用时间段时无限使用2026-10-08"></a>
<a id="计划临时计时生命周期修复2026-10-08"></a>
<a id="三类用时的独立生命周期2026-10-13"></a>
<a id="网站模块英文与-github-检查修复2026-10-13"></a>
<a id="关闭窗口后的白名单恢复2026-10-15"></a>
<a id="配置屏蔽和设置的目录与时段交互2026-10-15"></a>
<a id="默认外观目录图标和网站名称2026-10-15"></a>
<a id="跨标签页暂停恢复2026-10-15"></a>
<a id="多组白名单的归属和暂停同步2026-10-17"></a>
<a id="暂停操作后的同网站同步2026-10-18"></a>
<a id="仪表盘与暂停页数据展示2026-10-19"></a>
<a id="暂停页核心控件恢复2026-10-19"></a>
<a id="暂停页紧凑布局仪表盘精简与视频心流默认项2026-10-19"></a>
<a id="暂停页等尺寸面板激励区与下次可用时段2026-10-19"></a>
<a id="关于与文档入口2026-10-19"></a>

## Change history

The following dates preserve development history. Current sections above incorporate the surviving contracts; obsolete single-panel pauses, compulsory restart rebindings, old plan resource matching, and coupled plan timing are superseded.

- **2026-09-12:** Verified same-tab confirmation; independent plan filtering profiles; dark-toolbar rounded backing.
- **2026-09-28:** Protected disable/clear/reset tickets; Debug pause/budget tools.
- **2026-09-30:** Hourly usage/group visualization; precise group accounting; shared/new-tab confirmation; pause balance rings and authenticated media recovery. Historical local validation covered compilation/builds, not rendered or interaction acceptance.
- **2026-10-01:** Plan notices, same-origin compatibility, popup dimensions, and five theme palettes.
- **2026-10-04:** Bilibili 1.2.3 native-autoplay handling and independent daily content-filter schedules.
- **2026-10-07:** General same-tab/origin plan visits; removed forced plan-list redirects; Bilibili 1.2.5 dynamic featured comments.
- **2026-10-08:** Integrated earlier release work on main; corrected formatting/type-only imports and stale test expectations without reducing quality gates. Empty/disabled period sets became unlimited; session-only plan grants and post-expiry navigation cleanup replaced stale local grants/notices. Local checks were compilation/release/Debug builds; remote results belong to their commit/run.
- **2026-10-13:** Separate ordinary/whitelist/plan ownership and ungrouped-only ordinary close; stable-ID bilingual module projection. CI run `38387368091` at `2d4cb29` exposed type/closure issues; subsequent stale migration expectations were aligned without weakening checks.
- **2026-10-15:** Unique combined-feature group recovery; shared directory/period controls; default blue/theme/icon/domain labels; coalesced cross-tab pause recovery.
- **2026-10-17:** Read real membership for every configured group; notify pause pages without stealing replies; suggest group names without overwriting user edits.
- **2026-10-18:** Post-commit same-site notices, 30ms recheck coalescing, retained inputs and original grant deadlines.
- **2026-10-19:** Shared usage projections/charts and dashboard refresh; recovered pause controls; compact fixed three-column layout; separated total digits/units; actual-playing-video default; equal frames/messages/next-period details; About privacy/MIT/contact links. Only compilation/CSS/release/Debug builds were recorded for these rounds; visual and interaction acceptance remains manual.
