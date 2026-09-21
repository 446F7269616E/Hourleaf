import { describe, expect, it, vi } from "vitest";
import type { AnalyticsService } from "../../src/shared/analytics";
import { UsageTracker } from "../../src/background/tracker";

describe("usage tracker", () => {
  it("counts a visible active session once and stops while hidden", async () => {
    let now = 0;
    const recordInterval = vi.fn(() => Promise.resolve());
    const tracker = new UsageTracker(
      { recordInterval } as unknown as AnalyticsService,
      () => now,
      null,
      () => true,
      () => ({ targetId: "target:test", activePeriodId: "period:focus" })
    );
    const tab = {
      id: 7,
      active: true,
      windowId: 1,
      url: "https://example.com/focus"
    };

    await expect(
      tracker.handleSessionUpdate(tab, "start", "session-123", tab.url, "visible")
    ).resolves.toBe(true);
    now = 15_000;
    await tracker.flush();
    await tracker.flush();
    expect(recordInterval).toHaveBeenCalledTimes(1);
    expect(recordInterval).toHaveBeenCalledWith("target:test", 0, 15_000, "period:focus");

    now = 20_000;
    await tracker.handleSessionUpdate(tab, "heartbeat", "session-123", tab.url, "hidden");
    now = 35_000;
    await tracker.flush();
    expect(recordInterval).toHaveBeenCalledTimes(2);
    expect(recordInterval).toHaveBeenLastCalledWith("target:test", 15_000, 20_000, "period:focus");
  });

  it("rejects stale events from a replaced session", async () => {
    const tracker = new UsageTracker(
      { recordInterval: vi.fn(() => Promise.resolve()) } as unknown as AnalyticsService,
      () => 0,
      null
    );
    const tab = { id: 1, active: true, url: "https://example.com/" };
    await tracker.handleSessionUpdate(tab, "start", "session-new", tab.url, "visible");
    await expect(
      tracker.handleSessionUpdate(tab, "stop", "session-old", tab.url, "hidden")
    ).resolves.toBe(false);
  });

  it("does not count an interval rejected by the plan/focus eligibility gate", async () => {
    let now = 0;
    const recordInterval = vi.fn(() => Promise.resolve());
    const tracker = new UsageTracker(
      { recordInterval } as unknown as AnalyticsService,
      () => now,
      null,
      () => false,
      () => ({ targetId: "target:test" })
    );
    const tab = {
      id: 9,
      active: true,
      windowId: 1,
      url: "https://example.com/focus"
    };
    await tracker.handleSessionUpdate(tab, "start", "session-plan", tab.url, "visible");
    now = 15_000;
    await tracker.flush();
    expect(recordInterval).not.toHaveBeenCalled();
  });

  it("persists the elapsed interval before acknowledging a heartbeat", async () => {
    let now = 0;
    let persisted = false;
    const tracker = new UsageTracker(
      {
        recordInterval: vi.fn(async () => {
          await Promise.resolve();
          persisted = true;
        })
      } as unknown as AnalyticsService,
      () => now,
      null,
      () => true,
      () => ({ targetId: "target:test", activePeriodId: "period:focus" })
    );
    const tab = { id: 10, active: true, windowId: 1, url: "https://example.com/focus" };

    await tracker.handleSessionUpdate(tab, "start", "session-live", tab.url, "visible");
    now = 15_000;
    await tracker.handleSessionUpdate(tab, "heartbeat", "session-live", tab.url, "visible");

    expect(persisted).toBe(true);
  });

  it("keeps the final plan-owned interval out of configured usage after the grant ends", async () => {
    let now = 0;
    const recordInterval = vi.fn(() => Promise.resolve());
    const tracker = new UsageTracker(
      { recordInterval } as unknown as AnalyticsService,
      () => now,
      null,
      () => true,
      () => ({ targetId: "target:test", activePeriodId: "period:focus" })
    );
    const tab = { id: 11, active: true, windowId: 1, url: "https://example.com/focus" };

    await tracker.handleSessionUpdate(
      tab,
      "start",
      "session-isolated",
      tab.url,
      "visible",
      "target:test",
      true
    );
    now = 15_000;
    await tracker.flush();
    now = 20_000;
    await tracker.handleSessionUpdate(
      tab,
      "stop",
      "session-isolated",
      tab.url,
      "hidden",
      "target:test",
      false
    );

    expect(recordInterval).not.toHaveBeenCalled();
  });

  it("flushes and clears a running session before configuration replacement", async () => {
    let now = 0;
    const recordInterval = vi.fn(() => Promise.resolve());
    const tracker = new UsageTracker(
      { recordInterval } as unknown as AnalyticsService,
      () => now,
      null,
      () => true,
      () => ({ targetId: "target:old", activePeriodId: "period:old" })
    );
    const tab = { id: 12, active: true, windowId: 1, url: "https://example.com/" };
    await tracker.handleSessionUpdate(
      tab,
      "start",
      "session-before-import",
      tab.url,
      "visible",
      "target:old"
    );
    now = 10_000;
    await tracker.resetSessions();
    now = 20_000;
    await tracker.flush();

    expect(recordInterval).toHaveBeenCalledTimes(1);
    expect(recordInterval).toHaveBeenCalledWith("target:old", 0, 10_000, "period:old");
  });
});
