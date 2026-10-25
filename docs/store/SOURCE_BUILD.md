# Hourleaf review-source build instructions

This archive contains the matching extension source, MIT license notice, English/Chinese README and privacy policies, manifest templates, assets, scripts, and lockfile for the submitted version. `BUILD_ENVIRONMENT.json` records the Node.js/npm versions, operating system, and architecture of the packaging machine.

Requirements: Node.js 22 or later, npm, and an internet connection to install the development dependencies pinned in `package-lock.json`. The extension itself does not contact the npm registry. Use a clean extracted directory with no pre-existing `node_modules` or `dist`.

```sh
npm ci
npm run build
```

The generated browser directories are:

- `dist/chromium`: Chrome Web Store candidate.
- `dist/safari`: Safari web-extension resources for the Apple converter.

`scripts/browser-targets.mjs` defines the active Chrome/Chromium and Safari targets. Firefox references under `deprecated/firefox/` are archival only; generated legacy artifacts are excluded from this source archive.

The build uses esbuild to bundle TypeScript into local JavaScript. It does not use obfuscation, production source maps, remote scripts, or build secrets. Browser manifests come from `manifests/`; UI files come from `static/`, `src/styles/`, and `_locales/`. The MIT license and both `PRIVACY.md` / `PRIVACY.zh-CN.md` are copied into every browser directory. The source archive also includes `README.md` and `README.zh-CN.md`.

To produce upload ZIPs and checksums, install the system `zip` command and run:

```sh
npm run package
```

ZIPs are written to `dist/packages/`. Their extension contents are rooted directly at `manifest.json`. ZIP container timestamps can differ; compare extracted files when reproducing a build. The Safari ZIP is a converter input, not an App Store upload. No signing or publishing happens during these commands.

`optional-modules/` contains separately distributed content-customization source files. They are not bundled in the browser extension directories. Safari builds reject imported user scripts; the Chromium build uses the browser's User Scripts API for user-selected local scripts. The platform policy is in `src/modules/local/capabilities.ts`.

The `safari/` Xcode project is generated only after the developer supplies their own bundle identifier and is not part of this source archive. Native code, signatures, profiles, and the host app require the separate Apple submission process in `docs/store/SAFARI.md`.
