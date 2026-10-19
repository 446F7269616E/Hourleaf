import { t } from "../shared/i18n";
import { buildScreenTimeSeries } from "../shared/screen-time";
import type { FocusSettings, PlanState, UsageSummary } from "../shared/types";
import { element, formatDuration } from "../styles/dom";
import { createHourlyChart } from "../ui/hourly-usage-chart";

export function createHourlyDistribution(
  settings: FocusSettings,
  usage: UsageSummary
): HTMLElement {
  const { all } = buildScreenTimeSeries(settings, usage);
  all.label = t("pause.allSites");
  return element("section", {
    className: "chart-card card dashboard-hourly",
    dataset: { dashboardRegion: "hourly" },
    attrs: { "aria-labelledby": "hourly-title" },
    children: [
      element("header", {
        className: "chart-card__header",
        children: [
          element("div", {
            children: [
              element("h2", { text: t("usage.hourlyDistribution"), attrs: { id: "hourly-title" } })
            ]
          })
        ]
      }),
      createHourlyChart(all)
    ]
  });
}

/** Plan queue totals have no date attribution and must not inherit the usage range label. */
export function createPlanOverview(state: PlanState | null): HTMLElement {
  const items = state?.queue.items ?? [];
  const completed = items.filter((item) => item.status === "completed").length;
  const pending = items.filter((item) => item.status === "pending");
  const pendingSeconds = pending.reduce((sum, item) => sum + item.scheduledDurationMinutes * 60, 0);
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
  const metric = (label: string, value: string, note: string) =>
    element("div", {
      className: "plan-statistic",
      children: [
        element("dt", { text: label }),
        element("dd", {
          children: [element("strong", { text: value }), element("span", { text: note })]
        })
      ]
    });
  return element("section", {
    className: "card dashboard-plan",
    dataset: { dashboardRegion: "plan" },
    attrs: { "aria-labelledby": "plan-summary-title" },
    children: [
      element("header", {
        className: "chart-card__header",
        children: [
          element("div", {
            children: [
              element("h2", { text: t("usage.planOverview"), attrs: { id: "plan-summary-title" } })
            ]
          })
        ]
      }),
      ...(state
        ? [
            element("dl", {
              className: "plan-statistics",
              children: [
                metric(
                  t("dashboard.pendingTime"),
                  formatDuration(pendingSeconds, true),
                  t("usage.pendingItems", { count: pending.length })
                ),
                metric(
                  t("dashboard.completed"),
                  `${completed} / ${items.length}`,
                  t("dashboard.completion", { percent })
                )
              ]
            }),
            element("div", {
              className: "plan-completion",
              attrs: {
                role: "progressbar",
                "aria-label": t("dashboard.completed"),
                "aria-valuemin": 0,
                "aria-valuemax": 100,
                "aria-valuenow": percent,
                "aria-valuetext": t("dashboard.completion", { percent })
              },
              children: [element("span", { attrs: { style: `width: ${percent}%` } })]
            }),
            ...(!items.length
              ? [
                  element("p", {
                    className: "dashboard-chart-note",
                    text: t("dashboard.planEmpty")
                  })
                ]
              : [])
          ]
        : [
            element("p", {
              className: "dashboard-chart-note",
              text: t("dashboard.planUnavailable")
            })
          ])
    ]
  });
}
