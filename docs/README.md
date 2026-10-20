# Hourleaf documentation

Contracts synchronized with source: 2026-10-19. Use this index to locate the affected module before editing. Update the feature description, development contract, and manual acceptance items when behavior changes.

<a id="产品与使用"></a>

## Product and usage

- [English overview and installation](../README.md) · [简体中文](../README.zh-CN.md) · [Feature reference](./FEATURES.md).
- [Changelog](../CHANGELOG.md) · [1.0.0 release notes](./releases/1.0.0.md).
- [Optional modules and imports](../optional-modules/README.md).
- [Privacy policy](../PRIVACY.md) · [隐私政策](../PRIVACY.zh-CN.md) · [MIT license](../LICENSE) · [Security reports](../SECURITY.md).

<a id="按功能定位开发模块"></a>

## Find the implementation

Paths below are relative to `src/`.

| Area                                   | Source entry points                                                                                                                                                                                                    | Contract                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sites and permissions                  | `core/sites.ts`, `shared/site-scope.ts`                                                                                                                                                                                | [Site model](./ARCHITECTURE.md#site-model)                                                                               |
| Periods, budgets, groups, flow         | `shared/schedule.ts`, `shared/next-available-period.ts`, `shared/group-quota.ts`, `shared/period-runtime.ts`                                                                                                           | [Time rules](./ARCHITECTURE.md#time-rules)                                                                               |
| Usage accounting                       | `background/tracker.ts`, `background/period-accounting.ts`, `shared/analytics.ts`                                                                                                                                      | [Timing](./ARCHITECTURE.md#timing-and-accounting)                                                                        |
| Dashboard and pause statistics         | `dashboard/index.ts`, `dashboard/total-time-card.ts`, `dashboard/usage-panels.ts`, `shared/usage-insights.ts`, `shared/screen-time.ts`, `ui/hourly-usage-chart.ts`, `ui/screen-time-summary.ts`, `ui/pause-details.ts` | [Statistics](./ARCHITECTURE.md#statistics-and-pause-data), [Styles](./UI_STYLE.md)                                       |
| Tab-group whitelists                   | `shared/tab-group-whitelist.ts`, `background/tab-group-whitelist.ts`, `ui/tab-group-whitelist.ts`                                                                                                                      | [Whitelist contract](./ARCHITECTURE.md#tab-group-whitelists)                                                             |
| Independent plans and visits           | `background/plan.ts`, `background/plan-visit.ts`, `background/plan-registration.ts`                                                                                                                                    | [Plans](./ARCHITECTURE.md#plans)                                                                                         |
| Confirmation, pause, and close         | `background/visit-confirmation.ts`, `background/website-access.ts`, `background/related-tabs.ts`, `shared/pause-access.ts`, `content/index.ts`, `end/index.ts`                                                         | [Confirmation](./ARCHITECTURE.md#confirmation-and-pause), [Cross-tab updates](./ARCHITECTURE.md#cross-tab-pause-updates) |
| Module imports, preferences, schedules | `modules/local/`, `ui/local-module-copy.ts`, `ui/filter-time-periods.ts`                                                                                                                                               | [Module format](./LOCAL_MODULES.md), [Development guide](./MODULE_DEVELOPMENT.md)                                        |
| Local configuration backup             | `shared/configuration-backup.ts`, `background/configuration-backup.ts`, `ui/configuration-backup.ts`                                                                                                                   | [Storage and migration](./ARCHITECTURE.md#storage-and-migration)                                                         |
| Directories and period forms           | `ui/configuration-directory.ts`, `ui/configuration-workspace.ts`, `ui/time-period-controls.ts`, `ui/theme.ts`                                                                                                          | [UI contract](./ARCHITECTURE.md#ui-and-settings), [Styles](./UI_STYLE.md)                                                |
| Settings and protection                | `home/index.ts`, `background/protected-actions.ts`                                                                                                                                                                     | [Protected actions](./ARCHITECTURE.md#protected-actions)                                                                 |
| Appearance and language                | `ui/`, `styles/`, `shared/i18n.ts`                                                                                                                                                                                     | [Styles](./UI_STYLE.md), [Writing](./UX_WRITING.md), [Icons](./ICONS.md)                                                 |

Message validation lives in `shared/messages.ts`; coordination and serialized state changes in `background/index.ts`; browser ports in `shared/browser.ts`. Shared module import guidance, document links, and disclaimers live in `ui/local-module-guidance.ts`. Keep domain, coordination, storage, and UI responsibilities separate, and reuse shared components.

<a id="开发与交付"></a>

## Development and delivery

- [Contributing](../CONTRIBUTING.md) · [Local Debug build](./LOCAL_DEBUG_BUILD.md).
- [Store submissions](./STORE_SUBMISSION.md): Chrome, Firefox, and Safari metadata, assets, review sources, and signing preparation.
- [Quality baseline](./QUALITY.md) · [Threat model](./THREAT_MODEL.md) · [Release checklist](./RELEASE_CHECKLIST.md).
- [Manual acceptance](./MANUAL_ACCEPTANCE.md): unchecked items remain unverified.
- [Site research](./SITE_MODULE_RESEARCH.md): consult when changing site-specific behavior.

Local automated validation is limited to TypeScript compilation and builds. Interaction checks remain manual. GitHub Actions retains formatting, type, lint, unit-coverage, build, and packaging checks; verify the results for the release commit separately from manual acceptance.
