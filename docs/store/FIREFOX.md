# Firefox AMO submission

Official references checked: 2026-10-19.

<a id="提交文件"></a>

## Submission files

- Extension: `dist/packages/hourleaf-1.0.0-firefox.zip`.
- Matching source: `dist/packages/hourleaf-1.0.0-review-source.zip`; root `BUILDING.md` describes reproduction and `BUILD_ENVIRONMENT.json` records the packaging environment.
- Summary/details: [LISTING.md](./LISTING.md).
- Select MIT, matching the root `LICENSE`.
- Privacy: [PRIVACY.md](https://github.com/446F7269616E/Hourleaf/blob/main/PRIVACY.md).

Retain the existing Gecko ID `bilifocus@opensource.local`. It is the stable extension identity, not a contact email; renaming must not create a new identity for existing installations.

<a id="数据与版本"></a>

## Data and browser versions

`browser_specific_settings.gecko.data_collection_permissions.required` is `["none"]`. Settings, plans, and statistics are not transmitted to the developer or third parties. New submissions declare the built-in data-consent fields required by AMO.

Minimum Firefox remains 121. The built-in consent interface starts at desktop Firefox 140 and is absent on older releases. Hourleaf does not transmit data on those versions either, so it does not depend on this UI for data-transmission consent. Check actual group API availability; do not promise whitelists on every Firefox 121+ version. Firefox Android is not an accepted target yet; select only manually verified platforms.

<a id="审核备注"></a>

## Review notes

Hourleaf is a website time-management extension. Its executable core is bundled and built from TypeScript using esbuild. Please use the attached source archive and `BUILDING.md` to reproduce the package. It has no account, analytics, ads, remote executable loader, or data transmission.

Firefox store builds do not request or use `userScripts`. Local JSON/CSS customization is opt-in through the content-customization page and requires confirmation after displaying the file author, version, and exact origins. Imports containing user scripts are rejected by both the interface and background service. Previously stored user scripts are not registered. Existing registrations are removed when the old API permission remains available; users should reload already-open pages after upgrading because previously executed page effects cannot be undone by unregistering a script alone.

All host access is optional and requested for the user-selected site origins. The broad optional HTTP(S) patterns are only the request ceiling. `tabGroups` is used to read membership for user-selected rules; unavailable APIs fail closed for group whitelists.

<a id="商店验证与签名"></a>

## Validation and signing

Run AMO validation or `web-ext lint` in the release environment and review every error/warning. Successful builds do not replace review. Bundled code requires matching source and build instructions for every submitted version.

Obtain the AMO-signed XPI after upload. Use it for final installation, upgrade, disable, enable, and uninstall acceptance. Ordinary ZIPs and temporary-load directories are not signed distribution artifacts.

<a id="官方依据"></a>

## Official references

- [Add-on Policies and User Scripts restrictions](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Submission steps](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
