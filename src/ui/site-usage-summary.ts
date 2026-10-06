import { t } from "../shared/i18n";
import { buildScreenTimeSeries } from "../shared/screen-time";
import type { FocusSettings, UsageSummary } from "../shared/types";
import { element, formatDuration, icon } from "../styles/dom";

/** The site's daily total is distinct from the period quota and all-site total. */
export function createSiteUsageSummary(
  settings: FocusSettings,
  usage: UsageSummary,
  siteId: string
): HTMLElement | null {
  const site = buildScreenTimeSeries(settings, usage).sites.find((entry) => entry.id === siteId);
  if (!site) return null;
  return element("section", {
    className: "site-usage-summary",
    attrs: { "aria-label": t("pause.todayCurrentSite") },
    children: [
      element("span", {
        className: "site-usage-summary__symbol",
        attrs: { "aria-hidden": "true" },
        children: [icon("clock")]
      }),
      element("h2", { text: t("pause.todayCurrentSite") }),
      element("strong", { text: formatDuration(site.totalSeconds) }),
      element("p", { text: site.label, attrs: { title: site.label } })
    ]
  });
}
