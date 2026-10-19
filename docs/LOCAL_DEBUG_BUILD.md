# Hourleaf local Debug build

Behavior synchronized: 2026-10-14. See [features](./FEATURES.md) and [manual acceptance](./MANUAL_ACCEPTANCE.md).

Debug is a local sideload environment for repository modules and ordinary site rules, not a release artifact. It shares `src/`, `static/`, styles, and manifest baselines with Chromium release. Differences are injected at build time; release builds do not include Debug presets.

<a id="构建与加载"></a>

## Build and load

```sh
npm run build:debug
```

The default output is the sibling `b站插件debug/` directory, outside Git. For another local location:

```sh
npm run build:debug -- /absolute/path/to/hourleaf-debug
```

Reload the extension and refresh pages after rebuilding. Bilibili 1.2.5 includes open Shadow DOM support, end recommendations, autoplay suppression, dynamic-feed popup/trending/notification handling, and featured-comment filtering. Autoplay suppression requires user-script support. Debug reload updates seeded modules; release imports must be updated manually.

Custom output must be outside the repository or under ignored `.local-debug/`. The builder preserves the directory itself and clears only an empty directory or one carrying a valid `hourleaf.local-debug-build` marker. In Chromium developer mode, load the output as an unpacked extension.

The manifest uses the name Hourleaf Debug and fixed `host_permissions` from current module manifests plus test origins. This permits repeatable local scenarios without individual prompts. Release manifests retain optional permissions. Debug/release share selected C-series icons without archived fallbacks; see [icons](./ICONS.md).

<a id="预置与更新语义"></a>

## Seeding and updates

- Inline current `optional-modules/` manifests, CSS, and scripts at build time; no runtime fetching.
- Add a managed site for each module's first exact origin; use the explicitly reviewed family scope for Bilibili.
- New seeded modules default enabled. Existing modules update content while preserving enable/group preferences.
- `hourleaf.debug-seed.v1` records only seeded IDs. Remove obsolete seeded IDs, never unrelated manual imports.
- Existing site rules remain ordinary user configuration; rebuilding does not delete sites or revoke permissions.

<a id="发布隔离"></a>

## Release isolation

- Default output is outside Git; `.local-debug/`, `debug-build/`, and `dist/` are ignored.
- `npm run build` creates only release directories and does not read Debug output.
- Packaging rejects Debug markers/names, `version_name`, and fixed `host_permissions`.
- CI does not build/upload Debug. Only `dist/packages` and separate `dist/modules` are release inputs.

Never copy Debug into `dist/<platform>` or upload it as a Release, Action artifact, or store candidate.

<a id="暂停页和额度测试工具2026-09-28"></a>

## Pause and budget tools — 2026-09-28

The collapsible toolbar Debug section exposes four actions. Release UI omits them and background rejects `DEBUG_ACTION`.

1. Configure `https://example.com` and `http://localhost:4173` for three one-minute groups in flow mode. Only these sites' periods are replaced.
2. Preview the current real pause state, falling back to Example when no HTTP page exists; do not manufacture usage.
3. Consume the current group's remaining budget into today's synthetic usage, letting the next page check trigger the real pause.
4. Consume the full remaining period to inspect final-group and flexible/flow/strict behavior.

Consume actions write statistics; preview does not unlock anything. Video-end flow must be chosen in the original page's overlay, not an independent preview without media context.

```sh
npm run debug:site
```

`http://localhost:4173` generates an eight-second local canvas/MediaRecorder video. Play it and consume the group through Debug. The server binds only `127.0.0.1:4173`; stop with Ctrl+C. `scripts/fixtures/focus-test.html` is excluded from store packages. Release builds retain optional host permissions.

Clear/reset suspends automatic seeding so worker restart does not recreate deleted data. Configure test sites explicitly to restore it. Historical local validation covered TypeScript/release/Debug builds, not unit/E2E/browser interaction tests.

<a id="工具栏尺寸2026-10-01"></a>

## Toolbar size — 2026-10-01

Fixed 380px width, maximum 600px height, natural overflow. Debug actions are collapsed by default; preserve the current popup session's expansion during refresh.

<a id="当前功能联调范围"></a>

## Current manual integration scope

- Ordinary rules: all periods off means unlimited access and actual-use recording; re-enable restores original periods/groups/budgets; filter schedules remain independent.
- Whitelists: manually create groups, move test sites, bind rules; inspect window ends, removal, dissolution, restart, and unique feature recovery. Debug creates/binds no browser groups.
- Plans: explicit start, independent timing, unchanged same-origin deadline, no stale interception after expiry, cleanup on origin departure/tab closure; no ordinary-budget mutation.
- Timing sources/close: separate ordinary/whitelist/plan budgets and media callbacks; ordinary close preserves every grouped page, plans close by item origin.
- UI/data: seven settings categories, directories and scroll, 24-hour clocks, prompt switch, bilingual modules, backup scope and identical-version preference restore.

Only compilation/builds run locally. Consume tools model ordinary group budgets, not independent plans; whitelist access does not refill ordinary budget.
