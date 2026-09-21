import { normalizeSettings } from "./config";
import { normalizePlanQueueStore } from "./storage";
import { siteMatchPatterns } from "./site-scope";
import type { FocusSettings, PlanQueueStore } from "./types";
import type { LocalModuleStore, LocalModulePreferences } from "../modules/local/types";
import { normalizeLocalModuleStore } from "../modules/local/validation";

export const CONFIGURATION_BACKUP_FORMAT = "hourleaf.configuration-backup" as const;
export const CONFIGURATION_BACKUP_SCHEMA_VERSION = 1 as const;
// Higher than the WebExtensions local-storage quota used by supported builds,
// while still bounding untrusted file parsing and runtime messages.
export const MAX_CONFIGURATION_BACKUP_BYTES = 16 * 1024 * 1024;

export interface LocalModulePreferenceBackup {
  moduleId: string;
  moduleVersion: string;
  enabled: boolean;
  disabledFilterGroupIds: string[];
  planPreferences?: LocalModulePreferences;
}

export interface ConfigurationBackupDocument {
  format: typeof CONFIGURATION_BACKUP_FORMAT;
  schemaVersion: typeof CONFIGURATION_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  data: {
    settings: FocusSettings;
    planQueue: PlanQueueStore;
    localModules: {
      schemaVersion: 1;
      preferences: LocalModulePreferenceBackup[];
    };
  };
}

export interface LocalModulePreferenceRestoreResult {
  store: LocalModuleStore;
  appliedCount: number;
  skippedCount: number;
}

export interface ConfigurationImportResult {
  imported: true;
  siteCount: number;
  planItemCount: number;
  appliedLocalModulePreferenceCount: number;
  skippedLocalModulePreferenceCount: number;
  runtimeWarningCount: number;
}

/**
 * Creates a portable configuration snapshot without usage history, active grants,
 * or executable local-module source. A restored backup can never silently install
 * or start third-party code.
 */
export function createConfigurationBackup(
  settings: FocusSettings,
  planQueue: PlanQueueStore,
  localModules: LocalModuleStore,
  now = new Date()
): ConfigurationBackupDocument {
  const dormantSettings = normalizeSettings({
    ...settings,
    planMode: { ...settings.planMode, enabled: false }
  });
  const normalizedQueue = normalizePlanQueueStore(planQueue);
  const normalizedModules = normalizeLocalModuleStore(localModules);
  return {
    format: CONFIGURATION_BACKUP_FORMAT,
    schemaVersion: CONFIGURATION_BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: {
      settings: dormantSettings,
      planQueue: normalizedQueue,
      localModules: {
        schemaVersion: 1,
        preferences: Object.values(normalizedModules.installations)
          .map((installation) => ({
            moduleId: installation.definition.id,
            moduleVersion: installation.definition.version,
            enabled: installation.enabled,
            disabledFilterGroupIds: [...installation.disabledFilterGroupIds].sort(),
            ...(installation.planPreferences
              ? {
                  planPreferences: {
                    enabled: installation.planPreferences.enabled,
                    disabledFilterGroupIds: [
                      ...installation.planPreferences.disabledFilterGroupIds
                    ].sort()
                  }
                }
              : {})
          }))
          .sort((left, right) => left.moduleId.localeCompare(right.moduleId))
      }
    }
  };
}

/** Strictly validates a backup selected by the user. No partial restore occurs. */
export function parseConfigurationBackup(value: unknown): ConfigurationBackupDocument {
  if (serializedByteLength(value) > MAX_CONFIGURATION_BACKUP_BYTES) {
    throw new Error("The configuration backup is too large");
  }
  if (!isRecord(value) || !hasExactKeys(value, ["format", "schemaVersion", "exportedAt", "data"])) {
    throw new Error("Invalid Hourleaf configuration backup");
  }
  if (
    value.format !== CONFIGURATION_BACKUP_FORMAT ||
    value.schemaVersion !== CONFIGURATION_BACKUP_SCHEMA_VERSION ||
    !isIsoTimestamp(value.exportedAt) ||
    !isRecord(value.data) ||
    !hasExactKeys(value.data, ["settings", "planQueue", "localModules"])
  ) {
    throw new Error("Unsupported Hourleaf configuration backup");
  }

  const rawSettings = upgradeBlockingPreferenceDefault(value.data.settings);
  const settings = normalizeSettings(rawSettings);
  if (!structurallyEqual(settings, rawSettings)) {
    throw new Error("The settings section is invalid or not canonical");
  }
  const planQueue = normalizePlanQueueStore(value.data.planQueue);
  if (!structurallyEqual(planQueue, value.data.planQueue)) {
    throw new Error("The plan section is invalid or not canonical");
  }
  const localModules = parseLocalModulePreferences(value.data.localModules);
  return clone({
    format: CONFIGURATION_BACKUP_FORMAT,
    schemaVersion: CONFIGURATION_BACKUP_SCHEMA_VERSION,
    exportedAt: value.exportedAt,
    data: { settings, planQueue, localModules }
  });
}

export function configurationBackupPermissionPatterns(
  backup: ConfigurationBackupDocument,
  currentLocalModules?: LocalModuleStore
): string[] {
  const modulePatterns = currentLocalModules
    ? backup.data.localModules.preferences.flatMap((preference) => {
        if (!preference.enabled) return [];
        const installation = currentLocalModules.installations[preference.moduleId];
        return installation?.definition.version === preference.moduleVersion
          ? installation.definition.matches
          : [];
      })
    : [];
  return [
    ...new Set(
      Object.values(backup.data.settings.sites)
        .flatMap((site) => siteMatchPatterns(site))
        .concat(modulePatterns)
    )
  ].sort();
}

/**
 * Restores only preferences for an already-installed, exact module version.
 * Missing or updated modules are skipped so a backup cannot authorize different code.
 */
export function restoreLocalModulePreferences(
  current: LocalModuleStore,
  preferences: readonly LocalModulePreferenceBackup[],
  now = Date.now()
): LocalModulePreferenceRestoreResult {
  const store = normalizeLocalModuleStore(current);
  let appliedCount = 0;
  let skippedCount = 0;
  for (const preference of preferences) {
    const installation = store.installations[preference.moduleId];
    if (!installation || installation.definition.version !== preference.moduleVersion) {
      skippedCount += 1;
      continue;
    }
    const groupIds = new Set(installation.definition.filterGroups.map((group) => group.id));
    installation.enabled = preference.enabled;
    installation.disabledFilterGroupIds = preference.disabledFilterGroupIds.filter((id) =>
      groupIds.has(id)
    );
    if (preference.planPreferences)
      installation.planPreferences = {
        enabled: preference.planPreferences.enabled,
        disabledFilterGroupIds: preference.planPreferences.disabledFilterGroupIds.filter((id) =>
          groupIds.has(id)
        )
      };
    else delete installation.planPreferences;
    installation.updatedAt = now;
    appliedCount += 1;
  }
  return { store: normalizeLocalModuleStore(store), appliedCount, skippedCount };
}

function parseLocalModulePreferences(
  value: unknown
): ConfigurationBackupDocument["data"]["localModules"] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schemaVersion", "preferences"]) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.preferences) ||
    value.preferences.length > 32
  ) {
    throw new Error("The local module preferences section is invalid");
  }
  const preferences: LocalModulePreferenceBackup[] = [];
  const seen = new Set<string>();
  for (const raw of value.preferences) {
    if (
      !isRecord(raw) ||
      !hasExactKeys(raw, [
        "moduleId",
        "moduleVersion",
        "enabled",
        "disabledFilterGroupIds",
        ...(raw.planPreferences !== undefined ? ["planPreferences"] : [])
      ]) ||
      !isStableId(raw.moduleId) ||
      seen.has(raw.moduleId) ||
      typeof raw.moduleVersion !== "string" ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(raw.moduleVersion) ||
      typeof raw.enabled !== "boolean" ||
      !Array.isArray(raw.disabledFilterGroupIds) ||
      raw.disabledFilterGroupIds.length > 24 ||
      !raw.disabledFilterGroupIds.every(isFilterGroupId) ||
      new Set(raw.disabledFilterGroupIds).size !== raw.disabledFilterGroupIds.length ||
      (raw.planPreferences !== undefined && !validModulePreferences(raw.planPreferences))
    ) {
      throw new Error("A local module preference is invalid");
    }
    seen.add(raw.moduleId);
    preferences.push({
      moduleId: raw.moduleId,
      moduleVersion: raw.moduleVersion,
      enabled: raw.enabled,
      disabledFilterGroupIds: [...raw.disabledFilterGroupIds].sort(),
      ...(validModulePreferences(raw.planPreferences)
        ? {
            planPreferences: {
              enabled: raw.planPreferences.enabled,
              disabledFilterGroupIds: [...raw.planPreferences.disabledFilterGroupIds].sort()
            }
          }
        : {})
    });
  }
  preferences.sort((left, right) => left.moduleId.localeCompare(right.moduleId));
  if (!structurallyEqual(preferences, value.preferences)) {
    throw new Error("The local module preferences section is not canonical");
  }
  return { schemaVersion: 1, preferences };
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isStableId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  );
}

function isFilterGroupId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 64 &&
    /^[a-z0-9][a-z0-9-]*$/u.test(value)
  );
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function serializedByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validModulePreferences(value: unknown): value is LocalModulePreferences {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["enabled", "disabledFilterGroupIds"]) &&
    typeof value.enabled === "boolean" &&
    Array.isArray(value.disabledFilterGroupIds) &&
    value.disabledFilterGroupIds.length <= 24 &&
    value.disabledFilterGroupIds.every(isFilterGroupId) &&
    new Set(value.disabledFilterGroupIds).size === value.disabledFilterGroupIds.length
  );
}

function upgradeBlockingPreferenceDefault(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const copy = clone(value);
  const addDefault = (candidate: unknown) => {
    if (isRecord(candidate) && candidate.enableAllBlocking === undefined)
      candidate.enableAllBlocking = true;
  };
  addDefault(copy.planMode);
  if (isRecord(copy.legacyCapsules) && isRecord(copy.legacyCapsules.bilibili))
    addDefault(copy.legacyCapsules.bilibili.planMode);
  return copy;
}
