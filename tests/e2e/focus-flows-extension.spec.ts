import { chromium, expect, test, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddSiteResult } from "../../src/core/sites";
import type { PlanState } from "../../src/shared/types";
import { normalizeLocalModuleDefinition } from "../../src/modules/local/validation";

async function request<T>(
  page: Page,
  type: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  return page.evaluate(
    async ({ type, payload }) => {
      const response = await chrome.runtime.sendMessage<
        unknown,
        { result?: { ok: boolean; data: unknown } }
      >({
        version: 1,
        requestId: crypto.randomUUID(),
        type,
        payload
      });
      if (!response?.result?.ok) throw new Error(JSON.stringify(response));
      return response.result.data;
    },
    { type, payload }
  ) as Promise<T>;
}

test("real confirmation opens its own tab and plan blocking restores independent preferences", async () => {
  test.setTimeout(60_000);
  const directory = await mkdtemp(path.join(tmpdir(), "hourleaf-flow-test-"));
  const extension = path.join(directory, "extension");
  const build = fileURLToPath(new URL("../../dist/chromium/", import.meta.url));
  await cp(build, extension, { recursive: true });
  const manifestPath = path.join(extension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  // Only the disposable test build receives a fixture origin; release permissions stay unchanged.
  manifest.host_permissions = ["https://example.com/*"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(directory, "profile"), {
    channel: "chromium",
    headless: true,
    locale: "zh-CN",
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    await context.route("https://example.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body><h1>Fixture website</h1><div class="feed">Feed</div><div class="comments">Comments</div></body></html>'
      })
    );
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const root = `chrome-extension://${new URL(worker.url()).host}`;
    const control = await context.newPage();
    await control.goto(`${root}/home.html`);
    await request(control, "UPDATE_SETTINGS", { patch: { locale: "zh-CN" } });
    const site = (
      await request<AddSiteResult>(control, "ADD_MANAGED_SITE", { url: "https://example.com/" })
    ).site!;
    await request(control, "UPDATE_MANAGED_SITE", {
      siteId: site.id,
      patch: { visitConfirmation: { enabled: true, waitSeconds: 0 } }
    });
    const website = await context.newPage();
    await website.goto("https://example.com/watch");
    await expect(website).toHaveURL(/end\.html#.*source=confirmation/);
    await website.getByRole("button", { name: "确认打开", exact: true }).click();
    await expect(website).toHaveURL("https://example.com/watch");
    await expect(website.getByRole("heading", { name: "Fixture website" })).toBeVisible();
    await website.reload();
    await expect(website.getByRole("heading", { name: "Fixture website" })).toBeVisible();
    await request(control, "UPDATE_MANAGED_SITE", {
      siteId: site.id,
      patch: { visitConfirmation: { enabled: false, waitSeconds: 0 } }
    });

    const module = normalizeLocalModuleDefinition({
      schemaVersion: 1,
      format: "hourleaf.local-module",
      id: "example.focus",
      name: "Fixture Focus",
      author: "Test",
      version: "1.0.0",
      matches: ["https://example.com/*"],
      domainPolicy: "timed",
      hideSelectors: [],
      filterGroups: [
        { id: "feed", name: "Feed", selectors: [".feed"] },
        { id: "comments", name: "Comments", selectors: [".comments"] }
      ]
    })!;
    await request(control, "IMPORT_LOCAL_MODULE", {
      module,
      riskAcknowledgement: "review-content-and-assume-risk"
    });
    await expect(website.locator(".feed")).toBeVisible();
    const state = await request<PlanState>(control, "ADD_PLAN_ITEM", {
      url: "https://example.com/watch",
      scheduledDurationMinutes: 5,
      completionMode: "strict"
    });
    const id = state.queue.items[0]!.id;
    await request(control, "START_PLAN_ITEM", { id });
    await expect(website.locator(".feed")).toBeHidden();
    await expect(website.locator(".comments")).toBeHidden();
    await request(control, "SET_LOCAL_MODULE_FILTER_ENABLED", {
      moduleId: module.id,
      groupId: "feed",
      enabled: false,
      profile: "plan"
    });
    await expect(website.locator(".feed")).toBeVisible();
    await expect(website.locator(".comments")).toBeHidden();
    await expect(
      request(control, "SET_LOCAL_MODULE_ENABLED", {
        moduleId: module.id,
        enabled: true,
        profile: "normal"
      })
    ).rejects.toThrow();
    await request(control, "SET_PLAN_MODE", { enabled: false });
    await expect(website.locator(".comments")).toBeVisible();
    await request(control, "START_PLAN_ITEM", { id });
    await expect(website.locator(".feed")).toBeVisible();
    await expect(website.locator(".comments")).toBeHidden();
    await request(control, "UPDATE_SETTINGS", {
      patch: { planMode: { enableAllBlocking: false } }
    });
    await expect(website.locator(".comments")).toBeVisible();
    await request(control, "UPDATE_SETTINGS", { patch: { planMode: { enableAllBlocking: true } } });
    await expect(website.locator(".comments")).toBeHidden();
  } finally {
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});
