import { runtimeSendMessage, tabsQuery, tabsSendMessage } from "../shared/browser";
import { WEBSITE_ACCESS_CHANGED } from "../shared/pause-access";
import { siteMatchPatterns } from "../shared/site-scope";
import type { ManagedSite } from "../shared/types";

/** Notify after a committed transition; receivers query access without granting more time. */
export async function notifyWebsiteAccessChange(site: ManagedSite): Promise<void> {
  const message = { type: WEBSITE_ACCESS_CHANGED, siteId: site.id };
  await Promise.allSettled([
    // Extension pages (including standalone end.html) are not content scripts.
    runtimeSendMessage(message),
    tabsQuery({ url: siteMatchPatterns(site) }).then((tabs) =>
      Promise.allSettled(
        tabs.flatMap((tab) => (tab.id === undefined ? [] : [tabsSendMessage(tab.id, message)]))
      )
    )
  ]);
}
