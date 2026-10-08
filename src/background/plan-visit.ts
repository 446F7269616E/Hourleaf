import {
  getSessionStorageArea,
  storageGet,
  storageSet,
  tabsGet,
  type ExtensionMessageSender,
  type StorageAreaLike
} from "../shared/browser";
import { normalizePlanUrl } from "../shared/plan";

const STORAGE_KEY = "hourleaf.plan-visit.v1";
interface PlanVisit {
  id: string;
  tabId: number;
  origin: string;
}

/** One plan belongs to one browser-session tab, independently of its page URL. */
export class PlanVisitService {
  private memory: PlanVisit | undefined;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(private readonly area: StorageAreaLike | null = getSessionStorageArea()) {}

  async get(): Promise<PlanVisit | undefined> {
    await this.writes;
    return this.read();
  }

  async has(id: string): Promise<boolean> {
    return (await this.get())?.id === id;
  }

  async matches(id: string, url: string | undefined, tabId: number | undefined): Promise<boolean> {
    const visit = await this.get();
    return Boolean(
      visit?.id === id && visit.tabId === tabId && normalizePlanUrl(url)?.origin === visit.origin
    );
  }

  async bind(id: string, tabId: number, origin: string): Promise<void> {
    if (!Number.isSafeInteger(tabId) || tabId < 0 || normalizePlanUrl(origin)?.origin !== origin)
      throw new Error("Invalid plan visit");
    await this.update(() => ({ id, tabId, origin }));
  }

  async clear(id?: string): Promise<void> {
    await this.update((current) => (id === undefined || current?.id === id ? undefined : current));
  }

  private async read(): Promise<PlanVisit | undefined> {
    if (!this.area) return this.memory ? { ...this.memory } : undefined;
    const value = (await storageGet(this.area, STORAGE_KEY))[STORAGE_KEY];
    if (typeof value !== "object" || value === null) return undefined;
    const visit = value as Partial<PlanVisit>;
    if (
      typeof visit.id !== "string" ||
      !visit.id ||
      visit.id.length > 100 ||
      !Number.isSafeInteger(visit.tabId) ||
      (visit.tabId as number) < 0 ||
      typeof visit.origin !== "string" ||
      normalizePlanUrl(visit.origin)?.origin !== visit.origin
    )
      return undefined;
    return { id: visit.id, tabId: visit.tabId as number, origin: visit.origin };
  }

  private update(change: (visit: PlanVisit | undefined) => PlanVisit | undefined): Promise<void> {
    const operation = async () => {
      const visit = change(await this.read());
      if (this.area) await storageSet(this.area, { [STORAGE_KEY]: visit ?? null });
      else this.memory = visit;
    };
    const result = this.writes.then(operation, operation);
    this.writes = result.catch(() => undefined);
    return result;
  }
}

export const planVisits = new PlanVisitService();

/** Mutation fallback for top-level extension pages where sender.tab is absent. */
export async function resolvePlanPageTabId(
  sender: ExtensionMessageSender | undefined,
  claimedTabId: number | undefined
): Promise<number> {
  if (sender?.tab?.id !== undefined) {
    if (claimedTabId !== undefined && claimedTabId !== sender.tab.id)
      throw new Error("The plan page belongs to another tab");
    return sender.tab.id;
  }
  if (claimedTabId === undefined || !sender?.url)
    throw new Error("The plan page tab is unavailable");
  const tab = await tabsGet(claimedTabId);
  if (!tab || tab.url !== sender.url) throw new Error("The plan page has navigated away");
  return claimedTabId;
}
