# Hourleaf Features

Describes the source and `1.0.0` behavior as of October 20, 2026. Platform signing, store publication, and manual acceptance are separate steps.

## Websites and time windows

Add an HTTP/HTTPS website in Configuration and authorize it to create rules. Ordinary websites match the exact scheme, host, and port; Bilibili uses its defined HTTPS site family. Matching open pages receive the content script after authorization. Denied permission does not save a new website; revocation stops its features.

Website names use the canonical domain rather than an imported component or legacy name. Directory details retain the full origin to distinguish schemes and ports.

New websites default to Strict mode, an all-day window every day, no minute limit, and one group. Windows have individual enable switches; there is no website-wide enable switch. Changes save immediately. Each window has its own weekdays, start/end times, access behavior, allowance, and group count. Equal start/end times mean all day. Overnight windows belong to their start day; the end boundary is excluded.

| State                               | Website access and tracking                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| No windows, or all disabled         | Unlimited use; actual usage and ordinary access confirmation remain, without consuming window allowances |
| Enabled windows exist, none matches | Unavailable                                                                                              |
| Always-available window matches     | Unlimited use; actual usage is recorded                                                                  |
| Always-blocked window matches       | Ordinary access is blocked                                                                               |
| Limited window matches              | Daily allowance, groups, and expiry mode determine access                                                |

Overlap priority is always available, then always blocked, then limited use. Content filtering and explicit domain blocks remain active. Plans and tab-group access are evaluated separately.

Quick-add presets include meals, two sessions, morning, afternoon, evening, early bird, night owl, and custom combinations. Custom presets can be named, saved, and reused. Adding a preset replaces only an unchanged default all-day window. Times use `HH:mm`; entering `0900` becomes `09:00`.

## Confirmation, groups, and expiry

Ordinary access confirmation and group unlocking share a policy: immediate confirmation, waiting, equations, calculus, or a password. The default wait is 30 seconds, configurable from 1–10800 seconds. Access requires confirmation after the countdown; tracking starts after confirmation.

Confirmation is normally shared within the same website's current available window. New tabs and returning visits do not repeat it. With Repeat confirmation in new tabs enabled, each tab confirms separately: refresh retains confirmation, but leaving and returning requires it again. A new day, a time-window or relevant policy change, or browser restart invalidates confirmation. The website's message switch controls only the text; disabling it preserves the text and confirmation flow.

A finite allowance is divided equally into groups. Unlocking the next group does not reset the allowance. Each group uses the website's expiry mode:

- Lenient: Show a reminder and allow continued access after confirmation.
- Flow: Allow one extension per group, either 1–15 minutes or until the current video ends. Confirmation activates it; the video option requires an available video and has no invented minute deadline.
- Strict: Stop the visit and offer the next group or closure according to the remaining groups.

Ordinary Flow extensions are recorded separately and do not consume later groups by default. When charging is enabled, accounting follows the setting saved with the grant. Retrying a failed page restoration does not issue another extension. For the same website target and window, a minute extension can restore other tabs paused under ordinary rules when they become visible or the grant changes. They share its original deadline. Opening the next group, Lenient confirmation, a newly available window, and shared access confirmation also restore eligible tabs. Per-tab confirmation still applies when enabled; ordinary access never bypasses an expired plan's pause.

After confirmation, Flow changes, or opening the next group, the background updates tabs for that website. Embedded pauses lift without replacing the webpage or losing video position; background tabs do not autoplay. Standalone pause pages update in the background and recheck before returning when shown. Restricted pages refresh the current window and actions. Updates are scoped by website and coalesced; unrelated targets, challenge initialization, generated questions, and tracking heartbeats do not redraw pause pages.

## Tab-group whitelist

Website and whitelist directories are peers in Configuration. Select a group configuration to edit its name, browser-group binding, and time windows. Each window has a name, weekdays, start/end time, and independent editing, enable, and delete controls. Changes save immediately. Each group supports up to 64 windows; a new group starts with an all-day daily window. Legacy rules keep their binding and convert the original window into the first item. Enabled windows form a union. No windows, or all disabled, restores ordinary website rules; deleting the last window keeps the group configuration.

Selecting a browser group fills the new configuration name. Changing groups updates the name until it has been manually edited. Configurations follow actual tab membership. Saving, rebinding, or moving tabs causes embedded and standalone pause pages to recheck access.

During an allowed window, configured and authorized websites in the bound group have unlimited ordinary access without allowances, group pauses, or confirmation. Actual website and hourly usage is still recorded. Leaving the group or reaching the window's end restores the original rules and balances. Other groups, ungrouped tabs, and unauthorized websites do not inherit access. Content filtering, CSS, and explicit domain blocks remain; plan deadlines are unchanged.

Rules persist, but numeric group IDs are trusted only within the current browser session. After a window closes or the browser restarts, bindings restore only when the saved name, color, and member-URL digest identify one group. Incomplete or ambiguous restoration waits rather than authorizing by name alone. Dissolving a group, removing its last tab, or restoring a backup requires rebinding. Background suspension retains session bindings.

Supported on Chromium and Firefox with group APIs and session storage. Safari and browsers without the required APIs show an unavailable state; ordinary rules and plans remain usable. The feature reads existing groups and membership without changing groups or expanding website permissions.

## Plan access

Add, bulk-import, edit, reorder, delete, complete, and restore items. Each item requires a 1–1440 minute duration and expiry mode. It can include a goal note of up to 500 characters and pause when its video ends. List and mind-map views place completed items in a collapsed section below pending items. The mind map supports dragging, pointer-centered zoom, keyboard controls, and fit-to-canvas.

Adding an item does not request permission. Starting requests the origin permission and opens a pause page to confirm duration and goal. Confirmation starts the timer. There is no separate plan-mode switch. Auto-completing an item when starting is optional and off by default.

Plans always use independent timers. They do not add ordinary website usage or consume its allowance. Ordinary blocked windows do not override them; explicit module domain blocks still apply. Whitelist access cannot cancel or extend plan deadlines. The old independent-timing field remains only for compatibility and is absent from Settings.

Only one plan visit can be active at a time, bound to the confirmed tab and exact origin. Same-origin navigation, refreshes, query parameters, fragments, paths, and SPA routes retain the deadline. Other tabs do not inherit it. Leaving the origin or closing the tab ends the visit; returning uses ordinary rules. Starting again creates a new visit and deadline.

Expiry displays Lenient, Flow, or Strict actions within the original visit. Flow permits one extra duration or continuation until the current video ends. Refreshing, navigating, or revisiting after expiry clears the old timer and notification. Stopping, replacement, completion, deletion, relevant item edits, globally disabling the extension, resetting, or restoring a backup also revoke access. Background suspension can recover a session; browser restart does not restore timers. Items and planned durations remain separate from website windows.

<a id="内容屏蔽与模块"></a>

## Content filtering and modules

Store candidates do not bundle website-specific modules. Download and review files from the [module catalog](../optional-modules/README.md), then select the manifest and its referenced local files on the Block page, review capabilities, and authorize them. The extension does not download modules, check for updates, or install from URLs.

The Block page lists installed modules and a download entry on the left, with the selected module or download instructions on the right. Import selects the new module. Deletion selects the first remaining module or displays an empty state.

Modules support exact-origin policies, selectors, self-contained CSS, and isolated user scripts where the platform permits. Domain policies are independent of content groups. Scripts run only on Chromium through the User Scripts API; Firefox and Safari store candidates reject script imports. Disabling or deleting unregisters future execution. Effects of scripts already executed follow their page lifecycle and may require a refresh.

Content groups run at all times by default. They can reference multiple existing windows for the corresponding website, using only start/end times as daily filtering windows. Weekdays, enable state, access mode, allowances, and group counts do not affect filtering. Deleted websites or windows invalidate references; when all references are invalid, filtering stops. Unlimited website access still applies these content rules.

Ordinary and plan preferences are stored separately. Enable all blocking during plans is on by default. An active plan uses installed modules' plan preferences, initially enabling content groups. The Block page edits the current context and restores ordinary preferences afterward. Existing permissions, schedules, and edited plan preferences still apply; no modules are installed or permissions requested automatically.

The Chinese UI calls these components “屏蔽插件.” The five repository modules use website names, describe the content they hide, and omit module-name suffixes. Names, descriptions, and group labels follow the UI language. Stable IDs localize existing installations without reimporting; unknown modules retain their authors' text. See the [catalog](../optional-modules/README.md) for versions and capabilities and [LOCAL_MODULES.md](./LOCAL_MODULES.md) for the contract.

## Statistics, pause page, and toolbar

Ordinary statistics count only visible pages in a focused window while the device is active. Platforms without idle detection use the available signals. Switching tabs, minimizing, navigating away, or locking the device does not backfill invisible time. Usage is grouped by local date and hour. Plans do not write ordinary statistics.

The dashboard covers today, this week, this month, and this year. It displays total and daily-average usage, active days, the most-used website, peak day, and Flow extensions. Averages include elapsed days without usage and exclude future days. Flow time is included in totals. Today's trend is hourly, weekly/monthly trends are daily, and the yearly trend is monthly. Week/month/year views also aggregate matching clock hours. Website rankings show duration and share, with expandable origins; retained history from removed websites is separate. Current plan covers the entire current queue regardless of the statistics range. Total usage displays separate numbers and units. The dashboard retains data names, values, and necessary states without explanatory subtitles or a footer.

Ordinary pauses use three equally sized columns: usage on the left, actions in the center, statistics on the right. Actions stay below the center content. Configured motivational text has its own center area with pagination; no area is reserved when it and the access message are empty. Narrow windows scroll the full layout horizontally. The left column includes window and group balances, or the next available window with date, weekday, and times; no future window produces an empty state. Group segments retain used/remaining counts without a hollow/filled legend. Panels follow the tallest content, and mobile section navigation scrolls to columns. Website rows show shares and select the hourly distribution. Flow defaults to stopping when the video ends if a video was playing before the pause; otherwise it defaults to a duration. Hourly charts initially select the recorded peak hour and support arrow keys and Home/End. Missing historical hourly detail is reported without estimates. Plan pauses show item duration, goal, and actions.

Ordinary closure affects only related tabs within the website scope that are confirmed ungrouped. All grouped tabs, including grouped pause pages, remain open; unknown membership is also preserved. Plan closure follows the item's exact origin rather than ordinary group protection.

The toolbar shows today's website usage, group or plan time remaining, up to three pending items, and a count of further items, with navigation to Plan. Its badge rounds remaining minutes up. Unlimited access, whitelist access, video-end grants, unconfigured pages, and global disablement show no ordinary countdown. Valid timed plan access shows its plan balance.

<a id="设置备份与删除"></a>

## Settings, backup, and deletion

Settings has seven categories: Operation and protection, Appearance and display, Plan access, Confirmation and unlocking, Pause and end page, Data management, and About. The right panel shows the selected category. Configuration, Block, and Settings share directory behavior; saving and changing language/theme preserve selection and scroll. On narrow screens the directory appears above the editor. The default theme is Ocean blue; existing choices are retained. Sidebar icons are hidden by default and can be enabled in Appearance and display for all three pages. The interface supports five themes, system light/dark mode, Simplified Chinese, English, system language, badge minutes, and custom motivational text. Disable protection offers waits of 1/3/5/10 minutes or a separate password.

About links to the privacy policy, MIT License, and developer contact. Documents open on GitHub, and contact opens project Issues. No remote document content is loaded into the page.

| Action                | Scope                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export configuration  | Websites, windows, custom presets, whitelist rules, plans, ordinary/plan module preferences, and filtering-time references                            |
| Excluded from backup  | Usage, active plan/temporary grants, group runtime, confirmation, group bindings, module CSS, and script source                                       |
| Restore configuration | Replace configuration after permission confirmation and clear runtime/bindings; restore preferences only for installed modules with matching versions |
| Restore defaults      | Clear website rules, group runtime, active grants, and disable passwords; retain statistics, plans, and imported modules                              |
| Clear all data        | Delete application settings, statistics, plans, modules, and runtime state; required to clear usage records                                           |

Configuration backups are local JSON files up to 16 MiB, without cloud sync. Preferences for absent or mismatched modules are skipped; backups cannot install code. Restoring defaults and clearing all data require a 120-second wait and the specified confirmation text. Canceling makes no changes. See the [privacy policy](../PRIVACY.md).
