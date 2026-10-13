import { tabsGet, tabsQuery, tabsRemove, type ExtensionTab } from "../shared/browser";
import { siteMatchPatterns } from "../shared/site-scope";
import { SettingsRepository } from "../shared/storage";
import { PlanService } from "./plan";

export type RelatedTabContext =
  { source: "focus"; siteId: string } | { source: "plan"; itemId: string };

type QueryTabs = (queryInfo: Record<string, unknown>) => Promise<ExtensionTab[]>;
type RemoveTabs = (tabIds: number | number[]) => Promise<void>;
type GetTab = (tabId: number) => Promise<ExtensionTab | null>;

/** Ordinary website expiry never owns tabs inside any browser tab group. */
export class RelatedTabService {
  constructor(
    private readonly settings = new SettingsRepository(),
    private readonly plan = new PlanService(settings),
    private readonly queryTabs: QueryTabs = tabsQuery,
    private readonly removeTabs: RemoveTabs = tabsRemove,
    private readonly getTab: GetTab = tabsGet
  ) {}

  async close(context: RelatedTabContext, senderTabId: number): Promise<{ closedCount: number }> {
    const patterns = await this.resolvePatterns(context);
    const relatedTabs =
      patterns.length > 0 ? await this.queryTabs({ url: patterns }).catch(() => []) : [];
    const candidates = [
      ...new Set([
        ...relatedTabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])),
        senderTabId
      ])
    ];
    const tabIds =
      context.source === "focus"
        ? (await Promise.all(candidates.map((id) => this.getTab(id).catch(() => null)))).flatMap(
            (tab) =>
              tab?.id !== undefined && typeof tab.groupId === "number" && tab.groupId < 0
                ? [tab.id]
                : []
          )
        : candidates;
    // Re-read even the originating pause-page tab: it may itself be grouped,
    // or a user may move a matching tab into a group while the query runs.
    if (tabIds.length > 0) await this.removeTabs(tabIds);
    return { closedCount: tabIds.length };
  }

  private async resolvePatterns(context: RelatedTabContext): Promise<string[]> {
    if (context.source === "focus") {
      const site = (await this.settings.get()).sites[context.siteId];
      return site ? siteMatchPatterns(site) : [];
    }
    const item = (await this.plan.getState()).queue.items.find(
      (candidate) => candidate.id === context.itemId
    );
    return item ? [`${item.origin}/*`] : [];
  }
}
