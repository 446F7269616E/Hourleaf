import {
  createPauseRecheck,
  nextPauseAccessCheckAt,
  pauseAccessChanged,
  planAllowsPauseResume,
  WEBSITE_ACCESS_CHANGED
} from "../shared/pause-access";
import { getExtensionApi, storageAddChangeListener, tabsGetCurrent } from "../shared/browser";
import { configureLocale, t } from "../shared/i18n";
import { sendRequest } from "../shared/messages";
import type {
  FocusSettings,
  PageDecision,
  PeriodRuntimeStatus,
  UsageSummary
} from "../shared/types";
import { assertAppRoot, element } from "../styles/dom";
import { createBrandMark } from "../ui/brand-mark";
import { applyTheme } from "../ui/theme";
import { createFlowChoice } from "../ui/flow-choice";
import { createUnlockControl } from "../ui/unlock-control";
import { createTimeBalance } from "../ui/time-balance";
import { centerPauseActions, createPauseLayout, createPauseNotes } from "../ui/pause-layout";
import {
  createNextPeriodDetails,
  createPausePeriodDetails,
  createPauseSiteDetails
} from "../ui/pause-details";
import { createGroupProgress } from "../ui/group-progress";
import { createScreenTimeSummary } from "../ui/screen-time-summary";
import { siteMatchesUrl } from "../shared/site-scope";
import { matchesPlanOrigin } from "../shared/plan-navigation";
import { createSiteUsageSummary } from "../ui/site-usage-summary";

const app = assertAppRoot();
const params = new URLSearchParams(location.hash.slice(1));
const source = params.get("source");
const targetId = params.get("targetId") ?? "";
const siteId = params.get("siteId") ?? "";
const itemId = params.get("itemId") ?? "";
const embedded = window.parent !== window;
let actionInFlight = false;
let accessResumed = false;
let resumePromise: Promise<void> | undefined;
let accessCheckTimer: ReturnType<typeof setTimeout> | undefined;
let rendering: Promise<void> | undefined;
let pauseViewDirty = true;
let currentDecision: PageDecision | undefined;
let decisionKey = "";
const recheckAccess = createPauseRecheck(async () => {
  if (source === "plan") return;
  await rendering;
  const resumed = await resumeAvailableVisit();
  if (!resumed && pauseViewDirty && !actionInFlight) {
    pauseViewDirty = false;
    await render();
  }
}, 30);

async function resumeAvailableVisit(): Promise<boolean> {
  if (accessResumed) return true;
  if (source === "plan" || actionInFlight) return false;
  const url = params.get("returnUrl");
  if (!url) return false;
  try {
    const tabId = (await tabsGetCurrent())?.id;
    const decision = await sendRequest({
      type: "GET_PAGE_DECISION",
      url,
      tabId,
      ...(targetId ? { targetId } : {})
    });
    currentDecision = decision;
    // Countdown ticks alone must not replace inputs or restart the friction UI.
    const key = JSON.stringify(decision, (name, value: unknown) =>
      name === "nextAccessCheckAt" || name === "visitConfirmationWaitSeconds" ? undefined : value
    );
    if (key !== decisionKey) pauseViewDirty = true;
    decisionKey = key;
    clearTimeout(accessCheckTimer);
    const deadline = nextPauseAccessCheckAt(decision, true);
    if (deadline !== undefined)
      accessCheckTimer = setTimeout(() => void recheckAccess(), Math.max(1, deadline - Date.now()));
    if (decision.blocked || actionInFlight) return false;
    const planDecision = await sendRequest({ type: "GET_PLAN_NAVIGATION_DECISION", url, tabId });
    if (!planAllowsPauseResume(planDecision) || actionInFlight) return false;
    // Extension previews omit the website's visit gate. A confirmation page
    // must observe an existing grant, rather than bounce back into itself.
    if (
      source === "confirmation" &&
      siteId &&
      !["tab-group-whitelist", "plan-access", "focus-disabled", "not-managed"].includes(
        decision.reason
      )
    ) {
      const gate = await sendRequest({ type: "GET_VISIT_GATE", url, siteId, tabId });
      if (!gate.alreadyGranted) return false;
    }
    // Standalone pages navigate only when shown. Embedded hosts can remove the
    // overlay in hidden tabs without autoplaying their preserved media.
    if (actionInFlight || document.visibilityState !== "visible") return false;
    await resume(url);
    return true;
  } catch {
    return false;
  }
}
if (source !== "plan") {
  // Notifications do not answer requests or reserve their response channel.
  getExtensionApi()?.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== getExtensionApi()?.runtime.id || !message || typeof message !== "object")
      return;
    if (!("type" in message)) return;
    if (message.type === WEBSITE_ACCESS_CHANGED) {
      if (!("siteId" in message) || message.siteId !== siteId) return;
    } else if (message.type !== "HOURLEAF_TAB_GROUP_ACCESS_CHANGED") return;
    pauseViewDirty = true;
    // Recheck asynchronously: the sender may still own the background write queue.
    void recheckAccess();
  });
  storageAddChangeListener((changes) => {
    if (pauseAccessChanged(changes, targetId)) {
      pauseViewDirty = true;
      void recheckAccess();
    }
  });
  getExtensionApi()?.tabs?.onUpdated?.addListener((_tabId, changeInfo) => {
    if (changeInfo.groupId !== undefined) void recheckAccess();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void recheckAccess();
  });
  window.addEventListener("focus", () => void recheckAccess());
  window.addEventListener("pageshow", () => void recheckAccess());
  window.addEventListener("pagehide", () => clearTimeout(accessCheckTimer));
}
if (source === "plan") void render();
else void recheckAccess();

function render(): Promise<void> {
  rendering ??= renderPage().finally(() => {
    rendering = undefined;
  });
  return rendering;
}

async function renderPage(): Promise<void> {
  try {
    const settings = await sendRequest({ type: "GET_SETTINGS" });
    configureLocale(settings.locale);
    applyTheme(settings.theme);
    document.title = "Hour Leaf";
    const card = element("section", {
      className: "end-card",
      children: [
        element("header", {
          className: "end-header",
          children: [
            createBrandMark(),
            element("div", {
              className: "end-heading",
              children: [element("h1", { text: "Hour Leaf" })]
            })
          ]
        })
      ]
    });
    if (source === "plan") {
      card.classList.add("end-card--plan");
      await renderPlan(card, settings);
    } else await renderFocus(card, settings);
    app.replaceChildren(element("div", { className: "end-backdrop", children: [card] }));
    centerPauseActions(app);
  } catch {
    const retry = element("button", { className: "btn", text: t("common.retry") });
    retry.onclick = () => void render();
    app.replaceChildren(
      element("section", {
        className: "end-card end-card--plan",
        children: [
          element("h1", { text: "Hour Leaf" }),
          element("p", { text: t("common.actionFailed"), attrs: { role: "alert" } }),
          retry
        ]
      })
    );
  }
}

async function renderFocus(card: HTMLElement, settings: FocusSettings): Promise<void> {
  if (accessResumed) return;
  const site = settings.sites[siteId];
  const target = settings.targets[targetId];
  const url = params.get("returnUrl");
  const validUrl = url && site && siteMatchesUrl(site, url) ? url : undefined;
  const usage = await sendRequest({ type: "GET_USAGE", period: "day" });
  let runtime: PeriodRuntimeStatus | undefined;
  const activePeriodId = currentDecision
    ? (currentDecision.activePeriodId ?? "")
    : (params.get("periodId") ?? "");
  let groupUnlocked = false;
  if (target && activePeriodId) {
    runtime = await sendRequest({ type: "GET_PERIOD_RUNTIME", targetId, periodId: activePeriodId });
    if (runtime.canUnlock && runtime.method === "wait")
      runtime = await sendRequest({
        type: "START_PERIOD_GROUP_WAIT",
        targetId,
        periodId: activePeriodId
      });
  }
  const { navigation, layout, overview, statistics, actions, messages } = createPauseLayout();
  card.append(navigation, layout);
  renderSummary(overview, statistics, settings, usage, runtime);
  const siteUsage = createSiteUsageSummary(settings, usage, siteId);
  if (siteUsage) messages.before(siteUsage);
  if (runtime) {
    const periodDetails = createPausePeriodDetails(settings, usage, runtime);
    if (periodDetails) overview.append(periodDetails);
  }
  const siteDetails = createPauseSiteDetails(settings, usage, siteId);
  if (siteDetails) actions.before(siteDetails);
  const notes = createPauseNotes([
    ...(source === "confirmation" &&
    site?.visitConfirmation?.promptEnabled &&
    site.visitConfirmation.prompt
      ? [site.visitConfirmation.prompt]
      : []),
    settings.endPage.motivationalMessage
  ]);
  if (notes) messages.append(notes);
  if (source === "confirmation" && validUrl) {
    const tabId = (await tabsGetCurrent())?.id;
    const gate = await sendRequest({ type: "GET_VISIT_GATE", url: validUrl, siteId, tabId });
    if (gate.alreadyGranted && document.visibilityState === "visible") {
      await resume(validUrl);
      return;
    }
    actions.append(
      createUnlockControl({
        ...gate,
        label: t("end.confirmVisit"),
        run: (proof) =>
          withPauseAction(async () => {
            const grant = await sendRequest({
              type: "GRANT_VISIT_CONFIRMATION",
              url: validUrl,
              siteId,
              tabId,
              proof
            });
            await resume(grant.url);
          })
      })
    );
  } else if (runtime && validUrl) {
    if (runtime.canFlow)
      actions.append(
        createFlowControls(validUrl, async (continuation) => {
          await sendRequest({
            type: "GRANT_PERIOD_FLOW",
            url: validUrl,
            targetId,
            periodId: activePeriodId,
            continuation
          });
        })
      );
    if (runtime.canUnlock)
      actions.append(
        createUnlockControl({
          ...runtime,
          label: t("end.openNextGroup"),
          run: (proof) =>
            withPauseAction(async () => {
              if (!groupUnlocked)
                await sendRequest({
                  type: "UNLOCK_PERIOD_GROUP",
                  targetId,
                  periodId: activePeriodId,
                  proof
                });
              groupUnlocked = true;
              await resume(validUrl);
            })
        })
      );
    if (runtime.canContinueLenient)
      actions.append(
        action(t("pause.continueLenient"), async () => {
          await sendRequest({ type: "ACKNOWLEDGE_LENIENT", targetId, periodId: activePeriodId });
          await resume(validUrl);
        })
      );
  }
  actions.append(closeAction(source === "confirmation" ? "focus" : source));
}

function renderSummary(
  overview: HTMLElement,
  statistics: HTMLElement,
  settings: FocusSettings,
  usage: UsageSummary,
  runtime?: PeriodRuntimeStatus
): void {
  if (runtime) overview.append(createTimeBalance(runtime), createGroupProgress(runtime));
  else {
    const target = settings.targets[targetId];
    const nextPeriod = target ? createNextPeriodDetails(target, usage) : null;
    overview.append(
      nextPeriod ?? element("p", { className: "end-message", text: t("pause.noActivePeriod") })
    );
  }
  statistics.append(createScreenTimeSummary(settings, usage));
}

async function renderPlan(card: HTMLElement, settings: FocusSettings): Promise<void> {
  const state = await sendRequest({ type: "GET_PLAN_STATE" });
  const item = state.queue.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("Plan item unavailable");
  const returnUrl = params.get("returnUrl");
  const validUrl = returnUrl && matchesPlanOrigin(item.url, returnUrl) ? returnUrl : item.url;
  const tabId = (await tabsGetCurrent())?.id;
  const notes = createPauseNotes([
    item.goal?.trim() || settings.endPage.motivationalMessage.trim() || t("pause.planEncouragement")
  ]);
  const actions = element("fieldset", { className: "end-action-set" });
  card.append(
    element("h2", { className: "end-plan-title", text: item.title }),
    ...(notes ? [notes] : []),
    element("p", {
      className: "end-message",
      text: t("pause.planDuration", { minutes: item.scheduledDurationMinutes })
    }),
    actions
  );
  if (params.get("reason") === "plan-start") {
    let started = false;
    actions.append(
      action(t("end.confirmVisit"), async () => {
        if (!started) {
          await sendRequest({ type: "START_PLAN_ITEM", id: item.id, tabId });
          started = true;
        }
        await resume(validUrl);
      })
    );
  } else {
    const decision = await sendRequest({
      type: "GET_PLAN_NAVIGATION_DECISION",
      url: validUrl,
      tabId
    });
    if (decision.flowDecisionRequired)
      actions.append(
        createFlowControls(validUrl, async (continuation) => {
          await sendRequest({
            type: "CONTINUE_PLAN_FLOW",
            itemId: item.id,
            url: validUrl,
            tabId,
            continuation
          });
        })
      );
    if (item.completionMode === "lenient")
      actions.append(
        action(t("pause.continueLenient"), async () => {
          await sendRequest({ type: "ACKNOWLEDGE_PLAN_END", itemId: item.id, tabId });
          await resume(validUrl);
        })
      );
  }
  actions.append(closeAction("plan"));
}

function createFlowControls(
  url: string,
  grant: (
    continuation: { kind: "minutes"; minutes: number } | { kind: "video-end" }
  ) => Promise<void>
): HTMLElement {
  return createFlowChoice({
    videoAvailable: embedded && params.get("video") === "1",
    grant,
    resume: () => resume(url),
    exclusive: withPauseAction
  });
}

async function withPauseAction(run: () => Promise<void>): Promise<void> {
  if (actionInFlight) throw new Error("A pause action is already running");
  actionInFlight = true;
  const controls = app.querySelector<HTMLFieldSetElement>(".end-action-set");
  if (controls) controls.disabled = true;
  try {
    await run();
  } finally {
    actionInFlight = false;
    if (controls) controls.disabled = false;
    void recheckAccess();
  }
}

function action(label: string, run: () => Promise<void | string>, primary = false): HTMLElement {
  const feedback = element("p", { className: "end-unlock__feedback", attrs: { role: "status" } });
  const button = element("button", {
    className: primary ? "btn btn--primary" : "btn",
    attrs: { type: "button" },
    text: label
  });
  button.onclick = () =>
    void (async () => {
      button.disabled = true;
      try {
        await withPauseAction(async () => {
          const result = await run();
          if (typeof result === "string") {
            feedback.textContent = result;
            button.disabled = false;
          }
        });
      } catch {
        feedback.textContent = t("common.actionFailed");
        button.disabled = false;
      }
    })();
  return element("div", { className: "end-actions", children: [button, feedback] });
}
function closeAction(kind: string | null): HTMLElement {
  return action(
    t(kind === "plan" ? "end.closeRelatedTabs" : "end.closeUngroupedTabs"),
    async () => {
      const tabId = (await tabsGetCurrent())?.id;
      if (kind === "plan" && itemId)
        await sendRequest({ type: "CLOSE_RELATED_TABS", source: "plan", itemId, tabId });
      else if (siteId) {
        const result = await sendRequest({
          type: "CLOSE_RELATED_TABS",
          source: "focus",
          siteId,
          tabId
        });
        return t("end.closedUngroupedTabs", { count: result.closedCount });
      } else window.close();
    },
    true
  );
}
async function resume(url: string): Promise<void> {
  resumePromise ??= restorePausedVisit(url)
    .then(() => {
      accessResumed = true;
      clearTimeout(accessCheckTimer);
    })
    .catch((error: unknown) => {
      resumePromise = undefined;
      throw error;
    });
  return resumePromise;
}

async function restorePausedVisit(url: string): Promise<void> {
  if (!embedded) {
    window.location.replace(url);
    return;
  }
  const channel = params.get("channel");
  if (!channel) throw new Error("The pause frame is outdated; reload the website");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sendRequest({ type: "RESUME_PAUSE_FRAME", channel, url }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Resume timed out")), 10000);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
