import {
  getExtensionApi,
  runtimeAddMessageListener,
  runtimeGetURL,
  storageAddChangeListener
} from "../shared/browser";
import { formatLocalDate } from "../shared/analytics";
import { sendRequest, type SessionEvent } from "../shared/messages";
import { configureLocale, t } from "../shared/i18n";
import type { PageDecision, PlanNavigationDecision } from "../shared/types";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { resolveSiteModule, subscribeSiteModuleRegistry } from "../modules/registry";
import { ContentFilterController } from "./content-filters";
import { LocalPageRuleController } from "./local-page-rules";

const ROOT_ID = "hourleaf-block-root";
const HEARTBEAT_INTERVAL_MS = 15_000;
const ROUTE_POLL_INTERVAL_MS = 1_000;
const SESSION_ID = createSessionId();
const contentFilters = new ContentFilterController();
const localPageRules = new LocalPageRuleController(document);
const CONTENT_RUNTIME_KEY = "__hourleafContentRuntimeV1";
type ContentRuntimeGlobal = typeof globalThis & { [CONTENT_RUNTIME_KEY]?: true };

let lastSeenUrl = window.location.href;
let evaluationGeneration = 0;
let mediaObserver: MutationObserver | null = null;
let bodyWasInert = false;
let managedBody: HTMLElement | null = null;
let contentStarted = false;
let planCheckGeneration = 0;
let initializationRetry: ReturnType<typeof setTimeout> | null = null;
let flowEndedCleanup: (() => void) | null = null;
let pauseFrameResume: ((channel: string) => Promise<boolean>) | undefined;
let planDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
let planDeadlineKey = "";
let filterScheduleTimer: ReturnType<typeof setTimeout> | undefined;
let filterScheduleDeadline: number | undefined;

startContentRuntimeOnce();

function startContentRuntimeOnce(): void {
  const runtimeGlobal = globalThis as ContentRuntimeGlobal;
  if (runtimeGlobal[CONTENT_RUNTIME_KEY]) return;
  runtimeGlobal[CONTENT_RUNTIME_KEY] = true;
  runtimeAddMessageListener(async (message, sender) => {
    if (
      !getExtensionApi()?.runtime.id ||
      sender.id !== getExtensionApi()?.runtime.id ||
      typeof message !== "object" ||
      message === null
    )
      return undefined;
    const request = message as { type?: unknown; channel?: unknown };
    if (request.type !== "hourleaf:resume-pause" || typeof request.channel !== "string")
      return undefined;
    try {
      return { resumed: (await pauseFrameResume?.(request.channel)) ?? false };
    } catch {
      return { resumed: false };
    }
  });

  subscribeSiteModuleRegistry(() => void evaluatePage());
  configureLocale("system");
  void initializeContent();

  window.addEventListener("popstate", routeMayHaveChanged);
  window.addEventListener("hashchange", routeMayHaveChanged);
  document.addEventListener("visibilitychange", () => {
    if (!contentStarted) return;
    if (document.visibilityState === "visible") void refreshContentState();
    else void sendSessionUpdate("heartbeat");
  });
  // Returning from the standalone end page commonly restores this document
  // from the back/forward cache. Re-establish a fresh session instead of
  // waiting for the regular heartbeat, so an unlocked next group starts
  // tracking and enforcing immediately.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && document.visibilityState === "visible") {
      contentStarted = false;
      void initializeContent();
    }
  });
  storageAddChangeListener((changes, areaName) => {
    if (areaName !== "local") return;
    const settingsChanged = changes[STORAGE_KEYS.settings];
    const changed =
      settingsChanged ?? changes[STORAGE_KEYS.localModules] ?? changes[STORAGE_KEYS.planAccess];
    if (!changed || changed.newValue === undefined) return;
    if (settingsChanged && (settingsChanged.newValue as { enabled?: boolean })?.enabled === false)
      removeBlockPage();
    void (settingsChanged ? syncContentLocale().then(() => evaluatePage()) : evaluatePage());
  });
  window.addEventListener("pagehide", () => {
    clearPlanDeadline();
    clearFilterScheduleTimer();
    if (!contentStarted) return;
    contentStarted = false;
    void sendSessionUpdate("stop");
  });

  setInterval(() => {
    void refreshContentState();
  }, HEARTBEAT_INTERVAL_MS);

  // Isolated content-script worlds cannot reliably monkey-patch the page's History
  // object in every browser. A cheap URL-only poll covers pushState/replaceState and
  // site-specific SPA navigation is covered without injecting code into the page world.
  setInterval(routeMayHaveChanged, ROUTE_POLL_INTERVAL_MS);
}

function routeMayHaveChanged(): void {
  if (window.location.href === lastSeenUrl) return;
  lastSeenUrl = window.location.href;
  void handleRouteChange();
}

async function initializeContent(): Promise<void> {
  await syncContentLocale();
  const outcome = await enforcePlanNavigation();
  if (outcome === "unavailable") {
    scheduleInitializationRetry();
    return;
  }
  if (outcome === "redirected" || contentStarted) return;
  contentStarted = true;
  await sendSessionUpdate("start");
  await evaluatePage(true);
}

async function handleRouteChange(): Promise<void> {
  removeBlockPage();
  flowEndedCleanup?.();
  flowEndedCleanup = null;
  if (contentStarted) await sendSessionUpdate("stop");
  contentStarted = false;
  const outcome = await enforcePlanNavigation();
  if (outcome === "unavailable") {
    scheduleInitializationRetry();
    return;
  }
  if (outcome === "redirected") return;
  contentStarted = true;
  await sendSessionUpdate("route");
  await evaluatePage(true);
}

async function refreshContentState(): Promise<void> {
  const outcome = await enforcePlanNavigation();
  if (outcome === "unavailable") return;
  if (outcome === "redirected") return;
  if (!contentStarted) {
    contentStarted = true;
    await sendSessionUpdate("start");
  } else {
    await sendSessionUpdate("heartbeat");
  }
  await evaluatePage(true);
}

async function enforcePlanNavigation(): Promise<"allowed" | "redirected" | "unavailable"> {
  if (pauseFrameCleanup && document.getElementById(ROOT_ID)) return "redirected";
  const module = resolveSiteModule(window.location.href);
  const checkedUrl = window.location.href;
  const generation = ++planCheckGeneration;
  try {
    const decision = await sendRequest(
      module?.plan
        ? module.plan.createNavigationRequest(window.location.href)
        : { type: "GET_PLAN_NAVIGATION_DECISION", url: window.location.href }
    );
    if (generation !== planCheckGeneration || checkedUrl !== window.location.href)
      return "unavailable";
    syncPlanDeadline(decision);
    if (decision.allowed) {
      if (decision.reason === "authorized" && decision.itemId)
        sessionStorage.removeItem(`hourleaf-plan-pause:${decision.itemId}`);
      if (
        decision.reason === "expired" &&
        decision.itemId &&
        decision.completionMode === "lenient"
      ) {
        if (!sessionStorage.getItem(`hourleaf-plan-pause:${decision.itemId}`)) {
          await whenDocumentReady();
          showPauseFrame({ source: "plan", itemId: decision.itemId, reason: "expired" });
          return "redirected";
        }
      }
      if (decision.flowContinuationKind === "video-end" && decision.itemId) {
        monitorVideoEnd(`plan:${decision.itemId}:${decision.expiresAt}`, undefined, async () => {
          await sendRequest({
            type: "STOP_PLAN_FLOW",
            itemId: decision.itemId as string,
            reason: "video-ended",
            url: window.location.href
          });
          showPauseFrame({ source: "plan", itemId: decision.itemId, reason: "expired" });
        });
      } else if (decision.pauseOnVideoEnd && decision.itemId) {
        monitorVideoEnd(
          `plan-pause:${decision.itemId}:${decision.expiresAt}`,
          undefined,
          async () => {
            await sendRequest({
              type: "STOP_PLAN_ACCESS",
              itemId: decision.itemId as string,
              reason: "video-ended",
              url: window.location.href
            });
            showPauseFrame({ source: "plan", itemId: decision.itemId, reason: "video-ended" });
          }
        );
      }
      return "allowed";
    }
    // A denied plan grant is not a global website restriction. Older background
    // versions can still return not-authorized/not-video for ordinary visits.
    // Only a concrete plan expiry owns a pause here; focus rules run afterwards.
    if (decision.reason !== "expired" || !decision.itemId) return "allowed";
    if (contentStarted) await sendSessionUpdate("stop");
    contentStarted = false;
    if (
      decision.reason === "expired" &&
      decision.completionMode === "flow" &&
      decision.flowDecisionRequired &&
      decision.itemId
    ) {
      await whenDocumentReady();
      const flowKey = `plan:${decision.itemId}`;
      if (document.getElementById(ROOT_ID)?.dataset.flowKey === flowKey) return "redirected";
      removeBlockPage();
      renderPlanFlowChoice(decision);
      return "redirected";
    }
    removeBlockPage();
    await whenDocumentReady();
    showPauseFrame({ source: "plan", itemId: decision.itemId, reason: "expired" });
    return "redirected";
  } catch {
    // A newly waking event page can miss the first document_start request.
    // Do not begin tracking or focus evaluation until an authoritative answer
    // arrives; the retry below does not backfill the unavailable interval.
    return "unavailable";
  }
}

function clearFilterScheduleTimer(): void {
  clearTimeout(filterScheduleTimer);
  filterScheduleTimer = undefined;
  filterScheduleDeadline = undefined;
}

function syncFilterScheduleTimer(deadline: number | undefined): void {
  if (deadline === filterScheduleDeadline) return;
  clearFilterScheduleTimer();
  if (deadline === undefined) return;
  filterScheduleDeadline = deadline;
  filterScheduleTimer = setTimeout(
    () => {
      clearFilterScheduleTimer();
      void evaluatePage();
    },
    Math.max(0, Math.min(2_147_483_647, deadline - Date.now()))
  );
}

function clearPlanDeadline(): void {
  clearTimeout(planDeadlineTimer);
  planDeadlineTimer = undefined;
  planDeadlineKey = "";
}

/** Check the actual deadline even when neither the route nor storage changes. */
function syncPlanDeadline(decision: PlanNavigationDecision): void {
  if (
    decision.reason !== "authorized" ||
    !decision.allowed ||
    !decision.itemId ||
    decision.expiresAt === undefined ||
    decision.flowContinuationKind === "video-end"
  ) {
    clearPlanDeadline();
    return;
  }
  const key = `${decision.itemId}:${decision.expiresAt}`;
  if (key === planDeadlineKey) return;
  clearPlanDeadline();
  planDeadlineKey = key;
  planDeadlineTimer = setTimeout(
    () => {
      clearPlanDeadline();
      void refreshContentState();
    },
    Math.max(0, Math.min(2_147_483_647, decision.expiresAt - Date.now()))
  );
}

function scheduleInitializationRetry(): void {
  if (initializationRetry !== null) return;
  initializationRetry = setTimeout(() => {
    initializationRetry = null;
    void initializeContent();
  }, 750);
}

async function sendSessionUpdate(event: SessionEvent): Promise<void> {
  try {
    const match = resolveSiteModule(window.location.href)?.match(window.location.href);
    await sendRequest({
      type: "SESSION_UPDATE",
      event,
      sessionId: SESSION_ID,
      url: window.location.href,
      ...(match ? { targetId: match.targetId } : {}),
      visibility: document.visibilityState === "visible" ? "visible" : "hidden"
    });
  } catch {
    // Non-persistent backgrounds can be unavailable briefly. The next heartbeat
    // re-establishes the session without backfilling unverified elapsed time.
  }
}

async function evaluatePage(planChecked = false): Promise<void> {
  if (pauseFrameCleanup && document.getElementById(ROOT_ID)) return;
  const topLevelUrl = window.location.href;
  // Plan notifications take priority over ordinary focus rules, including the
  // storage event emitted when an expired grant disables plan mode.
  if (
    (!planChecked && (await enforcePlanNavigation()) !== "allowed") ||
    topLevelUrl !== window.location.href
  )
    return;
  const url = topLevelUrl;
  const module = resolveSiteModule(url);
  const match = module?.match(url);
  const generation = ++evaluationGeneration;
  try {
    const [decision, settings, localRules] = await Promise.all([
      sendRequest({
        type: "GET_PAGE_DECISION",
        url,
        ...(match ? { targetId: match.targetId } : {})
      }),
      sendRequest({ type: "GET_SETTINGS" }),
      sendRequest({ type: "GET_LOCAL_PAGE_RULES", url }).catch(() => ({
        css: "",
        hideSelectors: [],
        moduleIds: [],
        nextScheduleCheckAt: undefined
      }))
    ]);
    if (generation !== evaluationGeneration || topLevelUrl !== window.location.href) return;
    configureLocale(settings.locale);
    contentFilters.apply(
      settings.enabled
        ? (module?.contentSettings(settings) ?? settings.contentFilters)
        : { ...settings.contentFilters, enabled: false },
      url
    );
    localPageRules.apply(
      settings.enabled ? localRules : { css: "", hideSelectors: [], moduleIds: [] }
    );
    syncFilterScheduleTimer(settings.enabled ? localRules.nextScheduleCheckAt : undefined);
    if (!decision.blocked) {
      removeBlockPage();
      if (decision.needsReminder && decision.activePeriodId) {
        void showReminder(
          t("end.title"),
          t("end.limitMessage", { site: "Hourleaf" }),
          `focus:${decision.activePeriodId}`
        );
      }
      if (
        decision.flowContinuationKind === "video-end" &&
        decision.flowGrantId &&
        decision.targetId &&
        decision.activePeriodId
      ) {
        monitorVideoEnd(
          `focus:${decision.targetId}:${decision.activePeriodId}:${decision.flowGrantId}`,
          undefined,
          async () => {
            const stopped = await sendRequest({
              type: "STOP_PERIOD_FLOW",
              url: window.location.href,
              targetId: decision.targetId as string,
              periodId: decision.activePeriodId as string,
              grantId: decision.flowGrantId as string
            });
            if (!stopped.blocked) return;
            goToEnd({
              source: "focus",
              siteId: decision.siteId,
              targetId: decision.targetId,
              periodId: decision.activePeriodId,
              reason: "period-limit"
            });
          }
        );
      }
      return;
    }
    await whenDocumentReady();
    if (
      generation !== evaluationGeneration ||
      topLevelUrl !== window.location.href ||
      pauseFrameCleanup
    )
      return;
    if (decision.needsVisitConfirmation && decision.siteId) {
      goToEnd({
        source: "confirmation",
        siteId: decision.siteId,
        targetId: decision.targetId,
        periodId: decision.activePeriodId,
        reason: "visit-confirmation",
        returnUrl: url,
        waitSeconds: decision.visitConfirmationWaitSeconds
      });
      return;
    }
    if (decision.needsFlowChoice && decision.targetId && decision.activePeriodId) {
      const flowKey = `focus:${decision.targetId}:${decision.activePeriodId}:${decision.flowGrantId}`;
      if (document.getElementById(ROOT_ID)?.dataset.flowKey === flowKey) {
        return;
      }
      renderFocusFlowChoice(decision, url);
      return;
    }
    goToEnd({
      source: "focus",
      siteId: decision.siteId,
      targetId: decision.targetId,
      periodId: decision.activePeriodId,
      reason: decision.reason,
      groupIndex: decision.groupIndex,
      groupCount: decision.groupCount
    });
  } catch (error) {
    // A missing or restarting background context must never break the current site.
    console.debug("Hourleaf page check unavailable", error);
  }
}

function renderPlanFlowChoice(decision: PlanNavigationDecision): void {
  showPauseFrame({ source: "plan", itemId: decision.itemId, reason: "expired" });
}
function renderFocusFlowChoice(decision: PageDecision, url: string): void {
  showPauseFrame({
    source: "focus",
    siteId: decision.siteId,
    targetId: decision.targetId,
    periodId: decision.activePeriodId,
    reason: decision.reason,
    returnUrl: url
  });
}
let pauseFrameCleanup: (() => void) | undefined;
function showPauseFrame(context: EndContext): void {
  const key = `${context.source}:${context.itemId ?? context.periodId}`;
  if (document.getElementById(ROOT_ID)?.dataset.flowKey === key) return;
  removeBlockPage();
  clearPlanDeadline();
  evaluationGeneration++;
  planCheckGeneration++;
  const pausedUrl = window.location.href;
  const channel = crypto.randomUUID();
  const activeMedia = [...document.querySelectorAll<HTMLMediaElement>("video, audio")].filter(
    (media) => !media.paused && !media.ended
  );
  const video = selectPrimaryVideo(
    activeMedia.filter((media): media is HTMLVideoElement => media instanceof HTMLVideoElement)
  );
  if (contentStarted) void sendSessionUpdate("stop");
  contentStarted = false;
  pauseMedia(document);
  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.dataset.flowKey = key;
  Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "2147483647" });
  const frame = document.createElement("iframe");
  const query = new URLSearchParams({
    source: context.source,
    reason: context.reason ?? "",
    returnUrl: window.location.href,
    video: video ? "1" : "0",
    channel
  });
  for (const name of ["siteId", "targetId", "periodId", "itemId"] as const)
    if (context[name]) query.set(name, context[name] as string);
  frame.src = `${runtimeGetURL("end.html")}#${query}`;
  frame.title = t("pause.title");
  Object.assign(frame.style, { width: "100%", height: "100%", border: "0", background: "white" });
  host.attachShadow({ mode: "closed" }).append(frame);
  document.documentElement.append(host);
  setPageInert(true);
  startMediaGuard(host);
  let resuming = false;
  pauseFrameResume = async (requestedChannel) => {
    if (
      requestedChannel !== channel ||
      !host.isConnected ||
      pausedUrl !== window.location.href ||
      resuming
    )
      return false;
    resuming = true;
    try {
      const decision =
        context.source === "plan"
          ? await sendRequest({ type: "GET_PLAN_NAVIGATION_DECISION", url: window.location.href })
          : await sendRequest({
              type: "GET_PAGE_DECISION",
              url: pausedUrl,
              targetId: context.targetId
            });
      if (
        ("allowed" in decision && !decision.allowed) ||
        ("blocked" in decision && decision.blocked)
      )
        return false;
      if (context.source === "focus") {
        const planDecision = await sendRequest({
          type: "GET_PLAN_NAVIGATION_DECISION",
          url: pausedUrl
        });
        if (!planDecision.allowed) return false;
      }
      if (!host.isConnected || pausedUrl !== window.location.href) return false;
      const resumeVideo =
        video?.isConnected && !video.ended
          ? video
          : selectPrimaryVideo(
              [...document.querySelectorAll<HTMLVideoElement>("video")].filter(
                (candidate) => !candidate.ended && candidate.readyState > 0
              )
            );
      if (decision.flowContinuationKind === "video-end" && !resumeVideo) return false;
      if (context.source === "plan")
        sessionStorage.setItem(`hourleaf-plan-pause:${context.itemId}`, "1");
      removeBlockPage();
      if (decision.flowContinuationKind === "video-end" && resumeVideo) {
        const flowKey =
          "blocked" in decision
            ? `focus:${decision.targetId}:${decision.activePeriodId}:${decision.flowGrantId}`
            : `plan:${context.itemId}:${decision.expiresAt}`;
        monitorVideoEnd(flowKey, resumeVideo, async () => {
          if (context.source === "plan")
            await sendRequest({
              type: "STOP_PLAN_FLOW",
              itemId: context.itemId as string,
              url: window.location.href,
              reason: "video-ended"
            });
          else if ("blocked" in decision && decision.flowGrantId) {
            const stopped = await sendRequest({
              type: "STOP_PERIOD_FLOW",
              targetId: context.targetId as string,
              periodId: context.periodId as string,
              url: window.location.href,
              grantId: decision.flowGrantId
            });
            if (!stopped.blocked) return;
          } else return;
          if (context.source === "plan") showPauseFrame(context);
          else goToEnd(context);
        });
      }
      if (
        decision.flowContinuationKind === "video-end" &&
        resumeVideo &&
        !activeMedia.includes(resumeVideo)
      )
        void resumeVideo.play().catch(() => undefined);
      for (const media of activeMedia)
        if (media.isConnected && !media.ended) void media.play().catch(() => undefined);
      void initializeContent();
      return true;
    } finally {
      resuming = false;
    }
  };
  pauseFrameCleanup = () => {
    pauseFrameResume = undefined;
  };
}

interface EndContext {
  source: "focus" | "plan" | "confirmation";
  siteId?: string;
  targetId?: string;
  periodId?: string;
  itemId?: string;
  reason?: string;
  groupIndex?: number;
  groupCount?: number;
  returnUrl?: string;
  waitSeconds?: number;
}

function goToEnd(context: EndContext): void {
  flowEndedCleanup?.();
  flowEndedCleanup = null;
  const params = new URLSearchParams({ source: context.source });
  if (context.siteId) params.set("siteId", context.siteId);
  if (context.targetId) params.set("targetId", context.targetId);
  if (context.periodId) params.set("periodId", context.periodId);
  if (context.itemId) params.set("itemId", context.itemId);
  if (context.reason) params.set("reason", context.reason);
  if (context.groupIndex !== undefined) params.set("groupIndex", String(context.groupIndex));
  if (context.groupCount !== undefined) params.set("groupCount", String(context.groupCount));
  // Returning through a verified source URL is more reliable than restoring a
  // BFCache entry with history.back(). In particular, it avoids replaying a
  // stale content-script lifecycle after a group unlock.
  const returnUrl =
    context.returnUrl ?? (context.source === "focus" ? window.location.href : undefined);
  if (returnUrl) params.set("returnUrl", returnUrl);
  if (context.waitSeconds !== undefined) params.set("waitSeconds", String(context.waitSeconds));
  window.location.assign(`${runtimeGetURL("end.html")}#${params.toString()}`);
}

function monitorVideoEnd(
  key: string,
  preferredVideo: HTMLVideoElement | undefined,
  onEnded: () => Promise<void>
): void {
  if ((monitorVideoEnd as unknown as { key?: string }).key === key) return;
  flowEndedCleanup?.();
  let monitoredVideo: HTMLVideoElement | undefined;
  const monitoredUrl = window.location.href;
  const handler = () => {
    flowEndedCleanup?.();
    flowEndedCleanup = null;
    // A site's old player can emit ended while replacing content during a route
    // change. Rebind to the new page instead of ending its continuing plan.
    if (window.location.href !== monitoredUrl) {
      routeMayHaveChanged();
      return;
    }
    void onEnded().catch(() => undefined);
  };
  const attach = (video: HTMLVideoElement): boolean => {
    if (video.ended || monitoredVideo) return false;
    monitoredVideo = video;
    document.removeEventListener("play", handlePlay, true);
    video.addEventListener("ended", handler, { once: true });
    return true;
  };
  const handlePlay = (event: Event) => {
    if (event.target instanceof HTMLVideoElement) attach(event.target);
  };
  const current = preferredVideo ?? selectPrimaryVideo(findPlayingVideos());
  if (!current || !attach(current)) document.addEventListener("play", handlePlay, true);
  const replacementObserver = new MutationObserver(() => {
    if (!monitoredVideo || monitoredVideo.isConnected) return;
    monitoredVideo.removeEventListener("ended", handler);
    monitoredVideo = undefined;
    const replacement = selectPrimaryVideo(findPlayingVideos());
    if (!replacement || !attach(replacement)) document.addEventListener("play", handlePlay, true);
  });
  replacementObserver.observe(document, { childList: true, subtree: true });
  (monitorVideoEnd as unknown as { key?: string }).key = key;
  flowEndedCleanup = () => {
    replacementObserver.disconnect();
    document.removeEventListener("play", handlePlay, true);
    monitoredVideo?.removeEventListener("ended", handler);
    delete (monitorVideoEnd as unknown as { key?: string }).key;
  };
}

function findPlayingVideos(): HTMLVideoElement[] {
  return [...document.querySelectorAll<HTMLVideoElement>("video")].filter(
    (video) => !video.paused && !video.ended
  );
}

function selectPrimaryVideo(videos: readonly HTMLVideoElement[]): HTMLVideoElement | undefined {
  if (videos.length === 0) return undefined;
  const pictureInPicture = document.pictureInPictureElement;
  if (pictureInPicture instanceof HTMLVideoElement && videos.includes(pictureInPicture)) {
    return pictureInPicture;
  }
  const fullscreen = document.fullscreenElement;
  if (fullscreen) {
    const fullscreenVideo = videos.find(
      (video) => video === fullscreen || fullscreen.contains(video)
    );
    if (fullscreenVideo) return fullscreenVideo;
  }
  return [...videos].sort((left, right) => visibleVideoArea(right) - visibleVideoArea(left))[0];
}

function visibleVideoArea(video: HTMLVideoElement): number {
  const bounds = video.getBoundingClientRect();
  const width = Math.max(0, Math.min(bounds.right, innerWidth) - Math.max(bounds.left, 0));
  const height = Math.max(0, Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, 0));
  return width * height;
}

async function syncContentLocale(): Promise<void> {
  try {
    const settings = await sendRequest({ type: "GET_SETTINGS" });
    configureLocale(settings.locale);
  } catch {
    configureLocale("system");
  }
}

async function showReminder(title: string, message: string, key: string): Promise<void> {
  const storageKey = `hourleaf-reminder:${formatLocalDate(new Date())}:${key}`;
  if (sessionStorage.getItem(storageKey)) return;
  sessionStorage.setItem(storageKey, "1");
  await whenDocumentReady();
  const reminder = element("aside", "", `${title} · ${message}`);
  reminder.setAttribute("role", "status");
  Object.assign(reminder.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483646",
    maxWidth: "360px",
    padding: "14px 18px",
    borderRadius: "14px",
    color: "#172033",
    background: "#fff",
    boxShadow: "0 18px 50px rgba(23,32,51,.2)",
    font: "600 13px/1.6 ui-sans-serif, system-ui"
  });
  document.documentElement.append(reminder);
  setTimeout(() => reminder.remove(), 8_000);
}

/** @deprecated Kept as a compatibility renderer for module integrations. */
export function renderBlockPage(decision: PageDecision, url: string): void {
  removeBlockPage();
  pauseMedia(document);

  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.setAttribute("role", "presentation");
  // Keep the blocker above extension-replaced homepages even when their
  // light-DOM styles target every div on the page.
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("inset", "0", "important");
  host.style.setProperty("z-index", "2147483647", "important");
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("visibility", "visible", "important");
  host.style.setProperty("opacity", "1", "important");
  host.style.setProperty("pointer-events", "auto", "important");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = BLOCK_PAGE_CSS;

  const backdrop = element("main", "backdrop");
  backdrop.setAttribute("aria-labelledby", "hourleaf-title");
  const card = element("section", "card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-describedby", "hourleaf-message");

  const mark = element("div", "mark", "H");
  mark.setAttribute("aria-hidden", "true");
  const eyebrow = element("p", "eyebrow", "Hourleaf");
  const heading = element("h1", "", t("end.restrictedTitle"));
  heading.id = "hourleaf-title";

  const moduleMatch = resolveSiteModule(url)?.match(url);
  const sectionLabel =
    moduleMatch && (!decision.targetId || decision.targetId === moduleMatch.targetId)
      ? moduleMatch.sectionLabel
      : t("end.currentPage");
  const reasonText =
    decision.reason === "daily-limit"
      ? t("end.limitMessage", { site: sectionLabel })
      : decision.reason === "domain-block"
        ? t("end.domainBlocked", { site: sectionLabel })
        : t("end.periodBlocked", { site: sectionLabel });
  const message = element("p", "message", reasonText);
  message.id = "hourleaf-message";

  const actions = element("div", "actions");
  const backButton = element("button", "", t("end.back"));
  backButton.type = "button";
  backButton.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else {
      const fallbackUrl = resolveSiteModule(url)?.match(url)?.fallbackUrl;
      if (fallbackUrl) window.location.assign(fallbackUrl);
      else window.close();
    }
  });
  actions.append(backButton);

  let allowButton: HTMLButtonElement | null = null;
  if (decision.canRequestTemporaryAccess) {
    allowButton = element("button", "primary", t("end.temporaryAccess"));
    allowButton.type = "button";
    actions.append(allowButton);
  }

  const hint = decision.canRequestTemporaryAccess
    ? element(
        "p",
        "hint",
        t("end.temporaryRemaining", { count: decision.temporaryAccessUsesRemaining })
      )
    : null;
  const status = element("div", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  card.append(mark, eyebrow, heading, message, actions);
  if (hint) card.append(hint);
  card.append(status);
  backdrop.append(card);
  shadow.append(style, backdrop);
  document.documentElement.append(host);
  setPageInert(true);
  startMediaGuard(host);

  allowButton?.addEventListener("click", () => void requestTemporaryAccess());

  async function requestTemporaryAccess(): Promise<void> {
    if (!allowButton) return;
    allowButton.disabled = true;
    status.textContent = t("end.openingTemporary");
    try {
      const match = resolveSiteModule(url)?.match(url);
      const nextDecision = await sendRequest({
        type: "GRANT_TEMPORARY_ACCESS",
        url,
        ...(match ? { targetId: match.targetId } : {})
      });
      if (!nextDecision.blocked) {
        removeBlockPage();
        return;
      }
      status.textContent = t("end.temporaryExhausted");
    } catch {
      status.textContent = t("common.actionFailed");
    } finally {
      allowButton.disabled = false;
    }
  }

  requestAnimationFrame(() => (allowButton ?? backButton).focus());
}

function removeBlockPage(): void {
  pauseFrameCleanup?.();
  pauseFrameCleanup = undefined;
  mediaObserver?.disconnect();
  mediaObserver = null;
  const host = document.getElementById(ROOT_ID);
  if (host) host.remove();
  restoreManagedBody();
}

function setPageInert(inert: boolean): void {
  if (!document.body || !inert || managedBody === document.body) return;
  restoreManagedBody();
  bodyWasInert = document.body.inert;
  document.body.inert = true;
  managedBody = document.body;
}

function restoreManagedBody(): void {
  if (!managedBody) return;
  managedBody.inert = bodyWasInert;
  managedBody = null;
}

function startMediaGuard(host: HTMLElement): void {
  mediaObserver?.disconnect();
  mediaObserver = new MutationObserver((mutations) => {
    // A site module may replace the body during startup. Keep the extension-owned
    // blocker outside that body and restore it across mount transitions.
    if (!host.isConnected && document.documentElement) document.documentElement.append(host);
    setPageInert(true);
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) pauseMedia(node);
      }
    }
  });
  mediaObserver.observe(document, { childList: true, subtree: true });
}

function pauseMedia(root: ParentNode): void {
  for (const media of root.querySelectorAll<HTMLMediaElement>("video, audio")) media.pause();
}

function whenDocumentReady(): Promise<void> {
  if (document.body) return Promise.resolve();
  return new Promise((resolve) =>
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const BLOCK_PAGE_CSS = `
  :host { all: initial; color-scheme: light dark; }
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647; box-sizing: border-box;
    display: grid; place-items: center; overflow: auto; padding: 32px 20px;
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #172033;
    background: radial-gradient(circle at 15% 12%, rgba(95, 179, 255, .2), transparent 30%),
      radial-gradient(circle at 85% 88%, rgba(251, 114, 153, .16), transparent 34%), #f7f9fc;
  }
  .card {
    width: min(100%, 520px); box-sizing: border-box; padding: clamp(28px, 6vw, 48px);
    border: 1px solid rgba(23, 32, 51, .09); border-radius: 28px;
    background: rgba(255, 255, 255, .9); box-shadow: 0 28px 80px rgba(33, 47, 79, .14);
    text-align: center; backdrop-filter: blur(18px);
  }
  .mark {
    display: grid; place-items: center; width: 64px; height: 64px; margin: 0 auto 24px;
    border-radius: 20px; color: #fff; background: linear-gradient(135deg, #00aeec, #fb7299);
    box-shadow: 0 14px 28px rgba(0, 174, 236, .22); font: 700 24px/1 ui-sans-serif;
  }
  .eyebrow { margin: 0 0 10px; color: #61708c; font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  h1 { margin: 0; color: #172033; font-size: clamp(28px, 6vw, 38px); line-height: 1.18; letter-spacing: -.03em; }
  .message { margin: 18px auto 0; max-width: 390px; color: #56627a; font-size: 16px; line-height: 1.75; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 30px; }
  .flow-duration { display: inline-flex; min-height: 46px; align-items: center; gap: 8px; color: #56627a; font: 650 14px/1 ui-sans-serif; }
  select { min-height: 46px; padding: 0 34px 0 14px; border: 1px solid #d8deea; border-radius: 13px; color: #29354d; background: #fff; font: 650 14px/1 ui-sans-serif; }
  button { min-height: 46px; padding: 0 20px; border: 1px solid #d8deea; border-radius: 13px; color: #29354d; background: #fff; font: 650 14px/1 ui-sans-serif; cursor: pointer; }
  button.primary { border-color: #00aeec; color: #fff; background: #00aeec; }
  @media (hover: hover) and (pointer: fine) { button:hover { filter: brightness(.97); transform: translateY(-1px); } }
  button:focus-visible { outline: 3px solid rgba(0, 174, 236, .35); outline-offset: 3px; }
  button[disabled] { cursor: wait; opacity: .65; transform: none; }
  .hint { margin: 18px 0 0; color: #77839a; font-size: 12px; line-height: 1.55; }
  .status { min-height: 20px; margin-top: 12px; color: #b83b62; font-size: 13px; }
  @media (prefers-color-scheme: dark) {
    .backdrop { color: #f3f6fc; background: radial-gradient(circle at 20% 10%, #163951, transparent 36%), #10141d; }
    .card { border-color: rgba(255,255,255,.1); background: rgba(27, 34, 48, .94); box-shadow: 0 28px 80px rgba(0,0,0,.4); }
    h1 { color: #f3f6fc; } .message { color: #b8c1d4; } .eyebrow, .hint { color: #929db3; }
    button, select { border-color: #465168; color: #e8edf7; background: #273044; }
    .flow-duration { color: #b8c1d4; }
    button.primary { border-color: #00aeec; background: #00aeec; color: #fff; }
  }
  @media (prefers-reduced-motion: no-preference) { button { transition: transform .15s ease, filter .15s ease; } }
`;
