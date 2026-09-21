import { describe, expect, it } from "vitest";
import {
  matchPatternMatchesUrl,
  normalizeSiteMatchPatterns,
  resolveSiteScope,
  siteMatchPatterns,
  siteMatchesUrl
} from "../../src/shared/site-scope";
import type { ManagedSite } from "../../src/shared/types";

function site(origin: string, matchPatterns?: string[]): ManagedSite {
  return {
    id: "site:test",
    origin,
    ...(matchPatterns ? { matchPatterns } : {}),
    hostname: new URL(origin).hostname,
    label: "Test",
    enabled: true,
    restrictionMode: "strict",
    targetIds: ["target:test"],
    createdAt: 1,
    updatedAt: 1
  };
}

describe("reviewed website family scopes", () => {
  it("expands every Bilibili entry point through the same audited family", () => {
    for (const input of [
      "https://bilibili.com",
      "https://www.bilibili.com/video/BV1",
      "https://t.bilibili.com/123",
      "https://space.bilibili.com/456"
    ]) {
      expect(resolveSiteScope(input)).toEqual({
        canonicalOrigin: "https://www.bilibili.com",
        displayHostname: "bilibili.com",
        matchPatterns: ["https://*.bilibili.com/*"],
        family: "bilibili"
      });
    }
  });

  it("does not expand lookalike or unrelated websites", () => {
    expect(resolveSiteScope("https://evilbilibili.com")?.matchPatterns).toEqual([
      "https://evilbilibili.com/*"
    ]);
    expect(resolveSiteScope("https://bilibili.com.example.org")?.matchPatterns).toEqual([
      "https://bilibili.com.example.org/*"
    ]);
    expect(resolveSiteScope("https://example.com")?.matchPatterns).toEqual([
      "https://example.com/*"
    ]);
  });

  it("matches the root and subdomains but not hostname suffix lookalikes", () => {
    const configured = site("https://www.bilibili.com", ["https://*.bilibili.com/*"]);
    expect(siteMatchesUrl(configured, "https://bilibili.com/")).toBe(true);
    expect(siteMatchesUrl(configured, "https://t.bilibili.com/1")).toBe(true);
    expect(siteMatchesUrl(configured, "https://space.bilibili.com/2")).toBe(true);
    expect(siteMatchesUrl(configured, "https://evilbilibili.com/")).toBe(false);
    expect(matchPatternMatchesUrl("https://*.bilibili.com/*", "http://t.bilibili.com/")).toBe(
      false
    );
  });

  it("keeps legacy sites exact and rejects unreviewed stored wildcards", () => {
    const legacy = site("https://www.bilibili.com");
    expect(siteMatchPatterns(legacy)).toEqual(["https://www.bilibili.com/*"]);
    expect(siteMatchesUrl(legacy, "https://t.bilibili.com/")).toBe(false);
    expect(
      normalizeSiteMatchPatterns("https://www.bilibili.com", ["https://*.example.com/*"])
    ).toBeUndefined();
  });
});
