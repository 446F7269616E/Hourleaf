import type { ManagedSite } from "./types";

interface SiteFamilyDefinition {
  id: string;
  rootHostname: string;
  canonicalOrigin: string;
  matchPatterns: readonly string[];
}

/**
 * Audited multi-origin website families. Add future families here instead of
 * teaching domain-specific behavior to permissions, tracking, popup, or tabs.
 */
export const SITE_FAMILY_DEFINITIONS = [
  {
    id: "bilibili",
    rootHostname: "bilibili.com",
    canonicalOrigin: "https://www.bilibili.com",
    matchPatterns: ["https://*.bilibili.com/*"]
  }
] as const satisfies readonly SiteFamilyDefinition[];

export type KnownSiteFamily = (typeof SITE_FAMILY_DEFINITIONS)[number]["id"];

export interface ResolvedSiteScope {
  canonicalOrigin: string;
  displayHostname: string;
  matchPatterns: string[];
  family?: KnownSiteFamily;
}

/**
 * Expands only explicitly reviewed site families. Arbitrary websites remain
 * exact-origin scoped; inferring eTLD+1 for every input would silently broaden
 * permissions and can cross tenant/security boundaries.
 */
export function resolveSiteScope(value: string | URL): ResolvedSiteScope | null {
  const url = parseHttpUrl(value);
  if (!url) return null;
  const family = !url.port
    ? SITE_FAMILY_DEFINITIONS.find((candidate) =>
        isHostnameWithin(url.hostname, candidate.rootHostname)
      )
    : undefined;
  if (family) {
    return {
      canonicalOrigin: family.canonicalOrigin,
      displayHostname: family.rootHostname,
      matchPatterns: [...family.matchPatterns],
      family: family.id
    };
  }
  return {
    canonicalOrigin: url.origin,
    displayHostname: url.hostname,
    matchPatterns: [`${url.origin}/*`]
  };
}

/** Returns the persisted, validated scope or the legacy exact-origin fallback. */
export function siteMatchPatterns(site: Pick<ManagedSite, "origin" | "matchPatterns">): string[] {
  const resolved = resolveSiteScope(site.origin);
  if (
    resolved?.family &&
    site.matchPatterns?.length === resolved.matchPatterns.length &&
    site.matchPatterns.every((pattern, index) => pattern === resolved.matchPatterns[index])
  ) {
    return [...resolved.matchPatterns];
  }
  return [`${site.origin}/*`];
}

/** Storage normalization accepts only the reviewed pattern for that family. */
export function normalizeSiteMatchPatterns(origin: string, value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const resolved = resolveSiteScope(origin);
  if (
    !resolved?.family ||
    value.length !== resolved.matchPatterns.length ||
    !value.every((pattern, index) => pattern === resolved.matchPatterns[index])
  ) {
    return undefined;
  }
  return [...resolved.matchPatterns];
}

export function siteMatchesUrl(
  site: Pick<ManagedSite, "origin" | "matchPatterns">,
  value: string | URL
): boolean {
  const url = parseHttpUrl(value);
  if (!url) return false;
  const patterns = siteMatchPatterns(site);
  return patterns.some((pattern) => matchPatternMatchesUrl(pattern, url));
}

/** Stable equality used to upgrade an existing exact Bilibili entry after re-authorization. */
export function siteScopeKey(value: string | URL): string | null {
  const resolved = resolveSiteScope(value);
  return resolved
    ? resolved.family
      ? `family:${resolved.family}`
      : resolved.canonicalOrigin
    : null;
}

export function matchPatternMatchesUrl(pattern: string, value: string | URL): boolean {
  const url = parseHttpUrl(value);
  if (!url) return false;
  const match = /^(https?):\/\/(\*\.)?([A-Za-z0-9.-]+)(?::(\d+))?\/\*$/u.exec(pattern);
  if (!match || `${match[1]}:` !== url.protocol) return false;
  if (match[4] !== undefined && match[4] !== url.port) return false;
  if (match[4] === undefined && url.port) return false;
  const hostname = match[3]?.toLowerCase();
  if (!hostname) return false;
  return match[2]
    ? isHostnameWithin(url.hostname, hostname)
    : url.hostname.toLowerCase() === hostname;
}

function isHostnameWithin(hostname: string, root: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === root || normalized.endsWith(`.${root}`);
}

function parseHttpUrl(value: string | URL): URL | null {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
