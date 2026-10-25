# Website module selector research

See the [component catalog](../optional-modules/README.md) and [local module specification](./LOCAL_MODULES.md). This file records historical page research, selector boundaries, and safe failure behavior. The 2026-10-20 documentation update did not revalidate live website DOM or repeat the historical checks below. Current behavior requires [manual acceptance](./MANUAL_ACCEPTANCE.md).

Modules are maintained through their manifests, CSS, and user scripts. Current store policy allows user scripts on Chromium only; Safari rejects entire script-bearing packages, including the current Bilibili and Xiaohongshu editions. Firefox support is archived in `deprecated/firefox/`; historical Firefox references below do not describe current targets.

## Selector strategy

- Prefer custom elements, stable IDs, `data-testid`, page-type attributes, and destination links.
- Select individual content items rather than mixed lists or sidebars.
- Use conservative `:not()` / `:has()` exclusions for known boundary markers. Leave uncertain content visible.
- When an SPA needs route scope, write only a content-free root marker. Route checks should be constant-time and must not scan page text.
- Failed selectors should hide nothing. Reinspect redesigned pages before publishing a patch.

## Xiaohongshu

Module: `optional-modules/xiaohongshu/`, version 1.0.1.

The script maintains only `data-hourleaf-xhs-page=home|other` on the root. The `home-recommendations` group controls ordinary home cards. This edition requires a script and is Chromium-only. Safari store builds reject it rather than importing a partially functioning package.

## X

Module: `optional-modules/x/`, version 1.0.1.

The selected `/home` tab scopes the homepage before selectors descend into tweets within `cellInnerDiv`. Renamed selectors naturally stop matching.

## YouTube

Module: `optional-modules/youtube/`, version 1.0.1.

Home recommendations, Shorts, related videos, and comments form four independent groups. Card rules target individual renderers instead of an entire grid or secondary container.

## Baidu Tieba

Module: `optional-modules/baidu-tieba/`, version 1.0.1.

Rules descend only to `#new_list > .j_feed_li`. Newer areas without stable semantic anchors are left unchanged. DOM changes should safely disable the group.

## Bilibili

Module: `optional-modules/bilibili/`, version 1.2.5.

The original single `hideSelectors` set was split into home recommendations, dynamic feed, related videos, and comments. Home and related-video selectors target ordinary cards. The `/` search-focus script has no network access, protects text input, and silently returns if no search field is found. See the dated records below for later additions.

## Reinspection checklist

For selector updates, inspect signed-out and signed-in pages, home and detail views, light/dark themes, 200% zoom, and every supported browser. For script-bearing packages, verify Chromium behavior and Safari import rejection. A separately published script-free edition needs its own acceptance record.

Repository tests read actual manifests and references and import them through `parseLocalModuleFiles()` to detect protocol drift. These fixtures do not establish current website compatibility.

## Open Shadow DOM home layouts — 2026-09-11

- Replacement home cards can live inside open shadow roots. Document CSS cannot enter them directly. The manifest declares hosts and mount events; the core copies only that module's rules into each root. Legacy site adapters are outside the local-module execution path.
- Different recommendation sources can produce different layouts. Filtering uses rendered DOM only, without intercepting APIs or reading login credentials.
- Inspected layouts contained a main content area, a grid after the heading, card wrappers, video cards, and destination links. Grid classes were `grid-adaptive`, `grid-two-columns`, and `grid-one-column`. Rules select single-card wrappers with standard video links and exclude commercial markers. Search, favorites, and history lack this home structure and stay visible. Ordinary videos in following/popular subviews with the same structure follow the home switch; no language-based subtab guessing is used.
- `.ad-report`, commercial classes, and commercial destination links are retained. Unknown structures, paid series links, live streams, skeletons, and navigation are not included in broader hiding rules.

Fixture entry point: `tests/e2e/local-rules-ui-contract.spec.ts`. Chromium/Firefox fixtures reproduce the inspected source structure and check computed styles across three grids, native home layouts, commercial/unknown-node retention, late mounts, replaced roots, pagination, switch restoration, and root isolation. They cannot replace checks against installed versions, actual account states, or live A/B layouts.

**Historical result:** 168 unit tests, type checking, lint, three-platform builds, and five Chromium browser cases passed. Bilibili 1.2.1 was packaged and the local Debug build updated. Firefox automation stopped during browser startup because of local process sandbox/GPU-helper failures; Firefox browser validation and actual-account end-to-end checks were not completed.

## Ending recommendations, dynamic hover panels, and trending lists — 2026-10-01

The change used `optional-modules/bilibili/hourleaf-module.json`, version 1.2.2. New selectors entered the existing `related-videos` and `dynamic-feed` groups without core or script changes. Normal/plan switches used the existing rule-generation layer.

- Read-only inspection of an open `https://t.bilibili.com/` page and video page identified `.bili-dyn-search-trendings` independently of the right-side banner. An inspected open root placed a dynamic popover after its `https://t.bilibili.com` entry within `.right-side-item`. Targeting that link avoids favorites, history, and notification popovers, without relying on Vue hashes or Chinese text.
- Ending rules descend to `.bpx-player-ending-related-item`, or `.bilibili-player-ending-panel-box-recommend` in older layouts, preserving other ending controls. Native dynamic hover panels use `.dynamic-panel-popover`.
- New rules retain commercial exclusions; ending recommendations also exclude paid-course links. Existing group styles cover later inserted cards and panels without extra scans, listeners, or permissions.

Catalog names were standardized to website names. Manifest and CSS/script metadata were updated together; module IDs, group IDs, and existing switches stayed stable.

**Historical result:** `npm run typecheck`, three-platform `npm run build`, and `npm run build:debug` passed; the local Debug output was updated. No unit or browser regression tests ran. Account-specific behavior, hover panels, video endings, and cross-browser behavior remained for manual acceptance.

## Autoplay after hiding ending cards — 2026-10-04

Bilibili 1.2.3 changed `focus.user.js` and `related-videos`. Hiding ending cards does not cancel the website's autoplay state, so additional CSS selectors alone could not address it.

- Read-only inspection identified `.next-play`, its `.continuous-btn` switch, and `.switch-btn.on` for the enabled state.
- The page's [official video script](https://s1.hdslb.com/bfs/static/jinkela/video/video.05af4e80b6081ba56c1b5b943d4c8e621df3f875.js) and [official player script](https://s1.hdslb.com/bfs/static/player/main/core.ba67b466.js) showed a native `continuousPlay` watcher updating `relatedAutoplay` and calling `setHandoff(Abort)`. Only public control/state semantics informed the implementation; upstream code was not copied, internal player objects were not called, and site storage was not modified.
- The script creates the empty, zero-size `#hourleaf-bilibili-related-playback-guard` marker and adds its selector to the related-video group. It temporarily disables native autoplay only while the core hides that marker. Existing CSS therefore supplies normal/plan preferences, group switches, global disable state, and schedules without duplicated timing logic.
- A local MutationObserver handles late controls, replaced recommendations, and switch-state changes. Added, changed, or removed styles trigger coalesced microtask updates. There is no polling, manual-play blocking, or video playback API use. The guard operates only on standard `/video/` pages with ordinary video cards and no known commercial/course markers; unknown structures fail safely.
- When filtering stops, the script restores only still-present controls it previously disabled. `pagehide` disconnects observers and restores controls; back-forward-cache `pageshow` rebinds them. Native state persistence after full page unload depends on the site's event queue; restoration after forced browser termination is not guaranteed.
- This behavior requires the User Scripts API. It was originally described for Chromium/Firefox; current store builds enable it on Chromium only. Safari rejects the package instead of silently omitting the script.

**Historical result:** script syntax, TypeScript, and release/Debug builds were checked. No unit or browser regression tests ran. Ending countdowns, changes after a countdown has started, schedules, and actual browser behavior remained for manual acceptance.

## Dynamic update and message badges — 2026-10-04

Bilibili 1.2.4 added selectors to `dynamic-feed`, without scripts or new origins. Read-only inspection covered the existing video navigation and its [official navigation script](https://s1.hdslb.com/bfs/seed/laputa-header/bili-header.umd.js).

- Native dynamic and message entries use `.dynamic-entry` and `.message-entry`; `.red-point` and `.red-num` represent badges within the entry links. Only these markers are hidden, leaving links, icons, membership hints, and other navigation badges visible.
- Inspected open-root navigation uses `.unread-dot` / `.unread-num-dot` directly under `.right-side-item`. Dynamic entries are identified by their direct `t.bilibili.com` link. Notifications use the message link or the entry's `i-tabler:bell` attribute, including `#` links that open a drawer. Rules avoid text, position, Vue hashes, and whole-popover hiding.
- Existing CSS matches newly added markers without polling, reading messages, or changing read status. Group switches, daily filtering periods, and normal/plan preferences control both the document and declared open roots.

Filter schedules were also made independent daily intervals using only referenced start/end times. Configured weekdays, enabled state, quota, and access mode do not participate. Manual checks must cover both 12:00–18:00 boundaries, disabled source periods, overnight intervals, background-tab return, and restored badges.

**Historical result:** syntax, compilation, build, and packaging checks only; no browser or unit tests ran.

## Comment previews on dynamic cards — 2026-10-07

Bilibili 1.2.5 extended `comments` to cover featured comment previews on dynamic cards. The previews shown in the user's screenshot belong to a separate interaction component, outside the existing `#comment`, `.comment-container`, `.reply-warp`, and `bili-comments` rules.

- Research read public dynamic-home HTML and its [official page script](https://s1.hdslb.com/bfs/static/2233-monorepo/dyn-home/static/js/index.611b9e16.js), without signing in, reading dynamic-feed data, or interacting with the page.
- `DynInteraction` renders `module_interaction.items` into `.bili-dyn-interaction__item` inside `.bili-dyn-item__interaction`. A direct child `.bili-dyn-interaction__item__icon.comment` denotes a comment; `.like` denotes a like interaction.
- Rules hide only rows with a direct comment icon and exclude known commercial markers. Likes, video cards, post text, and bottom action bars remain visible. No comment-text guessing or whole-card/mixed-container hiding is used; unknown icons remain visible.
- The existing comments CSS controls the change independently of the dynamic-feed switch. New pages, appended items, and replaced nodes match naturally. Normal/plan preferences and daily schedules use the existing logic, with no new scripts, observers, or permissions.

Manifest, CSS, and script metadata moved together to 1.2.5.

**Historical result:** type checking, three-platform release builds, Debug build, and packaging checks only. Actual account and browser behavior remained for manual acceptance.

## Release archive audit — 2026-10-20

The v1.0.0 draft contained Bilibili 1.2.5 and Xiaohongshu, X, YouTube, and Baidu Tieba 1.0.1 archives, plus `MODULE-SHA256SUMS`. Read-only inspection found that each archived manifest and referenced file matched the source byte for byte, and each archive matched the release checksum. Each ZIP included MIT `LICENSE` and README notices. This audit did not publish the draft or establish live website compatibility.
