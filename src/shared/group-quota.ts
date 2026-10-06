import type { TimePeriodSettings } from "./types";

/** Quota arithmetic uses integer milliseconds; only UI formatters round seconds.
 * Ceiling cumulative boundaries distributes indivisible milliseconds without
 * losing time, and makes the final boundary exactly equal to the period limit.
 */
export function resolveGroupQuota(
  period: Pick<TimePeriodSettings, "limitMinutes" | "groupCount">,
  usedSeconds: number,
  unlockedGroups = 1
) {
  const groupCount = Math.min(24, Math.max(1, Math.trunc(period.groupCount) || 1));
  const availableGroups = Math.min(groupCount, Math.max(1, Math.trunc(unlockedGroups) || 1));
  const totalMs = period.limitMinutes === null ? null : Math.round(period.limitMinutes * 60_000);
  const usedMs = Number.isFinite(usedSeconds) ? Math.max(0, Math.round(usedSeconds * 1000)) : 0;
  const boundaryMs = (group: number): number =>
    totalMs === null
      ? Infinity
      : Math.ceil((totalMs * Math.min(groupCount, Math.max(0, group))) / groupCount);
  let usedGroups = 0;
  if (totalMs !== null) {
    while (usedGroups < groupCount && usedMs >= boundaryMs(usedGroups + 1)) usedGroups++;
  }
  return {
    groupCount,
    availableGroups,
    usedGroups,
    remainingGroups: groupCount - usedGroups,
    currentGroup: Math.min(groupCount, usedGroups + 1),
    usedMs,
    totalMs,
    boundaryMs,
    remainingMs: totalMs === null ? null : Math.max(0, totalMs - usedMs),
    availableMs: Math.max(0, boundaryMs(availableGroups) - usedMs),
    exhausted: totalMs !== null && usedMs >= totalMs,
    atGroupBoundary: totalMs !== null && usedMs >= boundaryMs(availableGroups)
  };
}
