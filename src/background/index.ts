import { activeBlockingProfile } from "../modules/local/profiles";
import type { LocalModuleProfile } from "../modules/local/types";
import { AnalyticsService, parseLocalDate } from "../shared/analytics";
import { ManagedSiteService, sameOrigin } from "../core/sites";
import {
  actionSetBadgeBackgroundColor,
  actionSetBadgeText,
  actionSetBadgeTextColor,
  getExtensionApi,
  runtimeAddMessageListener,
  storageAddChangeListener,
  tabsGet,
  tabsQuery,
  type ExtensionTab,
  type ExtensionMessageSender
} from "../shared/browser";
import { FocusDecisionService } from "../shared/focus";
import { isHttpUrl, parseMessageRequest, type AnyRequest } from "../shared/messages";
import {
  PeriodRuntimeRepository,
  SettingsRepository,
  SiteModuleRepository
} from "../shared/storage";
import type {
  DeepPartial,
  FocusSettings,
  PlanNavigationDecision,
  UsagePeriod
} from "../shared/types";
import { PlanService } from "./plan";
import { UsageTracker } from "./tracker";
import {
  PREINSTALLED_SITE_MODULE_MANIFESTS,
  PREINSTALLED_SITE_MODULES
} from "../modules/preinstalled";
import { LocalModuleService } from "../modules/local/service";
import type { PageDecision, TargetId } from "../shared/types";
import { selectActiveTimePeriod } from "../shared/schedule";
import { PeriodRuntimeService } from "../shared/period-runtime";
import { PlanContentRegistrationService } from "./plan-registration";
import { VisitConfirmationService, resolveVisitConfirmationTabId } from "./visit-confirmation";
import { resolveToolbarBadgeText } from "../shared/remaining-time";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { siteMatchesUrl } from "../shared/site-scope";
import { RelatedTabService } from "./related-tabs";
import { isIndependentPlanAccess, shouldRecordConfiguredUsage } from "../shared/plan";
import { ConfigurationBackupService } from "./configuration-backup";
import { initializeDebugBuild } from "../debug/bootstrap";

const api = getExtensionApi();
const settings = new SettingsRepository();
const analytics = new AnalyticsService();
const managedSites = new ManagedSiteService(settings);
const modules = new SiteModuleRepository(undefined, PREINSTALLED_SITE_MODULE_MANIFESTS);
const modulesReady = initializeBundledModules();
const localModules = new LocalModuleService();
const localModulesReady = localModules.initialize();
const debugBuildReady = initializeDebugBuild(localModulesReady, localModules, managedSites);
const resolveManagedTarget = async (url: string, targetId?: string) => {
  const resolved = await managedSites.resolve(url, targetId);
  return resolved ? { siteId: resolved.site.id, target: resolved.target } : null;
};
const periodRuntime = new PeriodRuntimeService(settings, new PeriodRuntimeRepository(), analytics);
const focus = new FocusDecisionService(
  settings,
  undefined,
  analytics,
  resolveManagedTarget,
  periodRuntime
);
const plan = new PlanService(settings);
const planRegistration = new PlanContentRegistrationService(settings);
const visitConfirmations = new VisitConfirmationService();
const configurationBackups = new ConfigurationBackupService(settings);
const relatedTabs = new RelatedTabService(settings, plan);
const tracker = new UsageTracker(
  analytics,
  Date.now,
  api,
  async (url, at, targetId) => {
    const [focusDecision, planDecision, currentSettings] = await Promise.all([
      decideEffectiveFocus(url, new Date(at), targetId),
      plan.decideNavigation(url),
      settings.get()
    ]);
    await reconcilePlanRegistration();
    return shouldRecordConfiguredUsage(
      currentSettings.planMode,
      planDecision,
      focusDecision.blocked
    );
  },
  async (url, targetId) => {
    const resolved = await managedSites.resolve(url, targetId);
    if (!resolved) return null;
    const activePeriod = selectActiveTimePeriod(resolved.target, new Date());
    return {
      siteId: resolved.site.id,
      targetId: resolved.target.id,
      ...(activePeriod?.behavior === "timed" ? { activePeriodId: activePeriod.id } : {})
    };
  }
);

if (api) {
  const extensionRoot = api.runtime.getURL?.("") ?? "";
  api.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
    if (!changeInfo.url) return;
    void visitConfirmations
      .revokeIfOriginChanged(tabId, changeInfo.url, extensionRoot)
      .catch(() => undefined);
  });
  api.tabs?.onUpdated?.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url !== undefined || changeInfo.status === "complete") {
      void refreshToolbarBadgeForTab(tab);
    }
  });
  api.tabs?.onActivated?.addListener(({ tabId }) => {
    void tabsGet(tabId)
      .then((tab) => (tab ? refreshToolbarBadgeForTab(tab) : undefined))
      .catch(() => undefined);
  });
  api.tabs?.onRemoved?.addListener((tabId) => {
    void visitConfirmations.revokeTab(tabId).catch(() => undefined);
  });
  storageAddChangeListener((changes, areaName) => {
    if (
      areaName === "local" &&
      (changes[STORAGE_KEYS.settings] || changes[STORAGE_KEYS.planAccess])
    ) {
      void currentBlockingProfile().catch(() => undefined);
    }
    if (
      areaName === "local" &&
      (changes[STORAGE_KEYS.settings] ||
        changes[STORAGE_KEYS.usage] ||
        changes[STORAGE_KEYS.periodRuntime] ||
        changes[STORAGE_KEYS.planAccess])
    ) {
      scheduleToolbarBadgeRefresh();
    }
  });
  runtimeAddMessageListener(async (rawMessage, sender) => {
    const parsed = parseMessageRequest(rawMessage);
    if (!parsed || !isTrustedSender(sender)) return undefined;
    try {
      const data = await handleMessage(parsed.request, sender);
      return {
        version: 1,
        requestId: parsed.requestId,
        result: { ok: true, data }
      };
    } catch (error: unknown) {
      return {
        version: 1,
        requestId: parsed.requestId,
        result: {
          ok: false,
          error: {
            code: "REQUEST_FAILED",
            message: error instanceof Error ? error.message : "Unknown Hourleaf error"
          }
        }
      };
    }
  });

  void tracker.start().catch((error: unknown) => {
    console.warn("Hourleaf usage tracking could not start", error);
  });
  void refreshActiveToolbarBadges();
  void modulesReady
    .then((store) =>
      managedSites.rebuildRegistrations(
        PREINSTALLED_SITE_MODULES.map((definition) => ({
          ...definition,
          enabled: store.installations[definition.manifest.id]?.enabled === true
        }))
      )
    )
    .catch((error: unknown) => {
      console.warn("Hourleaf could not rebuild website registrations", error);
    });
  void localModulesReady.catch((error: unknown) => {
    console.warn("Hourleaf could not rebuild local module registrations", error);
  });
  void debugBuildReady.catch((error: unknown) => {
    console.warn("Hourleaf could not initialize local debug fixtures", error);
  });
  void currentBlockingProfile().catch(() => undefined);
  void planRegistration.reconcile().catch((error: unknown) => {
    console.warn("Hourleaf could not rebuild the active plan registration", error);
  });
}

export async function handleMessage(
  message: AnyRequest,
  sender?: ExtensionMessageSender
): Promise<unknown> {
  switch (message.type) {
    case "GET_SETTINGS":
      return settings.get();
    case "GET_CONFIGURATION_BACKUP":
      assertExtensionPageSender(sender);
      await tracker.flush();
      await localModulesReady;
      return configurationBackups.export();
    case "IMPORT_CONFIGURATION": {
      assertExtensionPageSender(sender);
      await localModulesReady;
      const result = await configurationBackups.import(message.backup, Date.now(), () =>
        tracker.resetSessions()
      );
      const runtimeResults = await Promise.allSettled([
        visitConfirmations.clear(),
        localModules.initialize(),
        (async () => {
          await modulesReady;
          const moduleStore = await modules.get();
          await managedSites.rebuildRegistrations(
            PREINSTALLED_SITE_MODULES.map((definition) => ({
              ...definition,
              enabled: moduleStore.installations[definition.manifest.id]?.enabled === true
            }))
          );
        })(),
        planRegistration.reconcile(),
        refreshActiveToolbarBadges()
      ]);
      return {
        ...result,
        runtimeWarningCount: runtimeResults.filter((entry) => entry.status === "rejected").length
      };
    }
    case "UPDATE_SETTINGS":
      assertExtensionPageSender(sender);
      assertSettingsPatch(message.patch);
      return withPlanRegistrationReconcile(settings.update(message.patch));
    case "RESET_SETTINGS":
      assertExtensionPageSender(sender);
      for (const siteId of Object.keys((await managedSites.list()).sites)) {
        await managedSites.remove(siteId);
      }
      return withPlanRegistrationReconcile(settings.reset());
    case "GET_USAGE":
      assertExtensionPageSender(sender);
      assertPeriod(message.period);
      await tracker.flush();
      return analytics.summarize(message.period, parseLocalDate(message.anchorDate) ?? new Date());
    case "CLEAR_USAGE":
      assertExtensionPageSender(sender);
      await analytics.clear();
      return { cleared: true as const };
    case "GET_PAGE_DECISION": {
      assertUrl(message.url);
      const isWebsiteRequest = Boolean(sender?.tab && !isExtensionPageSender(sender));
      const resolved = isWebsiteRequest
        ? await assertAuthorizedConfiguredUrl(message.url, message.targetId, sender)
        : await managedSites.resolve(message.url, message.targetId);
      if (!isWebsiteRequest) assertExtensionPageSender(sender);
      const [decision, currentSettings] = await Promise.all([
        decideEffectiveFocus(message.url, new Date(), message.targetId),
        settings.get()
      ]);
      const planDecision = currentSettings.planMode.enabled
        ? await plan.decideNavigation(message.url)
        : undefined;
      const independentPlanAccess = isIndependentPlanAccess(currentSettings.planMode, planDecision);
      const planOverridesFocus = independentPlanAccess && decision.reason !== "domain-block";
      const accessDecision = planOverridesFocus ? allowFocusDecisionForPlan(decision) : decision;
      const effectiveDecision =
        resolved && !planOverridesFocus
          ? await applyVisitConfirmation(accessDecision, resolved.site, sender)
          : accessDecision;
      refreshSenderToolbarBadge(sender, message.url, { focusDecision: effectiveDecision });
      return effectiveDecision;
    }
    case "GRANT_TEMPORARY_ACCESS":
      assertUrl(message.url);
      await assertAuthorizedConfiguredUrl(message.url, message.targetId, sender);
      if ((await localModules.getDomainPolicy(message.url)) !== "timed") {
        return decideEffectiveFocus(message.url, new Date(), message.targetId);
      }
      return focus.grant(message.url, new Date(), message.targetId);
    case "GRANT_VISIT_CONFIRMATION": {
      assertExtensionPageSender(sender);
      assertUrl(message.url);
      const tabId = await resolveVisitConfirmationTabId(
        sender,
        message.tabId,
        api?.runtime.getURL?.("") ?? "",
        message.url,
        message.siteId
      );
      const resolved = await assertAuthorizedConfiguredUrl(message.url, undefined, sender);
      if (resolved.site.id !== message.siteId || !siteMatchesUrl(resolved.site, message.url)) {
        throw new Error("The website confirmation no longer matches this tab");
      }
      const policy = resolved.site.visitConfirmation ?? { enabled: false, waitSeconds: 3 };
      if (!policy.enabled) throw new Error("Visit confirmation is no longer enabled");
      await visitConfirmations.grant(
        tabId,
        resolved.site.id,
        new URL(message.url).origin,
        resolved.site.updatedAt,
        policy.waitSeconds
      );
      return { granted: true as const, url: message.url };
    }
    case "GET_PERIOD_RUNTIME":
      assertExtensionPageSender(sender);
      return periodRuntime.getStatus(message.targetId, message.periodId);
    case "START_PERIOD_GROUP_WAIT":
      assertExtensionPageSender(sender);
      return periodRuntime.startWait(message.targetId, message.periodId);
    case "UNLOCK_PERIOD_GROUP":
      assertExtensionPageSender(sender);
      return periodRuntime.unlock(message.targetId, message.periodId, message.proof);
    case "GRANT_PERIOD_FLOW": {
      assertUrl(message.url);
      const resolved = await assertAuthorizedConfiguredUrl(message.url, message.targetId, sender);
      if (!resolved.target.timePeriods.some((period) => period.id === message.periodId)) {
        throw new Error("The configured time period no longer exists");
      }
      await periodRuntime.grantFlow(resolved.target.id, message.periodId, message.continuation);
      const decision = await decideEffectiveFocus(message.url, new Date(), resolved.target.id);
      refreshSenderToolbarBadge(sender, message.url, { focusDecision: decision });
      return decision;
    }
    case "STOP_PERIOD_FLOW": {
      assertUrl(message.url);
      const resolved = await assertAuthorizedConfiguredUrl(message.url, message.targetId, sender);
      if (!resolved.target.timePeriods.some((period) => period.id === message.periodId)) {
        throw new Error("The configured time period no longer exists");
      }
      await periodRuntime.revokeFlow(resolved.target.id, message.periodId);
      const decision = await decideEffectiveFocus(message.url, new Date(), resolved.target.id);
      refreshSenderToolbarBadge(sender, message.url, { focusDecision: decision });
      return decision;
    }
    case "GET_MANAGED_SITES":
      assertExtensionPageSender(sender);
      return managedSites.list();
    case "ADD_MANAGED_SITE": {
      assertExtensionPageSender(sender);
      const result = await managedSites.addAuthorized(message.url, message.label);
      if (result.granted) {
        await modulesReady;
        const moduleStore = await modules.get();
        for (const installation of Object.values(moduleStore.installations)) {
          if (installation.enabled) {
            const definition = PREINSTALLED_SITE_MODULES.find(
              (candidate) => candidate.manifest.id === installation.manifest.id
            );
            await managedSites.applyModuleManifest(
              installation.manifest,
              true,
              definition?.contentScript
            );
          }
        }
      }
      if (result.granted) await refreshActiveToolbarBadges();
      return result;
    }
    case "UPDATE_MANAGED_SITE": {
      assertExtensionPageSender(sender);
      return managedSites.updateSite(message.siteId, message.patch);
    }
    case "UPDATE_SITE_TARGET":
      assertExtensionPageSender(sender);
      return managedSites.updateTarget(message.targetId, message.patch);
    case "REMOVE_MANAGED_SITE":
      assertExtensionPageSender(sender);
      return managedSites.remove(message.siteId);
    case "CLOSE_RELATED_TABS": {
      assertExtensionPageSender(sender);
      return relatedTabs.close(message, requireSenderTabId(sender));
    }
    case "GET_SITE_MODULES":
      assertExtensionPageSender(sender);
      await modulesReady;
      return modules.get();
    case "RESTORE_SITE_MODULE":
      assertExtensionPageSender(sender);
      {
        await modulesReady;
        return modules.restore(message.moduleId);
      }
    case "SET_SITE_MODULE_ENABLED": {
      assertExtensionPageSender(sender);
      await modulesReady;
      const store = await modules.get();
      const installation = store.installations[message.moduleId];
      if (!installation) throw new Error("Site module is not installed");
      const definition = PREINSTALLED_SITE_MODULES.find(
        (candidate) => candidate.manifest.id === message.moduleId
      );
      if (!definition) throw new Error("Site module is not included in this Hourleaf build");
      await managedSites.applyModuleManifest(
        installation.manifest,
        message.enabled,
        definition.contentScript
      );
      return modules.setEnabled(message.moduleId, message.enabled);
    }
    case "UNINSTALL_SITE_MODULE": {
      assertExtensionPageSender(sender);
      await modulesReady;
      const store = await modules.get();
      const installation = store.installations[message.moduleId];
      if (installation) await managedSites.removeModuleManifest(installation.manifest);
      return modules.uninstall(message.moduleId);
    }
    case "GET_LOCAL_MODULES":
      assertExtensionPageSender(sender);
      await localModulesReady;
      return localModules.getSnapshot(await currentBlockingProfile());
    case "IMPORT_LOCAL_MODULE":
      assertExtensionPageSender(sender);
      await localModulesReady;
      await localModules.import(message.module);
      return localModules.getSnapshot(await currentBlockingProfile());
    case "SET_LOCAL_MODULE_ENABLED":
      assertExtensionPageSender(sender);
      await localModulesReady;
      return localModules.setEnabled(
        message.moduleId,
        message.enabled,
        await assertBlockingProfile(message.profile)
      );
    case "SET_LOCAL_MODULE_FILTER_ENABLED":
      assertExtensionPageSender(sender);
      await localModulesReady;
      return localModules.setFilterGroupEnabled(
        message.moduleId,
        message.groupId,
        message.enabled,
        await assertBlockingProfile(message.profile)
      );
    case "REMOVE_LOCAL_MODULE":
      assertExtensionPageSender(sender);
      await localModulesReady;
      await localModules.remove(message.moduleId);
      return localModules.getSnapshot(await currentBlockingProfile());
    case "GET_LOCAL_PAGE_RULES":
      await localModulesReady;
      if (sender?.tab && !isExtensionPageSender(sender))
        await planRegistration.assertAuthorizedWebsiteUrl(message.url, sender);
      else await assertAuthorizedConfiguredUrl(message.url, undefined, sender);
      return localModules.getPageRules(message.url, await currentBlockingProfile());
    case "GET_TRACKING_STATUS":
      await tracker.flush();
      return tracker.getStatus();
    case "GET_PLAN_STATE":
      assertExtensionPageSender(sender);
      return withPlanRegistrationReconcile(plan.getState());
    case "SET_PLAN_MODE":
      assertExtensionPageSender(sender);
      return withPlanRegistrationReconcile(
        plan.setMode({
          ...(message.enabled !== undefined ? { enabled: message.enabled } : {}),
          ...(message.watchDurationMinutes !== undefined
            ? { watchDurationMinutes: message.watchDurationMinutes }
            : {}),
          ...(message.defaultCompletionMode !== undefined
            ? { defaultCompletionMode: message.defaultCompletionMode }
            : {}),
          ...(message.autoCompleteOnStart !== undefined
            ? { autoCompleteOnStart: message.autoCompleteOnStart }
            : {}),
          ...(message.independentAccessTiming !== undefined
            ? { independentAccessTiming: message.independentAccessTiming }
            : {})
        })
      );
    case "ADD_PLAN_ITEM":
      assertExtensionPageSender(sender);
      return plan.add(message);
    case "UPDATE_PLAN_ITEM":
      assertExtensionPageSender(sender);
      return withPlanRegistrationReconcile(plan.update(message.id, message.patch));
    case "DELETE_PLAN_ITEM":
      assertExtensionPageSender(sender);
      return withPlanRegistrationReconcile(plan.remove(message.id));
    case "MOVE_PLAN_ITEM":
      assertExtensionPageSender(sender);
      return plan.move(message.id, message.direction);
    case "REORDER_PLAN_ITEMS":
      assertExtensionPageSender(sender);
      return plan.reorder(message.orderedIds);
    case "SET_PLAN_ITEM_COMPLETED":
      assertExtensionPageSender(sender);
      return withPlanRegistrationReconcile(plan.setCompleted(message.id, message.completed));
    case "START_PLAN_ITEM": {
      assertExtensionPageSender(sender);
      await planRegistration.prepareForStart(message.id);
      return withPlanRegistrationReconcile(plan.start(message.id));
    }
    case "GET_PLAN_NAVIGATION_DECISION": {
      if (sender?.tab && !isExtensionPageSender(sender)) {
        if (!message.url) throw new Error("Website plan checks require their current URL");
        await planRegistration.assertAuthorizedWebsiteUrl(message.url, sender);
      } else if (sender) {
        assertExtensionPageSender(sender);
      }
      const decision = await withPlanRegistrationReconcile(
        plan.decideNavigation(message.url, message.bvid)
      );
      if (message.url) refreshSenderToolbarBadge(sender, message.url, { planDecision: decision });
      return decision;
    }
    case "CONTINUE_PLAN_FLOW": {
      if (sender?.tab && !isExtensionPageSender(sender)) {
        if (!message.url) throw new Error("Website flow decisions require their current URL");
        await planRegistration.assertAuthorizedWebsiteUrl(message.url, sender);
      } else {
        assertExtensionPageSender(sender);
      }
      const result = await withPlanRegistrationReconcile(
        plan.continueFlow(message.itemId, message.continuation, message.url)
      );
      if (message.url) {
        refreshSenderToolbarBadge(sender, message.url, {
          planDecision: await plan.decideNavigation(message.url)
        });
      }
      return result;
    }
    case "STOP_PLAN_FLOW": {
      if (sender?.tab && !isExtensionPageSender(sender)) {
        if (!message.url) throw new Error("Website flow stops require their current URL");
        await planRegistration.assertAuthorizedWebsiteUrl(message.url, sender);
      } else {
        assertExtensionPageSender(sender);
      }
      const result = await withPlanRegistrationReconcile(
        plan.revokeFlow(message.itemId, message.url)
      );
      if (message.url) refreshSenderToolbarBadge(sender, message.url);
      return result;
    }
    case "STOP_PLAN_ACCESS": {
      if (sender?.tab && !isExtensionPageSender(sender)) {
        if (!message.url) throw new Error("Website plan stops require their current URL");
        await planRegistration.assertAuthorizedWebsiteUrl(message.url, sender);
      } else {
        assertExtensionPageSender(sender);
      }
      const result = await withPlanRegistrationReconcile(
        plan.pauseAtVideoEnd(message.itemId, message.url)
      );
      if (message.url) refreshSenderToolbarBadge(sender, message.url);
      return result;
    }
    case "IMPORT_PLAN_ITEMS":
      assertExtensionPageSender(sender);
      return plan.importItems(message.items, message.source);
    case "SESSION_UPDATE": {
      if (!sender?.tab) throw new Error("Session updates require a website tab");
      const resolved = await assertAuthorizedConfiguredUrl(message.url, message.targetId, sender);
      const [currentSettings, planDecision] = await Promise.all([
        settings.get(),
        plan.decideNavigation(message.url)
      ]);
      const independentPlanAccess = isIndependentPlanAccess(currentSettings.planMode, planDecision);
      const confirmation = resolved.site.visitConfirmation;
      if (
        !independentPlanAccess &&
        confirmation?.enabled &&
        sender.tab.id !== undefined &&
        !(await visitConfirmations.isGranted(
          sender.tab.id,
          resolved.site.id,
          new URL(message.url).origin,
          resolved.site.updatedAt
        ))
      ) {
        return { accepted: false };
      }
      return {
        accepted: await tracker.handleSessionUpdate(
          sender.tab,
          message.event,
          message.sessionId,
          message.url,
          message.visibility,
          resolved.target.id,
          independentPlanAccess
        )
      };
    }
    default:
      return assertNever(message);
  }
}

async function currentBlockingProfile(): Promise<LocalModuleProfile> {
  // Storage notifications may arrive between grant and mode writes. Never reconcile
  // (and thereby erase) an in-flight start while merely selecting a filter profile.
  const state = await plan.getState({ reconcile: false });
  const profile = activeBlockingProfile(state.settings, Boolean(state.activeGrant));
  await localModules.setRuntimeProfile(profile);
  return profile;
}

async function assertBlockingProfile(
  requested: LocalModuleProfile = "normal"
): Promise<LocalModuleProfile> {
  const current = await currentBlockingProfile();
  if (requested !== current) throw new Error("Blocking context changed; reload before editing");
  return current;
}

async function applyVisitConfirmation(
  decision: PageDecision,
  site: Awaited<ReturnType<typeof assertAuthorizedConfiguredUrl>>["site"],
  sender?: ExtensionMessageSender
): Promise<PageDecision> {
  const policy = site.visitConfirmation;
  const tabId = sender?.tab?.id;
  if (
    decision.blocked ||
    !policy?.enabled ||
    tabId === undefined ||
    (sender !== undefined && isExtensionPageSender(sender))
  ) {
    return decision;
  }
  const currentOrigin = new URL(sender?.url ?? sender?.tab?.url ?? site.origin).origin;
  if (await visitConfirmations.isGranted(tabId, site.id, currentOrigin, site.updatedAt)) {
    return decision;
  }
  const waitSeconds = await visitConfirmations.requireConfirmation(
    tabId,
    site.id,
    currentOrigin,
    site.updatedAt,
    policy.waitSeconds
  );
  return {
    ...decision,
    blocked: true,
    reason: "visit-confirmation",
    needsVisitConfirmation: true,
    visitConfirmationWaitSeconds: waitSeconds,
    canRequestTemporaryAccess: false
  };
}

function requireSenderTabId(sender?: ExtensionMessageSender): number {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId) || (tabId as number) < 0)
    throw new Error("This action requires a browser tab");
  return tabId as number;
}

async function decideEffectiveFocus(
  url: string,
  now: Date,
  targetId?: TargetId
): Promise<PageDecision> {
  const base = await focus.decide(url, now, targetId);
  if (
    base.reason === "not-managed" ||
    base.reason === "focus-disabled" ||
    base.reason === "rule-disabled" ||
    base.reason === "domain-block"
  ) {
    return base;
  }
  const policy = await localModules.getDomainPolicy(url);
  if (policy === "always-allow") {
    return {
      ...base,
      blocked: false,
      reason: "domain-allow",
      canRequestTemporaryAccess: false
    };
  }
  if (policy === "always-block") {
    return {
      ...base,
      blocked: true,
      reason: "domain-block",
      canRequestTemporaryAccess: false
    };
  }
  return base;
}

function allowFocusDecisionForPlan(decision: PageDecision): PageDecision {
  return {
    ...(decision.siteId ? { siteId: decision.siteId } : {}),
    ...(decision.targetId ? { targetId: decision.targetId } : {}),
    section: decision.section,
    blocked: false,
    reason: "plan-access",
    canRequestTemporaryAccess: false,
    temporaryAccessUsesRemaining: 0
  };
}

let toolbarBadgeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

interface ToolbarDecisionOverrides {
  focusDecision?: PageDecision;
  planDecision?: PlanNavigationDecision;
}

function scheduleToolbarBadgeRefresh(): void {
  if (toolbarBadgeRefreshTimer !== null) return;
  toolbarBadgeRefreshTimer = setTimeout(() => {
    toolbarBadgeRefreshTimer = null;
    void refreshActiveToolbarBadges();
  }, 200);
}

async function refreshActiveToolbarBadges(): Promise<void> {
  const tabs = await tabsQuery({ active: true }).catch(() => []);
  await Promise.all(tabs.map((tab) => refreshToolbarBadgeForTab(tab)));
}

function refreshSenderToolbarBadge(
  sender: ExtensionMessageSender | undefined,
  url: string,
  overrides: ToolbarDecisionOverrides = {}
): void {
  if (sender?.tab?.id === undefined) return;
  void refreshToolbarBadgeForTab({ ...sender.tab, url }, overrides);
}

async function refreshToolbarBadgeForTab(
  tab: ExtensionTab,
  overrides: ToolbarDecisionOverrides = {}
): Promise<void> {
  if (tab.id === undefined) return;
  try {
    const currentSettings = await settings.get();
    if (!currentSettings.enabled || !currentSettings.showRemainingMinutesOnIcon || !tab.url) {
      await actionSetBadgeText("", tab.id);
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(tab.url);
    } catch {
      await actionSetBadgeText("", tab.id);
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      await actionSetBadgeText("", tab.id);
      return;
    }
    const now = new Date();
    const [usage, decision, planDecision] = await Promise.all([
      analytics.summarize("day", now),
      overrides.focusDecision ?? decideEffectiveFocus(parsed.href, now),
      overrides.planDecision ??
        (currentSettings.planMode.enabled ? plan.decideNavigation(parsed.href) : undefined)
    ]);
    const text = resolveToolbarBadgeText(currentSettings, usage, decision, {
      nowMs: now.getTime(),
      planDecision
    });
    await Promise.all([
      actionSetBadgeBackgroundColor("#2f8065", tab.id),
      actionSetBadgeTextColor("#ffffff", tab.id)
    ]);
    await actionSetBadgeText(text, tab.id);
  } catch {
    await actionSetBadgeText("", tab.id).catch(() => undefined);
  }
}

async function initializeBundledModules() {
  const previous = await modules.get();
  const current = await modules.initialize();
  for (const [id, installation] of Object.entries(previous.installations)) {
    if (!current.installations[id]) {
      await managedSites.removeModuleManifest(installation.manifest).catch(() => undefined);
    }
  }
  return current;
}

function assertExtensionPageSender(sender?: ExtensionMessageSender): void {
  // Direct calls without a sender are used by deterministic unit tests. An
  // extension page may itself live in a browser tab, so `sender.tab` does not
  // distinguish it from a content script; the trusted extension URL does.
  if (sender && !isExtensionPageSender(sender)) {
    throw new Error("Plan data is available only to extension pages");
  }
}

function isTrustedSender(sender: ExtensionMessageSender): boolean {
  if (api?.runtime.id && sender.id && sender.id !== api.runtime.id) return false;
  if (isExtensionPageSender(sender)) return true;
  if (sender.tab) return isHttpUrl(sender.url ?? sender.tab.url);
  return sender.id === api?.runtime.id;
}

function isExtensionPageSender(sender: ExtensionMessageSender): boolean {
  const extensionRoot = api?.runtime.getURL?.("");
  return Boolean(extensionRoot && sender.url?.startsWith(extensionRoot));
}

function assertUrl(url: unknown): asserts url is string {
  if (!isHttpUrl(url)) throw new Error("Invalid URL");
}

async function assertAuthorizedConfiguredUrl(
  url: string,
  targetId: string | undefined,
  sender?: ExtensionMessageSender
) {
  const senderUrl = sender?.url ?? sender?.tab?.url;
  if (
    sender?.tab &&
    !isExtensionPageSender(sender) &&
    (!senderUrl || !sameOrigin(senderUrl, url))
  ) {
    throw new Error("Website messages cannot cross origins");
  }
  const resolved = await managedSites.resolve(url, targetId, true);
  if (!resolved) throw new Error("Website is not configured or its permission is missing");
  return resolved;
}

function assertPeriod(period: unknown): asserts period is UsagePeriod {
  if (period !== "day" && period !== "week" && period !== "month" && period !== "year") {
    throw new Error("Invalid usage period");
  }
}

function assertSettingsPatch(value: unknown): asserts value is DeepPartial<FocusSettings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid settings patch");
  }
}

async function withPlanRegistrationReconcile<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } finally {
    await reconcilePlanRegistration();
    await currentBlockingProfile();
  }
}

async function reconcilePlanRegistration(): Promise<void> {
  try {
    await planRegistration.reconcile();
  } catch (error) {
    console.warn("Hourleaf could not reconcile the active plan registration", error);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported request: ${String(value)}`);
}
