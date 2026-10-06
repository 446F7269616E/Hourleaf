import { getLocalStorageArea, storageGet, storageSet, storageRemove } from "../shared/browser";
import type { FocusSettings } from "../shared/types";

export type ProtectedAction = "disable" | "clear-all" | "reset" | "protection";
export interface ProtectedTicket {
  token: string;
  action: ProtectedAction;
  readyAt: number;
  method: "wait" | "password" | "none";
  phrase: string;
}
const KEY = "hourleaf.protected-action.v1";
interface StoredTicket extends ProtectedTicket {
  owner: string;
  policy: string;
  expiresAt: number;
}
/** A single outstanding ticket prevents stale dialogs and survives worker suspension. */
export class ProtectedActions {
  private queue: Promise<unknown> = Promise.resolve();
  async begin(
    action: ProtectedAction,
    settings: FocusSettings,
    owner: string
  ): Promise<ProtectedTicket> {
    return this.enqueue(async () => {
      const destructive = action === "clear-all" || action === "reset";
      const method = destructive ? "wait" : settings.disableProtection.method;
      const ticket: StoredTicket = {
        token: crypto.randomUUID(),
        action,
        owner,
        method,
        readyAt:
          Date.now() +
          (destructive
            ? 120_000
            : method === "wait"
              ? settings.disableProtection.waitMinutes * 60_000
              : 0),
        phrase:
          action === "clear-all"
            ? "确认清空所有数据"
            : action === "reset"
              ? "确认恢复默认设置"
              : "",
        policy: JSON.stringify(settings.disableProtection),
        expiresAt: Date.now() + 3_600_000
      };
      await storageSet(getLocalStorageArea(), { [KEY]: ticket });
      return {
        token: ticket.token,
        action,
        method,
        readyAt: ticket.readyAt,
        phrase: ticket.phrase
      };
    });
  }
  async consume(
    action: ProtectedAction,
    token: string | undefined,
    proof: string | undefined,
    settings: FocusSettings,
    owner: string
  ): Promise<void> {
    return this.enqueue(async () => {
      const ticket = (await storageGet(getLocalStorageArea(), KEY))[KEY] as
        StoredTicket | undefined;
      if (
        !ticket ||
        ticket.token !== token ||
        ticket.action !== action ||
        ticket.owner !== owner ||
        ticket.expiresAt < Date.now() ||
        ticket.readyAt > Date.now() ||
        ticket.policy !== JSON.stringify(settings.disableProtection)
      )
        throw new Error("Confirmation expired or waiting period incomplete");
      if (ticket.phrase && proof !== ticket.phrase)
        throw new Error("Confirmation text does not match");
      if (
        ticket.method === "password" &&
        (!settings.disableProtection.passwordVerifier ||
          proof !== settings.disableProtection.passwordVerifier)
      )
        throw new Error("Incorrect password");
      await storageRemove(getLocalStorageArea(), KEY);
    });
  }
  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
