export const LOCAL_MODULE_SCHEMA_VERSION = 1 as const;
export const LOCAL_MODULE_FORMAT = "hourleaf.local-module" as const;
export const LOCAL_MODULE_IMPORT_RISK_CODE = "review-content-and-assume-risk" as const;

export const LOCAL_MODULE_CAPABILITIES = [
  "domain-policy",
  "hide-elements",
  "css",
  "user-script"
] as const;

export type LocalModuleCapability = (typeof LOCAL_MODULE_CAPABILITIES)[number];
export type LocalModuleDomainPolicy = "timed" | "always-allow" | "always-block";

/** Explicit open shadow hosts; lifecycle events only trigger local root discovery. */
export interface LocalModuleShadowRoot {
  hostSelector: string;
  mountEvent?: string;
}

/** A user-visible, independently configurable set of page elements. */
export interface LocalModuleFilterGroup {
  /** Stable within a module so settings survive compatible module updates. */
  id: string;
  name: string;
  description: string;
  selectors: string[];
}

export const LOCAL_DNR_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "xmlhttprequest",
  "ping",
  "media",
  "websocket",
  "other"
] as const;

export type LocalDnrResourceType = (typeof LOCAL_DNR_RESOURCE_TYPES)[number];
export type LocalDnrActionType = "block" | "allow" | "upgradeScheme";

/**
 * Store-safe DNR subset. Runtime IDs and initiator domains are owned by the
 * core, so an imported module cannot affect pages outside its declared hosts.
 */
export interface LocalDnrRule {
  action: LocalDnrActionType;
  urlFilter: string;
  resourceTypes: LocalDnrResourceType[];
}

/**
 * A fully self-contained module produced from files explicitly chosen by the
 * user. No field is treated as a URL to fetch executable content from.
 */
export interface LocalModuleDefinition {
  schemaVersion: typeof LOCAL_MODULE_SCHEMA_VERSION;
  /** Stable content identifier; do not infer the format from a file extension. */
  format: typeof LOCAL_MODULE_FORMAT;
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  /** Exact HTTP(S) origin match patterns. Wildcard hosts are intentionally rejected. */
  matches: string[];
  domainPolicy: LocalModuleDomainPolicy;
  /** Legacy selectors that remain enabled whenever the module is enabled. */
  hideSelectors: string[];
  /** Optional user-configurable selector groups. */
  filterGroups: LocalModuleFilterGroup[];
  shadowRoots?: LocalModuleShadowRoot[];
  css: string;
  dnrRules: LocalDnrRule[];
  userScript: string;
  capabilities: LocalModuleCapability[];
}

export type LocalModuleProfile = "normal" | "plan";
export interface LocalModuleTimePeriodReference {
  targetId: string;
  periodId: string;
}

/** Missing group means unrestricted; an empty selection means never active. */
export type LocalModuleFilterSchedules = Record<string, LocalModuleTimePeriodReference[]>;

export interface LocalModulePreferences {
  enabled: boolean;
  disabledFilterGroupIds: string[];
  filterGroupSchedules?: LocalModuleFilterSchedules;
}

export interface LocalModuleInstallation {
  definition: LocalModuleDefinition;
  source: "local-file";
  enabled: boolean;
  /** Group ids explicitly disabled by the user; new groups default to enabled. */
  disabledFilterGroupIds: string[];
  filterGroupSchedules?: LocalModuleFilterSchedules;
  planPreferences?: LocalModulePreferences;
  importedAt: number;
  updatedAt: number;
}

export interface LocalModuleStore {
  schemaVersion: 1;
  installations: Record<string, LocalModuleInstallation>;
}

export type LocalModuleRuntimeState =
  "available" | "permission-required" | "unsupported" | "disabled-by-platform";

export type LocalModulePlatform = "chromium" | "firefox" | "safari" | "unknown";

export type LocalModuleWarningCode =
  | "unsafe-user-script"
  | "safari-user-script-disabled"
  | "user-scripts-api-unavailable"
  | "user-scripts-permission-required"
  | "legacy-dnr-cleanup-failed";

export interface LocalModuleRuntimeStatus {
  userScripts: LocalModuleRuntimeState;
  declarativeNetRequest: "available" | "unsupported";
  warnings: LocalModuleWarningCode[];
}

export interface LocalModuleSnapshot {
  profile?: LocalModuleProfile;
  store: LocalModuleStore;
  runtime: LocalModuleRuntimeStatus;
}

export interface LocalPageRules {
  css: string;
  hideSelectors: string[];
  moduleIds: string[];
  /** Next local clock boundary that can change a selected filter schedule. */
  nextScheduleCheckAt?: number;
  /** Keep each module's styles scoped to its own declared hosts. */
  shadowRules?: Array<LocalModuleShadowRoot & { css: string; hideSelectors: string[] }>;
}

export interface LocalModuleFile {
  name: string;
  text: string;
}

/**
 * Ephemeral data for the confirmation step. It is intentionally not persisted:
 * the normalized definition already contains every field needed at runtime.
 */
export interface LocalModuleImportPreview {
  id: string;
  name: string;
  author: string;
  format: typeof LOCAL_MODULE_FORMAT;
  version: string;
  matches: string[];
  capabilities: LocalModuleCapability[];
  hasUserScript: boolean;
  riskDisclosure: {
    code: typeof LOCAL_MODULE_IMPORT_RISK_CODE;
    acknowledgementRequired: true;
  };
}

export type LocalModuleImportErrorCode =
  | "selection-required"
  | "file-limit-exceeded"
  | "invalid-file"
  | "duplicate-file"
  | "unsupported-file-type"
  | "multiple-manifests"
  | "invalid-json"
  | "invalid-manifest"
  | "invalid-reference"
  | "missing-reference"
  | "metadata-required"
  | "metadata-conflict"
  | "author-required"
  | "format-required"
  | "unsupported-format"
  | "unsupported-dnr"
  | "unsafe-css"
  | "unsafe-user-script";
