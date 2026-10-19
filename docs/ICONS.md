# C-series icon specification

The selected identity is C, the leaf hourglass: indigo expresses time boundaries and mint leaves express focus and moderate browsing. Keep transparent PNG masters; toolbar buttons use the white-background derivative.

| Surface                               | Resource                                             | Treatment                                                                                     |
| ------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Extension manager/install information | `public/icons/icon-{16,32,48,128}.png`               | Complete C-series two-leaf composition                                                        |
| Toolbar                               | `public/icons/toolbar-white-{16,19,24,32,38,48}.png` | Transparent rounded white backing, stronger outline, light/dark toolbars and density variants |
| Extension-page favicon                | `toolbar-32.png`                                     | Simplified small-size derivative                                                              |
| Header/popup brand                    | `src/ui/brand-mark.ts`                               | 34/32 CSS px, high-density assets; decorative beside brand text                               |
| End/confirmation pages                | `createBrandMark(true)`                              | 64 CSS px using the 128px asset                                                               |

Remaining minutes use the existing action badge, not static icon pixels. Function buttons retain semantic chart/calendar/clock/shield/settings icons rather than the brand mark.

<a id="来源与导出"></a>

## Sources and export

- App master: `assets/icon-masters/hourleaf-c-app.png`, from selected candidate C.
- Toolbar master: `assets/icon-masters/hourleaf-c-toolbar.png`, generated from C with built-in image generation.
- Toolbar brief: upright indigo hourglass, two opposing mint leaves; stronger frame/crossbars; no fine veins, texture, shadows, or text; transparent background, centered, readable at 16px.
- On macOS, `sh scripts/export-icons.sh` regenerates sizes from masters. This is an asset-production step; release builds directly copy committed PNGs without image-tool dependencies.

Release targets and Debug share `public/icons/`. Fix missing/incorrect dimensions rather than falling back to archived candidates. Original candidates and earlier masters remain design history and are not packaged.

<a id="深色工具栏辨识2026-09-12"></a>

## Dark-toolbar legibility — 2026-09-12

The white-backed master is `assets/icon-masters/hourleaf-c-toolbar-white.png`, generated from the existing mark with an approximately 20%-radius transparent corner mask and exported at 16/19/24/32/38/48px. All manifests reference `toolbar-white-*`. The backing stays visible in light/dark browser themes without page-theme detection or new permissions.

Manager icons, favicons, and in-page branding retain their existing resources. Release and Debug share the files; the exporter maintains original and white-backed variants. Builds reject white-backed toolbar PNGs without alpha channels to prevent solid square corners.
