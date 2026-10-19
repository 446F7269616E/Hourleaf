import { formatLocalDate } from "./analytics";
import { selectActiveTimePeriod, timeToMinutes } from "./schedule";
import type { SiteTargetSettings, TimePeriodSettings, UsageSummary, Weekday } from "./types";

export interface NextAvailablePeriod {
  period: TimePeriodSettings;
  startsAt: Date;
  endsAt: Date;
}

/** Search calendar boundaries using the same weekday, overlap and quota rules as enforcement. */
export function findNextAvailablePeriod(
  target: SiteTargetSettings,
  usage: UsageSummary,
  now = new Date()
): NextAvailablePeriod | null {
  const boundaries = new Set<number>();
  for (let offset = -1; offset <= 8; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (offset >= 0) boundaries.add(day.getTime());
    for (const period of target.timePeriods) {
      if (!period.enabled || !period.days.includes(day.getDay() as Weekday)) continue;
      const start = timeToMinutes(period.startTime);
      const end = timeToMinutes(period.endTime);
      if (start === null || end === null) continue;
      const at = (days: number, minute: number) =>
        new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate() + days,
          Math.floor(minute / 60),
          minute % 60
        ).getTime();
      // Equal clocks mean the entire selected calendar day, not a rolling 24 hours.
      boundaries.add(start === end ? at(0, 0) : at(0, start));
      boundaries.add(start === end ? at(1, 0) : at(end < start ? 1 : 0, end));
    }
  }
  const candidates = [...boundaries].filter((at) => at > now.getTime()).sort((a, b) => a - b);
  const availableAt = (at: Date) => {
    const period = selectActiveTimePeriod(target, at);
    if (!period || period.behavior === "always-block") return null;
    if (period.behavior === "always-allow" || period.limitMinutes === null) return period;
    const used = formatLocalDate(at) === usage.startDate ? (usage.byPeriod[period.id] ?? 0) : 0;
    return used < period.limitMinutes * 60 ? period : null;
  };
  for (const timestamp of candidates) {
    const startsAt = new Date(timestamp);
    const period = availableAt(startsAt);
    if (!period) continue;
    const start = timeToMinutes(period.startTime)!;
    const end = timeToMinutes(period.endTime)!;
    const minute = startsAt.getHours() * 60 + startsAt.getMinutes();
    const endDay = start === end || (end < start && minute >= start) ? 1 : 0;
    let endsAt = new Date(
      startsAt.getFullYear(),
      startsAt.getMonth(),
      startsAt.getDate() + endDay,
      start === end ? 0 : Math.floor(end / 60),
      start === end ? 0 : end % 60
    );
    for (const boundary of candidates) {
      if (boundary <= timestamp || boundary >= endsAt.getTime()) continue;
      if (availableAt(new Date(boundary))?.id !== period.id) {
        endsAt = new Date(boundary);
        break;
      }
    }
    return { period, startsAt, endsAt };
  }
  return null;
}
