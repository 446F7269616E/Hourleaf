import { getResolvedLocale, t } from "../shared/i18n";
import { resolveGroupQuota } from "../shared/group-quota";
import { buildScreenTimeSeries } from "../shared/screen-time";
import { peakUsageHour } from "../shared/usage-insights";
import { findNextAvailablePeriod } from "../shared/next-available-period";
import { hasEnabledTimePeriods, selectActiveTimePeriod } from "../shared/schedule";
import type {
  FocusSettings,
  PeriodRuntimeStatus,
  SiteTargetSettings,
  UsageSummary
} from "../shared/types";
import { element, formatDuration } from "../styles/dom";

function facts(entries: Array<[string, string]>): HTMLElement {
  return element("dl", {
    className: "pause-facts",
    children: entries.map(([label, value]) =>
      element("div", {
        children: [element("dt", { text: label }), element("dd", { text: value })]
      })
    )
  });
}

/** Quota comes from the configured period and its charged bucket, never extra actual time. */
export function createPausePeriodDetails(
  settings: FocusSettings,
  usage: UsageSummary,
  runtime: PeriodRuntimeStatus
): HTMLElement | null {
  const target = settings.targets[runtime.targetId];
  const period = target?.timePeriods.find((entry) => entry.id === runtime.periodId);
  if (!period || period.behavior !== "timed") return null;
  const quota = resolveGroupQuota(period, usage.byPeriod[period.id] ?? 0, runtime.unlockedGroups);
  const group = quota.availableGroups;
  const duration = (milliseconds: number | null) =>
    milliseconds === null || !Number.isFinite(milliseconds)
      ? t("pause.unlimited")
      : formatDuration(milliseconds / 1000, true);
  return element("section", {
    className: "pause-detail-card",
    attrs: { "aria-label": t("pause.periodDetails") },
    children: [
      element("header", {
        className: "pause-detail-card__heading",
        children: [
          element("h2", { text: period.name || t("pause.periodDetails") }),
          element("span", { text: `${period.startTime}–${period.endTime}` })
        ]
      }),
      facts([
        [t("pause.periodQuota"), duration(quota.totalMs)],
        [
          t("pause.groupQuota"),
          duration(
            quota.totalMs === null ? null : quota.boundaryMs(group) - quota.boundaryMs(group - 1)
          )
        ],
        [t("pause.groupRemaining"), duration(quota.totalMs === null ? null : quota.availableMs)],
        [t("pause.unlockedGroups"), `${runtime.unlockedGroups} / ${runtime.groupCount}`]
      ])
    ]
  });
}

/** Describes today's actual site usage without adding a score or changing access rules. */
export function createPauseSiteDetails(
  settings: FocusSettings,
  usage: UsageSummary,
  siteId: string
): HTMLElement | null {
  const { all, sites } = buildScreenTimeSeries(settings, usage);
  const site = sites.find((entry) => entry.id === siteId);
  if (!site) return null;
  const peak = peakUsageHour(site.hourlySeconds);
  const hour = (value: number) => `${String(value % 24).padStart(2, "0")}:00`;
  const percent = new Intl.NumberFormat(getResolvedLocale(), {
    style: "percent",
    maximumFractionDigits: 1
  });
  return element("section", {
    className: "pause-detail-card pause-detail-card--site",
    attrs: { "aria-label": t("pause.siteDetails") },
    children: [
      element("h2", { text: t("pause.siteDetails") }),
      facts([
        [
          t("pause.siteShare"),
          percent.format(all.totalSeconds ? site.totalSeconds / all.totalSeconds : 0)
        ],
        [
          t("pause.sitePeakHour"),
          peak === null ? t("dashboard.noRecords") : `${hour(peak)}–${hour(peak + 1)}`
        ],
        [
          t("pause.peakHourTime"),
          peak === null
            ? t("dashboard.noRecords")
            : formatDuration(site.hourlySeconds[peak] ?? 0, true)
        ]
      ])
    ]
  });
}

/** Only forecast when the target is outside every enabled time window. */
export function createNextPeriodDetails(
  target: SiteTargetSettings,
  usage: UsageSummary,
  now = new Date()
): HTMLElement | null {
  if (!hasEnabledTimePeriods(target) || selectActiveTimePeriod(target, now)) return null;
  const next = findNextAvailablePeriod(target, usage, now);
  const dateTime = new Intl.DateTimeFormat(getResolvedLocale(), {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  return element("section", {
    className: "pause-next-period",
    attrs: { "aria-label": t("pause.nextAvailablePeriod") },
    children: [
      element("p", { className: "end-message", text: t("pause.outsidePeriods") }),
      element("h2", { text: t("pause.nextAvailablePeriod") }),
      ...(next
        ? [
            element("strong", {
              className: "pause-next-period__name",
              text: next.period.name || t("pause.periodDetails")
            }),
            facts([
              [t("pause.periodOpensAt"), dateTime.format(next.startsAt)],
              [t("pause.periodClosesAt"), dateTime.format(next.endsAt)]
            ])
          ]
        : [element("p", { className: "end-message", text: t("pause.noUpcomingPeriod") })])
    ]
  });
}
