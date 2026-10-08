import type { UiTheme } from "../shared/types";

/** Applies the persisted palette before a full-page screen is rendered. */
export function applyTheme(theme: UiTheme | undefined): void {
  document.documentElement.dataset.theme = theme ?? "verdant";
}
