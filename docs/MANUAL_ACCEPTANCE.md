# Hourleaf manual acceptance

Source synchronized: 2026-10-25. See [features](./FEATURES.md). Every unchecked scenario below remains for a human to execute. Historical dates identify development rounds, not completed acceptance. Apply current contracts rather than removed controls or superseded identity/layout rules.

Current development and acceptance cover Chrome (Chromium) and Safari. Firefox is [archived](../deprecated/firefox/README.md); references in dated release notes describe historical builds.

For each candidate record commit, version, browser/OS, build commands, and SHA-256. Use a clean profile and an upgrade profile with v0.4 data. Local automated validation remains compilation/builds only; CI results are separate evidence.

<a id="核心流程"></a>

## Core flow

- [ ] All three browser builds load. Popup, dashboard, plans, configuration, filtering, and settings show no crash, blank page, or permanent loading state.
- [ ] Five full pages share centered sticky Dashboard/Plans/Configuration/Filtering/Settings navigation, current state, title size/alignment, and reachable narrow-screen navigation. Configuration/filtering/settings omit duplicate subtitles. Rightmost help opens concise page descriptions with keyboard/accessibility support.
- [ ] Dashboard contains statistics only, aggregates ordinary sites by domain with expandable subdomains, and applies module visibility without hiding manually configured sites. View radios select Today/Week/Month/Year with one complete date range above content.
- [ ] Configuration owns site periods, filtering owns imports/content groups, and settings owns global options. No tutorial steps, first-use cards, raw exceptions, schemas, or provider jargon.
- [ ] Configuration autosaves mode/period edits, enablement, add/delete immediately. Rapid edits queue without loss; errors remain visible; no manual Save or navigation status button; leaving does not silently drop edits.
- [ ] Preset action is primary and manual add secondary. Left-hand presets include Meals, Split, Morning, Afternoon, Evening, Early bird, Night owl, saved custom presets, and Custom. Preview includes 24 cells (gray unavailable, colors per period), text times/budgets/groups, and a persistent Add preset button.
- [ ] Built-ins match the [preset table](./ARCHITECTURE.md#presets). Custom presets require preset/period names, support multiple add/delete/edit operations and live preview, survive reopen and backup. Replace only an untouched default all-day period; preserve other periods; reject a 64-period overflow without partial writes.
- [ ] There is no site-wide enable switch. Previously disabled legacy sites normalize to registered sites; individual period switches govern access.
- [ ] Bottom-of-detail prompt switch defaults off for new sites; enabled shows input, disabled retains text but hides it on confirmation. Old nonempty prompts migrate enabled. This switch never disables access confirmation.
- [ ] Default confirmation is shared within the current site/scope. Repeat-in-new-tabs requires each tab; same-origin refresh/SPA does not repeat, origin departure/re-entry does. Day/period/policy changes invalidate it, unrelated theme changes do not. Worker sleep retains session state; browser restart does not.
- [ ] Entry/next-group share immediate, 1–10800-second waiting (default 30), equation, calculus, or password rules. Waiting does not count as use, expiry still needs a click, and cancel does not create a return-loop.

## Sites and permissions

- [ ] Fresh install requests no host access. Adding `https://example.com` requests only `https://example.com/*`.
- [ ] Bilibili root/www/reviewed subdomains normalize to its reviewed HTTPS family; `t.bilibili.com` and `space.bilibili.com` work. `evilbilibili.com`, `bilibili.com.example.org`, and unrelated sites never match that scope.
- [ ] Rejection writes no site; another explicit action can request again. Browser revocation stops timing/filtering and removes registrations; deletion cleans matching local state while restart restores remaining authorized registrations.
- [ ] HTTP/HTTPS/different ports remain distinct origins. Reject file/browser-internal/credential URLs and malformed input.
- [ ] Adding an already-open authorized site activates it without reload. Reconciliation is idempotent: no doubled heartbeat or overlays; popup/badge update on tab return.

<a id="规则与计时"></a>

## Rules and accounting

- [ ] Independent sites/targets/periods have separate quotas and local-midnight reset. Overlap priority is allow, block, timed. Enabled periods with no current match deny access.
- [ ] Empty/all-disabled periods allow unlimited ordinary access, hide finite badges, and record actual time without period charge. Re-enable restores prior ranges/groups/budgets. Explicit domain blocks and daily content schedules remain active.
- [ ] Check weekdays/workdays/weekends, all-day equal endpoints, start-inclusive/end-exclusive boundaries, and overnight dates.
- [ ] Groups divide the exact budget. Every exhausted group pauses; immediate/wait/equation/password unlock occurs only at its real boundary and returns to a validated scope. Worker restart cannot unlock early or skip groups.
- [ ] Flexible final exhaustion requires explicit continuation; strict cannot continue. Flow is once per group, 1–15 minutes or real video end; video-end grants do not expire at fifteen minutes.
- [ ] “Use / 再用” is outside duration options. Choosing minute flow immediately updates popup/badge from the grant deadline; plan badges remain independent even with ordinary quota exhausted. Video-end grants show no false zero/huge minute count.
- [ ] Ordinary pause retains usage/actions/statistics and optional messages regardless of legacy `endPage.view`. Plan pause contains only its own duration/goal/actions.
- [ ] Ordinary close removes only related ungrouped tabs; preserve grouped pause pages and unknown membership, display close counts, allow retry, and never close similar/unrelated domains. Recheck a candidate moved into a group during the query; empty candidates are not an error. Plan close uses item origin separately.
- [ ] Only visible/focused/active-device intervals count. Tab changes, minimize, lock, sleep, routing, reload, back/forward, and multiple windows neither duplicate sessions nor backfill long gaps.
- [ ] Settle each heartbeat before the subsequent decision. Popup/badge/end page agree on usage; total and subparts agree across ranges/midnight. Clearing updates all open pages.
- [ ] Check 60 seconds / 7 groups and / 24 groups: no premature jump or subsecond deadlock; last total is exactly 60 seconds. Partial groups remain available.
- [ ] Several subsecond intervals accumulate without rounding drift. Reading statistics/pause state waits for pending writes, even with no new active interval.
- [ ] A heartbeat crossing adjacent periods, allow/block boundaries, or midnight charges each correct owner/date. New-day runtime inherits no old unlock/flow.
- [ ] Concurrent unlock/flow clicks across two pauses advance only once; retry reads state without duplicate grants.
- [ ] Free/charged flow, partial next-group consumption, multiple-group consumption, and exhausted total produce consistent actual/extra/quota figures. Changing the charging setting during flow affects only later grants.
- [ ] Late prior-group/day/media callbacks cannot revoke a new grant. Normal heartbeat does not replace a valid bound video listener.
- [ ] Editing budget/groups/range settles old time and recalculates compatible runtime; rename does not reset it. Switching to strict revokes old flexible/flow access. More than 512 runtime entries still permit new states; reload/worker restart preserves them.

<a id="计划"></a>

## Plans

- [ ] Accept arbitrary valid HTTP(S) URLs with per-item duration/end mode; reject malformed/duplicate/overlong entries. Add/edit/bulk import require duration but request no host permissions until Start.
- [ ] Start requests only the item's exact origin. Rejection creates no grant/navigation. Confirmation shows duration and goal before timing, without ordinary groups/statistics/math challenges.
- [ ] There is no plan-mode switch. Start is explicit; grants bind the confirmed tab/origin and deadline. Complete/delete/edit authorization fields/stop/replace/global disable/restore/reset clear matching runtime.
- [ ] Same-tab queries (`?page=2`, `?p=3`), paths (`/page/4`), fragments, SPA routes, different same-origin content, reload, and back/forward keep the original unexpired deadline. Different tabs, copies, and duplicate URLs inherit no plan grant.
- [ ] Origin departure revokes the visit; returning follows ordinary rules until a new explicit plan start. No automatic permission expansion or ordinary-page redirect to the plan queue.
- [ ] Independent plan access works on a site absent from ordinary configuration and during ordinary blocked/exhausted periods, without increasing ordinary statistics/quota. Old `independentAccessTiming=false` settings/backups migrate true and expose no toggle.
- [ ] Only the plan's fixed registration changes on start/stop/end/delete/replace; ordinary focus registrations remain. Browser worker sleep restores current-session visits; full browser restart drops grants/notices but preserves queue/durations. Legacy local grants are cleared; missing session APIs use current background memory only.
- [ ] Flexible/strict/flow expiry and minute/video-end flow show the original page's pause even after popup/plan reads expiry first. Continue restores current validated same-origin location/video position, not the initial queue URL. Failed recovery retries without more time.
- [ ] After expiry/video end, same-URL reload/new navigation clears stale notices and returns to ordinary rules. Restarting the item creates a fresh duration. Closing related tabs clears grant/notice; unrelated tabs do not.
- [ ] Per-item pause-on-video-end and post-expiry video-end flow are distinct. A real current media end stops the correct visit; late route/replaced-player events do not stop new content/items. No misleading fifteen-minute cap on video-end grants.
- [ ] Plans do not count while blocked. Plan-page addresses do not append blocked-page query strings. Auto-complete-on-start defaults off and applies only to explicitly started items.
- [ ] Mode options are short Flexible/Flow/Strict names with matching live descriptions below in add/edit/bulk forms.
- [ ] List/mind-map View radios, drag/keyboard ordering, and persisted ordering work. List cards adapt columns; empty queue has no decorative plus icon, while the header Add action remains.
- [ ] Completed items remain below/outside both canvases, initially collapsed; expanding/restoring retains sensible focus. Only pending nodes affect map fit/signature; editing completed items does not reset viewport.
- [ ] Map supports pointer-centered zoom, blank-space pan, Ctrl/Command-wheel zoom, normal page wheel, keyboard `+`/`-`/`0`/arrows, and fit. Check 50/500 nodes, 500-character URLs, long words, narrow widths, and 200% zoom without node overflow or incorrect connectors.
- [ ] Legacy active grants without `visitId` retain compatibility until end; restarted visits use current tab/origin behavior without changing stored goals/URLs/durations.

<a id="本地模块"></a>

## Local modules

- [ ] Fresh stores contain no site-specific modules. Filtering supplies import, release downloads, source/development links, and third-party disclaimer; settings contains no import control. URLs never trigger module installation/download.
- [ ] Explicit file selection shows name, author, version, exact sites, capabilities, and required safety acknowledgement. Missing author/format, rejected permission, missing references, wildcard hosts, remote CSS, nonempty DNR, or over-limit inputs do not install.
- [ ] In both languages, import explains ZIP extraction/file exclusions and standalone metadata; visible platform compatibility matches the picker and rejection behavior. Specification, authoring, license, and rights-contact links open separately. Download and import share the concise disclaimer without implying third-party MIT licensing or guaranteed safety.
- [ ] Acknowledgement remains disabled until a valid preview. Switching files clears it; fast overlapping selections and closing during a read never display a stale preview. Submission locks file selection and acknowledgement; rejected permissions allow retry without automatically changing the selected files.
- [ ] Lightweight validation rejects known eval/dynamic/network/privileged API/script-injection/CSS external-resource patterns without claiming complete safety.
- [ ] Chromium with user scripts disabled gives a clear unavailable state. Safari rejects script-bearing imports in UI/background, exposes no script-permission action, and retains script-free JSON/domain/CSS support. Old scripts are not registered after upgrading; refresh already-open pages to inspect residual executed effects.
- [ ] Enable/disable/delete reconciles CSS and future script registrations; legacy owned DNR is cleaned. Filter-group changes immediately restore/remove their selectors; new groups default enabled without changing other saved choices.
- [ ] Each group has description/switch above schedule summary/expandable selection. Desktop two-column/narrow one-column layouts do not stretch neighbors; preserve focus, expanded state, and scroll through saves; failure restores selection.
- [ ] Show corresponding-site periods only; reviewed Bilibili subdomains may share family periods, unrelated sites cannot. Missing site periods have a useful empty state; stale cross-site references are invalid/removable and never apply.
- [ ] Absent schedules remain unlimited; an empty selection is inactive. Any selected daily range applies filtering, with 12:00 inclusive/18:00 exclusive, overnight/equal endpoints, independent of referenced weekday, enabled flag, budget, policy, and usage group.
- [ ] Daily boundaries update native document and supported open roots without reload, including when the access period is disabled. Editing start/end updates filtering; weekday changes do not. Removing period/site/matching module scope invalidates references without expanding to all-day.
- [ ] Ordinary/plan schedules remain separate; restart/reimport/backup preserves surviving bindings; old backups remain unlimited. Turning a module/group/global switch off always restores content.
- [ ] Five repository modules use site names and bilingual metadata by stable IDs; existing installations switch without reimport and preserve both profiles. Unknown third-party IDs/groups retain author text; translated projections are not stored.

### Site regressions

- [ ] With current Bilibili files (1.2.5; earlier autoplay work began in 1.2.3), related-video filtering hides sidebar/end recommendations in old/new players. Required controls/replay remain; disabling restores content.
- [ ] With Chromium user-script access, related filtering disables the native autoplay control. Already-running countdowns, late controls, SPA changes, and user attempts to re-enable obey current filtering without breaking manual playback. Stop suppressing when group/module/global state, schedule, or plan context changes; restore only controls the script changed, retain originally-off state, and reapply after BFCache.
- [ ] Dynamic feed filtering hides ordinary feed cards, supported hover popups, trending lists, feed update dots/counts, and message reminder marks while retaining navigation, notification content, unrelated history/favorite popups, and commercial/unknown areas. Check ordinary and plan profiles and end-of-window restoration.
- [ ] With feed filtering off and comments on, hide featured comments under original/reposted feed videos while retaining video/body/like/actions. Appended cards, route tabs, reload, full comments in video/detail/article pages, and schedule/profile/global/module changes behave correctly; unknown/commercial structures remain visible.
- [ ] Reimport current module or reload Debug; check native/open-shadow home recommendations across supported recommendation sources/three grid layouts, late attachment, reattachment, pagination, and toggle restore. Keep searches/results/favorites/history/commercial marks/nonstandard links/unknown content. Record module version, login state, and browser. Homepage CSS still works without user scripts.

## Protected actions and data

- [ ] Disable protection defaults off. Test dedicated wait 1/3/5/10 minutes and password, with ordinary rules still active during waiting; cancellation keeps the extension on. Refresh/replay/changed protection cannot bypass old conditions; group and disable passwords are distinct.
- [ ] Clear/reset warns first; confirm input/action remains disabled before 120 seconds, and exact requested text is required. Cancellation changes nothing; reopening restarts waiting; replay is rejected.
- [ ] Reset removes site rules/passwords/runtime but retains statistics, queue, and imports. Clear removes them all and returns defaults. Both settle the last interval first and retain browser host permissions.
- [ ] Debug does not reseed cleared/reset data after restart until explicit test configuration. Global disable stops timing/plan/filtering/future script registrations; already-executed script effects may require refresh.
- [ ] Export/import is confined to Data management and local files. Round-trip rules, named presets, whitelist periods, plans, and identical-version module preferences/schedules; exclude history, grants, confirmations, bindings, and source.
- [ ] Reject oversized/malformed/unknown backup fields. Permission refusal makes zero writes. Restore waits for saves/old timing, clears bindings, atomically replaces data, resets runtime, and reports reconciliation warnings without reviving old grants or replacing protected disable settings.
- [ ] Absent/different-version modules are skipped, not installed/replaced. Restored whitelist periods require real group rebinding. Retained browser host permissions do not keep removed content registrations active.

## Tab-group whitelists

- [ ] Add whitelist is a peer of Add site. Separate left directories show counts; selected details appear on the right even without any sites. Each type retains its last selection/scroll; new save selects it, delete selects the first remaining/empty state; stale responses cannot overwrite newer selection.
- [ ] Existing same-name groups are distinguishable without internal IDs. Name suggestions track selected groups until user edits, handle unnamed/80-character names, and never rename browser groups or overwrite saved custom names.
- [ ] Each stable rule has separate identity/binding and up to 64 periods. New rule gets one all-day period; old single-period settings/backups retain windows and binding. Add/edit/enable/delete immediately persist; deleting the last period keeps the rule but grants no access.
- [ ] Single-day/workdays/all-day/overnight/start/end boundaries and union of overlapping periods are correct. All-off/no-match returns to ordinary rules without introducing a group blacklist.
- [ ] Configured, authorized sites in an active bound group bypass ordinary exhaustion/group waiting/entry confirmation without resetting budgets; outside-group same-site pages remain ordinary. No new host permission or behavior on unconfigured sites.
- [ ] Whitelist time enters actual/site/hour totals only. Group entry/exit, boundary between heartbeats, midnight, rule edit/delete, and multiple overlaps settle exactly once; after leaving, original groups/confirmation resume. Time after a whitelist interval ends is not silently charged to ordinary quota.
- [ ] Plans in whitelisted groups remain independently timed, keep deadlines, and retain all end/media/flow pauses. Whitelist never closes plan pauses or bypasses module domain blocks; filtering CSS remains active.
- [ ] Dissolving a group/last-member removal clears its binding and access; an unrelated same-name group does not inherit it. Mid-save deletion/window closure cannot revive a revoked group.
- [ ] Worker sleep retains active session validation. Closing/reopening windows or full browser restart may restore only one complete unique name/color/member-hash match, never old numeric IDs. Incomplete restoration waits; duplicate features, unreadable/private members, and same-name different members fail closed.
- [ ] Members on Hourleaf pause pages may contribute validated return sites to recovery; actual permission/domain/plan eligibility still decides navigation. Explicit dissolution, config deletion, and backup restore never revive revoked bindings.
- [ ] Two different groups and multiple rules per group work independently regardless of insertion order/selection/deleting the first rule. A later active rule still grants when an earlier rule is off/outside its window; reads use current real membership.
- [ ] Standalone/embedded/background pauses, cross-window groups, rebind/move, and worker sleep synchronize after save. Notifications neither steal save replies nor cause duplicate grants/message loops. Removing a tab/window or an ambiguous/missing API fails closed.
- [ ] Delete rule/site, revoke permission, disable extension, reset, and restore leave no stale access. Missing group/session APIs show unavailable state without breaking ordinary sites/plans.

## Cross-tab pause recovery

- [ ] Two pauses for the same site/target/period share A's minute grant ID/deadline when B returns; no duplicate duration/use count. Other sites/targets/periods inherit none.
- [ ] Repeat for embedded/standalone/background/another-window/BFCache pauses. Hidden embedded overlays may clear, but media resumes only when visible. Standalone hidden pages update state and recheck before navigation. Expired grants never revive through focus changes.
- [ ] A's next-group, flexible confirmation, shared entry confirmation, whitelist, or newly available ordinary rule updates eligible B pages. Per-tab confirmation, explicit domain denial, exhausted other targets, and all plan-pause boundaries remain effective.
- [ ] Flow/video-end grants obey original deadline/once-only/charging rules across minute/period/midnight changes. Media end uses the current target/period/grant after recovery.
- [ ] Concurrent host recovery and iframe confirmation/retry share one recovery; tab changes, repeated focus, worker sleep, navigation, and replaced instances do not lose the latest state or authorize a new page from a stale response.
- [ ] Grant/unlock success sends relevant same-site notices. Waiting initialization, generated questions, and usage heartbeats cause no continuous redraw/query storm; retain answer inputs/wait deadline. Short bursts coalesce without losing a follow-up check.
- [ ] Failure offers retry without granting/unlocking again; actions are mutually exclusive. Check real media resume on Debug video and Bilibili targets across Chromium/Safari; original target identity is retained.

## Statistics and layout

- [ ] Range cards, dates, trends, hours, and site shares change together. Today has a single hourly trend, week/month daily and year monthly. Zero values have no positive-height bars; empty data is clear.
- [ ] Average uses elapsed local calendar days including zero days, excluding future dates. Recorded days exclude zero values. Peak day and extras match raw aggregates without group-mirror double counting.
- [ ] Rank/time/percentage/share bars and expandable origins agree with total; removed sites remain under Other websites; unrecorded domains do not inflate recorded-site counts.
- [ ] Current-plan summary covers the entire queue, not invented per-range completion. Pending duration/completion count/progress and empty/unavailable states are accurate.
- [ ] Visible dashboard refresh retains expansion, list scroll, hour selection, and keyboard focus; old range responses are discarded; temporary failure retains last good data.
- [ ] Pause preserves balance ring, group segments, diamond clock, all-site total, percentages, shared vertical scale, peak-hour default, site pagination, and missing-hour history without inventing hourly data. Select-site/page changes preserve total/scale/selection.
- [ ] Group segment count matches 1/3/24 configured groups: exhausted hollow, nonexhausted solid, accurate accessible values/used/remaining summary, no visible hollow/solid legend. Flow spanning groups updates correctly.
- [ ] Hourly charts support mouse/touch/Tab/arrows/Home/End and explicit time/duration readings, including empty hours/all-zero days. Trend selection also supports keyboard. Repeated DST hours and local midnight aggregate correctly.
- [ ] Balance ring expresses actual elapsed plus remaining quota, including extras, not group progress. Check unused/partial/exhausted/unlimited/free-flow/charged-flow/flexible overrun and zeros; no NaN or false unlimited percentage.
- [ ] Current pause is fixed equal-width/equal-height usage/actions/statistics, max 1180px, with a centered action column. Narrow/short windows retain the full layout through necessary scrolling and initially center actions. Navigation only scrolls, never hides/recreates controls or restarts waits. Older single-region/two-row expectations are obsolete.
- [ ] Current period/group detail uses authoritative buckets without charging free extras twice. Site share/peak above actions is real; missing hours produce no invented peak. Right statistics fill their frame; all actions stay bottom-centered; long content grows frames naturally.
- [ ] Encouragement/custom prompts appear in the middle message slot. Empty text hides the slot, distribution rows fill space, and frames remain equal. More than 120 Unicode characters paginate completely without recreating wait/grant state.
- [ ] Only when no enabled period matches, show next available name/date/weekday/24-hour times. Check later today, overnight, next week/weekends, all-day, disabled/always-block, zero/exhausted quota, priority intersections, and no-future empty state. Boundary redraw never grants access or bypasses confirmation/domain/flow rules.
- [ ] Dashboard omits explanatory block/average/module/footer prose. Total card uses theme top line, separate digits/units, timing state; check zero, subminute, long hours, English/Chinese, light/dark.
- [ ] Embedded flow defaults video end only for actually playing main video; minutes hidden initially, switch restores 1–15/default five minutes. Paused/ended/audio/no-video/standalone cases default minutes. Confirmation grants once; recovery retry does not extend.

<a id="平台与可访问性"></a>

## Appearance, popup, and accessibility

- [ ] New/reset/invalid themes use ocean blue on the first frame; preserve valid saved forest/ocean/violet/amber/rose themes. Fixed palette swatches represent their own colors; all pages/popup update and survive refresh/backup.
- [ ] Sidebar icons default off with no reserved empty column; Appearance toggles all three directories without changing header/action icons. Old settings and backups normalize correctly.
- [ ] Sites/whole-site targets display canonical domains with origins distinguishing scheme/port; legacy module/debug labels cannot override them. Dedicated section labels/IDs/permissions remain unchanged.
- [ ] Long desktop directories scroll independently without moving details or being obscured by sticky navigation at document bottom. Redraw/resize/zoom retain scroll/focus and do not grow the page indefinitely. Width ≤860px or height ≤360px restores document flow.
- [ ] Settings shows seven categories with only selected details; save/language/theme preserve category/scroll/focus. Long English descriptions and narrow mode/control grids remain usable.
- [ ] All clocks, periods, presets, whitelists, timestamps use 24-hour time even under system 12-hour settings. Check `00:00`, `12:00`, `23:59`, overnight, `0900` -> `09:00`, and invalid input.
- [ ] Popup contains no global/plan toggle, only current-site summary, pending items, and Plans action. On tab/SPA/URL changes, refresh site/period/group/remainder; tick visibly only while timed without per-second storage writes.
- [ ] Popup shows at most three ordered pending items plus remaining count; one remainder for single-group, group/period/today values for multi-group. Fixed 380px/max600px popup scrolls to all actions; Debug expansion persists.
- [ ] Badge uses rounded-up minutes, `1` for 1–60 seconds, `0` when exhausted; plan uses independent deadline. Clear when display disabled, unlimited/unconfigured/non-page/globally paused or whitelist access. Flow updates immediately.
- [ ] Selected C-series rounded white toolbar icons are legible in light/dark browser chrome at 1×/2×; corners retain transparency; badge stays readable; favicon/manager icons retain intended assets.
- [ ] Chinese/English/system language reaches popup, all five pages, end pages, and manifest without mixed text. Existing module names/groups/delete/accessibility/schedules switch live; unknown author copy remains.
- [ ] Keyboard-only flow, visible focus, named controls, status beyond color, reduced motion, VoiceOver, forced colors, light/dark, five themes, long domains/titles, 320px width, short windows, 200%/400% zoom, and soft keyboard retain every action. Check common 1440×900/1366×768/1280×720 plus 1024×768/800×600/390×844/320×568 without assuming all columns fit at once.

## Platforms and documents

- [ ] Chromium worker recycling retains valid state. Resolve Safari converter warnings and verify denied/one-day/always/revoked permission states on submitted devices.
- [ ] Storage contains no ordinary complete URLs/titles/page text; full workflow produces no telemetry/ad/analytics requests. Privacy disclosure matches local recovery hashes and explicit plan URLs.
- [ ] Settings -> About has privacy, MIT license, and developer contact links, with bilingual names and keyboard access. Public GitHub documents open in separate tabs; rejecting host permissions does not block documents.
- [ ] English/Chinese README and privacy links resolve publicly. MIT and actual platform capabilities agree across README/privacy/store metadata/candidate notices. Screenshots and final signed candidates are reviewed separately.

Permission/privacy/data-loss/unescapable-filter/wrong-timing/signing/upgrade failures block publication. Automated build success cannot close these checks.

<a id="开放-shadow-dom-首页兼容回归"></a>
<a id="访问确认计划屏蔽与工具栏2026-09-12"></a>
<a id="统一暂停页回归2026-09-28人工执行"></a>
<a id="暂停页可视化2026-09-30人工执行"></a>
<a id="分组记录修复2026-09-30待人工执行"></a>
<a id="同网站新标签页确认2026-09-30待人工执行"></a>
<a id="暂停页布局与时长可视化2026-09-30待人工执行"></a>
<a id="居中布局与心流恢复2026-09-30待人工执行"></a>
<a id="计划暂停与主题更新2026-10-01待人工执行"></a>
<a id="同标签页通用计划访问2026-10-07待人工执行"></a>
<a id="普通访问不跳计划清单2026-10-07待人工执行"></a>
<a id="bilibili-动态精选评论2026-10-07待人工执行"></a>
<a id="标签页组白名单人工验收"></a>
<a id="配置布局24-小时制与设置分类人工验收"></a>
<a id="用时来源切换及组内标签保护人工验收2026-10-13"></a>
<a id="网站模块双语显示人工验收"></a>
<a id="关闭窗口后的白名单恢复2026-10-15"></a>
<a id="配置屏蔽和设置的目录与时段交互2026-10-15"></a>
<a id="默认外观目录图标和网站名称2026-10-15"></a>
<a id="心流与同网站多个暂停页2026-10-15"></a>
<a id="暂停操作后的同网站同步2026-10-18待人工执行"></a>
<a id="多个标签页组白名单2026-10-17"></a>
<a id="仪表盘与暂停页展示2026-10-19待人工执行"></a>
<a id="暂停页心流与分组条恢复待人工执行"></a>
<a id="暂停页紧凑展示与视频心流默认项待人工执行"></a>
<a id="暂停页尺寸按钮位置和下一可用时段待人工执行"></a>
<a id="关于与文档2026-10-19"></a>

## Historical regression rounds

These rounds remain unexecuted unless a separate candidate-specific record supplies evidence. The current checklists above consolidate their surviving scenarios.

| Date       | Scope                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-12 | Same-tab confirmation, ordinary/plan filter profiles, toolbar alpha/dark rendering; `focus-flows-extension.spec.ts` records automated fixtures, not new execution here      |
| 2026-09-28 | Unified pauses, group challenges, once-only flow, media recovery, protected disable/reset/clear                                                                             |
| 2026-09-30 | Usage/group/ring visualization, precision fixes, new-tab confirmation, centered pause/recovery                                                                              |
| 2026-10-01 | Plan notices/goals/themes and popup dimensions                                                                                                                              |
| 2026-10-07 | General same-origin plan visits, no forced plan redirects, Bilibili dynamic featured comments                                                                               |
| 2026-10-13 | Timing-source boundaries, grouped-tab preservation, bilingual module projection                                                                                             |
| 2026-10-15 | Unique-feature whitelist recovery replacing compulsory restart rebind; directories/multiple periods, blue default/icons/domain names, cross-tab pauses                      |
| 2026-10-17 | Multiple whitelist groups, latest real membership, naming, nonblocking notices                                                                                              |
| 2026-10-18 | Same-site post-action synchronization and retained pause inputs                                                                                                             |
| 2026-10-19 | Range/hour/plan statistics, restored group/flow controls, fixed compact panels, video default, equal frames/messages/next available period, About/MIT/platform restrictions |

Historical notes record TypeScript/CSS compilation, release/Debug builds, and some packaging checks only. They do not establish browser interactions, screenshots, visual fidelity, or signed-store acceptance.
