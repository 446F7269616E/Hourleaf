import { sendRequest } from "../shared/messages";
import { getPrimaryDomain } from "../shared/domain";
import { configureLocale, getResolvedLocale, localizeDocumentTitle, t } from "../shared/i18n";
import {
  SECTION_IDS,
  type FocusSettings,
  type ManagedSite,
  type PlanState,
  type SectionId,
  type SiteModuleInstallation,
  type SiteModuleStore,
  type TrackingStatus,
  type UsagePeriod,
  type UsageSummary
} from "../shared/types";
import { assertAppRoot, describeError, element, formatDuration, icon } from "../styles/dom";
import { createPageNavigation } from "../ui/page-navigation";
import { enableRadioButtonGroup } from "../ui/radio-button-group";
import { applyTheme } from "../ui/theme";
import { buildScreenTimeSeries } from "../shared/screen-time";
import { summarizeUsageInsights, totalUsageForDay } from "../shared/usage-insights";
import { createHourlyChart } from "../ui/hourly-usage-chart";
import { createHourlyDistribution, createPlanOverview } from "./usage-panels";
import { createTotalTimeCard } from "./total-time-card";

const SECTION_COLORS: Readonly<Record<SectionId, string>> = {
  home: "#e94983",
  dynamic: "#7657d5",
  popular: "#ef7d35",
  video: "#df5277",
  live: "#3b9f91",
  bangumi: "#4e78e8",
  search: "#63738f"
};

function periodLabel(period: UsagePeriod): string {
  return t(
    period === "day"
      ? "dashboard.today"
      : period === "week"
        ? "dashboard.week"
        : period === "month"
          ? "dashboard.month"
          : "dashboard.year"
  );
}

const app = assertAppRoot();
let currentPeriod: UsagePeriod = "week";
let loadSequence = 0;
let currentUsage: UsageSummary | null = null;
let dashboardState: {
  settings: FocusSettings;
  planState: PlanState | null;
  moduleStore: SiteModuleStore | null;
} | null = null;
let refreshInFlight = false;

interface SiteUsageStat {
  id: string;
  hostname: string;
  origin: string;
  seconds: number;
}

interface DomainUsageGroup {
  domain: string;
  seconds: number;
  sites: SiteUsageStat[];
}

document.body.classList.add("dashboard-page");
configureLocale("system");
void loadDashboard(currentPeriod);
window.setInterval(() => void refreshLiveDashboard(), 5_000);

async function loadDashboard(period: UsagePeriod, focusPeriodControl = false): Promise<void> {
  currentPeriod = period;
  currentUsage = null;
  const sequence = ++loadSequence;
  renderLoading(period);
  try {
    const [usage, tracking, settings, planState, moduleStore] = await Promise.all([
      sendRequest({ type: "GET_USAGE", period }),
      sendRequest({ type: "GET_TRACKING_STATUS" }),
      sendRequest({ type: "GET_SETTINGS" }),
      sendRequest({ type: "GET_PLAN_STATE" }).catch(() => null),
      sendRequest({ type: "GET_SITE_MODULES" }).catch(() => null)
    ]);
    if (sequence !== loadSequence) return;
    configureLocale((settings as FocusSettings & { locale?: string }).locale);
    applyTheme(settings.theme);
    localizeDocumentTitle("dashboard");
    currentUsage = usage;
    renderDashboard(usage, tracking, settings, planState, moduleStore);
    if (focusPeriodControl) {
      document
        .querySelector<HTMLButtonElement>(`[data-testid='dashboard-range-${period}']`)
        ?.focus();
    }
  } catch (error) {
    if (sequence !== loadSequence) return;
    renderError(period, describeError(error));
  }
}

async function refreshLiveDashboard(): Promise<void> {
  if (!currentUsage || !dashboardState || refreshInFlight || document.visibilityState !== "visible")
    return;
  const sequence = loadSequence;
  const period = currentPeriod;
  refreshInFlight = true;
  try {
    const [usage, tracking, planState] = await Promise.all([
      sendRequest({ type: "GET_USAGE", period }),
      sendRequest({ type: "GET_TRACKING_STATUS" }),
      sendRequest({ type: "GET_PLAN_STATE" }).catch(() => dashboardState?.planState ?? null)
    ]);
    if (sequence !== loadSequence || !dashboardState) return;
    currentUsage = usage;
    dashboardState.planState = planState;
    const { settings, moduleStore } = dashboardState;
    const groups = buildDomainUsageGroups(usage, settings);
    const regions: Array<[string, () => HTMLElement]> = [
      ["range", () => createCurrentRange(usage)],
      ["overview", () => createOverview(usage, tracking, groups)],
      ["trend", () => createTrendCard(usage, settings)],
      ["websites", () => createWebsiteBreakdown(groups, usage.totalSeconds)],
      ["hourly", () => createHourlyDistribution(settings, usage)],
      ["plan", () => createPlanOverview(planState)]
    ];
    for (const installation of Object.values(moduleStore?.installations ?? {})) {
      if (installation.enabled && installation.manifest.capabilities.includes("usage-tracking"))
        regions.push([
          `module-${installation.manifest.id}`,
          () => createModuleBreakdown(installation, usage, settings)
        ]);
    }
    for (const [name, create] of regions) {
      const previous = Array.from(
        document.querySelectorAll<HTMLElement>("[data-dashboard-region]")
      ).find((region) => region.dataset.dashboardRegion === name);
      // Preserve an active keyboard target, chart selection and expanded source lists.
      if (!previous || previous.contains(document.activeElement)) continue;
      const expanded = new Set(
        Array.from(previous.querySelectorAll<HTMLDetailsElement>("details[open]")).map(
          (detail) => detail.dataset.domain
        )
      );
      const scrollTop = previous.querySelector(".site-groups")?.scrollTop ?? 0;
      const selectedHour = previous.querySelector<HTMLElement>(
        ".hour-chart__hour[aria-pressed='true']"
      )?.dataset.hour;
      const next = create();
      if (selectedHour !== undefined)
        next
          .querySelector<HTMLButtonElement>(`.hour-chart__hour[data-hour='${selectedHour}']`)
          ?.click();
      for (const detail of next.querySelectorAll<HTMLDetailsElement>("details"))
        detail.open = expanded.has(detail.dataset.domain);
      previous.replaceWith(next);
      const list = next.querySelector(".site-groups");
      if (list) list.scrollTop = scrollTop;
    }
  } catch {
    // Preserve the last confirmed summary while a background page wakes up.
  } finally {
    refreshInFlight = false;
  }
}

function renderLoading(period: UsagePeriod): void {
  const content = createShell(
    period,
    element("section", {
      className: "card state-view",
      attrs: { "aria-busy": "true", "aria-label": t("dashboard.loading") },
      children: [
        element("div", {
          children: [
            element("div", { className: "state-view__icon", children: [icon("bar-chart")] }),
            element("h2", { text: t("dashboard.loadingPeriod", { period: periodLabel(period) }) })
          ]
        })
      ]
    })
  );
  app.replaceChildren(content);
}

function renderError(period: UsagePeriod, message: string): void {
  const retry = element("button", {
    className: "btn btn--primary",
    text: t("options.reload"),
    attrs: { type: "button" }
  });
  retry.addEventListener("click", () => void loadDashboard(period));
  const state = element("section", {
    className: "card state-view",
    attrs: { role: "alert" },
    children: [
      element("div", {
        children: [
          element("div", { className: "state-view__icon", children: [icon("warning")] }),
          element("h2", { text: t("dashboard.loadFailed") }),
          element("p", { text: message }),
          retry
        ]
      })
    ]
  });
  app.replaceChildren(createShell(period, state));
}

function renderDashboard(
  usage: UsageSummary,
  tracking: TrackingStatus,
  settings: FocusSettings,
  planState: PlanState | null,
  moduleStore: SiteModuleStore | null
): void {
  dashboardState = { settings, planState, moduleStore };
  const siteGroups = buildDomainUsageGroups(usage, settings);
  const enabledModules = Object.values(moduleStore?.installations ?? {}).filter(
    (installation) =>
      installation.enabled && installation.manifest.capabilities.includes("usage-tracking")
  );
  const content = element("div", {
    children: [
      element("section", {
        className: "dashboard-general",
        attrs: { "aria-label": t("dashboard.general") },
        children: [
          createOverview(usage, tracking, siteGroups),
          element("div", {
            className: "dashboard-grid",
            children: [
              createTrendCard(usage, settings),
              createWebsiteBreakdown(siteGroups, usage.totalSeconds)
            ]
          }),
          element("div", {
            className: `dashboard-grid dashboard-grid--secondary${usage.period === "day" ? " dashboard-grid--single" : ""}`,
            children: [
              ...(usage.period !== "day" ? [createHourlyDistribution(settings, usage)] : []),
              createPlanOverview(planState)
            ]
          })
        ]
      }),
      ...enabledModules.map((installation) => createModuleBreakdown(installation, usage, settings))
    ]
  });
  app.replaceChildren(createShell(usage.period, content, usage));
}

function createShell(period: UsagePeriod, content: HTMLElement, usage?: UsageSummary): HTMLElement {
  return element("div", {
    className: "dashboard-shell app-shell",
    children: [
      createPageNavigation({ currentPage: "dashboard" }),
      element("section", {
        className: "dashboard-heading page-heading",
        children: [
          element("div", {
            children: [element("h1", { className: "page-title", text: t("nav.dashboard") })]
          }),
          createPeriodControl(period)
        ]
      }),
      ...(usage ? [createCurrentRange(usage)] : []),
      content
    ]
  });
}

function createPeriodControl(selected: UsagePeriod): HTMLElement {
  const buttons = (["day", "week", "month", "year"] satisfies UsagePeriod[]).map((period) => {
    const button = element("button", {
      className: "segmented__item",
      text: periodLabel(period),
      attrs: {
        type: "button",
        role: "radio",
        "aria-checked": String(period === selected),
        "data-testid": `dashboard-range-${period}`
      }
    });
    button.addEventListener("click", () => {
      if (period !== currentPeriod) void loadDashboard(period, true);
    });
    return button;
  });
  enableRadioButtonGroup(buttons);
  return element("div", {
    className: "period-control view-control",
    children: [
      element("span", { className: "view-control__label", text: t("common.view") }),
      element("div", {
        className: "segmented",
        attrs: { role: "radiogroup", "aria-label": t("dashboard.rangeLabel") },
        children: buttons
      })
    ]
  });
}

function createCurrentRange(usage: UsageSummary): HTMLElement {
  return element("section", {
    className: "dashboard-current-range",
    dataset: { dashboardRegion: "range" },
    attrs: {
      "aria-label": t("dashboard.currentRange"),
      "data-testid": "dashboard-current-range"
    },
    children: [element("strong", { text: formatDateRange(usage) })]
  });
}

function createOverview(
  usage: UsageSummary,
  tracking: TrackingStatus,
  siteGroups: readonly DomainUsageGroup[]
): HTMLElement {
  const topSite = siteGroups.find((group) => group.seconds > 0 && group.sites.length > 0);
  const insights = summarizeUsageInsights(usage);
  return element("section", {
    className: "overview-grid",
    dataset: { dashboardRegion: "overview" },
    attrs: { "aria-label": t("dashboard.periodOverview", { period: periodLabel(usage.period) }) },
    children: [
      createTotalTimeCard({
        label: t("dashboard.total", { period: periodLabel(usage.period) }),
        seconds: usage.totalSeconds,
        status: liveTrackingLabel(tracking),
        tracking: tracking.isTracking
      }),
      createMetricCard(t("usage.dailyAverage"), formatDuration(insights.averageSeconds, true)),
      createMetricCard(
        t("dashboard.topWebsite"),
        topSite?.domain ?? t("dashboard.noRecords"),
        topSite
          ? `${formatDuration(topSite.seconds, true)} · ${formatShare(topSite.seconds, usage.totalSeconds)}`
          : t("dashboard.noUsage")
      ),
      createMetricCard(t("usage.activeDays"), `${insights.activeDays} / ${insights.elapsedDays}`)
    ]
  });
}

function liveTrackingLabel(tracking: TrackingStatus): string {
  if (tracking.isTracking) {
    return `${t("popup.tracking")} · ${tracking.section ? t(`section.${tracking.section}`) : t("dashboard.managedWebsite")}`;
  }
  if (tracking.idleState === "idle" || tracking.idleState === "locked") return t("dashboard.away");
  return t("popup.notTracking");
}

function createMetricCard(label: string, value: string, note?: string | Node): HTMLElement {
  return element("article", {
    className: "metric-card card",
    children: [
      element("p", { className: "metric-card__label", text: label }),
      element("p", {
        className: "metric-card__value",
        text: value
      }),
      ...(note
        ? [
            element("p", {
              className: "metric-card__note",
              ...(typeof note === "string" ? { text: note } : { children: [note] })
            })
          ]
        : [])
    ]
  });
}

function createTrendCard(usage: UsageSummary, settings: FocusSettings): HTMLElement {
  const insights = summarizeUsageInsights(usage);
  const { all } = buildScreenTimeSeries(settings, usage);
  all.label = t("pause.allSites");
  const buckets = buildTrendBuckets(usage);
  const maximum = Math.max(
    60,
    Math.ceil(Math.max(0, ...buckets.map((bucket) => bucket.seconds)) / 60) * 60
  );
  const columns = buckets.map((bucket, index) => {
    const total = bucket.seconds;
    const height = total > 0 ? Math.max(2, (total / maximum) * 100) : 0;
    const column = element("div", {
      className: "chart-column",
      dataset: { empty: String(total === 0) },
      attrs: {
        tabindex: index === 0 ? "0" : "-1",
        role: "img",
        "aria-label": t("dashboard.usageAria", {
          label: bucket.ariaLabel,
          duration: formatDuration(total, true)
        })
      },
      children: [
        element("div", {
          className: "chart-column__track",
          children: [
            element("div", {
              className: "chart-column__bar",
              attrs: { style: `height: ${height.toFixed(2)}%` }
            })
          ]
        }),
        element("span", {
          className: "chart-column__label",
          text: bucket.label
        }),
        element("span", {
          className: "chart-tooltip",
          text: `${bucket.tooltipLabel} · ${formatDuration(total, true)}`,
          attrs: { "aria-hidden": "true" }
        })
      ]
    });
    column.onkeydown = (event) => {
      const columns = Array.from(
        column.parentElement?.querySelectorAll<HTMLElement>(".chart-column") ?? []
      );
      const next =
        event.key === "ArrowRight"
          ? (index + 1) % columns.length
          : event.key === "ArrowLeft"
            ? (index + columns.length - 1) % columns.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? columns.length - 1
                : undefined;
      if (next === undefined) return;
      event.preventDefault();
      for (const [position, candidate] of columns.entries())
        candidate.tabIndex = position === next ? 0 : -1;
      columns[next]?.focus();
    };
    return column;
  });

  return element("section", {
    className: "chart-card card",
    dataset: { dashboardRegion: "trend" },
    attrs: { "aria-labelledby": "trend-title", "data-testid": "dashboard-trend-chart" },
    children: [
      element("header", {
        className: "chart-card__header",
        children: [
          element("div", {
            children: [element("h2", { text: t("dashboard.trend"), attrs: { id: "trend-title" } })]
          })
        ]
      }),
      ...(usage.period === "day"
        ? [createHourlyChart(all)]
        : [
            element("div", {
              className: "trend-plot",
              children: [
                element("div", {
                  className: "trend-axis",
                  attrs: { "aria-hidden": "true" },
                  children: [maximum, maximum / 2, 0].map((seconds) =>
                    element("span", { text: formatDuration(seconds) })
                  )
                }),
                element("div", {
                  className: "bar-chart",
                  attrs: {
                    "aria-label": `${periodLabel(usage.period)} ${t("dashboard.trend")}`
                  },
                  children: columns
                })
              ]
            })
          ]),
      element("div", {
        className: "trend-summary",
        children: [
          element("p", {
            children: [
              element("span", { text: t("usage.peakDay") }),
              element("strong", {
                text: insights.peakDay
                  ? `${formatShortDate(insights.peakDay.date)} · ${formatDuration(insights.peakDay.seconds, true)}`
                  : t("dashboard.noRecords")
              })
            ]
          }),
          element("p", {
            children: [
              element("span", { text: t("usage.flowExtra") }),
              element("strong", { text: formatDuration(insights.extraSeconds, true) })
            ]
          })
        ]
      }),
      ...(usage.totalSeconds === 0 && usage.period !== "day"
        ? [element("p", { className: "dashboard-chart-note", text: t("dashboard.noUsage") })]
        : [])
    ]
  });
}

function createWebsiteBreakdown(
  groups: readonly DomainUsageGroup[],
  totalSeconds: number
): HTMLElement {
  const groupRows = groups.map((group, index) => {
    const siteRows = group.sites.map((site) =>
      element("div", {
        className: "site-group__site",
        dataset: { siteId: site.id },
        children: [
          element("div", {
            className: "site-group__identity",
            children: [
              element("strong", { text: site.hostname, attrs: { title: site.origin } }),
              element("span", { text: site.origin })
            ]
          }),
          element("span", {
            className: "site-group__time",
            text: formatDuration(site.seconds, true)
          })
        ]
      })
    );
    return element(group.sites.length ? "details" : "article", {
      className: "site-group",
      dataset: { domain: group.domain },
      children: [
        element(group.sites.length ? "summary" : "div", {
          className: "site-group__summary",
          attrs: {
            "aria-label": group.sites.length
              ? t("dashboard.domainDetailsAria", {
                  domain: group.domain,
                  duration: formatDuration(group.seconds, true)
                })
              : `${group.domain} · ${formatDuration(group.seconds, true)}`
          },
          children: [
            element("span", {
              className: "site-group__rank",
              text: String(index + 1),
              attrs: { "aria-hidden": "true" }
            }),
            element("span", {
              className: "site-group__domain",
              children: [
                element("strong", { text: group.domain, attrs: { title: group.domain } }),
                element("span", {
                  text: group.sites.length
                    ? t("dashboard.sources", { count: group.sites.length })
                    : t("usage.removedRecords")
                })
              ]
            }),
            element("span", {
              className: "site-group__summary-value",
              children: [
                element("span", {
                  className: "site-group__numbers",
                  children: [
                    element("strong", { text: formatDuration(group.seconds, true) }),
                    element("span", { text: formatShare(group.seconds, totalSeconds) })
                  ]
                }),
                ...(group.sites.length ? [icon("chevron")] : [])
              ]
            }),
            element("span", {
              className: "site-group__track",
              attrs: { "aria-hidden": "true" },
              children: [
                element("span", {
                  attrs: {
                    style: `width: ${totalSeconds ? Math.min(100, (group.seconds / totalSeconds) * 100) : 0}%`
                  }
                })
              ]
            })
          ]
        }),
        element("div", { className: "site-group__sites", children: siteRows })
      ]
    });
  });

  return element("section", {
    className: "site-breakdown card",
    dataset: { dashboardRegion: "websites" },
    attrs: {
      "aria-labelledby": "website-breakdown-title",
      "data-testid": "dashboard-section-list"
    },
    children: [
      element("header", {
        className: "site-breakdown__header",
        children: [
          element("div", {
            children: [
              element("h2", {
                text: t("dashboard.websiteTime"),
                attrs: { id: "website-breakdown-title" }
              })
            ]
          }),
          element("span", {
            className: "badge",
            text: t("usage.activeDomains", {
              count: groups.filter((group) => group.seconds > 0 && group.sites.length > 0).length
            })
          })
        ]
      }),
      groupRows.length > 0
        ? element("div", { className: "site-groups", children: groupRows })
        : element("div", {
            className: "site-breakdown__empty",
            children: [
              element("div", { className: "state-view__icon", children: [icon("clock")] }),
              element("p", { text: t("dashboard.noWebsites") })
            ]
          })
    ]
  });
}

function createModuleBreakdown(
  installation: SiteModuleInstallation,
  usage: UsageSummary,
  settings: FocusSettings
): HTMLElement {
  const manifest = installation.manifest;
  const rows = manifest.sections.map((section, index) => {
    const matchingTargets = Object.values(settings.targets).filter(
      (target) => target.moduleId === manifest.id && target.moduleSectionId === section.id
    );
    const targetSeconds = matchingTargets.reduce(
      (total, target) => total + (usage.byTarget[target.id] ?? 0),
      0
    );
    const seconds = targetSeconds;
    return {
      id: section.id,
      label: section.label,
      seconds,
      color:
        SECTION_COLORS[section.id as SectionId] ??
        Object.values(SECTION_COLORS)[index % SECTION_IDS.length] ??
        "#63738f"
    };
  });
  const maximum = Math.max(1, ...rows.map((row) => row.seconds));
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  const moduleName = manifest.name;

  return element("section", {
    className: "module-statistics card",
    dataset: { dashboardRegion: `module-${manifest.id}` },
    attrs: { "aria-labelledby": `module-statistics-${safeDomId(manifest.id)}` },
    children: [
      element("header", {
        className: "module-statistics__header",
        children: [
          element("div", {
            children: [
              element("h2", {
                text: t("dashboard.moduleStats", { module: moduleName }),
                attrs: { id: `module-statistics-${safeDomId(manifest.id)}` }
              })
            ]
          }),
          element("div", {
            className: "module-statistics__total",
            children: [
              element("span", { text: t("dashboard.sum") }),
              element("strong", { text: formatDuration(total, true) })
            ]
          })
        ]
      }),
      rows.length > 0
        ? element("div", {
            className: "module-statistics__rows",
            children: rows
              .sort((left, right) => right.seconds - left.seconds)
              .map((row) => createUsageBar(row.label, row.seconds, maximum, row.color))
          })
        : element("p", {
            className: "module-statistics__empty",
            text: t("dashboard.noModuleStats")
          })
    ]
  });
}

function createUsageBar(label: string, value: number, maximum: number, color: string): HTMLElement {
  const percentage = Math.max(0, Math.min(100, (value / maximum) * 100));
  return element("div", {
    className: "section-total",
    attrs: { style: `--section-color: ${color}` },
    children: [
      element("div", {
        className: "section-total__header",
        children: [
          element("span", {
            className: "section-total__name",
            children: [element("span", { className: "section-total__dot" }), label]
          }),
          element("span", {
            className: "section-total__value",
            text: formatDuration(value, true)
          })
        ]
      }),
      element("div", {
        className: "section-total__track",
        attrs: {
          role: "progressbar",
          "aria-label": t("dashboard.durationAria", { label }),
          "aria-valuemin": "0",
          "aria-valuemax": maximum,
          "aria-valuenow": value,
          "aria-valuetext": formatDuration(value, true)
        },
        children: [
          element("div", {
            className: "section-total__bar",
            attrs: { style: `width: ${percentage.toFixed(2)}%` }
          })
        ]
      })
    ]
  });
}

function buildDomainUsageGroups(usage: UsageSummary, settings: FocusSettings): DomainUsageGroup[] {
  const groups = new Map<string, DomainUsageGroup>();
  for (const site of Object.values(settings.sites)) {
    const stat = createSiteUsageStat(site, usage);
    const domain = getPrimaryDomain(site.hostname);
    const existing = groups.get(domain);
    if (existing) {
      existing.seconds += stat.seconds;
      existing.sites.push(stat);
    } else {
      groups.set(domain, { domain, seconds: stat.seconds, sites: [stat] });
    }
  }

  const assigned = new Set(Object.values(settings.sites).flatMap((site) => site.targetIds));
  const otherSeconds = Object.entries(usage.byTarget)
    .filter(([id]) => !assigned.has(id))
    .reduce((sum, [, seconds]) => sum + seconds, 0);
  const result = [...groups.values()];
  if (otherSeconds > 0)
    result.push({ domain: t("pause.otherSites"), seconds: otherSeconds, sites: [] });

  return result
    .map((group) => ({
      ...group,
      sites: group.sites.sort(
        (left, right) => right.seconds - left.seconds || left.hostname.localeCompare(right.hostname)
      )
    }))
    .sort((left, right) => right.seconds - left.seconds || left.domain.localeCompare(right.domain));
}

function createSiteUsageStat(site: ManagedSite, usage: UsageSummary): SiteUsageStat {
  const seconds = site.targetIds.reduce(
    (total, targetId) => total + (usage.byTarget[targetId] ?? 0),
    0
  );
  return {
    id: site.id,
    hostname: site.hostname,
    origin: site.origin,
    seconds
  };
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function formatShare(seconds: number, totalSeconds: number): string {
  return new Intl.NumberFormat(getResolvedLocale(), {
    style: "percent",
    maximumFractionDigits: 1
  }).format(totalSeconds ? seconds / totalSeconds : 0);
}

function parseDate(value: string): Date {
  const [year = "1970", month = "01", day = "01"] = value.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDateRange(usage: UsageSummary): string {
  if (usage.startDate === usage.endDate) return formatFullDate(usage.startDate);
  const formatter = new Intl.DateTimeFormat(getResolvedLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `${formatter.format(parseDate(usage.startDate))} – ${formatter.format(parseDate(usage.endDate))}`;
}

function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat(getResolvedLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(parseDate(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat(getResolvedLocale(), { month: "numeric", day: "numeric" }).format(
    parseDate(value)
  );
}

interface TrendBucket {
  label: string;
  ariaLabel: string;
  tooltipLabel: string;
  seconds: number;
}

function buildTrendBuckets(usage: UsageSummary): TrendBucket[] {
  if (usage.period === "year") {
    const byMonth = new Map<string, number>();
    for (const day of usage.byDay) {
      const month = day.date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + totalUsageForDay(day));
    }
    const monthFormatter = new Intl.DateTimeFormat(getResolvedLocale(), { month: "short" });
    const fullMonthFormatter = new Intl.DateTimeFormat(getResolvedLocale(), {
      year: "numeric",
      month: "long"
    });
    return [...byMonth.entries()].map(([month, seconds]) => {
      const date = parseDate(`${month}-01`);
      const fullMonth = fullMonthFormatter.format(date);
      return {
        label: monthFormatter.format(date),
        ariaLabel: fullMonth,
        tooltipLabel: fullMonth,
        seconds
      };
    });
  }

  return usage.byDay.map((day, index) => {
    const date = parseDate(day.date);
    const fullDate = formatFullDate(day.date);
    const label =
      usage.period === "week"
        ? new Intl.DateTimeFormat(getResolvedLocale(), { weekday: "narrow" }).format(date)
        : usage.period === "month"
          ? index % 5 === 0 || index === usage.byDay.length - 1
            ? String(date.getDate())
            : ""
          : formatShortDate(day.date);
    return {
      label,
      ariaLabel: fullDate,
      tooltipLabel: formatShortDate(day.date),
      seconds: totalUsageForDay(day)
    };
  });
}
