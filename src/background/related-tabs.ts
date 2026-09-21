import { tabsQuery, tabsRemove, type ExtensionTab } from "../shared/browser";
import { siteMatchPatterns } from "../shared/site-scope";
import { SettingsRepository } from "../shared/storage";
import { PlanService } from "./plan";

export type RelatedTabContext =
  { source: "focus"; siteId: string } | { source: "plan"; itemId: string };

type QueryTabs = (queryInfo: Record<string, unknown>) => Promise<ExtensionTab[]>;
type RemoveTabs = (tabIds: number | number[]) => Promise<void>;

/** Resolves a trusted stored scope and closes it together with the current end-page tab. */
export class RelatedTabService {
  constructor(
    private readonly settings = new SettingsRepository(),
    private readonly plan = new PlanService(settings),
    private readonly queryTabs: QueryTabs = tabsQuery,
    private readonly removeTabs: RemoveTabs = tabsRemove
  ) {}

  async close(context: RelatedTabContext, senderTabId: number): Promise<{ closedCount: number }> {
    const patterns = await this.resolvePatterns(context);
    const relatedTabs =
      patterns.length > 0 ? await this.queryTabs({ url: patterns }).catch(() => []) : [];
    const tabIds = [
      ...new Set([
        ...relatedTabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])),
        senderTabId
      ])
    ];
    await this.removeTabs(tabIds);
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
