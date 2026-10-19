import type { FocusSettings, UsageSummary } from "./types";

export interface ScreenTimeSeries {
  id: string;
  label: string;
  totalSeconds: number;
  hourlySeconds: number[];
  unallocatedSeconds: number;
}

/** Projects current site identities and handles older/removed targets without inventing hours. */
export function buildScreenTimeSeries(
  settings: FocusSettings,
  usage: UsageSummary
): {
  all: ScreenTimeSeries;
  sites: ScreenTimeSeries[];
} {
  const totals = usage.byTarget;
  const hoursByTarget = new Map<string, number[]>();
  for (const day of usage.byDay) {
    for (let hour = 0; hour < 24; hour++) {
      for (const [targetId, seconds] of Object.entries(day.byHour?.[String(hour)] ?? {})) {
        let hours = hoursByTarget.get(targetId);
        if (!hours) {
          hours = Array<number>(24).fill(0);
          hoursByTarget.set(targetId, hours);
        }
        hours[hour] = (hours[hour] ?? 0) + seconds;
      }
    }
  }
  const seriesFor = (id: string, label: string, targetIds: string[]): ScreenTimeSeries => {
    const hourlySeconds = Array.from({ length: 24 }, (_, hour) =>
      targetIds.reduce((sum, targetId) => sum + (hoursByTarget.get(targetId)?.[hour] ?? 0), 0)
    );
    return {
      id,
      label,
      totalSeconds: targetIds.reduce((sum, targetId) => sum + (totals[targetId] ?? 0), 0),
      hourlySeconds,
      // Keep older totals visible without fabricating an hourly distribution.
      unallocatedSeconds: Math.max(
        0,
        Math.round(
          (targetIds.reduce((sum, targetId) => sum + (totals[targetId] ?? 0), 0) -
            hourlySeconds.reduce((sum, seconds) => sum + seconds, 0)) *
            1000
        ) / 1000
      )
    };
  };
  const assigned = new Set<string>();
  const sites = Object.values(settings.sites).map((site) => {
    const ids = site.targetIds.filter((id) => {
      if (assigned.has(id)) return false;
      assigned.add(id);
      return true;
    });
    return seriesFor(site.id, site.hostname, ids);
  });
  const other = Object.keys(totals).filter((id) => !assigned.has(id));
  if (other.length) sites.push(seriesFor("unconfigured", "", other));
  sites.sort((a, b) => b.totalSeconds - a.totalSeconds || a.label.localeCompare(b.label));
  return { all: seriesFor("all", "", Object.keys(totals)), sites };
}
