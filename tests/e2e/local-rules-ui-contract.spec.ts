import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LocalPageRules } from "../../src/modules/local/types";
import type { LocalPageRuleController } from "../../src/content/local-page-rules";
import { parseLocalModuleFiles } from "../../src/modules/local/importer";

declare global {
  interface Window {
    localRulesTest: { LocalPageRuleController: typeof LocalPageRuleController };
    ruleController: LocalPageRuleController;
  }
}

const definition = parseLocalModuleFiles(
  ["hourleaf-module.json", "focus.css", "focus.user.js"].map((name) => ({
    name,
    text: readFileSync(new URL(`../../optional-modules/bilibili/${name}`, import.meta.url), "utf8")
  }))
);
const selectors = definition.filterGroups.find(
  (group) => group.id === "home-recommendations"
)!.selectors;
const rules: LocalPageRules = {
  moduleIds: [definition.id],
  css: "",
  hideSelectors: selectors,
  shadowRules: [
    { hostSelector: "#bewly", mountEvent: "bewlyMounted", css: "", hideSelectors: selectors }
  ]
};
const card = (id: string, inner = "", url = "https://www.bilibili.com/video/BV1234567890") =>
  `<div id="${id}"><div><div class="video-card"><a href="${url}">${id}</a>${inner}</div></div></div>`;
// Both upstream Home/ForYou components use main > header + div > grid > card wrapper.
const home = (
  grid = "grid-adaptive"
) => `<div id="bewly-wrapper"><main><header><input aria-label="搜索"></header><div><div class="${grid}">
  ${card("ordinary")}${card("commercial", '<span class="ad-report"></span>')}
  ${card("paid", "", "https://www.bilibili.com/bangumi/play/ep123")}
  <div id="unknown">Unknown content</div>
</div></div></main><aside>${card("history")}</aside></div>`;

async function apply(page: Page, next = rules): Promise<void> {
  await page.evaluate((value) => window.ruleController.apply(value), next);
}
async function mount(page: Page, html = home(), event = false): Promise<void> {
  await page.evaluate(
    ({ html, event }) => {
      let host = document.querySelector("#bewly");
      if (!host) {
        host = document.createElement("div");
        host.id = "bewly";
        document.body.append(host);
      }
      const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      root.innerHTML = html;
      if (event) window.dispatchEvent(new CustomEvent("bewlyMounted"));
    },
    { html, event }
  );
}

test.beforeEach(async ({ page }) => {
  await page.setContent(
    '<div class="recommended-container"><div id="native" class="bili-video-card">video</div><div id="native-ad" class="bili-video-card"><span class="ad-report">ad</span></div></div>'
  );
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../../src/content/local-page-rules.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "localRulesTest"
  });
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  await page.evaluate(() => {
    window.ruleController = new window.localRulesTest.LocalPageRuleController(document);
  });
});

for (const grid of ["grid-adaptive", "grid-two-columns", "grid-one-column"]) {
  test(`filters native and Bewly web/app cards in ${grid} without hiding navigation or other pages`, async ({
    page
  }) => {
    await mount(page, home(grid));
    await apply(page);
    await expect(page.locator("#native")).toBeHidden();
    await expect(page.locator("#native-ad")).toBeVisible();
    await expect(page.locator("#ordinary")).toBeHidden();
    for (const id of ["commercial", "paid", "unknown", "history"])
      await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "搜索" })).toBeVisible();
    // SPA switches to Search/Favorites/History reuse video cards without Home's header/grid structure.
    await page.evaluate((html) => {
      document.querySelector("#bewly")!.shadowRoot!.querySelector("main")!.innerHTML = html;
    }, card("search-result"));
    await expect(page.locator("#search-result")).toBeVisible();
  });
}

test("handles late hosts, window mount events, remounts, new cards and disabling without duplicate styles", async ({
  page
}) => {
  await apply(page);
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "bewly";
    document.body.append(host);
  });
  await mount(page, home(), true);
  await expect(page.locator("#ordinary")).toBeHidden();
  await apply(page);
  await expect(page.locator("#bewly #hourleaf-local-module-style")).toHaveCount(1);
  await page.evaluate((html) => {
    document
      .querySelector("#bewly")!
      .shadowRoot!.querySelector(".grid-adaptive")!
      .insertAdjacentHTML("beforeend", html);
  }, card("next-page"));
  await expect(page.locator("#next-page")).toBeHidden();
  await page.evaluate(() => document.querySelector("#bewly")!.remove());
  await mount(page);
  await expect(page.locator("#ordinary")).toBeHidden();
  await apply(page, { moduleIds: [definition.id], css: "", hideSelectors: [], shadowRules: [] });
  await expect(page.locator("#ordinary")).toBeVisible();
  await expect(page.locator("#native")).toBeVisible();
  await expect(page.locator("#hourleaf-local-module-style")).toHaveCount(0);
  await apply(page);
  await page.evaluate(() => window.ruleController.stop());
  await expect(page.locator("#ordinary")).toBeVisible();
});

test("scopes modules to declared hosts and tolerates invalid selectors and closed roots", async ({
  page
}) => {
  await mount(page);
  await page.evaluate(() => {
    for (const [id, mode] of [
      ["other-host", "open"],
      ["closed-host", "closed"]
    ] as const) {
      const host = document.createElement("div");
      host.id = id;
      host.attachShadow({ mode }).innerHTML = '<div class="video-card">Other module</div>';
      document.body.append(host);
    }
  });
  await apply(page, {
    ...rules,
    shadowRules: [
      ...rules.shadowRules!,
      { hostSelector: "[", css: "* { display:none }", hideSelectors: [] },
      { hostSelector: "#closed-host", css: "* { display:none }", hideSelectors: [] }
    ]
  });
  await expect(page.locator("#ordinary")).toBeHidden();
  await expect(page.locator("#other-host .video-card")).toBeVisible();
});
