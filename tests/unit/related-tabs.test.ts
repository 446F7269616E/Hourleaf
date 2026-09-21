import { describe, expect, it, vi } from "vitest";
import { RelatedTabService } from "../../src/background/related-tabs";
import type { PlanService } from "../../src/background/plan";
import type { SettingsRepository } from "../../src/shared/storage";

describe("related tab closing", () => {
  it("closes every Bilibili family tab and the current end page", async () => {
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
    const queryTabs = vi.fn(() => Promise.resolve([{ id: 2 }, { id: 3 }, { id: 2 }]));
    const removeTabs = vi.fn(() => Promise.resolve());
    const service = new RelatedTabService(settings, {} as PlanService, queryTabs, removeTabs);

    await expect(service.close({ source: "focus", siteId: "site:bilibili" }, 99)).resolves.toEqual({
      closedCount: 3
    });
    expect(queryTabs).toHaveBeenCalledWith({ url: ["https://*.bilibili.com/*"] });
    expect(removeTabs).toHaveBeenCalledWith([2, 3, 99]);
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
