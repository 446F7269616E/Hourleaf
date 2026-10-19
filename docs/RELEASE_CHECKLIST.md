# Hourleaf public-release checklist

Behavior/documentation synchronized: 2026-10-19. Compare candidates with [FEATURES.md](./FEATURES.md). Local checks cover compilation/builds; record CI and manual acceptance separately. Editing this document does not complete a gate.

See [store submissions](./STORE_SUBMISSION.md) for materials and commands. The Safari ZIP is converter input, not an App Store upload.

<a id="候选冻结"></a>

## Freeze the candidate

- [ ] Version, commit, changelog, browser minimums, and manifests agree.
- [ ] A clean checkout reproduces one extension per browser; record every ZIP's SHA-256.
- [ ] Repository and artifacts contain no tokens, certificates, profiles, private keys, test accounts, or user data.
- [ ] README, privacy/security policies, license, and store copy match the candidate.

<a id="质量与隐私"></a>

## Quality and privacy

- [ ] Required static, unit/component/E2E, and three-platform candidate acceptance are complete.
- [ ] Store ZIPs contain no site-specific modules, `optional-modules/`, remote scripts, or remote update manifests.
- [ ] Optional host patterns are not default access; requests are limited to the configured origin or explicitly reviewed site-family scope.
- [ ] No remote JS/Wasm, dynamic execution, CDN, production source maps, or remote instruction interpreter.
- [ ] UI and background validate local imports; reject remote CSS, wildcard hosts, nonempty DNR, and excessive input.
- [ ] Chromium user scripts use only User Scripts API; Firefox/Safari declare no such permission, reject script-bearing imports, and do not register stored scripts.
- [ ] Disable/remove unregisters User Scripts; initialization cleans Hourleaf's legacy dynamic DNR ID range.
- [ ] Upgrade migration, permission rejection/revocation, clearing, site deletion, uninstall, and rollback are verified.
- [ ] `PRIVACY.md`, store disclosures, storage, and observed traffic agree.
- [ ] Sites without enabled periods remain unlimited; content filtering and daily filter windows still work.
- [ ] Independent plans do not charge ordinary usage/budgets; post-expiry navigation is free of stale interception; source switches settle first; old media callbacks do not affect new visits.
- [ ] Whitelist windows, dissolution, membership changes, browser restart, and unique recovery respect session boundaries without extending plan deadlines or host permissions.
- [ ] Ordinary close removes only related ungrouped tabs and preserves unknown membership; plans close by their own origin.
- [ ] Backups include named presets, whitelist periods, plans, and matching-version module preferences; exclude grants, statistics, bindings, and executable source.

<a id="公共素材"></a>

## Public assets

- [ ] Product name is Hourleaf; site modules clearly identify unofficial third-party adaptations.
- [ ] Descriptions promise only implemented functions and explain local statistics and optional site permissions.
- [ ] Screenshots come from the candidate and contain no real accounts, avatars, history, or other personal data.
- [ ] Store candidate ZIPs and optional module assets are separate; no claim of bypassing normal store installation.
- [ ] Debug output is absent from `dist/<platform>`, commits, Action artifacts, GitHub Releases, and store uploads; packaging's Debug gate passes.

<a id="平台"></a>

## Platforms

### Chrome / Chromium

- [ ] ZIP root contains `manifest.json`; only one extension package is published.
- [ ] `userScripts` and host permissions have single-purpose explanations; no DNR permission remains.
- [ ] `tabGroups` only reads existing groups and membership; no persistent `tabs` permission; recovered IDs require session validation or a unique recovery match.
- [ ] Developer Dashboard single purpose, permission justifications, data usage, and privacy URL are complete.
- [ ] Store-draft installation verifies permission prompts, Service Worker recovery, and upgrades.

### Firefox

- [ ] Manifest retains the stable Gecko ID and accurate `data_collection_permissions`.
- [ ] No `userScripts` permission; only script-free JSON/CSS imports; old scripts are not registered.
- [ ] Verify actual versions with and without group/session APIs; do not infer support from the browser name.
- [ ] `web-ext lint` passes; matching build instructions and review source are submitted to AMO.
- [ ] The final AMO-signed XPI passes installation, upgrade, disable, enable, and uninstall checks.

### Safari

- [ ] Convert `dist/safari` with `npm run prepare:safari -- <BundleID>` using a real identifier; resolve every warning.
- [ ] Add `PrivacyInfo.xcprivacy` to host/extension targets; archived privacy report agrees with App Store Connect.
- [ ] Entitlements, site permissions, and privacy information contain only necessary capabilities; signing material stays outside Git.
- [ ] Script-bearing imports are explicitly rejected; no `userScripts` declaration.
- [ ] No `tabGroups` or `idle`; whitelist UI is unavailable and does not grant access; timing uses supported signals.
- [ ] TestFlight/App Store candidates pass permission rejection, grant, revocation, and upgrade checks on each submitted macOS/iOS platform.

<a id="github-与发布"></a>

## GitHub and publication

- [x] `main` requires PRs, the `quality` check, an up-to-date branch, resolved discussions, linear history, and administrator protection; force pushes and deletion are prohibited.
- [ ] Minimum maintainer access and private vulnerability reporting are verified.
- [ ] CI packages before uploading `dist/packages`; missing artifacts fail the job.
- [ ] Create the protected tag/Release and attach Chromium/Firefox candidates, Safari conversion ZIP, matching review-source ZIP, `SHA256SUMS`, and separate module ZIPs plus `MODULE-SHA256SUMS`.
- [ ] Release notes describe product changes, limitations, and platform status without internal collaboration instructions.
- [ ] README, features, index, architecture, module format, privacy, and acceptance have no obsolete contracts; distinguish Unreleased from published assets.
- [ ] Observe timing, permission, and compatibility failures during rollout; retain the previous safe version and data-compatibility path.
