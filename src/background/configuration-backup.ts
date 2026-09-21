import { permissionsContains, storageSet, getLocalStorageArea } from "../shared/browser";
import {
  configurationBackupPermissionPatterns,
  createConfigurationBackup,
  parseConfigurationBackup,
  restoreLocalModulePreferences,
  type ConfigurationBackupDocument,
  type ConfigurationImportResult
} from "../shared/configuration-backup";
import { PlanQueueRepository, SettingsRepository } from "../shared/storage";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { LocalModuleRepository } from "../modules/local/repository";
import { normalizeSettings } from "../shared/config";

export interface ConfigurationBackupServiceDependencies {
  hasPermissions(patterns: string[]): Promise<boolean>;
  write(values: Record<string, unknown>): Promise<void>;
}

const DEFAULT_DEPENDENCIES: ConfigurationBackupServiceDependencies = {
  hasPermissions: (patterns) =>
    patterns.length === 0 ? Promise.resolve(true) : permissionsContains(patterns),
  write: (values) => storageSet(getLocalStorageArea(), values)
};

/** Owns the single-storage-write boundary for portable user configuration. */
export class ConfigurationBackupService {
  constructor(
    private readonly settings = new SettingsRepository(),
    private readonly planQueue = new PlanQueueRepository(),
    private readonly localModules = new LocalModuleRepository(),
    private readonly dependencies = DEFAULT_DEPENDENCIES
  ) {}

  async export(now = new Date()): Promise<ConfigurationBackupDocument> {
    const [settings, planQueue, localModules] = await Promise.all([
      this.settings.get(),
      this.planQueue.get(),
      this.localModules.get()
    ]);
    // The same strict gate is used on both directions, guaranteeing that every
    // successfully returned same-version export is accepted by the importer.
    return parseConfigurationBackup(
      createConfigurationBackup(settings, planQueue, localModules, now)
    );
  }

  async import(
    value: unknown,
    now = Date.now(),
    beforeWrite?: () => Promise<void>
  ): Promise<ConfigurationImportResult> {
    const backup = parseConfigurationBackup(value);
    const currentModules = await this.localModules.get();
    const permissionPatterns = configurationBackupPermissionPatterns(backup, currentModules);
    if (!(await this.dependencies.hasPermissions(permissionPatterns))) {
      throw new Error("Website permission is missing for this configuration backup");
    }
    const restoredModules = restoreLocalModulePreferences(
      currentModules,
      backup.data.localModules.preferences,
      now
    );
    const settings = normalizeSettings({
      ...backup.data.settings,
      planMode: { ...backup.data.settings.planMode, enabled: false }
    });

    await beforeWrite?.();

    // All durable configuration and the runtime reset cross storage in one set()
    // call. Usage history is deliberately outside the backup/restore contract.
    await this.dependencies.write({
      [STORAGE_KEYS.settings]: settings,
      [STORAGE_KEYS.planQueue]: backup.data.planQueue,
      [STORAGE_KEYS.localModules]: restoredModules.store,
      [STORAGE_KEYS.planAccess]: { schemaVersion: 1 },
      [STORAGE_KEYS.temporaryAccess]: {
        schemaVersion: 2,
        expiresAtByTarget: {},
        usesByDateAndTarget: {},
        expiresAtBySection: {},
        usesByDate: {}
      },
      [STORAGE_KEYS.periodRuntime]: { schemaVersion: 1, entries: {} }
    });

    return {
      imported: true,
      siteCount: Object.keys(settings.sites).length,
      planItemCount: backup.data.planQueue.items.length,
      appliedLocalModulePreferenceCount: restoredModules.appliedCount,
      skippedLocalModulePreferenceCount: restoredModules.skippedCount,
      runtimeWarningCount: 0
    };
  }
}
