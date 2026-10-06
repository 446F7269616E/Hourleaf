import { getResolvedLocale, t } from "../shared/i18n";
import { buildScreenTimeSeries, type ScreenTimeSeries } from "../shared/screen-time";
import type { FocusSettings, UsageSummary } from "../shared/types";
import { element, formatDuration } from "../styles/dom";

/** Screen-time overview shared by top-level pause pages and the in-site flow frame. */
export function createScreenTimeSummary(settings: FocusSettings, usage: UsageSummary): HTMLElement {
  const { all, sites } = buildScreenTimeSeries(settings, usage);
  all.label = t("pause.allSites");
  for (const site of sites) if (!site.label) site.label = t("pause.otherSites");
  const chart = element("div", { className: "screen-time__chart" });
  const buttons = new Map<string, HTMLButtonElement>();
  const axisMax = Math.max(900, Math.ceil(Math.max(...all.hourlySeconds) / 900) * 900);
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
          element("strong", { text: duration(site.totalSeconds) }),
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

function createHourlyChart(series: ScreenTimeSeries, axisMax: number): HTMLElement {
  const heading = element("div", {
    className: "screen-time__chart-heading",
    attrs: { "aria-live": "polite", "aria-atomic": "true" },
    children: [
      element("span", { text: series.label }),
      element("span", { text: duration(series.totalSeconds) })
    ]
  });
  const selection = element("p", {
    className: "screen-time__selection",
    attrs: { role: "status", "aria-live": "polite" }
  });
  const hourButtons: HTMLButtonElement[] = [];
  const bars = element("div", {
    className: "hour-chart__bars",
    attrs: { role: "group", "aria-label": t("pause.hourlyUsage", { site: series.label }) },
    children: series.hourlySeconds.map((seconds, hour) => {
      const label = t("pause.hourUsage", {
        start: `${String(hour).padStart(2, "0")}:00`,
        end: `${String(hour + 1).padStart(2, "0")}:00`,
        time: duration(seconds)
      });
      const button = element("button", {
        className: "hour-chart__hour",
        attrs: {
          type: "button",
          title: label,
          "aria-label": label,
          "aria-pressed": "false",
          tabindex: hour === 0 ? 0 : -1
        },
        children: [
          element("span", {
            className: "hour-chart__fill",
            attrs: {
              "aria-hidden": "true",
              style: `height: ${seconds > 0 ? Math.max(0.8, (seconds / axisMax) * 100) : 0}%`
            }
          })
        ]
      });
      button.onclick = () => {
        for (const candidate of hourButtons) {
          candidate.setAttribute("aria-pressed", String(candidate === button));
          candidate.tabIndex = candidate === button ? 0 : -1;
        }
        selection.textContent = label;
      };
      button.onkeydown = (event) => {
        const index =
          event.key === "ArrowRight"
            ? (hour + 1) % 24
            : event.key === "ArrowLeft"
              ? (hour + 23) % 24
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 23
                  : undefined;
        if (index === undefined) return;
        event.preventDefault();
        const next = hourButtons[index];
        next?.focus();
        next?.click();
      };
      hourButtons.push(button);
      return button;
    })
  });
  const plot = element("div", {
    className: "hour-chart",
    children: [
      element("div", {
        className: "hour-chart__plot",
        children: [
          element("div", {
            className: "hour-chart__grid",
            attrs: { "aria-hidden": "true" },
            children: [element("span"), element("span"), element("span")]
          }),
          bars
        ]
      }),
      element("div", {
        className: "hour-chart__axis-y",
        attrs: { "aria-hidden": "true" },
        children: [axisMax, axisMax / 2, 0].map((seconds) =>
          element("span", { text: t("pause.axisMinutes", { minutes: seconds / 60 }) })
        )
      }),
      element("div", {
        className: "hour-chart__axis-x",
        attrs: { "aria-hidden": "true" },
        children: ["00", "06", "12", "18", "24"].map((text) => element("span", { text }))
      })
    ]
  });
  return element("div", {
    children: [
      heading,
      plot,
      selection,
      ...(series.unallocatedSeconds > 0
        ? [
            element("p", {
              className: "screen-time__hint",
              text: t("pause.missingHours", { time: duration(series.unallocatedSeconds) })
            })
          ]
        : []),
      ...(series.totalSeconds === 0
        ? [element("p", { className: "screen-time__empty", text: t("pause.noUsage") })]
        : [])
    ]
  });
}

function duration(seconds: number): string {
  return formatDuration(seconds, true);
}
