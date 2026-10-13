import {
  getSessionStorageArea,
  storageGet,
  storageSet,
  tabGroupsQuery,
  tabsGet,
  type StorageAreaLike
} from "../shared/browser";
import type { SettingsRepository } from "../shared/storage";
import {
  isTabGroupWhitelistActive,
  MAX_TAB_GROUP_WHITELIST_RULES,
  type TabGroupWhitelistRule,
  type TabGroupWhitelistState
} from "../shared/tab-group-whitelist";
import { STORAGE_KEYS } from "../shared/storage-keys";

/** Group bindings never outlive the browser session or travel in backups. */
export class TabGroupWhitelistService {
  private readonly removedGroups = new Set<number>();

  constructor(private readonly settings: SettingsRepository) {}

  async getState(): Promise<TabGroupWhitelistState> {
    const [config, groups, bindings] = await Promise.all([
      this.settings.get(),
      tabGroupsQuery().catch(() => null),
      this.readBindings()
    ]);
    const live = new Set(groups?.map((group) => group.id) ?? []);
    return {
      supported: groups !== null,
      groups: (groups ?? []).map((group) => ({
        id: group.id,
        title: group.title ?? "",
        windowId: group.windowId
      })),
      rules: config.tabGroupWhitelist.map((rule) => {
        const groupId = bindings[rule.id];
        return {
          rule,
          groupId:
            groupId !== undefined && live.has(groupId) && !this.removedGroups.has(groupId)
              ? groupId
              : null
        };
      })
    };
  }

  async save(rule: TabGroupWhitelistRule, groupId?: number): Promise<TabGroupWhitelistState> {
    const area = getSessionStorageArea();
    if (groupId !== undefined) {
      const groups = await tabGroupsQuery();
      if (!area || !groups?.some((group) => group.id === groupId))
        throw new Error("The tab group is no longer available; refresh and select it again");
      // Across local/session storage, a failed rebind must leave the rule dormant
      // rather than apply its new hours to the previously selected group.
      const bindings = await this.readBindings();
      delete bindings[rule.id];
      await storageSet(area, { [STORAGE_KEYS.tabGroupBindings]: bindings });
    }
    await this.settings.mutate((config) => {
      const index = config.tabGroupWhitelist.findIndex((entry) => entry.id === rule.id);
      if (index < 0) {
        if (groupId === undefined) throw new Error("Select a tab group first");
        if (config.tabGroupWhitelist.length >= MAX_TAB_GROUP_WHITELIST_RULES)
          throw new Error("Too many tab group whitelist rules");
        config.tabGroupWhitelist.push(rule);
      } else config.tabGroupWhitelist[index] = rule;
    });
    if (groupId !== undefined && area) {
      // Removal can arrive while the settings write is pending. Never revive
      // that binding; a later explicit selection must validate a live group.
      const groups = await tabGroupsQuery();
      if (this.removedGroups.has(groupId) || !groups?.some((group) => group.id === groupId))
        throw new Error("The tab group is no longer available; refresh and select it again");
      const bindings = await this.readBindings();
      bindings[rule.id] = groupId;
      await storageSet(area, { [STORAGE_KEYS.tabGroupBindings]: bindings });
    }
    return this.getState();
  }

  async remove(id: string): Promise<TabGroupWhitelistState> {
    await this.settings.mutate((config) => {
      config.tabGroupWhitelist = config.tabGroupWhitelist.filter((rule) => rule.id !== id);
    });
    const area = getSessionStorageArea();
    if (area) {
      const bindings = await this.readBindings();
      delete bindings[id];
      await storageSet(area, { [STORAGE_KEYS.tabGroupBindings]: bindings });
    }
    return this.getState();
  }

  /** Revoke synchronously before any queued storage work can finish. */
  markRemoved(groupId: number): void {
    this.removedGroups.add(groupId);
  }

  async releaseGroup(groupId: number): Promise<void> {
    const area = getSessionStorageArea();
    if (!area) return;
    const bindings = await this.readBindings();
    for (const [id, bound] of Object.entries(bindings)) if (bound === groupId) delete bindings[id];
    await storageSet(area, { [STORAGE_KEYS.tabGroupBindings]: bindings });
    this.removedGroups.delete(groupId);
  }

  async clearBindings(): Promise<void> {
    const area = getSessionStorageArea();
    if (area) await storageSet(area, { [STORAGE_KEYS.tabGroupBindings]: {} });
  }

  async rulesForTab(tabId?: number): Promise<TabGroupWhitelistRule[]> {
    if (tabId === undefined) return [];
    const tab = await tabsGet(tabId).catch(() => null);
    if (tab?.groupId === undefined || tab.groupId < 0 || this.removedGroups.has(tab.groupId))
      return [];
    const state = await this.getState();
    if (!state.supported) return [];
    return state.rules.filter((entry) => entry.groupId === tab.groupId).map((entry) => entry.rule);
  }

  async allows(tabId: number | undefined, now: Date): Promise<boolean> {
    return (await this.rulesForTab(tabId)).some((rule) => isTabGroupWhitelistActive(rule, now));
  }

  private async readBindings(): Promise<Record<string, number>> {
    const area: StorageAreaLike | null = getSessionStorageArea();
    if (!area) return {};
    const raw = (await storageGet(area, STORAGE_KEYS.tabGroupBindings))[
      STORAGE_KEYS.tabGroupBindings
    ];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const bindings: Record<string, number> = {};
    for (const [id, groupId] of Object.entries(raw)) {
      if (
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id) &&
        typeof groupId === "number" &&
        Number.isInteger(groupId) &&
        groupId >= 0 &&
        groupId <= 2147483647
      ) {
        bindings[id] = groupId;
        if (Object.keys(bindings).length >= MAX_TAB_GROUP_WHITELIST_RULES) break;
      }
    }
    return bindings;
  }
}
