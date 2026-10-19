import { getResolvedLocale, t } from "../shared/i18n";
import { buildScreenTimeSeries, type ScreenTimeSeries } from "../shared/screen-time";
import type { FocusSettings, UsageSummary } from "../shared/types";
import { element, formatDuration } from "../styles/dom";
import { createHourlyChart, hourlyAxisMaximum } from "./hourly-usage-chart";

/** Screen-time overview shared by top-level pause pages and the in-site flow frame. */
export function createScreenTimeSummary(settings: FocusSettings, usage: UsageSummary): HTMLElement {
  const { all, sites } = buildScreenTimeSeries(settings, usage);
  all.label = t("pause.allSites");
  for (const site of sites) if (!site.label) site.label = t("pause.otherSites");
  const chart = element("div", { className: "screen-time__chart" });
  const buttons = new Map<string, HTMLButtonElement>();
  const axisMax = hourlyAxisMaximum(all.hourlySeconds);
  const date = new Date(`${usage.startDate}T12:00:00`);
  const total = element("header", {
    className: "screen-time__header",
    children: [
      element("div", {
        children: [
          element("h2", { text: t("pause.todayTotal") }),
          element("p", { className: "screen-time__total", text: duration(all.totalSeconds) })
        ]
      }),
      element("time", {
        text: new Intl.DateTimeFormat(getResolvedLocale(), {
          month: "short",
          day: "numeric"
        }).format(date),
        attrs: { datetime: usage.startDate }
      })
    ]
  });
  const allButton = element("button", {
    className: "screen-time__all",
    text: t("pause.allSites"),
    attrs: { type: "button" }
  });
  buttons.set(all.id, allButton);
  allButton.onclick = () => select(all);
  const list = element("ul", {
    className: "screen-time__sites",
    children: sites.map((site) => {
      const button = element("button", {
        className: "screen-time__site",
        attrs: {
          type: "button",
          "aria-label": t("pause.siteUsage", {
            site: site.label,
            time: duration(site.totalSeconds)
          })
        },
        children: [
          element("span", {
            className: "screen-time__site-name",
            text: site.label,
            attrs: { title: site.label }
          }),
          element("span", {
            className: "screen-time__site-value",
            children: [
              element("strong", { text: duration(site.totalSeconds) }),
              element("span", {
                text: new Intl.NumberFormat(getResolvedLocale(), {
                  style: "percent",
                  maximumFractionDigits: 1
                }).format(all.totalSeconds ? site.totalSeconds / all.totalSeconds : 0)
              })
            ]
          }),
          element("span", {
            className: "screen-time__site-track",
            attrs: { "aria-hidden": "true" },
            children: [
              element("span", {
                attrs: {
                  style: `width: ${all.totalSeconds ? Math.min(100, (site.totalSeconds / all.totalSeconds) * 100) : 0}%`
                }
              })
            ]
          })
        ]
      });
      buttons.set(site.id, button);
      button.onclick = () => select(site);
      return element("li", { children: [button] });
    })
  });
  const pageSize = 3;
  let page = 0;
  const pageCount = Math.max(1, Math.ceil(sites.length / pageSize));
  const previous = element("button", {
    className: "pause-page-button",
    text: "←",
    attrs: { type: "button", "aria-label": t("pause.previousPage") }
  });
  const next = element("button", {
    className: "pause-page-button",
    text: "→",
    attrs: { type: "button", "aria-label": t("pause.nextPage") }
  });
  const pageStatus = element("span", { attrs: { "aria-live": "polite" } });
  const updatePage = () => {
    Array.from(list.children).forEach((row, index) => {
      (row as HTMLElement).hidden = index < page * pageSize || index >= (page + 1) * pageSize;
    });
    pageStatus.textContent = t("pause.pageNumber", { current: page + 1, total: pageCount });
    previous.disabled = page === 0;
    next.disabled = page === pageCount - 1;
  };
  previous.onclick = () => {
    page = Math.max(0, page - 1);
    updatePage();
  };
  next.onclick = () => {
    page = Math.min(pageCount - 1, page + 1);
    updatePage();
  };
  updatePage();
  const pagination = element("nav", {
    className: "pause-pagination",
    attrs: { "aria-label": t("pause.todaySites") },
    children: [previous, pageStatus, next]
  });
  const root = element("section", {
    className: "screen-time",
    attrs: { "aria-label": t("pause.todayTotal") },
    children: [
      total,
      chart,
      element("div", {
        className: "screen-time__sites-heading",
        children: [element("h3", { text: t("pause.todaySites") }), allButton]
      }),
      ...(sites.length
        ? [list, ...(pageCount > 1 ? [pagination] : [])]
        : [element("p", { className: "screen-time__empty", text: t("pause.noUsage") })])
    ]
  });
  select(all);
  return root;

  function select(series: ScreenTimeSeries): void {
    for (const [id, button] of buttons)
      button.setAttribute("aria-pressed", String(id === series.id));
    chart.replaceChildren(createHourlyChart(series, axisMax));
  }
}

function duration(seconds: number): string {
  return formatDuration(seconds, true);
}
