import { resolveGroupQuota } from "../shared/group-quota";
import { DEBUG_BUILD } from "./flags";
import { getLocalStorageArea, storageRemove, runtimeGetURL } from "../shared/browser";
import { selectActiveTimePeriod } from "../shared/schedule";
import type { AnyRequest } from "../shared/messages";
import type { ManagedSiteService } from "../core/sites";
import type { SettingsRepository } from "../shared/storage";
import type { UsageTracker } from "../background/tracker";
import type { AnalyticsService } from "../shared/analytics";
import type { PeriodRuntimeService } from "../shared/period-runtime";

export async function handleDebugAction(
  message: Extract<AnyRequest, { type: "DEBUG_ACTION" }>,
  services: {
    ready: Promise<void>;
    managedSites: ManagedSiteService;
    settings: SettingsRepository;
    tracker: UsageTracker;
    analytics: AnalyticsService;
    periodRuntime: PeriodRuntimeService;
    refreshBadges(): Promise<void>;
  }
): Promise<{ url?: string }> {
  const { managedSites, settings, tracker, analytics, periodRuntime } = services;
  if (!DEBUG_BUILD) throw new Error("Debug tools are unavailable in release builds");
  await services.ready;
  if (message.action === "setup") {
    await storageRemove(getLocalStorageArea(), "hourleaf.debug-seed-disabled");
    for (const url of ["https://example.com", "http://localhost:4173"]) {
      await managedSites.addAuthorized(
        url,
        url.includes("localhost") ? "Hourleaf 本地视频测试" : "Example 测试网站"
      );
    }
    const current = await settings.get();
    for (const site of Object.values(current.sites).filter((site) =>
      ["https://example.com", "http://localhost:4173"].includes(site.origin)
    )) {
      for (const id of site.targetIds)
        await settings.mutate((config) => {
          const target = config.targets[id];
          if (target)
            target.timePeriods = [
              {
                id: `debug-${crypto.randomUUID()}`,
                name: "Debug · 3 × 1 min",
                enabled: true,
                days: [0, 1, 2, 3, 4, 5, 6],
                startTime: "00:00",
                endTime: "00:00",
                behavior: "timed",
                limitMinutes: 3,
                groupCount: 3
              }
            ];
          if (config.sites[site.id]) config.sites[site.id]!.restrictionMode = "flow";
        });
    }
    return { url: "http://localhost:4173" };
  }
  const currentUrl =
    message.url ?? (message.action === "preview" ? "https://example.com" : undefined);
  if (!currentUrl) throw new Error("Open a configured test website first");
  const resolved = await managedSites.resolve(currentUrl);
  if (!resolved) throw new Error("This website is not configured");
  const period = selectActiveTimePeriod(resolved.target, new Date());
  if (message.action === "preview") {
    const query = new URLSearchParams({
      source: "focus",
      siteId: resolved.site.id,
      targetId: resolved.target.id,
      reason: "preview",
      returnUrl: currentUrl,
      ...(period ? { periodId: period.id } : {})
    });
    return { url: `${runtimeGetURL("end.html")}#${query}` };
  }
  if (!period || !period.limitMinutes || period.behavior !== "timed")
    throw new Error("Configure a finite timed period first");
  await tracker.resetSessions();
  const runtime = await periodRuntime.getEntry(resolved.target.id, period.id);
  {
    const usage = await analytics.summarize("day");
    const quota = resolveGroupQuota(period, usage.byPeriod[period.id] ?? 0, runtime.unlockedGroups);
    const missing =
      (message.action === "consume-period" ? (quota.remainingMs ?? 0) : quota.availableMs) / 1000;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    await analytics.recordInterval(
      resolved.target.id,
      now.getTime(),
      now.getTime() + missing * 1000,
      period.id
    );
  }
  const params = new URLSearchParams({
    source: "focus",
    siteId: resolved.site.id,
    targetId: resolved.target.id,
    periodId: period.id,
    reason: "group-boundary",
    returnUrl: currentUrl
  });
  await services.refreshBadges();
  return { url: `${runtimeGetURL("end.html")}#${params}` };
}
