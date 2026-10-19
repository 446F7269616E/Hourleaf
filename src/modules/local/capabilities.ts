import type { LocalModulePlatform } from "./types";

declare const __HOURLEAF_BROWSER_TARGET__: Exclude<LocalModulePlatform, "unknown">;

export function resolveLocalModulePlatform(): LocalModulePlatform {
  if (typeof __HOURLEAF_BROWSER_TARGET__ !== "undefined") {
    return __HOURLEAF_BROWSER_TARGET__;
  }
  return "unknown";
}

/** Store distributions only permit user-provided executable code on Chromium. */
export function localModuleAllowsUserScripts(platform: LocalModulePlatform): boolean {
  return platform === "chromium";
}
