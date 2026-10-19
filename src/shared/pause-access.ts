import type { StorageChangeLike } from "./browser";
import type { PageDecision, PeriodRuntimeStore, PlanNavigationDecision } from "./types";
import { STORAGE_KEYS } from "./storage-keys";

export const WEBSITE_ACCESS_CHANGED = "HOURLEAF_WEBSITE_ACCESS_CHANGED";

/** Challenge seeds and wait setup do not change access and must not rebuild other gates. */
function runtimeAccessChanged(change: StorageChangeLike, targetId?: string): boolean {
  const before = (change.oldValue as PeriodRuntimeStore | undefined)?.entries ?? {};
  const after = (change.newValue as PeriodRuntimeStore | undefined)?.entries ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].some((key) => {
    const previous = before[key];
    const next = after[key];
    if (targetId && previous?.targetId !== targetId && next?.targetId !== targetId) return false;
    const access = (entry: typeof previous) => [
      entry?.unlockedGroups ?? 1,
      entry?.flowUsed ?? false,
      entry?.lenientAcknowledged ?? false,
      entry?.flowContinuationKind,
      entry?.flowExpiresAt,
      entry?.flowGrantId,
      entry?.flowConsumesQuota
    ];
    return JSON.stringify(access(previous)) !== JSON.stringify(access(next));
  });
}

/** Pending challenges do not grant access; observing them would recheck our own gate writes. */
function confirmedVisits(value: unknown): string {
  if (!value || typeof value !== "object") return "[]";
  const store = value as Record<string, unknown>;
  return JSON.stringify(
    ["byTab", "bySite"].map((scope) => {
      const grants = store[scope];
      if (!grants || typeof grants !== "object" || Array.isArray(grants)) return [];
      return Object.entries(grants)
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(
          ([, grant]) =>
            grant &&
            typeof grant === "object" &&
            typeof (grant as Record<string, unknown>).confirmedAt === "number"
        );
    })
  );
}

/** Shared by the website host and end.html; usage heartbeats are deliberately excluded. */
export function pauseAccessChanged(
  changes: Record<string, StorageChangeLike>,
  targetId?: string
): boolean {
  const keys = [
    STORAGE_KEYS.settings,
    STORAGE_KEYS.temporaryAccess,
    STORAGE_KEYS.localModules,
    STORAGE_KEYS.planAccess,
    STORAGE_KEYS.tabGroupBindings,
    STORAGE_KEYS.tabGroupBindingRecords
  ];
  if (
    keys.some((key) => {
      const change = changes[key];
      return change && JSON.stringify(change.oldValue) !== JSON.stringify(change.newValue);
    })
  )
    return true;
  const runtime = changes[STORAGE_KEYS.periodRuntime];
  if (runtime && runtimeAccessChanged(runtime, targetId)) return true;
  const visits = changes[STORAGE_KEYS.visitConfirmation];
  return Boolean(visits && confirmedVisits(visits.oldValue) !== confirmedVisits(visits.newValue));
}

/** A lenient plan expiry may allow navigation while its pause still needs acknowledgement. */
export function planAllowsPauseResume(decision: PlanNavigationDecision): boolean {
  return decision.allowed && !(decision.reason === "expired" && decision.itemId);
}

/** Minute-based schedules and exact grant deadlines can both change a paused page's access. */
export function nextPauseAccessCheckAt(
  decision: PageDecision,
  paused = false,
  now = Date.now()
): number | undefined {
  const deadlines = [
    decision.nextAccessCheckAt,
    decision.flowExpiresAt,
    decision.temporaryAccessExpiresAt,
    ...(paused ? [now - (now % 60_000) + 60_000] : [])
  ].filter(
    (deadline): deadline is number =>
      typeof deadline === "number" && Number.isFinite(deadline) && deadline > now
  );
  return deadlines.length ? Math.min(...deadlines) : undefined;
}

/** One in-flight check, plus a trailing check if access changed while awaiting the result. */
export function createPauseRecheck(
  check: () => Promise<unknown>,
  coalesceMs = 0
): () => Promise<void> {
  let pending = false;
  let running: Promise<void> | undefined;
  return () => {
    pending = true;
    running ??= Promise.resolve()
      .then(async () => {
        if (coalesceMs > 0) await new Promise((resolve) => setTimeout(resolve, coalesceMs));
        while (pending) {
          pending = false;
          await check();
        }
      })
      .finally(() => {
        running = undefined;
      });
    return running;
  };
}
