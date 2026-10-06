import {
  getSessionStorageArea,
  tabsGet,
  type ExtensionMessageSender,
  storageGet,
  storageSet,
  type StorageAreaLike
} from "../shared/browser";

import type { FocusSettings } from "../shared/types";
import { formatLocalDate } from "../shared/analytics";
import { selectActiveTimePeriod } from "../shared/schedule";
import { createMathChallenge, randomSeed, verifyUnlock, sha256 } from "../shared/unlock-challenge";

const STORAGE_KEY = "hourleaf.visit-confirmation.v1";
const SCHEMA_VERSION = 1 as const;

interface VisitGrant {
  siteId: string;
  origin: string;
  policyVersion: number;
  requiredAt: number;
  confirmedAt?: number;
  seed?: number;
  accessScope?: string;
}

interface VisitGrantStore {
  schemaVersion: typeof SCHEMA_VERSION;
  byTab: Record<string, VisitGrant>;
  bySite: Record<string, VisitGrant>;
}

/**
 * Keeps pending challenges tab-bound; confirmed visits may be shared by site
 * inside a day/schedule/policy scope. Quota enforcement remains independent.
 * `storage.session` makes the grant resilient to MV3 worker suspension without
 * carrying it into another browser session. Browsers without that API use the
 * background page's in-memory store.
 */
export class VisitConfirmationService {
  private readonly area: StorageAreaLike | null;
  private readonly memory: VisitGrantStore = {
    schemaVersion: SCHEMA_VERSION,
    byTab: {},
    bySite: {}
  };
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(area: StorageAreaLike | null = getSessionStorageArea()) {
    this.area = area;
  }

  async isGranted(
    tabId: number,
    siteId: string,
    origin: string,
    policyVersion: number,
    context?: VisitAccessContext
  ): Promise<boolean> {
    await this.writeQueue;
    const store = await this.read();
    const grant = store.byTab[String(tabId)];
    if (
      matchesGrant(grant, siteId, policyVersion, context) &&
      grant?.origin === normalizeOrigin(origin)
    ) {
      return true;
    }
    // Callers resolve and authorize the requested URL against the same managed
    // site first, so audited site-family subdomains can share a confirmation.
    return Boolean(
      context &&
      !context.repeatInNewTabs &&
      matchesGrant(store.bySite[siteId], siteId, policyVersion, context)
    );
  }

  async requireConfirmation(
    tabId: number,
    siteId: string,
    origin: string,
    policyVersion: number,
    waitSeconds: number,
    now = Date.now(),
    context?: VisitAccessContext
  ): Promise<number> {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) throw new Error("Invalid confirmation origin");
    let requiredAt = now;
    await this.update((store) => {
      const current = store.byTab[String(tabId)];
      if (
        current?.siteId === siteId &&
        current.origin === normalizedOrigin &&
        current.policyVersion === policyVersion &&
        current.accessScope === context?.scope &&
        current.confirmedAt === undefined
      ) {
        requiredAt = current.requiredAt;
        return;
      }
      store.byTab[String(tabId)] = {
        siteId,
        origin: normalizedOrigin,
        policyVersion,
        requiredAt: now,
        seed: randomSeed(),
        ...(context ? { accessScope: context.scope } : {})
      };
    });
    return Math.max(0, Math.ceil((requiredAt + waitSeconds * 1_000 - now) / 1_000));
  }

  async getGate(tabId: number, settings: FocusSettings) {
    const grant = (await this.read()).byTab[String(tabId)];
    if (!grant || grant.confirmedAt) throw new Error("No pending confirmation");
    return {
      method: settings.endPage.groupUnlock.method,
      waitEndsAt: grant.requiredAt + settings.endPage.groupUnlock.waitSeconds * 1000,
      mathChallenge: {
        prompt: createMathChallenge(grant.seed ?? 0, settings.endPage.groupUnlock.mathDifficulty)
          .prompt
      },
      passwordConfigured: Boolean(settings.endPage.groupUnlock.passwordVerifier)
    };
  }

  async grant(
    tabId: number,
    siteId: string,
    origin: string,
    policyVersion: number,
    waitSeconds: number,
    now = Date.now(),
    settings?: FocusSettings,
    proof?: string,
    context?: VisitAccessContext
  ): Promise<void> {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) throw new Error("Invalid confirmation origin");
    await this.update((store) => {
      const current = store.byTab[String(tabId)];
      if (
        current?.siteId !== siteId ||
        current.origin !== normalizedOrigin ||
        current.policyVersion !== policyVersion ||
        current.accessScope !== context?.scope
      ) {
        throw new Error("This visit confirmation is no longer available");
      }
      if (
        context &&
        !context.repeatInNewTabs &&
        matchesGrant(store.bySite[siteId], siteId, policyVersion, context)
      ) {
        current.confirmedAt = now;
        return;
      }
      if (now < current.requiredAt + waitSeconds * 1_000) {
        throw new Error("The visit confirmation wait has not finished");
      }
      if (settings) verifyUnlock(settings, current.seed ?? 0, current.requiredAt, proof, now);
      current.confirmedAt = now;
      if (context && !context.repeatInNewTabs) {
        if (settings) {
          for (const id of Object.keys(store.bySite)) {
            if (!settings.sites[id]) delete store.bySite[id];
          }
        }
        store.bySite[siteId] = { ...current };
      }
    });
  }

  async revokeTab(tabId: number): Promise<void> {
    await this.update((store) => {
      delete store.byTab[String(tabId)];
    });
  }

  async clear(): Promise<void> {
    await this.update((store) => {
      store.byTab = {};
      store.bySite = {};
    });
  }

  async revokeIfOriginChanged(
    tabId: number,
    nextUrl: string,
    extensionRoot: string
  ): Promise<void> {
    if (extensionRoot && nextUrl.startsWith(extensionRoot)) return;
    const nextOrigin = normalizeOrigin(nextUrl);
    const grant = (await this.read()).byTab[String(tabId)];
    if (grant && grant.origin !== nextOrigin) await this.revokeTab(tabId);
  }

  private async read(): Promise<VisitGrantStore> {
    if (!this.area) return cloneStore(this.memory);
    const result = await storageGet(this.area, STORAGE_KEY);
    return normalizeStore(result[STORAGE_KEY]);
  }

  private async update(mutator: (store: VisitGrantStore) => void): Promise<void> {
    const operation = async () => {
      const store = await this.read();
      mutator(store);
      if (this.area) await storageSet(this.area, { [STORAGE_KEY]: store });
      else {
        this.memory.schemaVersion = SCHEMA_VERSION;
        const copy = cloneStore(store);
        this.memory.byTab = copy.byTab;
        this.memory.bySite = copy.bySite;
      }
    };
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.catch(() => undefined);
    await result;
  }
}

export interface VisitAccessContext {
  scope: string;
  repeatInNewTabs: boolean;
}

/** One managed website shares its scope across targets, never across websites.
 * Quota/group changes are checked by the focus decision before using this grant.
 */
export async function createVisitAccessContext(
  settings: FocusSettings,
  siteId: string,
  now = new Date()
): Promise<VisitAccessContext> {
  const site = settings.sites[siteId];
  if (!site) throw new Error("Website no longer configured");
  const activePeriods = [...site.targetIds].sort().map((targetId) => {
    const target = settings.targets[targetId];
    const period = target ? selectActiveTimePeriod(target, now) : undefined;
    return [targetId, period ?? null];
  });
  return {
    repeatInNewTabs: settings.endPage.repeatConfirmationInNewTabs,
    scope: await sha256(
      JSON.stringify([
        formatLocalDate(now),
        settings.enabled,
        site.id,
        site.updatedAt,
        site.matchPatterns,
        activePeriods,
        settings.endPage.groupUnlock,
        settings.endPage.repeatConfirmationInNewTabs
      ])
    )
  };
}

function matchesGrant(
  grant: VisitGrant | undefined,
  siteId: string,
  policyVersion: number,
  context?: VisitAccessContext
): boolean {
  return (
    grant?.siteId === siteId &&
    grant.policyVersion === policyVersion &&
    grant.confirmedAt !== undefined &&
    grant.accessScope === context?.scope
  );
}

function normalizeStore(value: unknown): VisitGrantStore {
  const store: VisitGrantStore = { schemaVersion: SCHEMA_VERSION, byTab: {}, bySite: {} };
  if (!isRecord(value)) return store;
  if (isRecord(value.byTab)) {
    for (const [tabId, raw] of Object.entries(value.byTab).slice(0, 512)) {
      if (!/^\d{1,10}$/u.test(tabId)) continue;
      const grant = normalizeGrant(raw);
      if (grant) store.byTab[tabId] = grant;
    }
  }
  if (isRecord(value.bySite)) {
    for (const [siteId, raw] of Object.entries(value.bySite).slice(0, 256)) {
      const grant = normalizeGrant(raw);
      if (grant?.siteId === siteId && grant.accessScope && grant.confirmedAt !== undefined)
        store.bySite[siteId] = grant;
    }
  }
  return store;
}

function normalizeGrant(raw: unknown): VisitGrant | undefined {
  if (!isRecord(raw)) return;
  const origin = normalizeOrigin(raw.origin);
  if (
    !origin ||
    typeof raw.siteId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.siteId) ||
    typeof raw.requiredAt !== "number" ||
    !Number.isSafeInteger(raw.requiredAt) ||
    raw.requiredAt < 0 ||
    typeof raw.policyVersion !== "number" ||
    !Number.isSafeInteger(raw.policyVersion) ||
    raw.policyVersion < 0 ||
    (raw.confirmedAt !== undefined &&
      (typeof raw.confirmedAt !== "number" ||
        !Number.isSafeInteger(raw.confirmedAt) ||
        raw.confirmedAt < raw.requiredAt))
  )
    return;
  return {
    siteId: raw.siteId,
    origin,
    policyVersion: raw.policyVersion,
    requiredAt: raw.requiredAt,
    ...(typeof raw.seed === "number" ? { seed: raw.seed } : {}),
    ...(typeof raw.confirmedAt === "number" ? { confirmedAt: raw.confirmedAt } : {}),
    ...(typeof raw.accessScope === "string" && /^[a-f0-9]{64}$/.test(raw.accessScope)
      ? { accessScope: raw.accessScope }
      : {})
  };
}

function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function cloneStore(store: VisitGrantStore): VisitGrantStore {
  return {
    schemaVersion: SCHEMA_VERSION,
    byTab: Object.fromEntries(
      Object.entries(store.byTab).map(([tabId, grant]) => [tabId, { ...grant }])
    ),
    bySite: Object.fromEntries(
      Object.entries(store.bySite).map(([siteId, grant]) => [siteId, { ...grant }])
    )
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extension-page messages may omit sender.tab in Chromium. Verify the explicit own-tab id. */
export async function resolveVisitConfirmationTabId(
  sender: ExtensionMessageSender | undefined,
  requestedTabId: number | undefined,
  extensionRoot: string,
  returnUrl: string,
  siteId: string,
  getTab: typeof tabsGet = tabsGet
): Promise<number> {
  const tabId = sender?.tab?.id ?? requestedTabId;
  if (
    !Number.isInteger(tabId) ||
    (tabId as number) < 0 ||
    (sender?.tab?.id !== undefined &&
      requestedTabId !== undefined &&
      sender.tab.id !== requestedTabId)
  ) {
    throw new Error("Visit confirmation requires its own browser tab");
  }
  const page = new URL(sender?.url ?? "about:blank");
  const expected = new URL("end.html", extensionRoot);
  const params = new URLSearchParams(page.hash.slice(1));
  if (
    page.protocol !== expected.protocol ||
    page.host !== expected.host ||
    page.pathname !== expected.pathname ||
    params.get("source") !== "confirmation" ||
    params.get("returnUrl") !== returnUrl ||
    params.get("siteId") !== siteId
  ) {
    throw new Error("The visit confirmation page does not match this request");
  }
  const tab = await getTab(tabId as number);
  // Without the broad tabs permission, Chromium may omit even an extension tab URL.
  // Sender URL validation above and the pending per-tab grant remain authoritative.
  if (!tab || (tab.url !== undefined && tab.url !== sender?.url))
    throw new Error("The confirmation tab has navigated away");
  return tabId as number;
}
