import { UI_THEMES, type FocusSettings, type UiTheme } from "../shared/types";
import { storageAddChangeListener } from "../shared/browser";
import { STORAGE_KEYS } from "../shared/storage-keys";

let watchingAppearance = false;

/** Applies the persisted palette before a full-page screen is rendered. */
export function applyTheme(theme: UiTheme | undefined): void {
  document.documentElement.dataset.theme = theme ?? "ocean";
}

/** Shared appearance preferences also update directories in already-open pages. */
export function applyAppearance(settings: Pick<FocusSettings, "theme" | "showSidebarIcons">): void {
  applyTheme(settings.theme);
  document.documentElement.dataset.sidebarIcons = String(settings.showSidebarIcons === true);
  if (watchingAppearance) return;
  watchingAppearance = true;
  storageAddChangeListener((changes, area) => {
    if (area !== "local") return;
    const value: unknown = changes[STORAGE_KEYS.settings]?.newValue;
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const appearance = value as Record<string, unknown>;
    document.documentElement.dataset.sidebarIcons = String(appearance.showSidebarIcons === true);
    if (UI_THEMES.includes(appearance.theme as UiTheme)) applyTheme(appearance.theme as UiTheme);
  });
}
