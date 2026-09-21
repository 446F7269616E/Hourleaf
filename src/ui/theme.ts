import type { FocusSettings, UiTheme } from "../shared/types";

/** Applies the persisted palette before a full-page screen is rendered. */
export function applyTheme(theme: UiTheme | FocusSettings["theme"] | undefined): void {
  document.documentElement.dataset.theme = theme ?? "verdant";
}
