import { describe, expect, it } from "vitest";
import {
  VisitConfirmationService,
  resolveVisitConfirmationTabId
} from "../../src/background/visit-confirmation";

describe("visit confirmation grants", () => {
  it("binds an extension-page request without sender.tab to its actual confirmation tab", async () => {
    const root = "chrome-extension://hourleaf/";
    const target = "https://example.com/video";
    const pageUrl = `${root}end.html#${new URLSearchParams({ source: "confirmation", siteId: "site:test", returnUrl: target })}`;
    const sender = { url: pageUrl };
    const getTab = (id: number) =>
      Promise.resolve({
        id,
        url: id === 8 ? pageUrl : "https://other.example/"
      });
    expect(await resolveVisitConfirmationTabId(sender, 8, root, target, "site:test", getTab)).toBe(
      8
    );
    await expect(
      resolveVisitConfirmationTabId(sender, 9, root, target, "site:test", getTab)
    ).rejects.toThrow();
    await expect(
      resolveVisitConfirmationTabId(sender, undefined, root, target, "site:test", getTab)
    ).rejects.toThrow();
    await expect(
      resolveVisitConfirmationTabId(sender, 8, root, target, "site:other", getTab)
    ).rejects.toThrow();
    await expect(
      resolveVisitConfirmationTabId(
        { url: root + "popup.html" },
        8,
        root,
        target,
        "site:test",
        getTab
      )
    ).rejects.toThrow();
    await expect(
      resolveVisitConfirmationTabId(
        { ...sender, tab: { id: 9 } },
        8,
        root,
        target,
        "site:test",
        getTab
      )
    ).rejects.toThrow();
  });

  it("enforces the independent wait and grants one tab for one policy version", async () => {
    const service = new VisitConfirmationService(null);
    expect(await service.requireConfirmation(12, "site:test", "https://example.com", 4, 3, 0)).toBe(
      3
    );
    await expect(
      service.grant(12, "site:test", "https://example.com", 4, 3, 2_999)
    ).rejects.toThrow(/wait/u);
    await service.grant(12, "site:test", "https://example.com", 4, 3, 3_000);
    expect(await service.isGranted(12, "site:test", "https://example.com", 4)).toBe(true);
    expect(await service.isGranted(12, "site:test", "https://example.com", 5)).toBe(false);
  });

  it("keeps the grant through the shared extension page and revokes it after leaving", async () => {
    const service = new VisitConfirmationService(null);
    await service.requireConfirmation(8, "site:test", "https://example.com", 9, 0, 100);
    await service.grant(8, "site:test", "https://example.com", 9, 0, 100);
    await service.revokeIfOriginChanged(
      8,
      "chrome-extension://hourleaf/end.html",
      "chrome-extension://hourleaf/"
    );
    expect(await service.isGranted(8, "site:test", "https://example.com", 9)).toBe(true);
    await service.revokeIfOriginChanged(
      8,
      "https://other.example/",
      "chrome-extension://hourleaf/"
    );
    expect(await service.isGranted(8, "site:test", "https://example.com", 9)).toBe(false);
  });
});
