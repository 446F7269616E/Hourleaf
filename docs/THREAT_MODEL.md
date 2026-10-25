# Hourleaf threat model

Behavior/source synchronized: 2026-10-14. This records existing boundaries; it does not replace platform acceptance or an independent security review. Platform and group-recovery descriptions reflect the current contract.

<a id="范围与资产"></a>

## Scope and assets

Scope: all three browser builds, extension pages, content scripts, background, local/session storage, optional host access, browser-group bindings, dynamic registrations, site modules, and the release supply chain. Assets: user rules, plans, aggregated usage, browsing privacy, extension privileges, update channels, and release credentials.

<a id="信任边界"></a>

## Trust boundaries

```text
untrusted site DOM/scripts -> content script -> privileged background -> local storage
                                    ^                   ^
                                    |                   |
                           local CSS/selectors     extension pages

local files -> importer/validator -> CSS/selectors / User Scripts API

source/dependencies -> CI/build -> store review/signing -> browser profile
```

Pages, DOM, URLs, module events, and content-script messages are untrusted. Extension pages and background are privileged but still face DOM XSS, corrupted storage, and supply-chain attacks. Storage does not protect against someone controlling the device/profile; avoid sensitive page content.

<a id="主要威胁"></a>

## Main threats

| Threat                                       | Impact                                   | Mitigation                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Treating optional patterns as default access | Broader browsing exposure                | Explicit requests for validated origins/reviewed site families; unregister after revocation                                                     |
| Executable remote modules/configuration      | Bypassing review                         | No URL installation/auto-update; local file selection; no remote JS/Wasm/eval/interpreter                                                       |
| Local module expands hosts or capabilities   | Unauthorized access                      | Exact origins, bounded validation at two boundaries, explicit permission; reject DNR that cannot preserve origins                               |
| User script gains extension privileges       | Reading settings or browser control      | User Scripts API isolated world, no privileged API bridge; disabled on Safari                                                                   |
| CSS requests or abusive selectors            | Disclosure or unusable pages             | Reject remote import/url, bound sizes/selectors, provide disable/remove paths                                                                   |
| Forged page messages                         | Privileged actions or disclosure         | Validate sender, origin, permission, version, type, and value bounds                                                                            |
| DOM XSS/CSS escape                           | Code execution or unusable overlay       | Safe DOM APIs, strict CSP, bounded selectors, preserve unknown DOM, exit paths                                                                  |
| Excessively detailed statistics              | Browsing inference                       | Local dates, hours, IDs, aggregated time only; no ordinary URL/title history                                                                    |
| Replayed plan grants                         | Another visit inherits access            | Bind item+visit+real tab+origin+deadline; session-only; revoke on origin departure, close, restart; clear stale notices after expiry            |
| Forged/revived group binding                 | Incorrect ordinary-rule bypass           | Explicit binding, real membership reads, session-validated IDs, unique combined-feature recovery; dissolution revokes; fail closed without APIs |
| Mixing timing sources                        | Wrong budgets or extended access         | Settle before switches; separate ordinary/whitelist/plan accounting and media callbacks; never extend plan deadlines                            |
| Overbroad close candidates                   | Closing unrelated/grouped pages          | Recheck scope and ungrouped state; preserve unknown membership; plan closes by exact item origin                                                |
| Backup carries code or grants                | Executing code or reviving authorization | Strict schema, 16 MiB cap, preferences only for identical installed versions; no source, grants, bindings                                       |
| Heartbeat replay/sleep catch-up              | Inflated statistics                      | Random session ID, one active session, bounded elapsed intervals, idle/visibility/focus checks                                                  |
| Corrupt storage/resource exhaustion          | Crashes or persistent errors             | Schema/count/length limits, normalization, idempotent migration, safe defaults                                                                  |
| Release supply-chain takeover                | Malicious updates                        | Locked dependencies, reproducible builds, checksums, MFA, minimum publishing access, signed store channels                                      |

<a id="本地模块边界"></a>

## Local-module boundary

Modules may declare domain policies, bounded selectors, self-contained CSS, and Chromium isolated user scripts. They may not invoke arbitrary browser APIs, read arbitrary storage, persist cookies/passwords/accounts/page text, add undeclared hosts, load remote code/CSS, supply arbitrary HTML/nonempty DNR, or bypass permissions and timing conditions.

The User Scripts API can execute arbitrary user-provided page code. Show source identity, exact sites, and capabilities before enablement. Core isolation and removal controls are not a guarantee that third-party scripts are safe. Unregistering cannot undo effects already executed in a page; refresh affected pages where necessary.

Plans and whitelists override only ordinary time settings, not host permissions or explicit module domain blocks. Filter schedules read saved daily start/end ranges, independently of access weekdays/budgets. Ordinary/plan preferences remain separate; backups contain no executable module files.

Group recovery uses hashed combined features, not a browser-guaranteed persistent identity. A unique, fully identical copy of a group's readable features cannot be distinguished perfectly by the API; preserve ambiguity rather than guessing.

<a id="剩余风险"></a>

## Residual risks

- Site changes can break selectors/scripts; safe degradation limits damage.
- Focus, freeze, mobile background, and idle signals vary. Statistics support focus, not audited timekeeping.
- Device/profile access permits reading or modifying local data.
- Safari lifecycle and prompts differ from Chromium; verify signed candidates manually.

Review this model and `PRIVACY.md` before adding accounts, sync, telemetry, remote APIs/configuration, third-party SDKs, permissions, MAIN-world execution, or new executable formats.
