import { resolveGroupQuota } from "../shared/group-quota";
import { formatLocalDate } from "../shared/analytics";
import {
  storageAddChangeListener,
  tabsAddActivatedListener,
  tabsAddUpdatedListener,
  tabsQuery
} from "../shared/browser";
import { configureLocale, localizeDocumentTitle, t } from "../shared/i18n";
import { sendRequest } from "../shared/messages";
import {
  remainingSecondsForDecision,
  resolveGroupedTargetAllowance,
  resolveTargetAllowance
} from "../shared/remaining-time";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { createBrandMark } from "../ui/brand-mark";
import { siteMatchesUrl } from "../shared/site-scope";
import { DEBUG_BUILD } from "../debug/flags";
import { applyTheme } from "../ui/theme";
import type {
  FocusSettings,
  ManagedSite,
  PageDecision,
  PlanItem,
  PlanState,
  SiteTargetSettings,
  TimePeriodSettings,
  TrackingStatus,
  UsageSummary
} from "../shared/types";
import { assertAppRoot, describeError, element, formatDuration, icon } from "../styles/dom";

interface PopupData {
  settings: FocusSettings;
  usage: UsageSummary;
  pageDecision: PageDecision | null;
  pageUrl: string | null;
  planState: PlanState | null;
  trackingStatus: TrackingStatus;
}

interface CurrentSiteSummary {
  site: ManagedSite | null;
  target: SiteTargetSettings | null;
  activePeriod: TimePeriodSettings | null;
  hostname: string | null;
  allowanceUsedSeconds: number;
  limitSeconds: number | null;
  remainingSeconds: number | null;
  groupCount: number;
  currentGroup: number;
  currentGroupRemainingSeconds: number | null;
  dailyRemainingSeconds: number | null;
}

const app = assertAppRoot();
let currentData: PopupData | null = null;
let refreshSequence = 0;
let refreshScheduled = false;
let debugToolsExpanded = false;

configureLocale("system");
void loadPopup();
const syncTimer = window.setInterval(() => void refreshLiveSummary(), 5_000);
const displayTimer = window.setInterval(() => advanceLiveUsage(), 1_000);
const removeTabActivatedListener = tabsAddActivatedListener(() => scheduleRefresh());
const removeTabUpdatedListener = tabsAddUpdatedListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url !== undefined || changeInfo.status === "complete")) {
    scheduleRefresh();
  }
});
const removeStorageListener = storageAddChangeListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (changes[STORAGE_KEYS.settings] ||
      changes[STORAGE_KEYS.planQueue] ||
      changes[STORAGE_KEYS.planAccess])
  ) {
    scheduleRefresh();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleRefresh();
});
window.addEventListener(
  "pagehide",
  () => {
    window.clearInterval(syncTimer);
    window.clearInterval(displayTimer);
    removeTabActivatedListener();
    removeTabUpdatedListener();
    removeStorageListener();
  },
  { once: true }
);

async function loadPopup(): Promise<void> {
  renderLoading();
  try {
    const data = await fetchPopupData();
    configureLocale(data.settings.locale);
    applyTheme(data.settings.theme);
    localizeDocumentTitle("popup");
    renderPopup(data);
  } catch (error) {
    renderError(describeError(error));
  }
}

async function refreshLiveSummary(): Promise<void> {
  if (document.visibilityState !== "visible") return;
  const sequence = ++refreshSequence;
  try {
    const data = await fetchPopupData();
    if (sequence !== refreshSequence) return;
    if (data.settings.locale !== currentData?.settings.locale) {
      configureLocale(data.settings.locale);
      localizeDocumentTitle("popup");
    }
    applyTheme(data.settings.theme);
    renderPopup(data);
  } catch {
    // 保留最近一次确认的数据，等待下一轮刷新恢复。
  }
}

async function fetchPopupData(): Promise<PopupData> {
  const [settings, usage, trackingStatus, tabs, planState] = await Promise.all([
    sendRequest({ type: "GET_SETTINGS" }).then((settings) => {
      applyTheme(settings.theme);
      configureLocale(settings.locale);
      return settings;
    }),
    sendRequest({ type: "GET_USAGE", period: "day" }),
    sendRequest({ type: "GET_TRACKING_STATUS" }),
    tabsQuery({ active: true, currentWindow: true }),
    // Plan data is supplementary to the current-site summary. Keep the popup usable
    // if an older background worker cannot provide it during an extension update.
    sendRequest({ type: "GET_PLAN_STATE" }).catch(() => null)
  ]);
  const pageUrl = tabs[0]?.url ?? null;
  const httpUrl = parseHttpUrl(pageUrl);
  const pageDecision = httpUrl
    ? await sendRequest({ type: "GET_PAGE_DECISION", url: httpUrl.href, tabId: tabs[0]?.id })
    : null;
  return { settings, usage, trackingStatus, pageDecision, pageUrl, planState };
}

function scheduleRefresh(): void {
  if (refreshScheduled) return;
  refreshScheduled = true;
  window.setTimeout(() => {
    refreshScheduled = false;
    void refreshLiveSummary();
  }, 0);
}

function advanceLiveUsage(): void {
  const data = currentData;
  if (!data || document.visibilityState !== "visible" || !data.trackingStatus.isTracking) return;
  const targetId = data.trackingStatus.targetId;
  if (!targetId || data.pageDecision?.targetId !== targetId) return;
  const activePeriodId = data.pageDecision.activePeriodId;
  if (formatLocalDate(new Date()) !== data.usage.startDate) {
    scheduleRefresh();
    return;
  }
  const period = data.settings.targets[targetId]?.timePeriods.find(
    (item) => item.id === activePeriodId
  );
  const isFlow = data.pageDecision.reason === "flow-extension";
  let increment = 1;
  if (
    isFlow &&
    data.pageDecision.flowExpiresAt !== undefined &&
    data.pageDecision.flowExpiresAt <= Date.now()
  ) {
    scheduleRefresh();
    return;
  }
  if (
    period &&
    !isFlow &&
    data.pageDecision.reason !== "domain-allow" &&
    !data.pageDecision.needsReminder
  ) {
    const quota = resolveGroupQuota(
      period,
      data.usage.byPeriod[period.id] ?? 0,
      data.pageDecision.groupIndex
    );
    increment = Math.min(increment, quota.availableMs / 1000);
    if (increment === 0) {
      scheduleRefresh();
      return;
    }
  }
  const usage: UsageSummary = {
    ...data.usage,
    totalSeconds: data.usage.totalSeconds + increment,
    byTarget: {
      ...data.usage.byTarget,
      [targetId]: (data.usage.byTarget[targetId] ?? 0) + increment
    },
    byPeriod:
      activePeriodId &&
      data.pageDecision.reason !== "domain-allow" &&
      !(data.pageDecision.reason === "flow-extension" && !data.pageDecision.flowConsumesQuota)
        ? {
            ...data.usage.byPeriod,
            [activePeriodId]: (data.usage.byPeriod[activePeriodId] ?? 0) + increment
          }
        : data.usage.byPeriod
  };
  renderPopup({ ...data, usage });
}

function renderLoading(): void {
  app.replaceChildren(
    element("div", {
      className: "popup-shell",
      attrs: { "aria-busy": "true" },
      children: [
        createHeader(),
        element("section", {
          className: "current-site-card card skeleton",
          text: t("popup.loading")
        }),
        createMainLink()
      ]
    })
  );
}

function renderError(message: string): void {
  const retry = element("button", {
    className: "btn btn--primary",
    text: t("options.reload"),
    attrs: { type: "button" }
  });
  retry.addEventListener("click", () => void loadPopup());

  app.replaceChildren(
    element("div", {
      className: "popup-shell",
      children: [
        createHeader(),
        element("section", {
          className: "state-view card popup-error",
          attrs: { role: "alert" },
          children: [
            element("div", {
              children: [
                element("div", { className: "state-view__icon", children: [icon("warning")] }),
                element("h2", { text: t("popup.loadFailed") }),
                element("p", { text: message }),
                retry
              ]
            })
          ]
        }),
        createMainLink()
      ]
    })
  );
}

function renderPopup(data: PopupData): void {
  currentData = data;
  const summary = resolveCurrentSiteSummary(data);
  const content = createPopupContent(data, summary);
  const existingContent = app.querySelector<HTMLElement>(".popup-content");
  if (existingContent && app.querySelector(".popup-shell")) {
    existingContent.replaceWith(content);
    return;
  }
  app.replaceChildren(
    element("div", {
      className: "popup-shell",
      children: [
        createHeader(),
        content,
        createMainLink(),
        element("p", {
          className: "popup-footer",
          text: t("popup.localOnly")
        })
      ]
    })
  );
}

function createPopupContent(data: PopupData, summary: CurrentSiteSummary): HTMLElement {
  return element("div", {
    className: "popup-content",
    children: [
      createCurrentSiteCard(data, summary),
      createPlanPreview(data.planState),
      ...(DEBUG_BUILD ? [createDebugTools(data)] : [])
    ]
  });
}

function resolveCurrentSiteSummary(data: PopupData): CurrentSiteSummary {
  const parsedUrl = parseHttpUrl(data.pageUrl);
  const decisionTarget = data.pageDecision?.targetId
    ? (data.settings.targets[data.pageDecision.targetId] ?? null)
    : null;
  const trackingTarget = data.trackingStatus.targetId
    ? (data.settings.targets[data.trackingStatus.targetId] ?? null)
    : null;
  const trackingSite = trackingTarget ? (data.settings.sites[trackingTarget.siteId] ?? null) : null;
  const candidateTarget =
    decisionTarget ?? (trackingSite?.origin === parsedUrl?.origin ? trackingTarget : null);
  const siteId = data.pageDecision?.siteId ?? candidateTarget?.siteId;
  const site = siteId
    ? (data.settings.sites[siteId] ?? null)
    : (Object.values(data.settings.sites).find((candidate) =>
        Boolean(parsedUrl && siteMatchesUrl(candidate, parsedUrl))
      ) ?? null);
  const target = candidateTarget?.siteId === site?.id ? candidateTarget : null;
  const allowance = target
    ? resolveTargetAllowance(target, data.usage, data.pageDecision?.activePeriodId)
    : null;
  const groupedAllowance = target
    ? resolveGroupedTargetAllowance(
        target,
        data.usage,
        data.pageDecision?.activePeriodId,
        data.pageDecision?.groupIndex
      )
    : null;
  const remainingSeconds =
    target && data.pageDecision
      ? remainingSecondsForDecision(target, data.usage, data.pageDecision)
      : (allowance?.remainingSeconds ?? null);

  return {
    site,
    target,
    activePeriod: allowance?.activePeriod ?? null,
    hostname: site?.hostname ?? parsedUrl?.hostname ?? null,
    allowanceUsedSeconds: allowance?.allowanceUsedSeconds ?? 0,
    limitSeconds: allowance?.limitSeconds ?? null,
    remainingSeconds,
    groupCount: groupedAllowance?.groupCount ?? 1,
    currentGroup: groupedAllowance?.currentGroup ?? 1,
    currentGroupRemainingSeconds: groupedAllowance?.currentGroupRemainingSeconds ?? null,
    dailyRemainingSeconds: groupedAllowance?.dailyRemainingSeconds ?? null
  };
}

function createCurrentSiteCard(data: PopupData, summary: CurrentSiteSummary): HTMLElement {
  const configured = Boolean(summary.site);
  const hasMultipleGroups = configured && summary.groupCount > 1;
  const progress =
    summary.limitSeconds === null || summary.limitSeconds <= 0
      ? 0
      : Math.min(100, (summary.allowanceUsedSeconds / summary.limitSeconds) * 100);
  const label = summary.site?.label || summary.hostname || t("popup.currentPage");
  const scope = summary.target
    ? [
        summary.hostname ?? t("popup.currentWebsite"),
        summary.target.label,
        summary.activePeriod?.name ||
          (summary.activePeriod ? t("popup.defaultPeriodName") : undefined)
      ]
        .filter(Boolean)
        .join(" · ")
    : configured
      ? summary.hostname
      : t("popup.unconfiguredScope");
  const status = describeCurrentStatus(data, summary);
  const remaining = formatRemaining(configured ? summary.remainingSeconds : null, configured);
  const metrics = hasMultipleGroups
    ? [
        createMetric(
          t("popup.currentGroupRemaining"),
          formatRemaining(summary.currentGroupRemainingSeconds, true),
          "popup-current-group-remaining"
        ),
        createMetric(
          t("popup.periodRemaining"),
          formatRemaining(summary.remainingSeconds, true),
          "popup-period-remaining"
        ),
        createMetric(
          t("popup.todayRemaining"),
          formatRemaining(summary.dailyRemainingSeconds, true),
          "popup-today-remaining"
        )
      ]
    : [createMetric(t("popup.remaining"), remaining, "popup-remaining-time")];

  return element("section", {
    className: "current-site-card card",
    attrs: { "aria-labelledby": "current-site-title" },
    children: [
      element("header", {
        className: "current-site-card__header",
        children: [
          element("div", {
            className: "current-site-card__identity",
            children: [
              element("span", {
                className: "current-site-card__icon",
                children: [icon(configured ? "clock" : "eye")]
              }),
              element("div", {
                children: [
                  element("p", { text: t("popup.currentWebsite") }),
                  element("h1", { text: label, attrs: { id: "current-site-title" } }),
                  element("span", { text: scope ?? "" }),
                  configured
                    ? element("span", {
                        className: "current-site-card__group",
                        text: t("popup.groupProgress", {
                          current: summary.currentGroup,
                          total: summary.groupCount
                        })
                      })
                    : null
                ]
              })
            ]
          }),
          element("span", {
            className: "current-site-card__status",
            dataset: { status: status.kind },
            text: status.label
          })
        ]
      }),
      element("div", {
        className: "current-site-card__metrics",
        dataset: { count: String(metrics.length) },
        children: metrics
      }),
      summary.limitSeconds === null || !configured
        ? element("p", {
            className: "current-site-card__note",
            text: configured ? t("popup.noLimit") : t("popup.configureHint")
          })
        : element("div", {
            className: "current-site-card__progress",
            attrs: {
              role: "progressbar",
              "aria-label": t("popup.limitProgress"),
              "aria-valuemin": "0",
              "aria-valuemax": "100",
              "aria-valuenow": String(Math.round(progress))
            },
            children: [element("span", { attrs: { style: `width: ${progress.toFixed(2)}%` } })]
          })
    ]
  });
}

function formatRemaining(remainingSeconds: number | null, configured: boolean): string {
  if (!configured) return t("popup.notConfigured");
  return remainingSeconds === null ? t("popup.unlimited") : formatDuration(remainingSeconds);
}

function createMetric(label: string, value: string, testId: string): HTMLElement {
  return element("div", {
    className: "current-site-card__metric",
    children: [
      element("span", { text: label }),
      element("strong", { text: value, attrs: { "data-testid": testId } })
    ]
  });
}

function createPlanPreview(planState: PlanState | null): HTMLElement {
  const pending = planState ? getPendingItems(planState) : [];
  const visibleItems = pending.slice(0, 3);

  return element("section", {
    className: "popup-plan-card card",
    attrs: { "aria-labelledby": "popup-plan-title" },
    children: [
      element("header", {
        className: "popup-plan-card__header",
        children: [
          element("div", {
            className: "popup-plan-card__heading",
            children: [
              element("span", { className: "popup-plan-card__icon", children: [icon("calendar")] }),
              element("h2", { text: t("plan.pending"), attrs: { id: "popup-plan-title" } })
            ]
          }),
          planState
            ? element("span", {
                className: "popup-plan-card__count",
                text: t("plan.pendingCount", { count: pending.length })
              })
            : null
        ]
      }),
      planState === null
        ? element("p", { className: "popup-plan-card__empty", text: t("popup.planUnavailable") })
        : pending.length === 0
          ? element("p", { className: "popup-plan-card__empty", text: t("plan.noPending") })
          : element("div", {
              className: "popup-plan-card__items",
              children: [
                element("ol", {
                  className: "popup-plan-card__list",
                  attrs: { "aria-label": t("plan.pending") },
                  children: visibleItems.map((item) => createPlanPreviewItem(item))
                }),
                pending.length > visibleItems.length
                  ? element("p", {
                      className: "popup-plan-card__more",
                      text: t("popup.morePending", {
                        count: pending.length - visibleItems.length
                      })
                    })
                  : null
              ]
            })
    ]
  });
}

function getPendingItems(planState: PlanState): PlanItem[] {
  return planState.queue.items
    .filter((item) => item.status === "pending")
    .sort((left, right) => left.order - right.order);
}

function createPlanPreviewItem(item: PlanItem): HTMLElement {
  return element("li", {
    className: "popup-plan-card__item",
    children: [
      element("span", { className: "popup-plan-card__item-marker", children: [icon("check")] }),
      element("span", { className: "popup-plan-card__item-title", text: item.title })
    ]
  });
}

function describeCurrentStatus(
  data: PopupData,
  summary: CurrentSiteSummary
): { kind: "active" | "blocked" | "paused" | "unmanaged"; label: string } {
  if (!summary.site) return { kind: "unmanaged", label: t("popup.notConfigured") };
  if (!data.settings.enabled) {
    return { kind: "paused", label: t("popup.paused") };
  }
  if (data.pageDecision?.blocked) return { kind: "blocked", label: t("popup.restricted") };
  const trackingTarget = data.trackingStatus.targetId
    ? data.settings.targets[data.trackingStatus.targetId]
    : undefined;
  if (data.trackingStatus.isTracking && trackingTarget?.siteId === summary.site.id) {
    return { kind: "active", label: t("popup.tracking") };
  }
  return { kind: "paused", label: t("popup.notTracking") };
}

function createHeader(): HTMLElement {
  return element("header", {
    className: "popup-header",
    children: [
      element("div", {
        className: "brand",
        attrs: { "aria-label": "Hourleaf" },
        children: [
          createBrandMark(),
          element("span", {
            className: "brand__meta",
            children: [
              element("span", { text: "Hourleaf" }),
              element("small", { text: t("popup.summary") })
            ]
          })
        ]
      })
    ]
  });
}

function createMainLink(): HTMLAnchorElement {
  return element("a", {
    className: "btn btn--primary popup-main-link",
    attrs: {
      href: "plan.html",
      target: "_blank",
      rel: "noreferrer",
      "data-testid": "popup-open-plan"
    },
    children: [icon("calendar"), t("popup.openPlan")]
  });
}

function parseHttpUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function createDebugTools(data: PopupData): HTMLElement {
  const feedback = element("p", { attrs: { role: "status" } });
  const definitions = [
    ["preview", "pause.debugPreview"],
    ["consume-group", "pause.debugGroup"],
    ["consume-period", "pause.debugPeriod"],
    ["setup", "pause.debugSetup"]
  ] as const;
  const details = element("details", {
    className: "card popup-debug-tools",
    children: [
      element("summary", { text: "Debug" }),
      element("div", {
        className: "popup-debug-tools__content",
        children: [
          ...definitions.map(([action, label]) => {
            const button = element("button", {
              className: "btn",
              text: t(label),
              attrs: { type: "button" }
            });
            button.onclick = () =>
              void (async () => {
                button.disabled = true;
                try {
                  const result = await sendRequest({
                    type: "DEBUG_ACTION",
                    action,
                    ...(data.pageUrl && parseHttpUrl(data.pageUrl) ? { url: data.pageUrl } : {})
                  });
                  if (result.url) window.open(result.url, "_blank");
                  scheduleRefresh();
                } catch (error) {
                  feedback.textContent = describeError(error);
                  button.disabled = false;
                }
              })();
            return button;
          }),
          feedback
        ]
      })
    ]
  });
  details.open = debugToolsExpanded;
  details.ontoggle = () => {
    if (details.isConnected) debugToolsExpanded = details.open;
  };
  return details;
}
