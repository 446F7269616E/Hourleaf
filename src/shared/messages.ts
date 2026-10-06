import { runtimeSendMessage } from "./browser";
import type {
  DeepPartial,
  FocusSettings,
  PageDecision,
  PeriodRuntimeStatus,
  PlanItemInput,
  PlanItemPatch,
  PlanItemSource,
  PlanNavigationDecision,
  PlanState,
  ManagedSite,
  SiteModuleStore,
  SiteTargetSettings,
  TargetId,
  TrackingStatus,
  UsagePeriod,
  UsageSummary
} from "./types";
import { MAX_VISIT_CONFIRMATION_PROMPT_LENGTH } from "./types";
import {
  isPlanId,
  isPlanCompletionMode,
  isPlanDurationMinutes,
  isPlanFlowExtensionMinutes,
  isPlanItemSource,
  MAX_PLAN_IMPORT_ITEMS,
  MAX_PLAN_ITEMS,
  MAX_PLAN_TITLE_LENGTH,
  normalizePlanItemInput
} from "./plan";
import {
  LOCAL_MODULE_IMPORT_RISK_CODE,
  type LocalModuleDefinition,
  type LocalModuleSnapshot,
  type LocalModuleTimePeriodReference,
  type LocalPageRules
} from "../modules/local/types";
import { normalizeLocalModuleDefinition } from "../modules/local/validation";
import { normalizeFilterSchedules } from "../modules/local/schedules";
import {
  parseConfigurationBackup,
  type ConfigurationBackupDocument,
  type ConfigurationImportResult
} from "./configuration-backup";

export type SessionEvent = "start" | "heartbeat" | "route" | "stop";

export interface MessageContract {
  GET_SETTINGS: { request: Record<never, unknown>; response: FocusSettings };
  GET_CONFIGURATION_BACKUP: {
    request: Record<never, unknown>;
    response: ConfigurationBackupDocument;
  };
  IMPORT_CONFIGURATION: {
    request: { backup: ConfigurationBackupDocument };
    response: ConfigurationImportResult;
  };
  UPDATE_SETTINGS: { request: { patch: DeepPartial<FocusSettings> }; response: FocusSettings };
  BEGIN_PROTECTED_ACTION: {
    request: { action: "disable" | "reset" | "clear-all" | "protection" };
    response: import("../background/protected-actions").ProtectedTicket;
  };
  COMPLETE_PROTECTED_ACTION: {
    request: {
      action: "disable" | "reset" | "clear-all" | "protection";
      token: string;
      proof?: string;
      protection?: FocusSettings["disableProtection"];
    };
    response: FocusSettings;
  };
  ACKNOWLEDGE_PLAN_END: { request: { itemId: string }; response: { acknowledged: true } };
  ACKNOWLEDGE_LENIENT: {
    request: { targetId: string; periodId: string };
    response: { acknowledged: true };
  };
  DEBUG_ACTION: {
    request: { action: "consume-group" | "consume-period" | "preview" | "setup"; url?: string };
    response: { url?: string };
  };
  RESET_SETTINGS: { request: { token?: string; proof?: string }; response: FocusSettings };
  GET_USAGE: {
    request: { period: UsagePeriod; anchorDate?: string };
    response: UsageSummary;
  };
  CLEAR_USAGE: { request: Record<never, unknown>; response: { cleared: true } };
  GET_PAGE_DECISION: { request: { url: string; targetId?: TargetId }; response: PageDecision };
  GRANT_TEMPORARY_ACCESS: { request: { url: string; targetId?: TargetId }; response: PageDecision };
  GET_VISIT_GATE: {
    request: { url: string; siteId: string; tabId?: number };
    response: {
      alreadyGranted?: boolean;
      method: import("./types").GroupUnlockMethod;
      waitEndsAt: number;
      mathChallenge: { prompt: string };
      passwordConfigured: boolean;
    };
  };
  GRANT_VISIT_CONFIRMATION: {
    request: { url: string; siteId: string; tabId?: number; proof?: string };
    response: { granted: true; url: string };
  };
  RESUME_PAUSE_FRAME: {
    request: { channel: string; url: string };
    response: { resumed: true };
  };
  GET_PERIOD_RUNTIME: {
    request: { targetId: TargetId; periodId: string };
    response: PeriodRuntimeStatus;
  };
  START_PERIOD_GROUP_WAIT: {
    request: { targetId: TargetId; periodId: string };
    response: PeriodRuntimeStatus;
  };
  UNLOCK_PERIOD_GROUP: {
    request: { targetId: TargetId; periodId: string; proof?: string };
    response: PeriodRuntimeStatus;
  };
  GRANT_PERIOD_FLOW: {
    request: {
      url: string;
      targetId: TargetId;
      periodId: string;
      continuation: { kind: "minutes"; minutes: number } | { kind: "video-end" };
    };
    response: PageDecision;
  };
  STOP_PERIOD_FLOW: {
    request: { url: string; targetId: TargetId; periodId: string; grantId: string };
    response: PageDecision;
  };
  GET_MANAGED_SITES: {
    request: Record<never, unknown>;
    response: { sites: Record<string, ManagedSite>; targets: Record<string, SiteTargetSettings> };
  };
  ADD_MANAGED_SITE: {
    request: { url: string; label?: string };
    response: { granted: boolean; origin: string; site?: ManagedSite; target?: SiteTargetSettings };
  };
  UPDATE_MANAGED_SITE: {
    request: {
      siteId: string;
      patch: {
        label?: string;
        restrictionMode?: "lenient" | "flow" | "strict";
        visitConfirmation?: { enabled: boolean; waitSeconds: number; prompt?: string };
      };
    };
    response: ManagedSite;
  };
  UPDATE_SITE_TARGET: {
    request: { targetId: string; patch: Partial<SiteTargetSettings> };
    response: SiteTargetSettings;
  };
  REMOVE_MANAGED_SITE: {
    request: { siteId: string };
    response: { removed: true; permissionRemoved: boolean };
  };
  CLOSE_RELATED_TABS: {
    request:
      | { source: "focus"; siteId: string; tabId?: number }
      | { source: "plan"; itemId: string; tabId?: number };
    response: { closedCount: number };
  };
  GET_SITE_MODULES: { request: Record<never, unknown>; response: SiteModuleStore };
  RESTORE_SITE_MODULE: { request: { moduleId: string }; response: SiteModuleStore };
  SET_SITE_MODULE_ENABLED: {
    request: { moduleId: string; enabled: boolean };
    response: SiteModuleStore;
  };
  UNINSTALL_SITE_MODULE: { request: { moduleId: string }; response: SiteModuleStore };
  GET_LOCAL_MODULES: { request: Record<never, unknown>; response: LocalModuleSnapshot };
  IMPORT_LOCAL_MODULE: {
    request: {
      module: LocalModuleDefinition;
      /** Fixed proof that the import entrypoint displayed and accepted the risk disclosure. */
      riskAcknowledgement: typeof LOCAL_MODULE_IMPORT_RISK_CODE;
    };
    response: LocalModuleSnapshot;
  };
  SET_LOCAL_MODULE_ENABLED: {
    request: { moduleId: string; enabled: boolean; profile?: "normal" | "plan" };
    response: LocalModuleSnapshot;
  };
  SET_LOCAL_MODULE_FILTER_ENABLED: {
    request: { moduleId: string; groupId: string; enabled: boolean; profile?: "normal" | "plan" };
    response: LocalModuleSnapshot;
  };
  SET_LOCAL_MODULE_FILTER_SCHEDULE: {
    request: {
      moduleId: string;
      groupId: string;
      periods: LocalModuleTimePeriodReference[] | null;
      profile?: "normal" | "plan";
    };
    response: LocalModuleSnapshot;
  };
  REMOVE_LOCAL_MODULE: { request: { moduleId: string }; response: LocalModuleSnapshot };
  GET_LOCAL_PAGE_RULES: { request: { url: string }; response: LocalPageRules };
  GET_TRACKING_STATUS: { request: Record<never, unknown>; response: TrackingStatus };
  GET_PLAN_STATE: { request: Record<never, unknown>; response: PlanState };
  SET_PLAN_MODE: {
    request: {
      enabled?: boolean;
      watchDurationMinutes?: number;
      defaultCompletionMode?: "lenient" | "flow" | "strict";
      autoCompleteOnStart?: boolean;
      independentAccessTiming?: boolean;
    };
    response: PlanState;
  };
  ADD_PLAN_ITEM: { request: PlanItemInput; response: PlanState };
  UPDATE_PLAN_ITEM: {
    request: { id: string; patch: PlanItemPatch };
    response: PlanState;
  };
  DELETE_PLAN_ITEM: { request: { id: string }; response: PlanState };
  MOVE_PLAN_ITEM: {
    request: { id: string; direction: "up" | "down" };
    response: PlanState;
  };
  REORDER_PLAN_ITEMS: { request: { orderedIds: string[] }; response: PlanState };
  SET_PLAN_ITEM_COMPLETED: {
    request: { id: string; completed: boolean };
    response: PlanState;
  };
  START_PLAN_ITEM: {
    request: { id: string };
    response: { state: PlanState; url: string; expiresAt: number };
  };
  GET_PLAN_NAVIGATION_DECISION: {
    request: { url?: string; bvid?: string };
    response: PlanNavigationDecision;
  };
  CONTINUE_PLAN_FLOW: {
    request: {
      itemId: string;
      continuation: { kind: "minutes"; minutes: number } | { kind: "video-end" };
      url?: string;
    };
    response: {
      state: PlanState;
      url: string;
      expiresAt: number;
      continuationKind: "minutes" | "video-end";
    };
  };
  STOP_PLAN_FLOW: {
    request: { itemId: string; reason: "video-ended" | "user-ended"; url?: string };
    response: PlanState;
  };
  STOP_PLAN_ACCESS: {
    request: { itemId: string; reason: "video-ended"; url?: string };
    response: PlanState;
  };
  IMPORT_PLAN_ITEMS: {
    request: { items: PlanItemInput[]; source?: PlanItemSource };
    response: { state: PlanState; addedCount: number; skippedCount: number };
  };
  SESSION_UPDATE: {
    request: {
      event: SessionEvent;
      sessionId: string;
      url: string;
      targetId?: TargetId;
      visibility: "visible" | "hidden";
    };
    response: { accepted: boolean };
  };
}

export type MessageType = keyof MessageContract;
export type RequestOf<K extends MessageType> = { type: K } & MessageContract[K]["request"];
export type AnyRequest = { [K in MessageType]: RequestOf<K> }[MessageType];

export type MessageResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface WireRequest {
  version: 1;
  requestId: string;
  type: MessageType;
  payload: Record<string, unknown>;
}

export interface WireResponse<T> {
  version: 1;
  requestId: string;
  result: MessageResult<T>;
}

/** Typed UI/content facade; callers never need to construct the wire envelope. */
export async function sendRequest<K extends MessageType>(
  message: RequestOf<K>
): Promise<MessageContract[K]["response"]> {
  const { type, ...payload } = message;
  const requestId = createRequestId();
  const response = await runtimeSendMessage<WireResponse<MessageContract[K]["response"]>>({
    version: 1,
    requestId,
    type,
    payload
  } satisfies WireRequest);
  if (!response || response.version !== 1 || response.requestId !== requestId) {
    throw new Error("Hourleaf background returned an invalid response");
  }
  if (!response.result.ok) throw new Error(response.result.error.message);
  return response.result.data;
}

/** Validates the untrusted cross-context wire boundary and returns a domain request. */
export function parseMessageRequest(
  value: unknown
): { requestId: string; request: AnyRequest } | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (
    typeof value.requestId !== "string" ||
    value.requestId.length < 1 ||
    value.requestId.length > 100
  ) {
    return null;
  }
  if (!isRecord(value.payload) || typeof value.type !== "string") return null;
  const payload = value.payload;

  let request: AnyRequest;
  switch (value.type) {
    case "RESUME_PAUSE_FRAME":
      if (
        !hasOnlyKeys(payload, ["channel", "url"]) ||
        !isOpaqueId(payload.channel) ||
        !isHttpUrl(payload.url)
      )
        return null;
      request = { type: value.type, channel: payload.channel, url: payload.url };
      break;
    case "GET_SETTINGS":
      request = { type: "GET_SETTINGS" };
      break;
    case "GET_CONFIGURATION_BACKUP":
      request = { type: "GET_CONFIGURATION_BACKUP" };
      break;
    case "IMPORT_CONFIGURATION": {
      if (!hasOnlyKeys(payload, ["backup"])) return null;
      try {
        request = { type: value.type, backup: parseConfigurationBackup(payload.backup) };
      } catch {
        return null;
      }
      break;
    }
    case "BEGIN_PROTECTED_ACTION":
    case "COMPLETE_PROTECTED_ACTION": {
      const action = payload.action;
      if (
        action !== "disable" &&
        action !== "reset" &&
        action !== "clear-all" &&
        action !== "protection"
      )
        return null;
      if (value.type === "BEGIN_PROTECTED_ACTION") request = { type: value.type, action };
      else {
        if (
          typeof payload.token !== "string" ||
          payload.token.length > 80 ||
          (payload.proof !== undefined &&
            (typeof payload.proof !== "string" || payload.proof.length > 160))
        )
          return null;
        if (
          payload.protection !== undefined &&
          (!isRecord(payload.protection) || !isBoundedJson(payload.protection))
        )
          return null;
        request = {
          type: value.type,
          action,
          token: payload.token,
          proof: payload.proof as string | undefined,
          protection: payload.protection as FocusSettings["disableProtection"] | undefined
        };
      }
      break;
    }
    case "ACKNOWLEDGE_PLAN_END":
      if (!isOpaqueId(payload.itemId)) return null;
      request = { type: value.type, itemId: payload.itemId };
      break;
    case "ACKNOWLEDGE_LENIENT":
      if (!isOpaqueId(payload.targetId) || !isOpaqueId(payload.periodId)) return null;
      request = { type: value.type, targetId: payload.targetId, periodId: payload.periodId };
      break;
    case "DEBUG_ACTION":
      if (
        !["consume-group", "consume-period", "preview", "setup"].includes(String(payload.action)) ||
        (payload.url !== undefined && !isHttpUrl(payload.url))
      )
        return null;
      request = {
        type: value.type,
        action: payload.action as "consume-group" | "consume-period" | "preview" | "setup",
        url: payload.url as string | undefined
      };
      break;
    case "RESET_SETTINGS":
      request = {
        type: "RESET_SETTINGS",
        token: typeof payload.token === "string" ? payload.token : undefined,
        proof: typeof payload.proof === "string" ? payload.proof : undefined
      };
      break;
    case "CLEAR_USAGE":
      request = { type: "CLEAR_USAGE" };
      break;
    case "GET_TRACKING_STATUS":
      request = { type: "GET_TRACKING_STATUS" };
      break;
    case "GET_PLAN_STATE":
      request = { type: "GET_PLAN_STATE" };
      break;
    case "GET_MANAGED_SITES":
    case "GET_SITE_MODULES":
    case "GET_LOCAL_MODULES":
      request = { type: value.type };
      break;
    case "UPDATE_SETTINGS":
      if (!isRecord(payload.patch) || !isBoundedJson(payload.patch)) return null;
      request = { type: value.type, patch: payload.patch };
      break;
    case "GET_USAGE":
      if (
        payload.period !== "day" &&
        payload.period !== "week" &&
        payload.period !== "month" &&
        payload.period !== "year"
      )
        return null;
      if (payload.anchorDate !== undefined && typeof payload.anchorDate !== "string") return null;
      request = {
        type: value.type,
        period: payload.period,
        ...(typeof payload.anchorDate === "string" ? { anchorDate: payload.anchorDate } : {})
      };
      break;
    case "GET_PAGE_DECISION":
    case "GRANT_TEMPORARY_ACCESS":
      if (
        !isHttpUrl(payload.url) ||
        (payload.targetId !== undefined && !isOpaqueId(payload.targetId))
      )
        return null;
      request = {
        type: value.type,
        url: payload.url,
        ...(isOpaqueId(payload.targetId) ? { targetId: payload.targetId } : {})
      };
      break;
    case "GET_VISIT_GATE":
    case "GRANT_VISIT_CONFIRMATION":
      if (
        !hasOnlyKeys(payload, ["url", "siteId", "tabId", "proof"]) ||
        (payload.proof !== undefined &&
          (typeof payload.proof !== "string" || payload.proof.length > 128)) ||
        (payload.tabId !== undefined && !isBoundedInteger(payload.tabId, 0, 2147483647)) ||
        !isHttpUrl(payload.url) ||
        !isOpaqueId(payload.siteId)
      ) {
        return null;
      }
      request = {
        type: value.type,
        url: payload.url,
        siteId: payload.siteId,
        ...(typeof payload.proof === "string" ? { proof: payload.proof } : {}),
        ...(typeof payload.tabId === "number" ? { tabId: payload.tabId } : {})
      };
      break;
    case "GET_PERIOD_RUNTIME":
    case "START_PERIOD_GROUP_WAIT":
      if (
        !hasOnlyKeys(payload, ["targetId", "periodId"]) ||
        !isOpaqueId(payload.targetId) ||
        !isOpaqueId(payload.periodId)
      ) {
        return null;
      }
      request = { type: value.type, targetId: payload.targetId, periodId: payload.periodId };
      break;
    case "UNLOCK_PERIOD_GROUP":
      if (
        !hasOnlyKeys(payload, ["targetId", "periodId", "proof"]) ||
        !isOpaqueId(payload.targetId) ||
        !isOpaqueId(payload.periodId) ||
        (payload.proof !== undefined &&
          (typeof payload.proof !== "string" || payload.proof.length > 128))
      ) {
        return null;
      }
      request = {
        type: value.type,
        targetId: payload.targetId,
        periodId: payload.periodId,
        ...(typeof payload.proof === "string" ? { proof: payload.proof } : {})
      };
      break;
    case "GRANT_PERIOD_FLOW": {
      if (
        !hasOnlyKeys(payload, ["url", "targetId", "periodId", "continuation"]) ||
        !isHttpUrl(payload.url) ||
        !isOpaqueId(payload.targetId) ||
        !isOpaqueId(payload.periodId) ||
        !isRecord(payload.continuation)
      ) {
        return null;
      }
      const continuation = payload.continuation;
      if (
        continuation.kind === "minutes" &&
        hasOnlyKeys(continuation, ["kind", "minutes"]) &&
        isBoundedInteger(continuation.minutes, 1, 15)
      ) {
        request = {
          type: value.type,
          url: payload.url,
          targetId: payload.targetId,
          periodId: payload.periodId,
          continuation: { kind: "minutes", minutes: continuation.minutes }
        };
      } else if (continuation.kind === "video-end" && hasOnlyKeys(continuation, ["kind"])) {
        request = {
          type: value.type,
          url: payload.url,
          targetId: payload.targetId,
          periodId: payload.periodId,
          continuation: { kind: "video-end" }
        };
      } else {
        return null;
      }
      break;
    }
    case "STOP_PERIOD_FLOW":
      if (
        !hasOnlyKeys(payload, ["url", "targetId", "periodId", "grantId"]) ||
        !isHttpUrl(payload.url) ||
        !isOpaqueId(payload.targetId) ||
        !isOpaqueId(payload.periodId) ||
        !isOpaqueId(payload.grantId)
      ) {
        return null;
      }
      request = {
        type: value.type,
        url: payload.url,
        targetId: payload.targetId,
        periodId: payload.periodId,
        grantId: payload.grantId
      };
      break;
    case "ADD_MANAGED_SITE":
      if (!isHttpUrl(payload.url) || (payload.label !== undefined && !isLabel(payload.label)))
        return null;
      request = {
        type: value.type,
        url: payload.url,
        ...(typeof payload.label === "string" ? { label: payload.label } : {})
      };
      break;
    case "UPDATE_MANAGED_SITE":
      if (
        !isOpaqueId(payload.siteId) ||
        !isRecord(payload.patch) ||
        !hasOnlyKeys(payload.patch, ["label", "restrictionMode", "visitConfirmation"])
      )
        return null;
      if (payload.patch.label !== undefined && !isLabel(payload.patch.label)) return null;
      if (
        payload.patch.restrictionMode !== undefined &&
        payload.patch.restrictionMode !== "lenient" &&
        payload.patch.restrictionMode !== "flow" &&
        payload.patch.restrictionMode !== "strict"
      ) {
        return null;
      }
      if (payload.patch.visitConfirmation !== undefined) {
        if (
          !isRecord(payload.patch.visitConfirmation) ||
          !hasOnlyKeys(payload.patch.visitConfirmation, ["enabled", "waitSeconds", "prompt"]) ||
          typeof payload.patch.visitConfirmation.enabled !== "boolean" ||
          !isBoundedInteger(payload.patch.visitConfirmation.waitSeconds, 0, 60) ||
          (payload.patch.visitConfirmation.prompt !== undefined &&
            (typeof payload.patch.visitConfirmation.prompt !== "string" ||
              payload.patch.visitConfirmation.prompt.length > MAX_VISIT_CONFIRMATION_PROMPT_LENGTH))
        ) {
          return null;
        }
      }
      request = { type: value.type, siteId: payload.siteId, patch: payload.patch };
      break;
    case "UPDATE_SITE_TARGET":
      if (
        !isOpaqueId(payload.targetId) ||
        !isRecord(payload.patch) ||
        !hasOnlyKeys(payload.patch, [
          "label",
          "enabled",
          "accessPolicy",
          "dailyLimitMinutes",
          "schedules",
          "timePeriods",
          "temporaryAccess"
        ]) ||
        !isBoundedJson(payload.patch)
      )
        return null;
      if (
        payload.patch.accessPolicy !== undefined &&
        payload.patch.accessPolicy !== "timed" &&
        payload.patch.accessPolicy !== "always-allow" &&
        payload.patch.accessPolicy !== "always-block"
      ) {
        return null;
      }
      request = {
        type: value.type,
        targetId: payload.targetId,
        patch: payload.patch
      };
      break;
    case "REMOVE_MANAGED_SITE":
      if (!isOpaqueId(payload.siteId)) return null;
      request = { type: value.type, siteId: payload.siteId };
      break;
    case "CLOSE_RELATED_TABS":
      if (payload.tabId !== undefined && !isBoundedInteger(payload.tabId, 0, 2147483647))
        return null;
      if (
        payload.source === "focus" &&
        hasOnlyKeys(payload, ["source", "siteId", "tabId"]) &&
        isOpaqueId(payload.siteId)
      ) {
        request = {
          type: value.type,
          source: "focus",
          siteId: payload.siteId,
          tabId: payload.tabId as number | undefined
        };
      } else if (
        payload.source === "plan" &&
        hasOnlyKeys(payload, ["source", "itemId", "tabId"]) &&
        isOpaqueId(payload.itemId)
      ) {
        request = {
          type: value.type,
          source: "plan",
          itemId: payload.itemId,
          tabId: payload.tabId as number | undefined
        };
      } else {
        return null;
      }
      break;
    case "RESTORE_SITE_MODULE":
      if (!isOpaqueId(payload.moduleId)) return null;
      request = { type: value.type, moduleId: payload.moduleId };
      break;
    case "SET_SITE_MODULE_ENABLED":
      if (!isOpaqueId(payload.moduleId) || typeof payload.enabled !== "boolean") return null;
      request = { type: value.type, moduleId: payload.moduleId, enabled: payload.enabled };
      break;
    case "UNINSTALL_SITE_MODULE":
      if (!isOpaqueId(payload.moduleId)) return null;
      request = { type: value.type, moduleId: payload.moduleId };
      break;
    case "IMPORT_LOCAL_MODULE": {
      if (
        !hasOnlyKeys(payload, ["module", "riskAcknowledgement"]) ||
        payload.riskAcknowledgement !== LOCAL_MODULE_IMPORT_RISK_CODE
      ) {
        return null;
      }
      const module = normalizeLocalModuleDefinition(payload.module);
      if (!module) return null;
      request = {
        type: value.type,
        module,
        riskAcknowledgement: LOCAL_MODULE_IMPORT_RISK_CODE
      };
      break;
    }
    case "SET_LOCAL_MODULE_ENABLED":
      if (
        !hasOnlyKeys(payload, ["moduleId", "enabled", "profile"]) ||
        !isOpaqueId(payload.moduleId) ||
        (payload.profile !== undefined &&
          payload.profile !== "normal" &&
          payload.profile !== "plan") ||
        typeof payload.enabled !== "boolean"
      ) {
        return null;
      }
      request = {
        type: value.type,
        moduleId: payload.moduleId,
        ...(payload.profile === "normal" || payload.profile === "plan"
          ? { profile: payload.profile }
          : {}),
        enabled: payload.enabled
      };
      break;
    case "SET_LOCAL_MODULE_FILTER_ENABLED":
      if (
        !hasOnlyKeys(payload, ["moduleId", "groupId", "enabled", "profile"]) ||
        !isOpaqueId(payload.moduleId) ||
        (payload.profile !== undefined &&
          payload.profile !== "normal" &&
          payload.profile !== "plan") ||
        !isOpaqueId(payload.groupId) ||
        typeof payload.enabled !== "boolean"
      ) {
        return null;
      }
      request = {
        type: value.type,
        moduleId: payload.moduleId,
        groupId: payload.groupId,
        ...(payload.profile === "normal" || payload.profile === "plan"
          ? { profile: payload.profile }
          : {}),
        enabled: payload.enabled
      };
      break;
    case "SET_LOCAL_MODULE_FILTER_SCHEDULE": {
      if (
        !hasOnlyKeys(payload, ["moduleId", "groupId", "periods", "profile"]) ||
        !isOpaqueId(payload.moduleId) ||
        !isOpaqueId(payload.groupId) ||
        (payload.profile !== undefined &&
          payload.profile !== "normal" &&
          payload.profile !== "plan")
      )
        return null;
      const schedule =
        payload.periods === null
          ? null
          : normalizeFilterSchedules({ [payload.groupId]: payload.periods });
      if (payload.periods !== null && !schedule) return null;
      request = {
        type: value.type,
        moduleId: payload.moduleId,
        groupId: payload.groupId,
        periods: schedule?.[payload.groupId] ?? null,
        ...(payload.profile === "normal" || payload.profile === "plan"
          ? { profile: payload.profile }
          : {})
      };
      break;
    }
    case "REMOVE_LOCAL_MODULE":
      if (!hasOnlyKeys(payload, ["moduleId"]) || !isOpaqueId(payload.moduleId)) return null;
      request = { type: value.type, moduleId: payload.moduleId };
      break;
    case "GET_LOCAL_PAGE_RULES":
      if (!hasOnlyKeys(payload, ["url"]) || !isHttpUrl(payload.url)) return null;
      request = { type: value.type, url: payload.url };
      break;
    case "SET_PLAN_MODE": {
      if (
        !hasOnlyKeys(payload, [
          "enabled",
          "watchDurationMinutes",
          "defaultCompletionMode",
          "autoCompleteOnStart",
          "independentAccessTiming"
        ])
      ) {
        return null;
      }
      const hasEnabled = typeof payload.enabled === "boolean";
      const hasDuration = isBoundedInteger(payload.watchDurationMinutes, 1, 360);
      const hasDefaultCompletionMode = isPlanCompletionMode(payload.defaultCompletionMode);
      const hasAutoComplete = typeof payload.autoCompleteOnStart === "boolean";
      const hasIndependentTiming = typeof payload.independentAccessTiming === "boolean";
      if (
        (!hasEnabled &&
          !hasDuration &&
          !hasDefaultCompletionMode &&
          !hasAutoComplete &&
          !hasIndependentTiming) ||
        (payload.enabled !== undefined && !hasEnabled) ||
        (payload.watchDurationMinutes !== undefined && !hasDuration) ||
        (payload.defaultCompletionMode !== undefined && !hasDefaultCompletionMode) ||
        (payload.autoCompleteOnStart !== undefined && !hasAutoComplete) ||
        (payload.independentAccessTiming !== undefined && !hasIndependentTiming)
      ) {
        return null;
      }
      request = {
        type: value.type,
        ...(hasEnabled ? { enabled: payload.enabled as boolean } : {}),
        ...(hasDuration ? { watchDurationMinutes: payload.watchDurationMinutes as number } : {}),
        ...(hasDefaultCompletionMode
          ? {
              defaultCompletionMode: payload.defaultCompletionMode as "lenient" | "flow" | "strict"
            }
          : {}),
        ...(hasAutoComplete ? { autoCompleteOnStart: payload.autoCompleteOnStart as boolean } : {}),
        ...(hasIndependentTiming
          ? { independentAccessTiming: payload.independentAccessTiming as boolean }
          : {})
      };
      break;
    }
    case "ADD_PLAN_ITEM": {
      const input = parsePlanItemInput(payload);
      if (!input) return null;
      request = { type: value.type, ...input };
      break;
    }
    case "UPDATE_PLAN_ITEM": {
      if (!isPlanId(payload.id) || !isRecord(payload.patch)) return null;
      const patch = parsePlanItemPatch(payload.patch);
      if (!patch) return null;
      request = { type: value.type, id: payload.id, patch };
      break;
    }
    case "DELETE_PLAN_ITEM":
    case "START_PLAN_ITEM":
      if (!hasOnlyKeys(payload, ["id"]) || !isPlanId(payload.id)) return null;
      request = { type: value.type, id: payload.id };
      break;
    case "MOVE_PLAN_ITEM":
      if (
        !hasOnlyKeys(payload, ["id", "direction"]) ||
        !isPlanId(payload.id) ||
        (payload.direction !== "up" && payload.direction !== "down")
      ) {
        return null;
      }
      request = { type: value.type, id: payload.id, direction: payload.direction };
      break;
    case "REORDER_PLAN_ITEMS":
      if (
        !hasOnlyKeys(payload, ["orderedIds"]) ||
        !Array.isArray(payload.orderedIds) ||
        payload.orderedIds.length > MAX_PLAN_ITEMS ||
        !payload.orderedIds.every(isPlanId) ||
        new Set(payload.orderedIds).size !== payload.orderedIds.length
      ) {
        return null;
      }
      request = { type: value.type, orderedIds: [...payload.orderedIds] };
      break;
    case "SET_PLAN_ITEM_COMPLETED":
      if (
        !hasOnlyKeys(payload, ["id", "completed"]) ||
        !isPlanId(payload.id) ||
        typeof payload.completed !== "boolean"
      ) {
        return null;
      }
      request = { type: value.type, id: payload.id, completed: payload.completed };
      break;
    case "GET_PLAN_NAVIGATION_DECISION":
      if (!hasOnlyKeys(payload, ["url", "bvid"])) return null;
      if (payload.url !== undefined && !isHttpUrl(payload.url)) return null;
      if (payload.bvid !== undefined && !isLegacyIdentity(payload.bvid)) return null;
      request = {
        type: value.type,
        ...(typeof payload.url === "string" ? { url: payload.url } : {}),
        ...(isLegacyIdentity(payload.bvid) ? { bvid: payload.bvid } : {})
      };
      break;
    case "CONTINUE_PLAN_FLOW": {
      if (
        !hasOnlyKeys(payload, ["itemId", "continuation", "url"]) ||
        !isPlanId(payload.itemId) ||
        !isRecord(payload.continuation) ||
        (payload.url !== undefined && !isHttpUrl(payload.url))
      ) {
        return null;
      }
      const continuation = payload.continuation;
      if (continuation.kind === "minutes") {
        if (
          !hasOnlyKeys(continuation, ["kind", "minutes"]) ||
          !isPlanFlowExtensionMinutes(continuation.minutes)
        ) {
          return null;
        }
        request = {
          type: value.type,
          itemId: payload.itemId,
          continuation: { kind: "minutes", minutes: continuation.minutes },
          ...(typeof payload.url === "string" ? { url: payload.url } : {})
        };
      } else if (continuation.kind === "video-end" && hasOnlyKeys(continuation, ["kind"])) {
        request = {
          type: value.type,
          itemId: payload.itemId,
          continuation: { kind: "video-end" },
          ...(typeof payload.url === "string" ? { url: payload.url } : {})
        };
      } else {
        return null;
      }
      break;
    }
    case "STOP_PLAN_FLOW":
      if (
        !hasOnlyKeys(payload, ["itemId", "reason", "url"]) ||
        !isPlanId(payload.itemId) ||
        (payload.url !== undefined && !isHttpUrl(payload.url)) ||
        (payload.reason !== "video-ended" && payload.reason !== "user-ended")
      ) {
        return null;
      }
      request = {
        type: value.type,
        itemId: payload.itemId,
        reason: payload.reason,
        ...(typeof payload.url === "string" ? { url: payload.url } : {})
      };
      break;
    case "STOP_PLAN_ACCESS":
      if (
        !hasOnlyKeys(payload, ["itemId", "reason", "url"]) ||
        !isPlanId(payload.itemId) ||
        payload.reason !== "video-ended" ||
        (payload.url !== undefined && !isHttpUrl(payload.url))
      ) {
        return null;
      }
      request = {
        type: value.type,
        itemId: payload.itemId,
        reason: "video-ended",
        ...(typeof payload.url === "string" ? { url: payload.url } : {})
      };
      break;
    case "IMPORT_PLAN_ITEMS": {
      if (
        !hasOnlyKeys(payload, ["items", "source"]) ||
        !Array.isArray(payload.items) ||
        payload.items.length < 1 ||
        payload.items.length > MAX_PLAN_IMPORT_ITEMS ||
        (payload.source !== undefined && !isPlanItemSource(payload.source))
      ) {
        return null;
      }
      const source = isPlanItemSource(payload.source) ? payload.source : undefined;
      const items = payload.items.map((item) => parsePlanItemInput(item, source));
      if (items.some((item) => item === null)) return null;
      request = {
        type: value.type,
        items: items as PlanItemInput[],
        ...(source ? { source } : {})
      };
      break;
    }
    case "SESSION_UPDATE":
      if (
        (payload.event !== "start" &&
          payload.event !== "heartbeat" &&
          payload.event !== "route" &&
          payload.event !== "stop") ||
        typeof payload.sessionId !== "string" ||
        payload.sessionId.length < 8 ||
        payload.sessionId.length > 100 ||
        !isHttpUrl(payload.url) ||
        (payload.targetId !== undefined && !isOpaqueId(payload.targetId)) ||
        (payload.visibility !== "visible" && payload.visibility !== "hidden")
      ) {
        return null;
      }
      request = {
        type: value.type,
        event: payload.event,
        sessionId: payload.sessionId,
        url: payload.url,
        ...(isOpaqueId(payload.targetId) ? { targetId: payload.targetId } : {}),
        visibility: payload.visibility
      };
      break;
    default:
      return null;
  }
  return { requestId: value.requestId, request };
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4_096) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

/** @deprecated Use isHttpUrl and authorize against configured origins in background. */
export const isBilibiliUrl = isHttpUrl;

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function parsePlanItemInput(value: unknown, fallbackSource?: PlanItemSource): PlanItemInput | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "title",
      "goal",
      "url",
      "bvid",
      "source",
      "scheduledDurationMinutes",
      "completionMode",
      "pauseOnVideoEnd"
    ])
  ) {
    return null;
  }
  const normalized = normalizePlanItemInput(value, fallbackSource);
  if (!normalized) return null;
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.goal === "string" ? { goal: value.goal } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(typeof value.bvid === "string" ? { bvid: value.bvid } : {}),
    ...(isPlanItemSource(value.source) ? { source: value.source } : {}),
    scheduledDurationMinutes: normalized.scheduledDurationMinutes,
    completionMode: normalized.completionMode,
    ...(typeof value.pauseOnVideoEnd === "boolean"
      ? { pauseOnVideoEnd: value.pauseOnVideoEnd }
      : {})
  } as PlanItemInput;
}

function parsePlanItemPatch(value: Record<string, unknown>): PlanItemPatch | null {
  if (
    !hasOnlyKeys(value, [
      "title",
      "goal",
      "url",
      "bvid",
      "source",
      "scheduledDurationMinutes",
      "completionMode",
      "pauseOnVideoEnd"
    ]) ||
    Object.keys(value).length < 1
  ) {
    return null;
  }
  if (
    (value.goal !== undefined && (typeof value.goal !== "string" || value.goal.length > 500)) ||
    (value.title !== undefined &&
      (typeof value.title !== "string" || value.title.length > MAX_PLAN_TITLE_LENGTH)) ||
    (value.url !== undefined && typeof value.url !== "string") ||
    (value.bvid !== undefined && !isLegacyIdentity(value.bvid)) ||
    (value.source !== undefined && !isPlanItemSource(value.source)) ||
    (value.scheduledDurationMinutes !== undefined &&
      !isPlanDurationMinutes(value.scheduledDurationMinutes)) ||
    (value.completionMode !== undefined && !isPlanCompletionMode(value.completionMode)) ||
    (value.pauseOnVideoEnd !== undefined && typeof value.pauseOnVideoEnd !== "boolean")
  ) {
    return null;
  }
  if (value.url !== undefined && !isHttpUrl(value.url)) return null;
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.goal === "string" ? { goal: value.goal } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(isLegacyIdentity(value.bvid) ? { bvid: value.bvid } : {}),
    ...(isPlanItemSource(value.source) ? { source: value.source } : {}),
    ...(isPlanDurationMinutes(value.scheduledDurationMinutes)
      ? { scheduledDurationMinutes: value.scheduledDurationMinutes }
      : {}),
    ...(isPlanCompletionMode(value.completionMode) ? { completionMode: value.completionMode } : {}),
    ...(typeof value.pauseOnVideoEnd === "boolean"
      ? { pauseOnVideoEnd: value.pauseOnVideoEnd }
      : {})
  };
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isBoundedJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "string") return value.length <= 1_000;
  if (Array.isArray(value)) {
    return value.length <= 100 && value.every((item) => isBoundedJson(item, depth + 1));
  }
  if (!isRecord(value) || Object.keys(value).length > 100) return false;
  return Object.values(value).every((item) => isBoundedJson(item, depth + 1));
}

function isOpaqueId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 80;
}

function isLegacyIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
