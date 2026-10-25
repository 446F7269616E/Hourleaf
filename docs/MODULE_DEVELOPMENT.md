# Hourleaf module development guidelines

These guidelines cover optional website modules submitted or published through GitHub. Users download, review, and import local files themselves. Modules are separate from the core and are never preinstalled, fetched remotely, or automatically updated.

See the [local module specification](./LOCAL_MODULES.md) for fields and platform limits, and the [component catalog](../optional-modules/README.md) for downloads and disclaimers.

## 1. Decide whether a module is needed

Only website-specific behavior belongs in a module:

- hiding site-specific recommendation feeds, comments, or noncommercial navigation distractions;
- declaring a default `timed`, `always-allow`, or `always-block` policy for exact origins;
- small local CSS adjustments that reduce visual distraction;
- lightweight keyboard actions through a user script without networking or extension privileges.

Timing, time periods, independent plans, tab-group allowlists, access confirmation, end pages, and statistics belong to the general core. Modules must not duplicate them or access Hourleaf storage. Locate the relevant core contract in the [development index](./README.md); see the [feature guide](./FEATURES.md) for current behavior.

### Commercial-content boundary

This is an internal development and review constraint. Website modules reduce distractions unrelated to the user's current intent. They must not hide, obscure, skip, or weaken revenue-related content: advertising, promotions, sponsorships, paid placements, membership or purchase entry points, creator monetization, or other commercial placements. Do not repeat this internal rule in module names, descriptions, switches, or other product copy.

- Do not hide entire lists, grids, sidebars, or timelines that mix ordinary and commercial content. Target verified ordinary child items and explicitly exclude stable commercial markers.
- If the DOM cannot reliably distinguish them, leave that area unfiltered. Do not guess from language, rank, position, or appearance.
- If a redesign, experiment, or signed-out layout invalidates exclusions, retain content rather than expanding the hidden area.
- Research notes must record sources, licenses, inspected pages, and borrowed selector ideas. Use DOM semantics and engineering approaches without copying substantial third-party code.

## 2. Directory and files

Each repository module has its own directory:

```text
optional-modules/<slug>/
├── hourleaf-module.json
├── focus.css          # optional
└── focus.user.js      # optional
```

- Use lowercase letters, digits, and hyphens for a stable `<slug>`.
- Explicitly reference CSS and scripts in the JSON manifest. Undeclared files, subdirectories, and remote files are not allowed in the source directory.
- Never reuse a published `id` for another module. Prefer a reverse-domain ID or `hourleaf.local.<site>-<purpose>`.
- Keep `format`, `id`, `name`, `author`, and `version` consistent across the manifest and CSS/script metadata.
- Put user-controlled selectors in `filterGroups`. Group IDs are stable lowercase kebab-case and must not be renamed after publication. Reserve `hideSelectors` for a small set of rules active whenever the module is enabled.

Minimal manifest:

```json
{
  "schemaVersion": 1,
  "format": "hourleaf.local-module",
  "id": "example.author.example-focus",
  "name": "Example Focus",
  "author": "Example Author",
  "version": "1.0.0",
  "description": "Optional filtering for Example recommendations.",
  "matches": ["https://example.com/*"],
  "domainPolicy": "timed",
  "hideSelectors": [],
  "filterGroups": [
    {
      "id": "home-recommendations",
      "name": "Home recommendations",
      "description": "Hide ordinary recommendation cards on the home page.",
      "selectors": [".recommendations > .card:not([data-placement])"]
    }
  ],
  "cssFiles": ["focus.css"],
  "userScriptFiles": []
}
```

## 3. Origins and permissions

- `matches` accepts explicit `http://host/*` or `https://host/*` patterns. Wildcard hosts, credentials, non-web protocols, and assumptions of path-level authorization are invalid.
- Declare only inspected origins. `www.example.com`, `live.example.com`, and `example.com` are separate origins and need separate entries.
- Modules cannot request permissions. After the preview, Hourleaf requests the manifest's exact origins only through a user action.
- Do not expand access through redirects, iframes, DNR, open proxies, or script navigation.
- Never send login state, cookies, account identifiers, page content, or browsing history off-device.

## 4. Selectors and CSS

Prefer stable semantics over generated class names, in this order:

1. Stable IDs, ARIA/roles, or public semantic classes.
2. Component roots and explicit data attributes.
3. Combined selectors inspected in at least two page variants.

Avoid:

- `body *`, wildcard descendant chains, or broad `:has()` queries;
- site-wide font, color, or layout resets using `!important`;
- hiding playback, pause, subtitles, login, privacy, or accessibility controls;
- selectors that exist only for one account, experiment, or language;
- mixed containers with advertisements, promotions, sponsorships, paid placements, or commercial entry points;
- `@import`, `url()`, remote fonts, images, tracking pixels, or any network resources.

The core generates hiding rules from `hideSelectors`. Use `focus.css` only for small adjustments that cannot be expressed by hiding. Support light/dark themes, 200% zoom, and `prefers-reduced-motion`.

For open Shadow DOM, explicitly declare hosts and any necessary low-frequency mount event in `shadowRoots`, and reuse `LocalPageRuleController`. Do not build a second style injector in a user script. Selectors operate within each root and must scope themselves to the intended area; a broad `.video-card` can affect search, favorites, or history. Cover early/late mounting, remounting, appended pages, switches, retention of unknown nodes, and isolation between modules.

## 5. User scripts

Prefer manifests and CSS. Use scripts only when necessary:

- Listen only to required events, return early, and throttle high-frequency events.
- Do not poll, scan the entire DOM, or run full-page queries on every mutation.
- Preserve the website's primary shortcuts; return when an input or `contenteditable` has focus.
- Degrade safely when nodes are missing, shadow roots are not mounted, or SPA routes change.
- Do not use `eval`, `Function`, string timers, dynamic import, or WebAssembly code generation.
- Do not use `fetch`, XHR, WebSocket, EventSource, Beacon, or other networking.
- Do not access `chrome.*`, `browser.*`, cookies, extension messaging, or injected `<script>` elements.
- Scripts are Chromium-only. Safari App Store builds accept modules without scripts; provide a separate JSON/CSS edition when cross-platform support is needed.

To coordinate script behavior with a filter group and its schedule, a script may create its own empty, zero-size DOM marker and include that selector in the group. Read the marker's computed hidden state without accessing Hourleaf storage or duplicating scheduling logic. Prefer verified native website controls and save page-local state that needs restoration. Discover late controls through inserted subtrees or affected local containers only, and restore state when styles are removed. Clearly describe any reduced functionality in a separately maintained script-free edition.

Static validation quickly rejects obvious violations; it is not a safety certification. Review script inputs, outputs, event lifecycles, and worst-case performance manually.

## 6. Performance budgets

Protocol limits are hard ceilings, not targets. Repository modules should keep:

- manifests and selectors within the actual feature scope;
- CSS generally below 20 KB;
- scripts generally below 30 KB;
- initialization free of large synchronous loops;
- interactions limited to local node queries;
- background networking, telemetry, advertisements, and update checks absent;
- disabled modules free of further script, style, or permission effects.

A PR exceeding these soft budgets must explain why and provide reproducible performance evidence. Unregistering an already executed script does not undo its page effects; account for page refresh and cleanup in its lifecycle.

## 7. Copy, accessibility, and compatibility

- Use the website name without a “focus module” suffix. Put unofficial status in the shared import notice and documentation; do not imply endorsement.
- Describe actual behavior without marketing claims or unverified compatibility.
- Avoid common browser/site shortcuts and protect text input.
- Preserve focus outlines and keyboard navigation, and do not use color alone for state.
- Record manual results separately for Chromium and Safari. Script-bearing packages are Chromium-only; never mark an untested platform as passed.
- Changed selectors should safely do nothing rather than hide essential content.

## 8. Local verification

1. Select the manifest and all references together in Blocking, then manually inspect the name, author, version, origins, and capabilities.
2. Check permission denial/grant, enable/disable, deletion, and reimport.
3. Check every declared origin and confirm that undeclared origins are unaffected.
4. Inspect primary pages signed out and signed in, at narrow widths and 200% zoom, in both themes and with reduced motion.
5. Local automated checks are limited to compilation and builds:

```bash
npm run typecheck
npm run build
```

Use `npm run package` separately for release archives. Never copy Debug files into store candidates. GitHub Actions retains the existing unit and packaging checks. Actual website behavior, permission denial, schedule changes, normal/plan preferences, and bilingual copy require manual acceptance; compilation does not establish those results.

## 9. Versioning and release

Use semantic versions:

- **patch:** selector, copy, or compatibility corrections;
- **minor:** new origins, filter areas, or optional capabilities;
- **major:** incompatible behavior or permission changes.

Update manifest metadata, CSS/script headers, and release notes together. `npm run package` creates one ZIP per valid directory plus `MODULE-SHA256SUMS`. Component ZIPs and browser packages may share a GitHub Release but must remain distinct assets. Components never enter extension installation packages. Module archives include MIT `LICENSE` and README notices; these are not import inputs.

## 10. PR checklist

- [ ] The feature belongs in a website module rather than the core.
- [ ] Author, format, ID, version, description, and referenced files agree.
- [ ] Origins are exact, minimal, and individually inspected.
- [ ] Group selectors target ordinary distracting content; mixed lists use child items with explicit commercial exclusions.
- [ ] No DNR, remote resources, account data, network access, or extension privileges are present.
- [ ] Essential controls, privacy notices, and accessibility entry points remain visible.
- [ ] Script events protect input and fail safely, without polling or unbounded scans.
- [ ] Chromium and Safari capability differences are recorded.
- [ ] Actual module files pass import and packaging checks.
- [ ] README and release notes state unofficial status and known limitations.

## Localization and naming

User-visible names, descriptions, and filter groups need stable Chinese and English i18n keys. `src/ui/local-module-copy.ts` maps module/group IDs to `src/shared/i18n.ts`; do not replace entire Chinese strings to localize them. Update both languages when behavior changes and retain author text for unknown groups.

Display projections do not rewrite imported files, alter permissions, or change executable content. A display-only translation does not require a new module ID or executable-file version. The Chinese UI calls these blocking plugins; internal IDs, format names, and directories retain `local-module`. Use website names without suffixes and concise behavior descriptions without repeated “unofficial local module” prefixes. Keep unofficial status and source confirmation in the import notice. Website targets continue to use origin domains independently of module names.
