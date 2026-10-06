import { resolveGroupQuota } from "./group-quota";
import { selectActiveTimePeriod } from "./schedule";
import { AnalyticsService, formatLocalDate } from "./analytics";
import { PeriodRuntimeRepository, SettingsRepository } from "./storage";
import type {
  FocusSettings,
  PeriodRuntimeEntry,
  PeriodRuntimeStatus,
  SiteTargetSettings,
  TimePeriodSettings
} from "./types";

import {
  createMathChallenge,
  randomSeed,
  verifyUnlock,
  extraUsageKey,
  freeUsageKey
} from "./unlock-challenge";

const RUNTIME_RETENTION_DAYS = 35;
const FLOW_EXTENSION_MAX_MINUTES = 15;

export type PeriodFlowContinuation = { kind: "minutes"; minutes: number } | { kind: "video-end" };

export class PeriodRuntimeService {
  constructor(
    private readonly settingsRepository = new SettingsRepository(),
    private readonly repository = new PeriodRuntimeRepository(),
    private readonly analytics = new AnalyticsService(),
    private readonly now: () => number = Date.now
  ) {}

  /** Settings edits retain actual usage but invalidate incompatible grants. */
  async reconcileSettings(before: FocusSettings, after: FocusSettings): Promise<void> {
    await this.repository.update((store) => {
      for (const [key, entry] of Object.entries(store.entries)) {
        const oldTarget = before.targets[entry.targetId];
        const target = after.targets[entry.targetId];
        const oldPeriod = oldTarget?.timePeriods.find((period) => period.id === entry.periodId);
        const period = target?.timePeriods.find((candidate) => candidate.id === entry.periodId);
        if (!oldPeriod || !period || periodPolicy(oldPeriod) !== periodPolicy(period)) {
          delete store.entries[key];
          continue;
        }
        if (
          before.sites[oldTarget!.siteId]?.restrictionMode !==
          after.sites[target!.siteId]?.restrictionMode
        ) {
          delete entry.flowContinuationKind;
          delete entry.flowExpiresAt;
          delete entry.flowStartedAt;
          delete entry.flowGrantId;
          delete entry.flowConsumesQuota;
          delete entry.lenientAcknowledged;
          delete entry.waitStartedAt;
        }
        if (
          JSON.stringify(before.endPage.groupUnlock) !== JSON.stringify(after.endPage.groupUnlock)
        ) {
          delete entry.waitStartedAt;
          entry.mathSeed = randomSeed();
        }
      }
    });
  }

  async getEntry(
    targetId: string,
    periodId: string,
    at = new Date(this.now())
  ): Promise<PeriodRuntimeEntry> {
    const date = formatLocalDate(at);
    const store = await this.repository.get();
    return (
      store.entries[runtimeKey(date, targetId, periodId)] ?? createEntry(date, targetId, periodId)
    );
  }

  async getStatus(targetId: string, periodId: string): Promise<PeriodRuntimeStatus> {
    const now = new Date(this.now());
    if ((await this.getEntry(targetId, periodId, now)).mathSeed === undefined)
      await this.repository.update((store) => {
        const key = runtimeKey(formatLocalDate(now), targetId, periodId);
        const entry = store.entries[key] ?? createEntry(formatLocalDate(now), targetId, periodId);
        pruneRuntime(store.entries, now);
        entry.mathSeed ??= randomSeed();
        store.entries[key] = entry;
      });
    const [settings, entry, usage] = await Promise.all([
      this.settingsRepository.get(),
      this.getEntry(targetId, periodId, now),
      this.analytics.summarize("day", now)
    ]);
    const { target, period } = requirePeriod(settings, targetId, periodId);
    const method = settings.endPage.groupUnlock.method;
    const usedSeconds = usage.byPeriod[period.id] ?? 0;
    const quota = resolveGroupQuota(period, usedSeconds, entry.unlockedGroups);
    const { groupCount, availableGroups: unlockedGroups, usedGroups } = quota;
    const active = settings.enabled && selectActiveTimePeriod(target, now)?.id === period.id;
    const activeFlow =
      entry.flowContinuationKind === "video-end" ||
      (entry.flowContinuationKind === "minutes" && (entry.flowExpiresAt ?? 0) > now.getTime());
    const canUnlock =
      active &&
      !activeFlow &&
      !quota.exhausted &&
      period.behavior === "timed" &&
      period.limitMinutes !== null &&
      unlockedGroups < groupCount &&
      quota.atGroupBoundary;
    const waitEndsAt = entry.waitStartedAt
      ? entry.waitStartedAt + settings.endPage.groupUnlock.waitSeconds * 1_000
      : undefined;
    return {
      date: entry.date,
      targetId: target.id,
      periodId: period.id,
      method,
      usedSeconds: Math.max(0, usedSeconds) + (usage.byPeriod[freeUsageKey(period.id)] ?? 0),
      extraSeconds: usage.byPeriod[extraUsageKey(period.id)] ?? 0,
      remainingSeconds: quota.remainingMs === null ? null : quota.remainingMs / 1000,
      remainingGroups: quota.remainingGroups,
      canFlow:
        active &&
        !activeFlow &&
        settings.sites[target.siteId]?.restrictionMode === "flow" &&
        period.behavior === "timed" &&
        quota.atGroupBoundary &&
        !entry.flowUsed,
      canContinueLenient:
        active &&
        settings.sites[target.siteId]?.restrictionMode === "lenient" &&
        period.behavior === "timed" &&
        quota.exhausted &&
        !entry.lenientAcknowledged,
      usedGroups,
      unlockedGroups,
      groupCount,
      canUnlock,
      ...(entry.waitStartedAt ? { waitStartedAt: entry.waitStartedAt } : {}),
      ...(waitEndsAt ? { waitEndsAt } : {}),
      ...(method === "math"
        ? {
            mathChallenge: {
              prompt: createMathChallenge(
                entry.mathSeed ?? 0,
                settings.endPage.groupUnlock.mathDifficulty
              ).prompt
            }
          }
        : {}),
      ...(method === "password"
        ? { passwordConfigured: settings.endPage.groupUnlock.passwordVerifier.length === 64 }
        : {})
    };
  }

  async startWait(targetId: string, periodId: string): Promise<PeriodRuntimeStatus> {
    const settings = await this.settingsRepository.get();
    requirePeriod(settings, targetId, periodId);
    if (settings.endPage.groupUnlock.method !== "wait") {
      throw new Error("The selected group unlock method does not require waiting");
    }
    // Waiting is part of a real group transition, not a pre-authorisation for a
    // later one. Without this guard, any extension page could start a wait
    // before the current group had actually been exhausted.
    const status = await this.getStatus(targetId, periodId);
    if (!status.canUnlock) {
      throw new Error("The next usage group is not ready to unlock");
    }
    const now = new Date(this.now());
    const date = formatLocalDate(now);
    if (date !== status.date) throw new Error("The day changed; refresh the usage group");
    await this.repository.update((store) => {
      pruneRuntime(store.entries, now);
      const key = runtimeKey(date, targetId, periodId);
      const entry = store.entries[key] ?? createEntry(date, targetId, periodId);
      if (
        entry.unlockedGroups !== status.unlockedGroups ||
        entry.flowContinuationKind === "video-end" ||
        (entry.flowExpiresAt ?? 0) > now.getTime()
      )
        throw new Error("The group changed while waiting");
      entry.waitStartedAt ??= now.getTime();
      store.entries[key] = entry;
    });
    return this.getStatus(targetId, periodId);
  }

  async unlock(targetId: string, periodId: string, proof?: string): Promise<PeriodRuntimeStatus> {
    const nowMs = this.now();
    const now = new Date(nowMs);
    const [settings, status] = await Promise.all([
      this.settingsRepository.get(),
      this.getStatus(targetId, periodId)
    ]);
    if (!status.canUnlock) throw new Error("The next usage group is not ready to unlock");
    const current = await this.getEntry(targetId, periodId, now);
    verifyUnlock(settings, current.mathSeed ?? 0, status.waitStartedAt ?? nowMs, proof, nowMs);
    const date = formatLocalDate(now);
    if (date !== status.date) throw new Error("The day changed; refresh the usage group");
    await this.repository.update((store) => {
      const key = runtimeKey(date, targetId, periodId);
      const entry = store.entries[key] ?? createEntry(date, targetId, periodId);
      const currentUnlockedGroups = Math.min(status.groupCount, Math.max(1, entry.unlockedGroups));
      if (
        currentUnlockedGroups !== status.unlockedGroups ||
        entry.mathSeed !== current.mathSeed ||
        entry.waitStartedAt !== current.waitStartedAt ||
        entry.flowContinuationKind === "video-end" ||
        (entry.flowExpiresAt ?? 0) > nowMs
      ) {
        throw new Error("The usage group changed; refresh before unlocking again");
      }
      entry.unlockedGroups = Math.min(
        status.groupCount,
        Math.max(entry.unlockedGroups + 1, status.usedGroups + 1)
      );
      delete entry.waitStartedAt;
      delete entry.flowUsed;
      delete entry.flowContinuationKind;
      delete entry.flowExpiresAt;
      delete entry.flowStartedAt;
      delete entry.flowGrantId;
      delete entry.flowConsumesQuota;
      entry.mathSeed = randomSeed();
      store.entries[key] = entry;
      pruneRuntime(store.entries, now);
    });
    return this.getStatus(targetId, periodId);
  }

  async grantFlow(
    targetId: string,
    periodId: string,
    continuation: PeriodFlowContinuation
  ): Promise<PeriodRuntimeEntry> {
    const nowMs = this.now();
    const now = new Date(nowMs);
    const settings = await this.settingsRepository.get();
    const { target, period } = requirePeriod(settings, targetId, periodId);
    const site = settings.sites[target.siteId];
    if (site?.restrictionMode !== "flow" || period.behavior !== "timed" || !period.limitMinutes) {
      throw new Error("This period is not waiting for a flow decision");
    }
    if (
      continuation.kind === "minutes" &&
      (!Number.isInteger(continuation.minutes) ||
        continuation.minutes < 1 ||
        continuation.minutes > FLOW_EXTENSION_MAX_MINUTES)
    ) {
      throw new Error("Flow extension must be between 1 and 15 minutes");
    }
    if (!(await this.getStatus(targetId, periodId)).canFlow)
      throw new Error("No flow continuation available");
    const usage = await this.analytics.summarize("day", now);
    const runtime = await this.getEntry(targetId, periodId, now);
    if (
      !resolveGroupQuota(period, usage.byPeriod[period.id] ?? 0, runtime.unlockedGroups)
        .atGroupBoundary
    ) {
      throw new Error("The period allowance has not ended");
    }
    const date = formatLocalDate(now);
    let next = createEntry(date, target.id, period.id);
    await this.repository.update((store) => {
      const key = runtimeKey(date, target.id, period.id);
      const entry = store.entries[key] ?? createEntry(date, target.id, period.id);
      if (entry.unlockedGroups !== runtime.unlockedGroups)
        throw new Error("The group changed before extending");
      if (entry.flowUsed) throw new Error("The flow continuation has already been used");
      delete entry.waitStartedAt;
      entry.flowUsed = true;
      entry.flowGrantId = crypto.randomUUID();
      entry.flowStartedAt = nowMs;
      entry.flowConsumesQuota = settings.endPage.flowConsumesNextGroup;
      entry.flowContinuationKind = continuation.kind;
      if (continuation.kind === "minutes") {
        entry.flowExpiresAt = nowMs + continuation.minutes * 60_000;
      } else {
        // Video continuations end only when the content script reports that the
        // selected video ended. They are not a disguised 15-minute extension.
        delete entry.flowExpiresAt;
      }
      store.entries[key] = entry;
      next = { ...entry };
      pruneRuntime(store.entries, now);
    });
    return next;
  }

  async acknowledgeLenient(targetId: string, periodId: string): Promise<void> {
    const status = await this.getStatus(targetId, periodId);
    if (!status.canContinueLenient) throw new Error("No lenient transition available");
    await this.repository.update((store) => {
      const entry = store.entries[runtimeKey(status.date, targetId, periodId)];
      if (entry) entry.lenientAcknowledged = true;
    });
  }

  async revokeFlow(
    targetId: string,
    periodId: string,
    grantId?: string
  ): Promise<PeriodRuntimeEntry> {
    const now = new Date(this.now());
    const date = formatLocalDate(now);
    let next = createEntry(date, targetId, periodId);
    await this.repository.update((store) => {
      const key = runtimeKey(date, targetId, periodId);
      const entry = store.entries[key] ?? createEntry(date, targetId, periodId);
      // Duplicate/stale video events must never alter the next group's grant.
      if (
        !entry.flowContinuationKind ||
        (grantId !== undefined &&
          (entry.flowGrantId ?? `${entry.date}-${entry.unlockedGroups}`) !== grantId)
      ) {
        next = { ...entry };
        return;
      }
      entry.flowUsed = true;
      entry.flowExpiresAt = this.now();
      delete entry.flowContinuationKind;
      store.entries[key] = entry;
      next = { ...entry };
    });
    return next;
  }
}

function requirePeriod(
  settings: FocusSettings,
  targetId: string,
  periodId: string
): { target: SiteTargetSettings; period: TimePeriodSettings } {
  const target = settings.targets[targetId];
  const period = target?.timePeriods.find((candidate) => candidate.id === periodId);
  if (!target || !period) throw new Error("The configured time period no longer exists");
  return { target, period };
}

function runtimeKey(date: string, targetId: string, periodId: string): string {
  return `${date}|${targetId}|${periodId}`;
}

function createEntry(date: string, targetId: string, periodId: string): PeriodRuntimeEntry {
  return { date, targetId, periodId, unlockedGroups: 1 };
}

function pruneRuntime(entries: Record<string, PeriodRuntimeEntry>, now: Date): void {
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - RUNTIME_RETENTION_DAYS
  );
  const cutoffKey = formatLocalDate(cutoff);
  for (const [key, entry] of Object.entries(entries)) {
    if (entry.date < cutoffKey) delete entries[key];
  }
}

function periodPolicy(period: TimePeriodSettings): string {
  return JSON.stringify([
    period.enabled,
    [...period.days].sort(),
    period.startTime,
    period.endTime,
    period.behavior,
    period.limitMinutes,
    period.groupCount
  ]);
}
