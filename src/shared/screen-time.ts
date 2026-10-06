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
  const day = usage.byDay.find((candidate) => candidate.date === usage.startDate);
  const totals = day?.byTarget ?? usage.byTarget;
  const seriesFor = (id: string, label: string, targetIds: string[]): ScreenTimeSeries => {
    const hourlySeconds = Array.from({ length: 24 }, (_, hour) =>
      targetIds.reduce((sum, targetId) => sum + (day?.byHour?.[String(hour)]?.[targetId] ?? 0), 0)
    );
    return {
      id,
      label,
      totalSeconds: targetIds.reduce((sum, targetId) => sum + (totals[targetId] ?? 0), 0),
      hourlySeconds,
      // Both buckets retain precision; round only the final millisecond delta.
      unallocatedSeconds: targetIds.reduce(
        (sum, targetId) =>
          sum +
          Math.max(
            0,
            Math.round(
              ((totals[targetId] ?? 0) -
                Array.from(
                  { length: 24 },
                  (_, hour) => day?.byHour?.[String(hour)]?.[targetId] ?? 0
                ).reduce((a, b) => a + b, 0)) *
                1000
            ) / 1000
          ),
        0
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
    return seriesFor(site.id, site.label || site.hostname, ids);
  });
  const other = Object.keys(totals).filter((id) => !assigned.has(id));
  if (other.length) sites.push(seriesFor("unconfigured", "", other));
  sites.sort((a, b) => b.totalSeconds - a.totalSeconds || a.label.localeCompare(b.label));
  return { all: seriesFor("all", "", Object.keys(totals)), sites };
}
