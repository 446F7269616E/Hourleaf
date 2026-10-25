# Contributing to Hourleaf

Search existing issues first. Propose substantial feature, permission, or data-model changes before implementation.

Contributors must follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Report security issues through the private process in [SECURITY.md](./SECURITY.md).

## Development setup

Use Node.js 22 or later, npm, and the relevant browser. Safari conversion requires macOS and Xcode. Start with the [documentation index](./docs/README.md), then read the affected [architecture contracts](./docs/ARCHITECTURE.md) and [feature behavior](./docs/FEATURES.md).

```bash
npm ci
npm run typecheck
npm run build
```

Active targets are Chrome (Chromium) and Safari, shared through `scripts/browser-targets.mjs`. Firefox source references are retained in `deprecated/firefox/` and are outside the current build and acceptance scope.

Use the scripts in the root `package.json` and retain the lockfile. Do not commit `dist`, test traces, browser profiles, signing certificates, provisioning profiles, `.env` files, or tokens.

Local automated validation covers compilation and builds; browser behavior is checked manually. Unit and E2E scripts are not required local checks. GitHub Actions uses Ubuntu 24.04 ARM and Node.js 22 to run formatting, types, lint, unit coverage, builds, and packaging. Keep those remote checks.

## Design principles

- Keep the extension local, focused on its single purpose, and limited to necessary permissions. Do not add telemetry, remote code, advertising, or external tracking.
- Separate domain logic from browser APIs. Put platform differences in adapters or the build layer.
- Extract reusable modules and validate external URL, time, storage, and message inputs at runtime.
- Keep ordinary allowances, tab-group access, and plans independent. Settle the previous tracking interval before changing sources; changing access sources must not widen website permissions or explicit domain blocks.
- Use semantic HTML, visible focus, and clear labels. Do not communicate state through color alone.
- Follow the [UI writing rules](./docs/UX_WRITING.md). Document privacy, permission, and schema changes.
- Follow the [module development guide](./docs/MODULE_DEVELOPMENT.md) and [local module contract](./docs/LOCAL_MODULES.md). Do not preinstall modules, update them over the network, or exceed their declared origins.

## Submitting changes

1. Create a focused branch from the current default branch. Merge into `main` through a PR with a passing `quality` check, an up-to-date branch, and resolved discussions. Protection also applies to administrators; force-pushing or deleting `main` is prohibited. A second approval is not required while the project has one maintainer.
2. Locate the relevant domain, coordination, storage, and UI layers. Reuse existing modules and update the affected contracts and acceptance items.
3. Format the change, run TypeScript compilation and affected builds, and retain remote CI checks.
4. Manually check affected browsers using [MANUAL_ACCEPTANCE.md](./docs/MANUAL_ACCEPTANCE.md). Record checks not performed.
5. Describe the problem, resulting behavior, compilation/build results, and manual acceptance status in the PR. Include evidence for permission, data, or platform changes.

Keep commits reviewable. Avoid unrelated formatting, generated files, and dependency upgrades. Address review findings before resolving their discussions.

## Changes requiring maintainer agreement

Obtain maintainer agreement before adding permissions or sites, accounts or sync, network services, telemetry, third-party SDKs, import/export paths, destructive schema migrations, remote configuration, or store identity/signing flows. Update `docs/QUALITY.md`, `docs/THREAT_MODEL.md`, and `PRIVACY.md` as applicable.

## Bug and feature reports

Include the version, browser/OS, expected and actual behavior, and a minimal reproduction. Remove accounts, avatars, URL parameters, browsing history, and other personal data from screenshots and logs. Feature proposals must support managing website time under user-defined rules and reducing distractions.

Contributions use the project's [MIT License](./LICENSE). Submit only material you have permission to contribute, retaining third-party copyright and license notices.
