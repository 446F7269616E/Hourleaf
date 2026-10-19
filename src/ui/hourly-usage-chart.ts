import { t } from "../shared/i18n";
import type { ScreenTimeSeries } from "../shared/screen-time";
import { peakUsageHour } from "../shared/usage-insights";
import { element, formatDuration } from "../styles/dom";

export function hourlyAxisMaximum(hours: readonly number[]): number {
  return Math.max(900, Math.ceil(Math.max(0, ...hours) / 900) * 900);
}

export function createHourlyChart(
  series: ScreenTimeSeries,
  axisMax = hourlyAxisMaximum(series.hourlySeconds)
): HTMLElement {
  const heading = element("div", {
    className: "hourly-usage__heading",
    attrs: { "aria-live": "polite", "aria-atomic": "true" },
    children: [
      element("span", { text: series.label }),
      element("span", { text: duration(series.totalSeconds) })
    ]
  });
  const selection = element("p", {
    className: "hourly-usage__selection",
    attrs: { role: "status", "aria-live": "polite" }
  });
  const hourButtons: HTMLButtonElement[] = [];
  const bars = element("div", {
    className: "hour-chart__bars",
    attrs: { role: "group", "aria-label": t("usage.hourlyAria", { site: series.label }) },
    children: series.hourlySeconds.map((seconds, hour) => {
      const label = t("pause.hourUsage", {
        start: `${String(hour).padStart(2, "0")}:00`,
        end: `${String((hour + 1) % 24).padStart(2, "0")}:00`,
        time: duration(seconds)
      });
      const button = element("button", {
        className: "hour-chart__hour",
        dataset: { hour: String(hour) },
        attrs: {
          type: "button",
          title: label,
          "aria-label": label,
          "aria-pressed": "false",
          tabindex: hour === (peakUsageHour(series.hourlySeconds) ?? 0) ? 0 : -1
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
          element("span", { text: duration(seconds) })
        )
      }),
      element("div", {
        className: "hour-chart__axis-x",
        attrs: { "aria-hidden": "true" },
        children: ["00", "06", "12", "18", "00"].map((text) => element("span", { text }))
      })
    ]
  });
  const peak = peakUsageHour(series.hourlySeconds);
  if (peak !== null) {
    hourButtons[peak]?.click();
    selection.textContent = t("usage.peakHour", { detail: selection.textContent ?? "" });
  }
  return element("div", {
    className: "hourly-usage",
    children: [
      heading,
      plot,
      selection,
      ...(series.unallocatedSeconds > 0
        ? [
            element("p", {
              className: "hourly-usage__hint",
              text: t("pause.missingHours", { time: duration(series.unallocatedSeconds) })
            })
          ]
        : []),
      ...(series.totalSeconds === 0
        ? [element("p", { className: "hourly-usage__hint", text: t("pause.noUsage") })]
        : [])
    ]
  });
}

function duration(seconds: number): string {
  return formatDuration(seconds, true);
}
