import { t } from "../shared/i18n";
import type { PeriodRuntimeStatus } from "../shared/types";
import { element } from "../styles/dom";

/** Remaining groups stay filled; completed groups retain an outline. */
export function createGroupProgress(runtime: PeriodRuntimeStatus): HTMLElement {
  const total = Math.max(1, Math.min(24, Math.floor(runtime.groupCount)));
  const used = Math.max(0, Math.min(total, Math.floor(runtime.usedGroups)));
  const summary = t("pause.groupSummary", { used, total, remaining: total - used });
  return element("section", {
    className: "group-progress",
    attrs: { "aria-label": t("pause.groups") },
    children: [
      element("div", {
        className: "group-progress__heading",
        children: [element("h2", { text: t("pause.groups") }), element("span", { text: summary })]
      }),
      element("div", {
        className: "group-progress__track",
        attrs: {
          role: "progressbar",
          "aria-label": t("pause.remainingGroups"),
          "aria-valuemin": 0,
          "aria-valuemax": total,
          "aria-valuenow": total - used,
          "aria-valuetext": summary
        },
        children: Array.from({ length: total }, (_, index) =>
          element("span", {
            className: "group-progress__segment",
            dataset: { used: String(index < used) },
            attrs: { "aria-hidden": "true" }
          })
        )
      }),
      element("p", {
        className: "group-progress__legend",
        children: [
          element("span", {
            className: "group-progress__key group-progress__key--used",
            text: t("pause.hollowUsed")
          }),
          element("span", { className: "group-progress__key", text: t("pause.solidRemaining") })
        ]
      })
    ]
  });
}
