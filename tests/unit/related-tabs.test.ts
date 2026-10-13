import { describe, expect, it, vi } from "vitest";
import { RelatedTabService } from "../../src/background/related-tabs";
import type { PlanService } from "../../src/background/plan";
import type { SettingsRepository } from "../../src/shared/storage";

describe("related tab closing", () => {
  it("closes only ungrouped Bilibili tabs and preserves the grouped end page", async () => {
    const settings = {
      get: () =>
        Promise.resolve({
          sites: {
            "site:bilibili": {
              origin: "https://www.bilibili.com",
              matchPatterns: ["https://*.bilibili.com/*"]
            }
          }
        })
    } as unknown as SettingsRepository;
    const queryTabs = vi.fn(() => Promise.resolve([{ id: 2 }, { id: 3 }, { id: 4 }, { id: 2 }]));
    const removeTabs = vi.fn(() => Promise.resolve());
    const getTab = vi.fn((id: number) =>
      Promise.resolve({ id, groupId: id === 2 ? -1 : id === 4 ? undefined : 7 })
    );
    const service = new RelatedTabService(
      settings,
      {} as PlanService,
      queryTabs,
      removeTabs,
      getTab
    );

    await expect(service.close({ source: "focus", siteId: "site:bilibili" }, 99)).resolves.toEqual({
      closedCount: 1
    });
    expect(queryTabs).toHaveBeenCalledWith({ url: ["https://*.bilibili.com/*"] });
    expect(removeTabs).toHaveBeenCalledWith([2]);
  });

  it("keeps plan closing scoped to the planned item's exact origin", async () => {
    const queryTabs = vi.fn(() => Promise.resolve([{ id: 7 }]));
    const removeTabs = vi.fn(() => Promise.resolve());
    const plan = {
      getState: () =>
        Promise.resolve({
          queue: {
            items: [{ id: "plan:item", origin: "https://example.com" }]
          }
        })
    } as unknown as PlanService;
    const service = new RelatedTabService({} as SettingsRepository, plan, queryTabs, removeTabs);

    await service.close({ source: "plan", itemId: "plan:item" }, 8);
    expect(queryTabs).toHaveBeenCalledWith({ url: ["https://example.com/*"] });
    expect(removeTabs).toHaveBeenCalledWith([7, 8]);
  });
});
