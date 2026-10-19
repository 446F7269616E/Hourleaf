import { tabGroupsQuery, tabsGet, tabsQuery, windowExists } from "../shared/browser";
import type { SettingsRepository } from "../shared/storage";
import {
  isTabGroupWhitelistActive,
  MAX_TAB_GROUP_WHITELIST_RULES,
  type TabGroupWhitelistRule,
  type TabGroupWhitelistState
} from "../shared/tab-group-whitelist";
import { TabGroupBindingStore } from "./tab-group-bindings";

/** Live IDs are session-scoped; closed-window recovery records stay local. */
export class TabGroupWhitelistService {
  private readonly removedGroups = new Set<number>();
  private readonly closingWindows = new Set<number>();
  private readonly bindings = new TabGroupBindingStore();

  constructor(private readonly settings: SettingsRepository) {}

  async getState(): Promise<TabGroupWhitelistState> {
    const [config, groups] = await Promise.all([
      this.settings.get(),
      tabGroupsQuery().catch(() => null)
    ]);
    const { bindings, retained } =
      groups === null || config.tabGroupWhitelist.length === 0
        ? { bindings: new Map<string, number>(), retained: new Set<string>() }
        : await this.bindings.resolve(
            groups,
            this.removedGroups,
            this.closingWindows,
            new Set(config.tabGroupWhitelist.map((rule) => rule.id))
          );
    const live = new Set(
      groups
        ?.filter((group) => !this.closingWindows.has(group.windowId))
        .map((group) => group.id) ?? []
    );
    return {
      supported: groups !== null,
      groups: (groups ?? []).map((group) => ({
        id: group.id,
        title: group.title ?? "",
        windowId: group.windowId
      })),
      rules: config.tabGroupWhitelist.map((rule) => {
        const groupId = bindings.get(rule.id);
        return {
          rule,
          groupId:
            groupId !== undefined && live.has(groupId) && !this.removedGroups.has(groupId)
              ? groupId
              : null,
          bindingStatus:
            groupId !== undefined && live.has(groupId) && !this.removedGroups.has(groupId)
              ? "bound"
              : retained.has(rule.id)
                ? "waiting"
                : "unbound"
        };
      })
    };
  }

  async save(rule: TabGroupWhitelistRule, groupId?: number): Promise<TabGroupWhitelistState> {
    await this.getState();
    if (groupId !== undefined) {
      const groups = await tabGroupsQuery();
      if (!groups?.some((group) => group.id === groupId))
        throw new Error("The tab group is no longer available; refresh and select it again");
      // Across local/session storage, a failed rebind must leave the rule dormant
      // rather than apply its new hours to the previously selected group.
      await this.bindings.remove(rule.id);
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
    if (groupId !== undefined) {
      // Removal can arrive while the settings write is pending. Never revive
      // that binding; a later explicit selection must validate a live group.
      const groups = await tabGroupsQuery();
      const group = groups?.find((entry) => entry.id === groupId);
      if (this.removedGroups.has(groupId) || !group || this.closingWindows.has(group.windowId))
        throw new Error("The tab group is no longer available; refresh and select it again");
      await this.bindings.bind(rule.id, group);
      if (this.removedGroups.has(groupId) || this.closingWindows.has(group.windowId)) {
        await this.bindings.remove(rule.id);
        throw new Error("The tab group closed while saving; select it again");
      }
    }
    return this.getState();
  }

  async remove(id: string): Promise<TabGroupWhitelistState> {
    await this.getState();
    await this.bindings.remove(id);
    await this.settings.mutate((config) => {
      config.tabGroupWhitelist = config.tabGroupWhitelist.filter((rule) => rule.id !== id);
    });
    return this.getState();
  }

  /** Revoke synchronously before any queued storage work can finish. */
  markRemoved(groupId: number): void {
    this.removedGroups.add(groupId);
  }

  markWindowClosing(windowId: number): void {
    this.closingWindows.add(windowId);
  }

  async releaseGroup(groupId: number, windowId: number): Promise<void> {
    const retain = this.closingWindows.has(windowId) || (await windowExists(windowId)) !== true;
    await this.bindings.release(groupId, retain);
    this.removedGroups.delete(groupId);
  }

  async clearBindings(): Promise<void> {
    await this.bindings.clear();
  }

  async rulesForTab(tabId?: number): Promise<TabGroupWhitelistRule[]> {
    if (tabId === undefined) return [];
    const state = await this.getState();
    if (!state.supported) return [];
    // Binding recovery can await several browser/storage operations. Read the
    // tab afterwards so a move between two configured groups uses its new group.
    const tab = await tabsGet(tabId).catch(() => null);
    if (!tab) return [];
    let groupId = tab.groupId;
    if (groupId === undefined) {
      // Some adapters omit membership on get(). Ask the browser for members of
      // every bound group; neither the selected configuration nor its order is
      // evidence that this tab belongs to that group.
      const candidates = [
        ...new Set(state.rules.flatMap((entry) => (entry.groupId === null ? [] : [entry.groupId])))
      ];
      const matches = await Promise.all(
        candidates.map(async (id) => {
          const members = await tabsQuery({ groupId: id }).catch(() => []);
          return members.some(
            (member) =>
              member.id === tabId && (member.groupId === undefined || member.groupId === id)
          )
            ? id
            : undefined;
        })
      );
      const memberships = matches.filter((id): id is number => id !== undefined);
      if (memberships.length !== 1) return [];
      groupId = memberships[0];
    }
    if (groupId === undefined || groupId < 0 || this.removedGroups.has(groupId)) return [];
    const group = state.groups.find((entry) => entry.id === groupId);
    if (!group || this.closingWindows.has(group.windowId)) return [];
    return state.rules.filter((entry) => entry.groupId === groupId).map((entry) => entry.rule);
  }

  async allows(tabId: number | undefined, now: Date): Promise<boolean> {
    return (await this.rulesForTab(tabId)).some((rule) => isTabGroupWhitelistActive(rule, now));
  }
}
