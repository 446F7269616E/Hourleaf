import { normalizePlanUrl } from "./plan";

/** The origin is a permission boundary, not an inferred pagination identity. */
export function matchesPlanOrigin(plannedUrl: string, currentUrl: string | undefined): boolean {
  const planned = normalizePlanUrl(plannedUrl);
  const current = normalizePlanUrl(currentUrl);
  return Boolean(planned && current && planned.origin === current.origin);
}

/** Compatibility matching for grants created before tab-bound visits existed. */
export function matchesPlanNavigation(plannedUrl: string, currentUrl: string | undefined): boolean {
  const planned = normalizePlanUrl(plannedUrl);
  const current = normalizePlanUrl(currentUrl);
  if (!planned || !current || planned.origin !== current.origin) return false;
  return navigationIdentity(planned) === navigationIdentity(current);
}

function navigationIdentity(url: URL): string {
  // This public route identifies the whole video in its path. Part selection and
  // referral parameters change its presentation, not the planned resource.
  // Keep the exact origin boundary; this does not depend on an installed module.
  if (
    url.protocol === "https:" &&
    ["www.bilibili.com", "bilibili.com"].includes(url.hostname) &&
    /^\/video\/BV[0-9A-Za-z]{10}\/?$/u.test(url.pathname)
  ) {
    url.pathname = url.pathname.replace(/\/$/u, "");
    url.search = "";
  } else {
    // Query values can identify different resources (for example ?v= or ?p=).
    // Generic sites retain every value, with only parameter order normalized.
    url.searchParams.sort();
  }
  return url.href;
}
