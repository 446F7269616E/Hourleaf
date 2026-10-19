import type { DailyUsage, UsageSummary } from "./types";

/** Calendar-based summaries exclude future dates, including across daylight-saving changes. */
export function summarizeUsageInsights(usage: UsageSummary, now = new Date()) {
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const elapsed = usage.byDay.filter((day) => day.date <= today);
  const days = elapsed.map((day) => ({ date: day.date, seconds: totalUsageForDay(day) }));
  const peakDay = days.reduce<(typeof days)[number] | null>(
    (peak, day) => (day.seconds > (peak?.seconds ?? 0) ? day : peak),
    null
  );
  return {
    elapsedDays: elapsed.length,
    activeDays: days.filter((day) => day.seconds > 0).length,
    averageSeconds: elapsed.length
      ? days.reduce((sum, day) => sum + day.seconds, 0) / elapsed.length
      : 0,
    peakDay,
    // Group annotations mirror the period total; summing both would double count extensions.
    extraSeconds: Object.entries(usage.byPeriod)
      .filter(([key]) => key.startsWith("extra:") && !/:g\d+$/.test(key))
      .reduce((sum, [, seconds]) => sum + seconds, 0)
  };
}

export function totalUsageForDay(day: DailyUsage): number {
  const total = Object.values(day.byTarget).reduce((sum, seconds) => sum + seconds, 0);
  return total || Object.values(day.bySection).reduce((sum, seconds) => sum + seconds, 0);
}

export function peakUsageHour(hours: readonly number[]): number | null {
  const maximum = Math.max(0, ...hours);
  return maximum > 0 ? hours.indexOf(maximum) : null;
}
