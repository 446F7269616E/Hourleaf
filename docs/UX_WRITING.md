# Hourleaf interface writing

> Status: release gate

Copy states the current condition, necessary reason, and available action. Keep it brief, natural, and concrete. Do not turn controls into tutorials, persuasion, or implementation notes.

<a id="规则"></a>

## Rules

1. The five page titles are Dashboard/Plans/Configuration/Filtering/Settings, using the matching stable translation keys. Chinese labels: 仪表盘/计划/配置/屏蔽/设置.
2. Use direct actions: Add website, Add period, Start, Open next group, Delete. Configuration autosaves; no duplicate Save button.
3. Avoid slogans, rhetorical questions, personification, guilt, and unsolicited encouragement.
4. Do not add first-use steps or tutorial cards.
5. Errors give the result and recovery action, not stacks, schemas, providers, protocols, or maintenance advice.
6. Permission text names the site and scope, for example allowing Hourleaf to time and apply rules on example.com.
7. Module states use Enable/Disable/Delete; local files use Import. External directories may describe downloading but must not imply automatic fetching/updating.
8. Privacy claims must be verifiable; no absolute-safety promises.
9. Do not rely on color alone. Visible text, accessible name, and control state agree.
10. Delete, clear, and reset identify the object and require confirmation.
11. Mode options contain only short names; persistent explanatory text below the control updates with selection.
12. Import dialogs describe the action, files, and responsibility to acknowledge. Show format-specific errors only when validation fails; no internal risk-normalization headings.
13. Flow minute options contain durations only. Keep “Use / 再用” outside the select. Use a complete close action when continuation is unavailable.
14. Dashboard and plan selectors have a visible View label; each option names its range/layout only.
15. Whitelists are peers of sites. Do not expose browser group IDs. Explain invalid binding directly; do not imply name-only restoration.
16. Ordinary close explicitly preserves grouped pages; plan close uses the item origin and must not reuse ordinary group-protection copy. Plans remain independent, without the old toggle.
17. Periods/timestamps use 24-hour time and `00:00`; durations use units. The prompt switch controls text visibility, not access confirmation.
18. Sites and whole-site targets use canonical domains. Repository modules use site names and specific content descriptions, without repeated module prefixes; import disclosures retain source/unofficial status.
19. Sidebar icons default off. Appearance copy states that the option covers configuration, filtering, and settings.

<a id="统一术语"></a>

## Terminology

| Meaning                                | Term                                                      |
| -------------------------------------- | --------------------------------------------------------- |
| User-authorized origin                 | Website / 网站                                            |
| Separate rule scope inside a site      | Target / 目标                                             |
| Hiding recommendations, comments, etc. | Content filtering / 内容屏蔽                              |
| Scheduled access window                | Available period / 可用时段                               |
| Scheduled denial window                | Unavailable period / 不可用时段                           |
| Equal share of a period budget         | Usage group / 使用分组                                    |
| Brief continuation after expiry        | Flow extension / 心流延时                                 |
| Website-access end screen              | End page / 结束页面                                       |
| Optional site adaptation               | Local add-on / 屏蔽插件; local module in source/protocols |
| Scheduled access for a browser group   | Tab-group whitelist / 标签页组白名单                      |

Simplified Chinese is the source copy. English uses the same stable i18n keys; business logic must not match or replace whole Chinese sentences. Use `Intl` with the resolved language for dates/durations, enforcing the product's 24-hour clock contract. Missing translations block release.

Prefer Loading, Saved, Could not load / Retry, and No records for shared states. Manual review checks consistent page names, reachable navigation, wrapping at narrow widths/200% zoom, understandable accessible names, and agreement with [features](./FEATURES.md), `PRIVACY.md`, and actual permissions.
