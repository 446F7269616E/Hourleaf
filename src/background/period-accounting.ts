import type { AnalyticsService } from "../shared/analytics";
import { resolveGroupQuota } from "../shared/group-quota";
import type { PeriodRuntimeService } from "../shared/period-runtime";
import { selectActiveTimePeriod } from "../shared/schedule";
import type { SettingsRepository } from "../shared/storage";
import type { TrackingTarget } from "./tracker";

/** Owns quota read/cap/write as one serial operation, including schedule changes. */
export class PeriodUsageRecorder {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly settings: SettingsRepository,
    private readonly runtime: PeriodRuntimeService,
    private readonly analytics: AnalyticsService
  ) {}

  record(target: TrackingTarget, start: number, end: number): Promise<void> {
    const write = this.queue.then(() => this.recordSegments(target, start, end));
    this.queue = write.catch(() => undefined);
    return write;
  }

  private async recordSegments(target: TrackingTarget, start: number, end: number): Promise<void> {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const config = await this.settings.get();
    const configuredTarget = config.targets[target.targetId];
    if (!config.enabled || !configuredTarget) return;
    if (target.quotaExempt) {
      await this.analytics.recordInterval(target.targetId, start, end);
      return;
    }
    const mode = config.sites[configuredTarget.siteId]?.restrictionMode;
    // Schedules have minute precision. Resolve each segment at its own time,
    // including a fresh runtime and daily quota after local midnight.
    let cursor = Math.round(start);
    const endMs = Math.round(end);
    while (cursor < endMs) {
      const at = new Date(cursor);
      const nextMinute = cursor + 60_000 - at.getSeconds() * 1000 - at.getMilliseconds();
      const segmentEnd = Math.min(endMs, nextMinute);
      const period = selectActiveTimePeriod(configuredTarget, at);
      if (period?.behavior === "always-allow") {
        await this.analytics.recordInterval(target.targetId, cursor, segmentEnd);
      } else if (period?.behavior === "timed") {
        const entry = await this.runtime.getEntry(target.targetId, period.id, at);
        const flowActive =
          mode === "flow" &&
          (entry.flowStartedAt === undefined || entry.flowStartedAt <= cursor) &&
          (entry.flowContinuationKind === "video-end" ||
            (entry.flowContinuationKind === "minutes" && (entry.flowExpiresAt ?? 0) > cursor));
        if (flowActive) {
          const cutoff =
            entry.flowContinuationKind === "minutes"
              ? Math.min(segmentEnd, entry.flowExpiresAt ?? segmentEnd)
              : segmentEnd;
          await this.analytics.recordInterval(
            target.targetId,
            cursor,
            cutoff,
            entry.flowConsumesQuota ? period.id : undefined,
            period.id,
            !entry.flowConsumesQuota,
            entry.unlockedGroups
          );
        } else {
          let cutoff = segmentEnd;
          if (period.limitMinutes !== null && !(mode === "lenient" && entry.lenientAcknowledged)) {
            const usage = await this.analytics.summarize("day", at);
            const quota = resolveGroupQuota(
              period,
              usage.byPeriod[period.id] ?? 0,
              entry.unlockedGroups
            );
            cutoff = Math.min(cutoff, cursor + quota.availableMs);
          }
          await this.analytics.recordInterval(target.targetId, cursor, cutoff, period.id);
        }
      }
      cursor = segmentEnd;
    }
  }
}
