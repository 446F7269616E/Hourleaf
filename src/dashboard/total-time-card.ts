import { getResolvedLocale, t } from "../shared/i18n";
import { element, icon } from "../styles/dom";

/** Keep duration units separate so large totals wrap between values, never inside digits. */
export function createTotalTimeCard(options: {
  label: string;
  seconds: number;
  status: string;
  tracking: boolean;
}): HTMLElement {
  const seconds = Math.max(0, Math.floor(Number.isFinite(options.seconds) ? options.seconds : 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts =
    hours > 0
      ? [
          { value: hours, unit: t("usage.hoursUnit") },
          { value: minutes, unit: t("usage.minutesUnit") }
        ]
      : [
          {
            value: seconds >= 60 ? minutes : seconds,
            unit: t(seconds >= 60 ? "usage.minutesUnit" : "usage.secondsUnit")
          }
        ];
  const number = new Intl.NumberFormat(getResolvedLocale());
  return element("article", {
    className: "metric-card total-time-card",
    dataset: { tracking: String(options.tracking) },
    children: [
      element("div", {
        className: "total-time-card__heading",
        children: [
          element("p", { className: "metric-card__label", text: options.label }),
          element("span", {
            className: "total-time-card__icon",
            attrs: { "aria-hidden": "true" },
            children: [icon("clock")]
          })
        ]
      }),
      element("p", {
        className: "total-time-card__duration",
        attrs: {
          "data-testid": "dashboard-total-time",
          "aria-label": parts.map((part) => `${number.format(part.value)} ${part.unit}`).join(" ")
        },
        children: parts.map((part) =>
          element("span", {
            className: "total-time-card__part",
            attrs: { "aria-hidden": "true" },
            children: [
              element("strong", { text: number.format(part.value) }),
              element("span", { text: part.unit })
            ]
          })
        )
      }),
      element("p", {
        className: "total-time-card__status",
        text: options.status,
        attrs: { "data-testid": "dashboard-live-status" }
      })
    ]
  });
}
