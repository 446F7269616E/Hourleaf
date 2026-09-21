# Design QA

## Evidence

- Source visual truth: `/var/folders/x1/h1mrw6j14knbhcklwd50mfrm0000gn/T/codex-clipboard-5eef547d-258b-4fea-8d5b-a1373c265da8.png`
- Source pixels: 1188 × 823.
- Source state: desktop wireframe of the one-click time-period dialog, with a preset list on the left and a 24-hour strip plus period summaries on the right.
- Implementation target: `dist/chromium/options.html`, one-click dialog open on the default “三餐下饭” preset and the named multi-period custom-preset editor.
- Implementation screenshot: unavailable.
- Intended viewport: desktop 1280 × 900 CSS px, device scale factor 1; narrow responsive state also required.
- Density normalization: not performed because no implementation capture was available.

## Full-view and focused comparison

The source image was opened and inspected. A matching implementation screenshot could not be captured: the Codex in-app browser blocks local `file://` extension pages, while the repository's Playwright Chromium executable is not installed. Browser security policy prohibits switching to another browser surface as a workaround after the local URL was blocked.

Because the implementation was not rendered, no side-by-side full-view or focused-region comparison can be made from visual evidence. Code inspection, successful builds, type checking, linting, formatting, and unit tests are not substitutes for rendered design QA.

## Findings

- [P1] Rendered fidelity is unverified.
  - Location: one-click time-period dialog and responsive layout.
  - Evidence: source wireframe is available, but implementation screenshot is missing.
  - Impact: typography, spacing, color contrast, timeline sizing, overflow, focus treatment, and dark-mode rendering cannot be accepted visually.
  - Fix: run the Chromium UI contract suite with its required Playwright browser installed, capture the dialog at the desktop and narrow breakpoints, then compare both captures with the source in one visual input.

## Required fidelity surfaces

- Fonts and typography: blocked; no rendered evidence.
- Spacing and layout rhythm: blocked; no rendered evidence.
- Colors and visual tokens: blocked; no rendered evidence.
- Image quality and asset fidelity: the toolbar PNG alpha channel and transparent corner pixels were verified mechanically, but toolbar rendering in a dark browser theme remains visually unverified.
- Copy and content: verified statically in Simplified Chinese and English resources; rendered wrapping remains blocked.

## Comparison history

- Initial pass: blocked before visual comparison. No P0/P1/P2 visual fixes were inferred from code alone.

## Implementation checklist

1. Install the repository's Playwright Chromium revision.
2. Run the configuration UI contract tests.
3. Capture the default preset, noon-split preset, named multi-period custom editor, saved custom preset reuse, narrow layout, and dark toolbar icon.
4. Compare the normalized captures with the source wireframe and resolve any P0/P1/P2 differences.

final result: blocked
