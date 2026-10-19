# Changelog

All notable changes to Hourleaf will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-19

### Added

- About settings link to the privacy policy, MIT license, and developer support.
- Store submission materials for Chrome, Firefox, and Safari, with separate component documentation and concise privacy and disclaimer notices.

- Dashboard daily averages, days with usage, peak-day and flow-extension summaries, hourly range distributions, ranked website shares, and a separate plan completion overview; removed websites retain their historical usage in the distribution.
- Shared keyboard-accessible hourly charts highlight the peak hour on dashboard and pause pages; pause website rows now show their share of the daily total.

- An opt-in sidebar icon preference applies to Configuration, Block and Settings directories and is included in local configuration backups.

- Scheduled tab-group whitelists allow unlimited access to configured, authorized websites in a bound browser group without consuming ordinary quotas; live IDs remain session-scoped, with local fingerprint recovery for uniquely matching restored groups. Group removal and configuration restore require rebinding.
- Local-module content filters can select saved Configuration time periods and apply only during matching daily clock ranges, with separate normal/plan preferences and configuration-backup support.
- Local configuration backup includes reusable custom presets, whitelist rules, plan items, and compatible installed-module preferences, excluding usage history, executable module files, active grants, and browser group bindings.

### Changed

- Firefox store builds reject user scripts to meet AMO policy; JSON and self-contained CSS remain available.
- GitHub product descriptions focus on website time management, plans, and local statistics.

- Keep three equal-sized pause panels, center the actions near the bottom, and show the configured motivational message in the middle; empty messages collapse so site statistics expand into the available space. Show period/group quotas and site usage above the actions; keep horizontal scrolling in narrow windows and remove the hollow/filled legend text.
- Outside all enabled periods, pause pages show the next available period with its date and times, respecting weekday, overnight, overlap and daily-quota rules.
- Simplify dashboard labels and remove the footer explanation; rebuild the total-time card with separate duration values and units plus tracking status.
- Flow continuation defaults to stopping when the video finishes when a video was playing before the embedded pause; otherwise it defaults to a timed continuation.

### Fixed

- Restore pause-page group progress styling and keep flow choices, next-group controls and usage progress visible in compact windows; section navigation now scrolls to panels instead of hiding them.

- Tab-group access checks read current membership after resolving all bindings and fall back to browser member queries when tab metadata omits the group; access-change notifications reach standalone pause pages as well as website frames. New configurations suggest the selected browser group's name.

- Ordinary pause pages now recheck shared flow/group grants and resume when access becomes available, including background tabs, embedded frames, shared confirmations and rule changes; existing deadlines, per-tab confirmation and plan-expiry pauses remain authoritative.
- Concurrent pause-frame resume requests share one result instead of reporting a failed resume while another request is already restoring the same page.

- New and reset configurations default to the blue Ocean theme, including the initial unconfigured palette; saved theme choices remain intact.
- Website and general-target names use their configured hostname, while maintained blocking add-ons use website names and concise descriptions of the content they hide, including existing imports.

- Shared configuration sidebars account for navigation height and page-bottom padding so scrolling long details to the end cannot push the directory behind the header; narrow or very short windows use normal document flow.

- Tab-group whitelist configurations now manage multiple independently named, enabled weekday/time windows under one group; existing schedules and bindings remain readable.
- Blocking and Settings now share Configuration’s sidebar/detail navigation, preserving selection and scroll position after saves.

- Plan access now belongs to its confirmed tab and exact website origin; pagination, refreshes, and route changes keep the original deadline, while other tabs follow ordinary focus rules.
- Ordinary website visits no longer redirect to the plan page when they do not match the active plan.
- Plan timers and expiry notifications are browser-session state; revisiting after expiry or leaving the website clears the old visit instead of repeatedly blocking access. Live same-origin navigation retains its deadline, and stale video-end callbacks do not stop the continuing visit.
- Toolbar remaining time and configured usage accounting now use the current tab's plan authorization.
- Ordinary pause-page close actions preserve all grouped tabs and close only related tabs confirmed to be ungrouped; plan close actions retain their exact-origin scope.
- Switching between ordinary access, whitelist access, and plan access settles the previous usage interval and clears media callbacks owned by the previous source.
- Built-in module names, descriptions, and filter-group labels follow the interface language without rewriting module files or stored preferences.
- Bilibili 1.2.5 extends the comments filter to featured comments beneath dynamic video cards while preserving likes, post content, and video cards.
- Content filter schedules now read only the selected start/end times as daily blacklist windows; configured weekdays, period enablement, access modes, and allowance no longer prevent matching or boundary refresh.
- Bilibili 1.2.4 hides dynamic-update and message-notification dot/count badges with the dynamic-feed filter in native navigation and supported alternative layouts.
- Bilibili 1.2.3 disables native related-video autoplay while its related-video filter is active, including selected time periods and plan preferences; existing visible toggles are restored when suppression ends.
- Bilibili 1.2.2 applies the related-video filter to player end-screen recommendations and the dynamic-feed filter to supported navigation popovers and the dynamic page's hot-search ranking.

### Changed

- Plans always use independent access timers and never consume configured usage or quotas; the former toggle is removed and older settings normalize to independent timing.
- Configuration uses parallel website and whitelist directories with an independently scrolling desktop sidebar; settings are organized into seven categories, including About.
- All clock inputs and timestamps use 24-hour notation, including systems configured for a 12-hour clock; website visit prompts have a separate text-visibility switch.
- Managed websites with no enabled time periods now allow unlimited use while retaining actual usage statistics, content filters, and their independent daily schedules.
- Content filter cards align switches and time-period controls, and offer only periods from the corresponding website; unrelated stored references remain inactive and removable.
- Plan mindmaps show pending items only; completed items use the same collapsible list at the bottom in both views.
- Optional module names now use only the website name: Bilibili, 小红书, X, YouTube, and 百度贴吧; module IDs and filter preferences remain stable.
- README and product/developer documentation now describe the complete current feature set, with a feature guide and a module-oriented documentation index.

## [0.6.0] - 2026-08-11

### Added

- Added a bounded local-module format for exact domain policies, element hiding, self-contained CSS, safe DNR rules and browser-isolated user scripts.
- Added local file import, explicit site authorization and module enable/remove controls, with an optional source catalog kept outside store packages.
- Added store-candidate packaging assertions and SHA-256 checksums for Chromium, Firefox and Safari artifacts.

### Changed

- Reduced store builds to the generic focus core and moved website-specific examples to the manually downloaded GitHub catalog.
- Made browser target capabilities build-time constants so Safari rejects imported user scripts at the privileged service boundary.
- Updated the GitHub Actions artifact upload to publish only validated store-candidate ZIP files.

### Privacy

- Modules are never downloaded or updated by the extension; users must select local files and approve exact website access.
- Imported scripts use only the browser User Scripts API on Chromium/Firefox; Safari store builds do not import or execute them.

## [0.5.1] - 2026-08-09

### Changed

- Consolidated each browser release into one Hourleaf extension with all reviewed site modules preinstalled.
- Split module runtime code into local chunks that are registered only while the module is enabled.
- Replaced module download actions with local enable, disable, delete and restore controls.

### Privacy

- Preinstalled modules remain disabled and request no website access until the user enables them.
- Deleting a module unregisters its code chunk and removes its module-specific targets without downloading or executing remote code.

## [0.5.0] - 2026-08-09

### Added

- Added user-managed rules, limits, plans and local time insights for arbitrary HTTP and HTTPS websites.
- Added exact, on-demand website permissions and persistent dynamic content-script registration.
- Added a bounded site-module contract and Bilibili site module.
- Added site and module management to the shared Hourleaf settings experience.

### Changed

- Renamed the extension to Hourleaf while retaining legacy storage keys and the Firefox extension ID for upgrades.
- Moved Bilibili routes, selectors, content filtering and video identity into the optional `hourleaf.site.bilibili` module.
- Migrated settings, usage and temporary access to generic site/target schemas.
- Separated generic website logic from reviewed site-module code without remotely executed code.

### Privacy

- Website access is optional and requested for the exact origin selected by the user.
- Ordinary browsing stores only site/target identifiers, local dates and aggregate seconds; it does not persist page paths, titles or content.

## [0.4.0] - 2026-08-09

### Added

- Added recurring per-section allowlists and blocklists by weekday and local time, including cross-midnight ranges and morning, midday, evening and meal presets.
- Added list and horizontal drag-to-reorder mind-map views for the local watch plan.

### Changed

- Replaced the full-page top navigation with a shared left sidebar for Dashboard, Plan, Configuration and Settings.
- Split focus and data controls into Settings while keeping content filters, section limits and time rules in Configuration.
- Replaced tutorial-style and recommendation-style interface copy with direct labels, states and actions.
- Migrated stored focus settings to schema version 2 while retaining the existing storage key and treating legacy schedules as block rules.

- Content filtering now skips unchanged 15-second refreshes and observes live feeds only when non-empty title rules are enabled.

## [0.3.0] - 2026-08-09

### Added

- Added modular in-page distraction controls for recommendations, dynamic feeds, related videos, comments, search suggestions, ads and top navigation.
- Added title keyword and safety-bounded regular-expression video-card filters plus the `/` search shortcut.
- Added a first-level Focus Center with live timing, today usage, focus status, plan status and clear routes to every full page.
- Added a normative UX writing standard for user-facing text, errors, empty states and terminology.

### Changed

- Unified full-page navigation, breadcrumbs, current-page state and same-tab transitions across the Focus Center, Watch List, Usage Insights and Focus Settings.
- Split “content quieting” from whole-page focus blocking, and collapsed detailed page rules to reduce settings-page density.
- Usage summaries now settle the active interval before display; popup and insights expose a live tracking state.
- Rewrote high-priority interface text around user outcomes and alternatives instead of provider, schema or service configuration.

### Privacy

- Content rules and title patterns remain local; matching does not create a history of titles or URLs and adds no new permission or network request.

## [0.2.0] - 2026-08-09

### Changed

- Renamed the extension from BiliFocus to BiliPace（哔哩节拍）while retaining legacy storage keys and the Firefox extension ID for upgrade compatibility.
- Added a prominent plan-mode switch and watch-list entry directly to the toolbar popup.
- Added release-first installation and plan-mode activation instructions.

### Added

- Initial privacy-first Bilibili focus controls, schedules, daily limits and temporary access.
- Optional plan mode that routes Bilibili navigation through a local watch queue and grants only the explicitly started BVID for a bounded window.
- Local watch-plan todo workflow with add, edit, reorder, complete, restore and safe batch URL/BVID import.
- A reviewed official Open Platform provider boundary for future watch-later/favorites import, with a clear not-configured fallback and no Cookie/private-API access.
- Local day, week and month usage insights grouped by Bilibili section.
- Chromium, Firefox and Safari Web Extension build targets.
- Automated type, lint, unit, build and browser UI quality gates.

### Fixed

- Extension pages opened in a browser tab were no longer misclassified as Bilibili content scripts, preventing closed Chrome message ports and “data unavailable” screens.
