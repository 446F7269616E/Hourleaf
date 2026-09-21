import { describe, expect, it, vi } from "vitest";
import {
  MAX_MANAGED_SITES,
  MAX_TIME_PERIODS,
  createDefaultSettings,
  normalizeSettings
} from "../../src/shared/config";
import {
  MAX_CONFIGURATION_BACKUP_BYTES,
  configurationBackupPermissionPatterns,
  createConfigurationBackup,
  parseConfigurationBackup,
  restoreLocalModulePreferences
} from "../../src/shared/configuration-backup";
import { ConfigurationBackupService } from "../../src/background/configuration-backup";
import type { SettingsRepository, PlanQueueRepository } from "../../src/shared/storage";
import type { LocalModuleRepository } from "../../src/modules/local/repository";
import type { LocalModuleDefinition, LocalModuleStore } from "../../src/modules/local/types";
import { applyPresetToPeriods } from "../../src/shared/time-period-presets";

const EMPTY_QUEUE = { schemaVersion: 1 as const, items: [] };

describe("configuration backup", () => {
  it("round-trips the canonical format without executable module source or usage history", () => {
    const settings = createDefaultSettings();
    const modules = localModuleStore(true);
    const backup = createConfigurationBackup(settings, EMPTY_QUEUE, modules, new Date(0));

    expect(parseConfigurationBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
    expect(backup.data.settings.planMode.enabled).toBe(false);
    expect(JSON.stringify(backup)).not.toContain("document.body.dataset.hourleaf");
    expect(backup).not.toHaveProperty("data.usage");
    expect(backup.data.localModules.preferences).toEqual([
      {
        moduleId: "example.local.focus",
        moduleVersion: "1.0.0",
        enabled: true,
        disabledFilterGroupIds: ["home-feed"]
      }
    ]);
  });

  it("round-trips time periods created from one-click presets", () => {
    let id = 0;
    const preset = applyPresetToPeriods(
      [
        {
          id: "period:default",
          name: "",
          enabled: true,
          days: [0, 1, 2, 3, 4, 5, 6],
          startTime: "00:00",
          endTime: "00:00",
          behavior: "timed",
          limitMinutes: null,
          groupCount: 1
        }
      ],
      "meals",
      () => `period:preset-${++id}`,
      (key) => key
    );
    expect(preset.ok).toBe(true);
    if (!preset.ok) return;
    const settings = normalizeSettings({
      ...createDefaultSettings(),
      sites: {
        "site:preset": {
          id: "site:preset",
          origin: "https://preset.example",
          hostname: "preset.example",
          label: "Preset",
          enabled: true,
          restrictionMode: "strict",
          targetIds: ["target:preset"],
          createdAt: 0,
          updatedAt: 0
        }
      },
      targets: {
        "target:preset": {
          id: "target:preset",
          siteId: "site:preset",
          label: "Preset",
          enabled: true,
          timePeriods: preset.periods,
          schedules: [],
          dailyLimitMinutes: null,
          temporaryAccess: { enabled: true, durationMinutes: 5, maxUsesPerDay: 3 }
        }
      },
      customTimePeriodPresets: [
        {
          id: "preset:study-breaks",
          name: "学习间歇",
          periods: [
            {
              name: "上午",
              startTime: "09:00",
              endTime: "10:00",
              limitMinutes: 30,
              groupCount: 2
            }
          ]
        }
      ]
    });
    const backup = createConfigurationBackup(settings, EMPTY_QUEUE, localModuleStore(false));

    expect(
      parseConfigurationBackup(backup).data.settings.targets["target:preset"]?.timePeriods
    ).toEqual(preset.periods);
    expect(parseConfigurationBackup(backup).data.settings.customTimePeriodPresets).toEqual(
      settings.customTimePeriodPresets
    );
  });

  it("preserves plan preferences and accepts backups created before the plan-blocking default", () => {
    const modules = localModuleStore(false);
    modules.installations["example.local.focus"]!.planPreferences = {
      enabled: true,
      disabledFilterGroupIds: ["home-feed"]
    };
    const backup = createConfigurationBackup(createDefaultSettings(), EMPTY_QUEUE, modules);
    const restored = restoreLocalModulePreferences(
      localModuleStore(false),
      parseConfigurationBackup(backup).data.localModules.preferences
    );
    expect(restored.store.installations["example.local.focus"]!.planPreferences).toEqual({
      enabled: true,
      disabledFilterGroupIds: ["home-feed"]
    });
    const old = JSON.parse(JSON.stringify(backup)) as {
      data: {
        settings: {
          planMode: { enableAllBlocking?: boolean };
          legacyCapsules: { bilibili: { planMode: { enableAllBlocking?: boolean } } };
        };
      };
    };
    delete old.data.settings.planMode.enableAllBlocking;
    delete old.data.settings.legacyCapsules.bilibili.planMode.enableAllBlocking;
    expect(parseConfigurationBackup(old).data.settings.planMode.enableAllBlocking).toBe(true);
  });

  it("round-trips the maximum website count with every website period slot populated", () => {
    const raw = createDefaultSettings();
    for (let index = 0; index < MAX_MANAGED_SITES; index += 1) {
      const siteId = `site:${index}`;
      const targetId = `target:${index}`;
      raw.sites[siteId] = {
        id: siteId,
        origin: `https://site-${index}.example`,
        hostname: `site-${index}.example`,
        label: `Site ${index}`,
        enabled: true,
        restrictionMode: "strict",
        targetIds: [targetId],
        createdAt: index,
        updatedAt: index
      };
      raw.targets[targetId] = {
        id: targetId,
        siteId,
        label: `Site ${index}`,
        enabled: true,
        accessPolicy: "timed",
        dailyLimitMinutes: null,
        schedules: [],
        timePeriods: Array.from({ length: MAX_TIME_PERIODS }, (_, periodIndex) => ({
          id: `period:${index}:${periodIndex}`,
          name: `Period ${periodIndex}`,
          enabled: true,
          days: [0, 1, 2, 3, 4, 5, 6],
          startTime: "00:00",
          endTime: "00:00",
          behavior: "timed" as const,
          limitMinutes: 45,
          groupCount: 1
        })),
        temporaryAccess: { enabled: true, durationMinutes: 5, maxUsesPerDay: 3 }
      };
    }
    const settings = normalizeSettings(raw);
    const backup = createConfigurationBackup(settings, EMPTY_QUEUE, localModuleStore(false));

    expect(() => parseConfigurationBackup(backup)).not.toThrow();
    expect(Object.keys(backup.data.settings.sites)).toHaveLength(MAX_MANAGED_SITES);
  });

  it("rejects non-canonical, unknown, and executable-looking fields", () => {
    const backup = createConfigurationBackup(
      createDefaultSettings(),
      EMPTY_QUEUE,
      localModuleStore(false)
    );
    expect(() => parseConfigurationBackup({ ...backup, extra: true })).toThrow();
    expect(() => parseConfigurationBackup({ ...backup, schemaVersion: 2 })).toThrow();
    expect(() =>
      parseConfigurationBackup({
        ...backup,
        padding: "x".repeat(MAX_CONFIGURATION_BACKUP_BYTES)
      })
    ).toThrow();
    expect(() =>
      parseConfigurationBackup({
        ...backup,
        data: { ...backup.data, settings: { ...backup.data.settings, enabled: "yes" } }
      })
    ).toThrow();
    expect(() =>
      parseConfigurationBackup({
        ...backup,
        data: {
          ...backup.data,
          localModules: {
            schemaVersion: 1,
            preferences: [
              {
                moduleId: "example.local.focus",
                moduleVersion: "1.0.0",
                enabled: true,
                disabledFilterGroupIds: [],
                userScript: "fetch('https://example.com')"
              }
            ]
          }
        }
      })
    ).toThrow();
  });

  it("restores only an installed exact module version and includes its matches in permissions", () => {
    const backup = createConfigurationBackup(
      createDefaultSettings(),
      EMPTY_QUEUE,
      localModuleStore(true)
    );
    expect(configurationBackupPermissionPatterns(backup, localModuleStore(true))).toEqual([
      "https://example.com/*"
    ]);
    const matching = restoreLocalModulePreferences(
      localModuleStore(false),
      backup.data.localModules.preferences,
      10
    );
    expect(matching.appliedCount).toBe(1);
    expect(matching.store.installations["example.local.focus"]?.enabled).toBe(true);

    const updated = localModuleStore(false);
    const installation = updated.installations["example.local.focus"];
    if (installation) installation.definition.version = "2.0.0";
    const mismatched = restoreLocalModulePreferences(
      updated,
      backup.data.localModules.preferences,
      10
    );
    expect(mismatched).toMatchObject({ appliedCount: 0, skippedCount: 1 });
    expect(mismatched.store.installations["example.local.focus"]?.enabled).toBe(false);
  });

  it("checks every restored permission before the single atomic write", async () => {
    const settings = normalizeSettings({
      ...createDefaultSettings(),
      sites: {
        "site:one": {
          id: "site:one",
          origin: "https://focus.example",
          hostname: "focus.example",
          label: "Focus",
          enabled: true,
          restrictionMode: "strict",
          targetIds: ["target:one"],
          createdAt: 0,
          updatedAt: 0
        }
      },
      targets: {
        "target:one": {
          id: "target:one",
          siteId: "site:one",
          label: "Focus",
          enabled: true,
          timePeriods: [
            {
              id: "period:one",
              name: "",
              enabled: true,
              days: [0, 1, 2, 3, 4, 5, 6],
              startTime: "00:00",
              endTime: "00:00",
              behavior: "timed",
              limitMinutes: 45,
              groupCount: 1
            }
          ],
          schedules: [],
          dailyLimitMinutes: null,
          temporaryAccess: { enabled: true, durationMinutes: 5, maxUsesPerDay: 3 }
        }
      }
    });
    const backup = createConfigurationBackup(settings, EMPTY_QUEUE, localModuleStore(true));
    const hasPermissions = vi.fn((patterns: string[]) => {
      void patterns;
      return Promise.resolve(true);
    });
    const write = vi.fn((values: Record<string, unknown>) => {
      void values;
      return Promise.resolve();
    });
    const beforeWrite = vi.fn(() => Promise.resolve());
    const service = new ConfigurationBackupService(
      { get: () => Promise.resolve(settings) } as unknown as SettingsRepository,
      { get: () => Promise.resolve(EMPTY_QUEUE) } as unknown as PlanQueueRepository,
      { get: () => Promise.resolve(localModuleStore(false)) } as unknown as LocalModuleRepository,
      { hasPermissions, write }
    );

    await expect(service.import(backup, 20, beforeWrite)).resolves.toMatchObject({
      imported: true,
      runtimeWarningCount: 0
    });
    expect(hasPermissions).toHaveBeenCalledWith([
      "https://example.com/*",
      "https://focus.example/*"
    ]);
    expect(beforeWrite).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0]).toMatchObject({
      "bilifocus.plan-access.v1": { schemaVersion: 1 },
      "hourleaf.period-runtime.v1": { schemaVersion: 1, entries: {} }
    });
  });

  it("does not reset runtime or write when any required permission is missing", async () => {
    const settings = createDefaultSettings();
    const backup = createConfigurationBackup(settings, EMPTY_QUEUE, localModuleStore(true));
    const write = vi.fn((values: Record<string, unknown>) => {
      void values;
      return Promise.resolve();
    });
    const beforeWrite = vi.fn(() => Promise.resolve());
    const service = new ConfigurationBackupService(
      { get: () => Promise.resolve(settings) } as unknown as SettingsRepository,
      { get: () => Promise.resolve(EMPTY_QUEUE) } as unknown as PlanQueueRepository,
      { get: () => Promise.resolve(localModuleStore(false)) } as unknown as LocalModuleRepository,
      { hasPermissions: () => Promise.resolve(false), write }
    );

    await expect(service.import(backup, 20, beforeWrite)).rejects.toThrow(/permission/i);
    expect(beforeWrite).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});

function localModuleStore(enabled: boolean): LocalModuleStore {
  const definition: LocalModuleDefinition = {
    schemaVersion: 1,
    format: "hourleaf.local-module",
    id: "example.local.focus",
    name: "Example Focus",
    author: "Hourleaf tests",
    version: "1.0.0",
    description: "",
    matches: ["https://example.com/*"],
    domainPolicy: "timed",
    hideSelectors: [],
    filterGroups: [
      {
        id: "home-feed",
        name: "Home feed",
        description: "",
        selectors: [".feed"]
      }
    ],
    css: "",
    dnrRules: [],
    userScript: "document.body.dataset.hourleaf = 'on';",
    capabilities: ["hide-elements", "user-script"]
  };
  return {
    schemaVersion: 1,
    installations: {
      [definition.id]: {
        definition,
        source: "local-file",
        enabled,
        disabledFilterGroupIds: ["home-feed"],
        importedAt: 1,
        updatedAt: 1
      }
    }
  };
}
