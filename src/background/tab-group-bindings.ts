import {
  getLocalStorageArea,
  getSessionStorageArea,
  runtimeGetURL,
  storageGet,
  storageSet,
  tabsQuery,
  type ExtensionTab,
  type ExtensionTabGroup
} from "../shared/browser";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { MAX_TAB_GROUP_WHITELIST_RULES } from "../shared/tab-group-whitelist";

interface GroupBinding {
  identity: string;
  fingerprint: string | null;
  session: string;
  groupId: number | null;
}

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const validGroupId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;

/** Only a digest survives closure; raw member URLs are never persisted. */
async function fingerprint(
  group: ExtensionTabGroup,
  tabs: readonly ExtensionTab[]
): Promise<string | null> {
  const members = tabs.filter((tab) => tab.groupId === group.id);
  if (members.length === 0 || members.some((tab) => tab.incognito)) return null;
  const pausePage = new URL(runtimeGetURL("end.html"));
  const urls = members
    .flatMap((tab) => {
      try {
        let url = new URL(tab.pendingUrl ?? tab.url ?? "");
        // A partially restored group may reach ordinary confirmation before all
        // members exist. Its own pause page still represents the return URL.
        if (
          url.protocol === pausePage.protocol &&
          url.host === pausePage.host &&
          url.pathname === pausePage.pathname
        ) {
          url = new URL(new URLSearchParams(url.hash.slice(1)).get("returnUrl") ?? "");
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") return [];
        url.username = "";
        url.password = "";
        return [url.href];
      } catch {
        return [];
      }
    })
    .sort();
  // A name/color match without any readable member evidence is insufficient.
  if (urls.length === 0) return null;
  const bytes = new TextEncoder().encode(
    JSON.stringify([group.title ?? "", group.color ?? "", members.length, urls])
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Serial, local-only bindings. Numeric group IDs are trusted only in their own session. */
export class TabGroupBindingStore {
  private queue: Promise<unknown> = Promise.resolve();

  resolve(
    groups: readonly ExtensionTabGroup[],
    revoked: ReadonlySet<number>,
    closingWindows: ReadonlySet<number>,
    ruleIds: ReadonlySet<string>
  ): Promise<{ bindings: Map<string, number>; retained: Set<string> }> {
    return this.enqueue(async () => {
      const [{ records, initialized }, session] = await Promise.all([this.read(), this.session()]);
      const before = JSON.stringify([...records]);
      const tabs = groups.length > 0 ? await tabsQuery({}) : [];
      const tabsByGroup = new Map<number, ExtensionTab[]>();
      for (const tab of tabs) {
        if (tab.groupId === undefined || tab.groupId < 0) continue;
        const members = tabsByGroup.get(tab.groupId) ?? [];
        members.push(tab);
        tabsByGroup.set(tab.groupId, members);
      }
      const available = groups.filter(
        (group) => !revoked.has(group.id) && !closingWindows.has(group.windowId)
      );
      const live = new Map(available.map((group) => [group.id, group]));
      const signatures = new Map(
        await Promise.all(
          available.map(
            async (group) =>
              [group.id, await fingerprint(group, tabsByGroup.get(group.id) ?? [])] as const
          )
        )
      );
      const owners = new Map<number, string>();
      const bindings = new Map<string, number>();

      // Existing v1 bindings can be upgraded only while their session and group are live.
      if (!initialized) {
        const area = getSessionStorageArea();
        const legacy = area
          ? (await storageGet(area, STORAGE_KEYS.tabGroupBindings))[STORAGE_KEYS.tabGroupBindings]
          : null;
        if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
          for (const [id, groupId] of Object.entries(legacy)) {
            if (!ruleIds.has(id) || !validGroupId(groupId) || !live.has(groupId)) continue;
            const identity = owners.get(groupId) ?? crypto.randomUUID();
            owners.set(groupId, identity);
            records.set(id, {
              identity,
              fingerprint: signatures.get(groupId) ?? null,
              session,
              groupId
            });
          }
        }
      }

      for (const [id, record] of records) {
        if (record.session !== session || record.groupId === null || !live.has(record.groupId))
          continue;
        const identity = owners.get(record.groupId) ?? record.identity;
        owners.set(record.groupId, identity);
        bindings.set(id, record.groupId);
        records.set(id, {
          ...record,
          identity,
          fingerprint: signatures.get(record.groupId) ?? record.fingerprint
        });
      }

      // Multiple rules bound to the same original group are one recovery source.
      const sources = new Map<string, Set<string>>();
      for (const record of records.values()) {
        if (!record.fingerprint) continue;
        const identities = sources.get(record.fingerprint) ?? new Set<string>();
        identities.add(record.identity);
        sources.set(record.fingerprint, identities);
      }
      for (const [id, record] of records) {
        if (bindings.has(id) || !record.fingerprint || sources.get(record.fingerprint)?.size !== 1)
          continue;
        if (record.session === session && record.groupId !== null && revoked.has(record.groupId))
          continue;
        const matches = available.filter(
          (group) => signatures.get(group.id) === record.fingerprint
        );
        // Never choose one of two indistinguishable groups or take another binding's group.
        const match = matches.length === 1 ? matches[0] : undefined;
        if (!match || revoked.has(match.id) || closingWindows.has(match.windowId)) continue;
        const owner = owners.get(match.id);
        if (owner && owner !== record.identity) continue;
        owners.set(match.id, record.identity);
        bindings.set(id, match.id);
        records.set(id, { ...record, session, groupId: match.id });
      }
      if (!initialized || before !== JSON.stringify([...records])) await this.write(records);
      return { bindings, retained: new Set(records.keys()) };
    });
  }

  bind(id: string, group: ExtensionTabGroup): Promise<void> {
    return this.enqueue(async () => {
      const [{ records }, session, tabs] = await Promise.all([
        this.read(),
        this.session(),
        tabsQuery({ groupId: group.id })
      ]);
      const existing = [...records.values()].find(
        (record) => record.session === session && record.groupId === group.id
      );
      records.set(id, {
        identity: existing?.identity ?? crypto.randomUUID(),
        fingerprint: await fingerprint(group, tabs),
        session,
        groupId: group.id
      });
      await this.write(records);
    });
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const { records } = await this.read();
      records.delete(id);
      await this.write(records);
    });
  }

  release(groupId: number, retain: boolean): Promise<void> {
    return this.enqueue(async () => {
      const [{ records }, session] = await Promise.all([this.read(), this.session()]);
      for (const [id, record] of records) {
        if (record.session !== session || record.groupId !== groupId) continue;
        if (retain) records.set(id, { ...record, groupId: null });
        else records.delete(id);
      }
      await this.write(records);
    });
  }

  clear(): Promise<void> {
    // An initialized empty v2 store also prevents old v1 bindings from reappearing.
    return this.enqueue(async () => {
      await this.write(new Map());
      const area = getSessionStorageArea();
      if (area) await storageSet(area, { [STORAGE_KEYS.tabGroupBindings]: {} });
    });
  }

  private async session(): Promise<string> {
    const area = getSessionStorageArea();
    if (!area) throw new Error("Session storage is required for tab group bindings");
    const value = (await storageGet(area, STORAGE_KEYS.tabGroupBindingSession))[
      STORAGE_KEYS.tabGroupBindingSession
    ];
    if (typeof value === "string" && VALID_ID.test(value)) return value;
    const session = crypto.randomUUID();
    await storageSet(area, { [STORAGE_KEYS.tabGroupBindingSession]: session });
    return session;
  }

  private async read(): Promise<{ initialized: boolean; records: Map<string, GroupBinding> }> {
    const raw: unknown = (
      await storageGet(getLocalStorageArea(), STORAGE_KEYS.tabGroupBindingRecords)
    )[STORAGE_KEYS.tabGroupBindingRecords];
    const records = new Map<string, GroupBinding>();
    if (
      raw &&
      typeof raw === "object" &&
      "schemaVersion" in raw &&
      raw.schemaVersion === 2 &&
      "records" in raw &&
      raw.records &&
      typeof raw.records === "object" &&
      !Array.isArray(raw.records)
    ) {
      for (const [id, value] of Object.entries(raw.records)) {
        if (!VALID_ID.test(id) || !value || typeof value !== "object") continue;
        const entry = value as Record<string, unknown>;
        if (
          typeof entry.identity !== "string" ||
          !VALID_ID.test(entry.identity) ||
          typeof entry.session !== "string" ||
          !VALID_ID.test(entry.session) ||
          (entry.groupId !== null && !validGroupId(entry.groupId)) ||
          (entry.fingerprint !== null &&
            (typeof entry.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(entry.fingerprint)))
        )
          continue;
        records.set(id, {
          identity: entry.identity,
          fingerprint: entry.fingerprint,
          session: entry.session,
          groupId: entry.groupId
        });
        if (records.size >= MAX_TAB_GROUP_WHITELIST_RULES) break;
      }
    }
    return { initialized: raw !== undefined, records };
  }

  private write(records: ReadonlyMap<string, GroupBinding>): Promise<void> {
    return storageSet(getLocalStorageArea(), {
      [STORAGE_KEYS.tabGroupBindingRecords]: {
        schemaVersion: 2,
        records: Object.fromEntries(records)
      }
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
