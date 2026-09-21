import type { ManagedSiteService } from "../core/sites";
import type { LocalModuleService } from "../modules/local/service";
import type { LocalModuleDefinition } from "../modules/local/types";
import { getLocalStorageArea, storageGet, storageSet } from "../shared/browser";

declare const __HOURLEAF_BUILD_FLAVOR__: "release" | "debug";
declare const __HOURLEAF_DEBUG_MODULES__: readonly LocalModuleDefinition[];
declare const __HOURLEAF_DEBUG_SITES__: readonly DebugSitePreset[];

export interface DebugSitePreset {
  url: string;
  label: string;
}

export interface DebugBuildPreset {
  modules: readonly LocalModuleDefinition[];
  sites: readonly DebugSitePreset[];
}

interface DebugLocalModuleGateway {
  getSnapshot: LocalModuleService["getSnapshot"];
  import: LocalModuleService["import"];
  setEnabled: LocalModuleService["setEnabled"];
  remove: LocalModuleService["remove"];
}

interface DebugManagedSiteGateway {
  list: ManagedSiteService["list"];
  addAuthorized: ManagedSiteService["addAuthorized"];
}

export interface DebugSeedStateGateway {
  getModuleIds(): Promise<string[]>;
  setModuleIds(moduleIds: readonly string[]): Promise<void>;
}

const DEBUG_SEED_STORAGE_KEY = "hourleaf.debug-seed.v1";

/**
 * Release builds compile this call to an immediate no-op. Debug values are
 * injected by the local build command, never committed as an extension asset.
 */
export async function initializeDebugBuild(
  localModulesReady: Promise<unknown>,
  localModules: DebugLocalModuleGateway,
  managedSites: DebugManagedSiteGateway
): Promise<void> {
  if (typeof __HOURLEAF_BUILD_FLAVOR__ === "undefined" || __HOURLEAF_BUILD_FLAVOR__ !== "debug") {
    return;
  }
  await localModulesReady;
  await applyDebugBuildPreset(
    {
      modules: __HOURLEAF_DEBUG_MODULES__,
      sites: __HOURLEAF_DEBUG_SITES__
    },
    localModules,
    managedSites,
    new BrowserDebugSeedStateGateway()
  );
}

/** Applies only repository-owned local fixtures and never fetches the network. */
export async function applyDebugBuildPreset(
  preset: DebugBuildPreset,
  localModules: DebugLocalModuleGateway,
  managedSites: DebugManagedSiteGateway,
  seedState: DebugSeedStateGateway
): Promise<void> {
  const initialModules = (await localModules.getSnapshot()).store.installations;
  const currentSeedIds = new Set(preset.modules.map((definition) => definition.id));
  for (const previousId of await seedState.getModuleIds()) {
    if (!currentSeedIds.has(previousId) && initialModules[previousId]) {
      await localModules.remove(previousId);
    }
  }
  for (const definition of preset.modules) {
    const existed = Boolean(initialModules[definition.id]);
    await localModules.import(definition);
    // New debug fixtures start enabled. A tester's later toggle remains intact
    // across service-worker restarts and rebuilt fixture versions.
    if (!existed) await localModules.setEnabled(definition.id, true);
  }

  const configuredOrigins = new Set(
    Object.values((await managedSites.list()).sites).map((site) => site.origin)
  );
  for (const site of preset.sites) {
    const origin = new URL(site.url).origin;
    if (configuredOrigins.has(origin)) continue;
    const result = await managedSites.addAuthorized(site.url, site.label);
    if (result.granted) configuredOrigins.add(result.origin);
  }
  await seedState.setModuleIds([...currentSeedIds]);
}

class BrowserDebugSeedStateGateway implements DebugSeedStateGateway {
  async getModuleIds(): Promise<string[]> {
    const value = (await storageGet(getLocalStorageArea(), DEBUG_SEED_STORAGE_KEY))[
      DEBUG_SEED_STORAGE_KEY
    ];
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.moduleIds)) return [];
    return value.moduleIds.filter(
      (item): item is string =>
        typeof item === "string" && /^[a-z0-9][a-z0-9._:-]{2,99}$/u.test(item)
    );
  }

  async setModuleIds(moduleIds: readonly string[]): Promise<void> {
    await storageSet(getLocalStorageArea(), {
      [DEBUG_SEED_STORAGE_KEY]: {
        schemaVersion: 1,
        moduleIds: [...new Set(moduleIds)].slice(0, 32)
      }
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
