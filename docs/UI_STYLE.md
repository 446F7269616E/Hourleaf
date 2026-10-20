# Interface style and layout

UI/source synchronized: 2026-10-19. See [features](./FEATURES.md) for behavior and the [documentation index](./README.md) for entry points.

Retain the pale gray canvas, white cards, centered pill navigation, and five palettes. Refine hierarchy, spacing, control sizes, and responsiveness within that identity. Time summaries lead the dashboard/popup; plans use an adaptive card grid; configuration, filtering, and settings share directory/detail layouts.

<a id="开发目录"></a>

## Implementation map

| Module                                                        | Responsibility                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/styles/tokens.css`                                       | Light/dark colors, fonts, shared type/control sizes, padding, shadows       |
| `src/styles/base.css`                                         | Headings, controls, focus scroll spacing, long text, dialogs, shared states |
| `src/styles/navigation.css`                                   | Centered navigation, current page, help, narrow layout                      |
| `src/styles/dashboard.css`                                    | Summary cards, dates, trends, site shares, plan overview                    |
| `src/styles/usage-charts.css`, `src/ui/hourly-usage-chart.ts` | Shared hourly charts, scales, peak selection, keyboard access               |
| `src/ui/viewport-scroll-panel.ts`                             | Sidebar visibility from navigation/grid/shell bounds; listener cleanup      |
| `src/ui/clock-input.ts`                                       | 24-hour HH:mm input, overnight/all-day hints                                |
| `src/ui/configuration-directory.ts`                           | Shared directories, counts, selected states                                 |
| `src/ui/configuration-controls.ts`                            | Site/whitelist fields, switches, weekdays, date summaries                   |
| `src/ui/configuration-workspace.ts`                           | Two-column shell, viewport mounting, scroll/focus restoration               |
| `src/styles/configuration.css`                                | Shared directory/detail styles and 860px breakpoint                         |
| `src/ui/time-period-controls.ts`                              | Shared period name, weekdays, start/end, enabled fields                     |
| `src/styles/options.css`                                      | Site cards, periods, configuration dialogs                                  |
| `src/styles/home.css`                                         | Selected settings category, description/control columns                     |
| `src/styles/plan.css`                                         | Plan cards, actions, mind map, editor                                       |
| `src/styles/block.css`                                        | Module/filter/schedule presentation                                         |
| `src/styles/popup.css`, `src/styles/end.css`                  | Compact toolbar and pause layouts                                           |

Change shared dimensions in tokens first. Page styles own density and responsiveness, not messages, permissions, storage, or timing.

<a id="视觉基线"></a>

## Visual baseline

Light colors: canvas `#f6f7fb`, surface `#ffffff`, text `#202333`, secondary `#676b7d`, border `#e4e6ee`, default ocean blue `#006fe6`. New installs, missing/invalid themes, resets, and the pre-settings first frame use blue. Preserve saved valid themes. Keep the existing dark palettes, font stacks, and radii.

Use Inter/system sans serif and PingFang SC/Hiragino Sans GB/Microsoft YaHei for Chinese. Body: 14px; desktop title: 30px, at least 26px on narrow screens; section: 18px; plan item: 15px; module: 16px; primary supporting text: 12px. Compact labels/chart axes may be smaller. Use tabular numerals for time/counts.

Content aligns left; pause actions center. Card padding is 20px, falling to 16px below 640px. Title spacing is 32px, or 24px on narrow screens. Regular controls are 42px high; compact actions 40px; coarse pointers raise the shared size to 44px. Primary buttons use filled theme colors; secondary actions use pale/bordered styles. Keep shadows restrained.

<a id="页面约束"></a>

## Page constraints

### Dashboard

- Four summary cards: total, daily average, most-used site, recorded days. Label/value/detail rows; vertically centered values with wrapping. Minimum height 160px; two columns below 980px, one below 640px; 24px after the date range.
- `dashboard/total-time-card.ts` uses a theme top border, thin outline, pale icon, separate number/unit spans, and a bottom timing state. No dark gradient or decorative circle.
- Trends/site shares form the upper row; hourly distribution/current plan form the lower row. Today uses one 24-hour chart; week/month use daily trends, year monthly trends. Longer ranges aggregate matching clock hours. Include scales, peak-day and flow-extra summaries; zero usage must not produce positive-height bars.
- Distinguish no records from missing hourly detail. Site ranking includes rank, time, percentage, share bar, and expandable origins. Retain removed-site history. The current plan card uses the whole queue, showing pending duration, completion count, and progress independently of the selected statistics range.
- Omit explanatory subtitles, average-method notes, module-identity notices, and footer essays. Retain names, dates, numbers, state, and necessary missing-data text.

### Pause page

- Share themed hourly charts with the dashboard. Default to the peak hour; support arrows/Home/End; midnight is `00:00`. Keep a common vertical scale across site filters, and retain totals when hourly details are missing.
- Maximum card width: 1180px. Fixed equal-width columns: usage, actions, statistics; equal-height frames, centered action column. Narrow windows scroll the whole minimum-width three-column layout horizontally and initially center actions. Section navigation only scrolls; it never hides/recreates controls. Do not move statistics below the other columns to fill space.
- Preserve the balance ring, hollow/solid group segments, used/remaining summaries, and diamond-clock site total. Omit the visible hollow/solid legend. Short windows tighten spacing without removing progress/actions.
- Below group progress show active period name/range, total budget, current group budget/remaining, and opened groups, computed from authoritative configuration and usage.
- The middle column contains site summary, optional messages, site distribution, and bottom-aligned actions. When encouragement/custom prompts exist, reserve at least 88px for text and support complete Unicode pagination. Hide an empty message slot; let distribution/data rows flex into the space. Long content raises all frames naturally.
- Site share and peak-hour information sit above confirmation/flow/next-group/close actions. When no enabled period matches, show the next usable period's name, date, weekday, and 24-hour range, or a clear empty state. This grants no access.
- Embedded flow pauses default to video end only when a real video was playing before intervention. Hide minute fields initially; switching to minutes restores 1–15 minutes. Without that context default to minutes. Plan pauses retain their separate duration/goal/actions without ordinary-site charts.

### Configuration, filtering, and settings

- Share a 240px directory, 24px gap, independent desktop sidebar scroll, and one-column layout below 860px or at viewport heights at most 360px. Sidebars return to normal document flow above details on small screens.
- Directory rows use natural content height, not compressed grid tracks. Compute sticky top from actual navigation height/offset and bottom clearance from shell padding. Compute height from the grid's natural origin, not the moved sidebar position. Coalesce navigation/grid/shell/visual-viewport/scroll updates into animation frames; clean all listeners during redraw. Stop scroll chaining into details.
- Directories are text-only by default, with no empty icon column. Appearance settings can enable sidebar icons for all three pages; existing pages update immediately.
- Configuration has peer Sites and Tab-group whitelist directories with separate counts. Show only the selected detail; preserve each directory's last selection, scroll, and keyboard focus. Newly saved items select themselves; deletion selects the first remaining item or the relevant empty state. Whitelists work even without configured sites.
- Whitelist identity/binding is edited separately from its maximum 64 periods. New rules have one all-day period; migrate old single-period fields without losing identity/binding. Removing the final period preserves the rule. Reuse ordinary period cards, switches, weekdays, `.input`, `.field`, `.day-picker`, and time fields. No long lifecycle/priority explanation beneath the section; show only relevant empty/invalid-binding states. Distinguish same-name groups by readable ordering, not internal IDs.
- Site names and ordinary whole-site targets use the canonical hostname; directory summaries retain full origins to distinguish scheme/port. Module/debug labels cannot replace site names. Dedicated targets retain section names. Detail order: identity, mode, periods, optional pre-visit prompt.
- Mode cards use 12×16px padding, 14px titles, compact selects, and a broad adjacent description column. Period creation emphasizes presets; manual add remains secondary. Period text wraps while switch/edit actions stay together.
- Settings has seven categories: operation/protection, appearance, plan access, confirmation/unlock, pause/end pages, data management, About. Show only the selected category and retain it through saves/theme/language changes. Wide control columns are 220–320px with a 24px gap; field cards have 16px padding; stack below 700px. About uses the same field cards for privacy/license/contact links.
- Plans always use independent timing; do not restore the obsolete coupling switch. Ordinary close copy specifies related ungrouped tabs and reports preserved grouped pages.
- Filtering lists modules and downloads on the left; show only the selected module or download instructions on the right. Import remains a header action. Successful imports select the new module; deletion and plan-context refresh preserve sensible selection/scroll.
- Import uses native collapsible file requirements, persistent platform compatibility, a file preview, and a shared concise disclaimer with external specification/license/contact links. Keep the dialog header/footer fixed and its body scrollable; long file names wrap. Acknowledgement is disabled until a valid preview and resets on every selection.

### Plans and popup

Plan cards keep adaptive columns and flex content so actions align at the bottom. Long titles wrap, links truncate, action groups wrap. Keep measured mind-map layout and interactions.

The popup is 380px wide, at most 600px high, with natural vertical scrolling and two summary cards. Main time is 22px, multi-group values 16px; long values wrap.

All clocks, periods, and plan timestamps use 24-hour time. Shared HH:mm text inputs normalize `0900` to `09:00`; invalid hours/minutes fail form validation. Show overnight/all-day hints only for valid values. Durations still use seconds/minutes/hours.

<a id="交互细节与验收"></a>

## Interaction and acceptance

Keep visible focus, including hidden weekday/rule inputs through their labels. Dialogs have their own scroll boundaries; shared loading animation respects reduced motion. Focused controls clear sticky navigation; long text wraps in CSS.

Historical local validation covered TypeScript/CSS compilation and three release targets plus Debug builds. It did not include unit/E2E tests, browser captures, or automated interaction acceptance. Manual review still covers five pages, popup, pauses, both languages, five themes, dark mode, narrow windows, 200% zoom, long titles, and keyboard access.
