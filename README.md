# Hourleaf

English · [简体中文](./README.zh-CN.md)

Hourleaf is a local browser extension for managing website time. Set availability windows and usage limits, schedule timed visits, and review your usage. No account or data collection.

Active builds target Chrome (Chromium) and Safari. Firefox files are retained in [the deprecated archive](./deprecated/firefox/README.md). The interface supports English, Simplified Chinese, system light/dark mode, and five color themes. The current version is `1.0.0`; see the [changelog](./CHANGELOG.md) for changes.

## Features

- **Website rules:** Choose which websites to authorize, set daily availability windows, and reuse custom presets. Overnight windows are supported.
- **Limits and groups:** Divide each window's allowance into groups. Open the next group immediately, after a wait, by solving a math problem, or with a local password.
- **Expiry modes:** Choose Lenient, Flow, or Strict. Flow allows one extension per group.
- **Independent plans:** Add, bulk-import, reorder, and complete items in a list or mind map. Give each item its own duration and expiry mode.
- **Usage insights:** Review daily, weekly, monthly, and yearly totals, hourly patterns, website shares, and plan completion.
- **Tab-group whitelist:** On supported browsers, give an existing tab group its own availability windows without consuming ordinary website allowances.
- **Confirmation and protection:** Configure access confirmation, pause-page messages, and protection against disabling the extension.
- **Local data management:** Back up and restore configuration, restore defaults, or delete all local data.

Ordinary usage follows page visibility and window focus, excluding device idle time where supported. Plans run on independent timers and do not consume ordinary website allowances.

## Installation

Use each platform's published store listing when available. GitHub ZIP files are build artifacts; they are not signed or store-approved packages.

Building from source requires Node.js 22 or later:

```bash
npm ci
npm run typecheck
npm run build
npm run package
```

- Chromium: Enable developer mode at `chrome://extensions` and load `dist/chromium`.
- Safari: Convert `dist/safari` to an Xcode container app and sign it before installation. App Store distribution also requires a developer account and review.

See [store submission materials](./docs/STORE_SUBMISSION.md) for platform requirements and remaining steps.

## Privacy and license

Settings, plans, and aggregate usage stay on your device. Hourleaf does not collect or upload user data. Website permissions are requested when needed and can be revoked. See the [privacy policy](./PRIVACY.md).

The [MIT License](./LICENSE) permits use, copying, modification, and distribution, including commercial use, with the copyright and license notices retained. Third-party materials retain their own licenses.

## Disclaimer

Hourleaf is provided for learning, exchange, and productivity, as is, without guarantees of timing accuracy, rule enforcement, or compatibility. Liability is limited to the extent permitted by law; rights and obligations that cannot legally be excluded remain unaffected.

For rights-related concerns, [contact the developer](https://github.com/446F7269616E/Hourleaf/issues) with the relevant material and basis for your claim. Report security or privacy vulnerabilities through the [private reporting process](./SECURITY.md).

## Documentation and contributions

[Features](./docs/FEATURES.md) · [Development documentation](./docs/README.md) · [Contributing](./CONTRIBUTING.md) · [Release checklist](./docs/RELEASE_CHECKLIST.md)

Local automated checks cover TypeScript compilation and builds. Browser interactions and store candidates require manual acceptance.
