import { resolveGroupQuota } from "./group-quota";
import type {
  FocusSettings,
  PageDecision,
  PlanNavigationDecision,
  SiteTargetSettings,
  TimePeriodSettings,
  UsageSummary
} from "./types";
import { isIndependentPlanAccess } from "./plan";

export interface ToolbarBadgeRuntime {
  nowMs?: number;
  planDecision?: PlanNavigationDecision | null;
}

export interface TargetAllowanceSummary {
  activePeriod: TimePeriodSettings | null;
  usedTodaySeconds: number;
  allowanceUsedSeconds: number;
  limitSeconds: number | null;
  remainingSeconds: number | null;
}

/**
 * The aggregate of all finite timed allowances owned by one target for the
 * current local day. This deliberately remains separate from the active
 * allowance: a target may own several independently metered time periods.
 */
export interface TargetDailyAllowanceSummary {
  limitSeconds: number | null;
  usedSeconds: number;
  remainingSeconds: number | null;
}

/** Presentation-ready quota details for a grouped active time period. */
export interface GroupedTargetAllowanceSummary extends TargetAllowanceSummary {
  groupCount: number;
  currentGroup: number;
  currentGroupRemainingSeconds: number | null;
  dailyRemainingSeconds: number | null;
}

/**
 * Resolves the active allowance from canonical period usage. The deprecated
 * target-level daily limit is deliberately ignored so popup and toolbar badge
 * always match enforcement when a site owns multiple periods.
 */
export function resolveTargetAllowance(
  target: SiteTargetSettings,
  usage: UsageSummary,
  activePeriodId?: string
): TargetAllowanceSummary {
  const activePeriod = activePeriodId
    ? (target.timePeriods.find((period) => period.id === activePeriodId) ?? null)
    : null;
  const usedTodaySeconds = sanitizeSeconds(usage.byTarget[target.id]);
  const allowanceUsedSeconds = activePeriod ? sanitizeSeconds(usage.byPeriod[activePeriod.id]) : 0;
  const limitSeconds =
    activePeriod?.behavior === "timed" && activePeriod.limitMinutes !== null
      ? activePeriod.limitMinutes * 60
      : null;
  return {
    activePeriod,
    usedTodaySeconds,
    allowanceUsedSeconds,
    limitSeconds,
    remainingSeconds:
      limitSeconds === null ? null : Math.max(0, limitSeconds - allowanceUsedSeconds)
  };
}

/**
 * Returns the remaining aggregate quota for all finite periods of a target.
 * Each period's own usage bucket is used so overlapping/future periods never
 * borrow from the currently active period.
 */
export function resolveTargetDailyAllowance(
  target: SiteTargetSettings,
  usage: UsageSummary
): TargetDailyAllowanceSummary {
  const timedPeriods = target.timePeriods.filter(
    (period) => period.behavior === "timed" && period.limitMinutes !== null
  );
  if (timedPeriods.length === 0) {
    return { limitSeconds: null, usedSeconds: 0, remainingSeconds: null };
  }
  const limitSeconds = timedPeriods.reduce(
    (total, period) => total + (period.limitMinutes ?? 0) * 60,
    0
  );
  const usedSeconds = timedPeriods.reduce(
    (total, period) => total + sanitizeSeconds(usage.byPeriod[period.id]),
    0
  );
  return {
    limitSeconds,
    usedSeconds,
    remainingSeconds: Math.max(0, limitSeconds - usedSeconds)
  };
}

/**
 * Resolves a current group without reading mutable runtime state. Callers may
 * pass the authoritative decision group when a boundary is waiting to be
 * unlocked; otherwise the currently consumed group is inferred from usage.
 */
export function resolveGroupedTargetAllowance(
  target: SiteTargetSettings,
  usage: UsageSummary,
  activePeriodId?: string,
  decisionGroupIndex?: number
): GroupedTargetAllowanceSummary | null {
  const allowance = resolveTargetAllowance(target, usage, activePeriodId);
  const period = allowance.activePeriod;
  if (
    !period ||
    period.behavior !== "timed" ||
    period.limitMinutes === null ||
    allowance.limitSeconds === null
  ) {
    return null;
  }

  const quota = resolveGroupQuota(period, allowance.allowanceUsedSeconds);
  const groupCount = quota.groupCount;
  const currentGroup = clampGroupIndex(decisionGroupIndex ?? quota.currentGroup, groupCount);
  const currentGroupRemainingSeconds =
    Math.max(0, quota.boundaryMs(currentGroup) - quota.usedMs) / 1000;
  const daily = resolveTargetDailyAllowance(target, usage);
  return {
    ...allowance,
    groupCount,
    currentGroup,
    currentGroupRemainingSeconds,
    dailyRemainingSeconds: daily.remainingSeconds
  };
}

export function remainingSecondsForDecision(
  target: SiteTargetSettings | undefined,
  usage: UsageSummary,
  decision: PageDecision,
  nowMs = Date.now()
): number | null {
  if (!target || decision.targetId !== target.id) return null;
  if (decision.flowContinuationKind === "video-end") return null;
  if (
    decision.flowContinuationKind === "minutes" &&
    isFutureTimestamp(decision.flowExpiresAt, nowMs)
  ) {
    return (decision.flowExpiresAt - nowMs) / 1_000;
  }
  if (isFutureTimestamp(decision.temporaryAccessExpiresAt, nowMs)) {
    return (decision.temporaryAccessExpiresAt - nowMs) / 1_000;
  }
  if (!decision.activePeriodId) return null;
  return resolveTargetAllowance(target, usage, decision.activePeriodId).remainingSeconds;
}

export function remainingSecondsForPlanDecision(
  decision: PlanNavigationDecision | null | undefined,
  nowMs = Date.now()
): number | null {
  if (
    !decision?.allowed ||
    decision.reason !== "authorized" ||
    decision.flowContinuationKind === "video-end" ||
    !isFutureTimestamp(decision.expiresAt, nowMs)
  ) {
    return null;
  }
  return (decision.expiresAt - nowMs) / 1_000;
}

export function resolveToolbarBadgeText(
  settings: FocusSettings,
  usage: UsageSummary,
  decision: PageDecision,
  runtime: ToolbarBadgeRuntime = {}
): string {
  if (!settings.enabled || !settings.showRemainingMinutesOnIcon) return "";
  const nowMs = runtime.nowMs ?? Date.now();
  const target = decision.targetId ? settings.targets[decision.targetId] : undefined;
  const planRemaining = remainingSecondsForPlanDecision(runtime.planDecision, nowMs);
  const isolatedPlanBadge =
    decision.reason !== "domain-block" &&
    isIndependentPlanAccess(settings.planMode, runtime.planDecision);
  const candidates = (
    isolatedPlanBadge
      ? [planRemaining]
      : [remainingSecondsForDecision(target, usage, decision, nowMs), planRemaining]
  ).filter((remaining): remaining is number => remaining !== null);
  return formatRemainingMinutesBadge(candidates.length > 0 ? Math.min(...candidates) : null);
}

/** Badge values are capped by the schema's 24-hour maximum and remain at least 1 until exhausted. */
export function formatRemainingMinutesBadge(remainingSeconds: number | null): string {
  if (remainingSeconds === null || !Number.isFinite(remainingSeconds) || remainingSeconds < 0) {
    return "";
  }
  return String(Math.min(1_440, Math.ceil(remainingSeconds / 60)));
}

function sanitizeSeconds(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampGroupIndex(value: number, groupCount: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(groupCount, Math.max(1, Math.trunc(value)));
}

function isFutureTimestamp(value: number | undefined, nowMs: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > nowMs;
}
