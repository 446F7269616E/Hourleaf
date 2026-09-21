import { modulePreferences } from "./profiles";
import {
  getLocalStorageArea,
  storageGet,
  storageSet,
  type StorageAreaLike
} from "../../shared/browser";
import { STORAGE_KEYS } from "../../shared/storage-keys";
import type { LocalModuleDefinition, LocalModuleStore, LocalModuleProfile } from "./types";
import { normalizeLocalModuleDefinition, normalizeLocalModuleStore } from "./validation";

export class LocalModuleRepository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly area: StorageAreaLike = getLocalStorageArea()) {}

  async get(): Promise<LocalModuleStore> {
    const result = await storageGet(this.area, STORAGE_KEYS.localModules);
    return normalizeLocalModuleStore(result[STORAGE_KEYS.localModules]);
  }

  async import(definition: LocalModuleDefinition, now = Date.now()): Promise<LocalModuleStore> {
    const normalized = normalizeLocalModuleDefinition(definition);
    if (!normalized) throw new Error("本地模块未通过安全校验");
    return this.update((store) => {
      const previous = store.installations[normalized.id];
      if (!previous && Object.keys(store.installations).length >= 32) {
        throw new Error("最多只能安装 32 个本地模块");
      }
      store.installations[normalized.id] = {
        definition: normalized,
        source: "local-file",
        enabled: previous?.enabled ?? false,
        disabledFilterGroupIds: previous
          ? previous.disabledFilterGroupIds.filter((groupId) =>
              normalized.filterGroups.some((group) => group.id === groupId)
            )
          : [],
        ...(previous?.planPreferences ? { planPreferences: previous.planPreferences } : {}),
        importedAt: previous?.importedAt ?? now,
        updatedAt: now
      };
    });
  }

  async setEnabled(
    id: string,
    enabled: boolean,
    now = Date.now(),
    profile: LocalModuleProfile = "normal"
  ): Promise<LocalModuleStore> {
    return this.update((store) => {
      const installation = store.installations[id];
      if (!installation) throw new Error("本地模块不存在");
      if (profile === "plan")
        installation.planPreferences = { ...modulePreferences(installation, profile), enabled };
      else installation.enabled = enabled;
      installation.updatedAt = now;
    });
  }

  async setFilterGroupEnabled(
    id: string,
    groupId: string,
    enabled: boolean,
    now = Date.now(),
    profile: LocalModuleProfile = "normal"
  ): Promise<LocalModuleStore> {
    return this.update((store) => {
      const installation = store.installations[id];
      if (!installation) throw new Error("本地模块不存在");
      if (!installation.definition.filterGroups.some((group) => group.id === groupId)) {
        throw new Error("模块屏蔽分组不存在");
      }
      const disabled = new Set(modulePreferences(installation, profile).disabledFilterGroupIds);
      if (enabled) disabled.delete(groupId);
      else disabled.add(groupId);
      if (profile === "plan")
        installation.planPreferences = {
          ...modulePreferences(installation, profile),
          disabledFilterGroupIds: [...disabled]
        };
      else installation.disabledFilterGroupIds = [...disabled];
      installation.updatedAt = now;
    });
  }

  async remove(id: string): Promise<LocalModuleStore> {
    return this.update((store) => {
      if (!store.installations[id]) throw new Error("本地模块不存在");
      delete store.installations[id];
    });
  }

  private update(mutator: (store: LocalModuleStore) => void): Promise<LocalModuleStore> {
    const operation = async () => {
      const store = await this.get();
      mutator(store);
      const normalized = normalizeLocalModuleStore(store);
      await storageSet(this.area, { [STORAGE_KEYS.localModules]: normalized });
      return normalized;
    };
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }
}
