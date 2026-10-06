import { t } from "../shared/i18n";
import type { PeriodRuntimeStatus } from "../shared/types";
import { element, formatDuration } from "../styles/dom";

/** A continuous ring compares actual elapsed time with remaining quota, not groups. */
export function createTimeBalance(runtime: PeriodRuntimeStatus): HTMLElement {
  const used = Math.max(0, runtime.usedSeconds);
  const remaining =
    runtime.remainingSeconds === null ? null : Math.max(0, runtime.remainingSeconds);
  const total = used + (remaining ?? 0);
  const percentage = remaining === null || total === 0 ? 0 : Math.min(100, (used / total) * 100);
  const usedText = formatDuration(used);
  const remainingText = remaining === null ? t("pause.unlimited") : formatDuration(remaining);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("aria-hidden", "true");
  for (const className of ["time-balance__track", "time-balance__used"]) {
    const circle = document.createElementNS(svg.namespaceURI, "circle");
    for (const [name, value] of Object.entries({
      cx: "60",
      cy: "60",
      r: "51",
      pathLength: "100",
      fill: "none",
      "stroke-width": "9",
      class: className
    }))
      circle.setAttribute(name, value);
    if (className.endsWith("__used")) {
      circle.setAttribute("stroke-dasharray", `${percentage} ${100 - percentage}`);
      circle.setAttribute("transform", "rotate(-90 60 60)");
    }
    svg.append(circle);
  }
  const metric = (label: string, value: string, kind: string) =>
    element("div", {
      className: `time-balance__metric time-balance__metric--${kind}`,
      children: [element("dt", { text: label }), element("dd", { text: value })]
    });
  return element("section", {
    className: "time-balance",
    dataset: { unlimited: String(remaining === null), empty: String(total === 0) },
    attrs: { "aria-label": t("pause.timeBalance") },
    children: [
      element("h2", { text: t("pause.timeBalance") }),
      element("div", {
        className: "time-balance__body",
        children: [
          element("div", {
            className: "time-balance__ring",
            children: [
              svg,
              element("span", {
                className: "time-balance__center",
                attrs: { "aria-hidden": "true" },
                children: [
                  element("strong", {
                    text:
                      remaining === null
                        ? "∞"
                        : `${total === 0 ? 0 : Math.round(100 - percentage)}%`
                  }),
                  element("span", {
                    text: remaining === null ? t("pause.unlimited") : t("pause.remainingShare")
                  })
                ]
              })
            ]
          }),
          element("dl", {
            className: "time-balance__values",
            children: [
              metric(t("pause.periodUsedTime"), usedText, "used"),
              metric(t("pause.remainingTime"), remainingText, "remaining")
            ]
          })
        ]
      }),
      ...(runtime.extraSeconds > 0
        ? [
            element("p", {
              className: "time-balance__extra",
              text: t("pause.extraTime", { time: formatDuration(runtime.extraSeconds) })
            })
          ]
        : [])
    ]
  });
}
