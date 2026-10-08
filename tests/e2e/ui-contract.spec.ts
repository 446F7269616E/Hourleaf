import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { installWebExtensionMock } from "./fixtures/webextension-mock";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const buildRoot = path.join(repositoryRoot, "dist/chromium");

test.skip(!fs.existsSync(path.join(buildRoot, "popup.html")), "Build dist/chromium before UI E2E");

test.beforeEach(async ({ context }) => {
  await installWebExtensionMock(context);
});

test("popup has a compact current-site and pending-plan summary without quick toggles", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(buildRoot, "popup.html")).href);

  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "进入计划页面" })).toBeVisible();
  await expect(page.getByTestId("popup-remaining-time")).toHaveText("00:35");

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  expect(errors).toEqual([]);
});

test("configuration exposes per-website time rules without content filters", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(buildRoot, "options.html")).href);

  await expect(page.getByRole("heading", { name: "网站" })).toBeVisible();
  await expect(page.getByTestId("site-add-button")).toBeVisible();
  await expect(page.getByTestId("configuration-export-button")).toHaveCount(0);
  await expect(page.getByTestId("configuration-import-button")).toHaveCount(0);
  await expect(page.getByTestId("period-add")).toBeVisible();
  await expect(page.getByTestId("settings-save")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "限制模式" })).toBeVisible();
  await expect(page.locator(".visit-confirmation-card + .restriction-mode-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "访问前确认" })).toBeVisible();
  const confirmationPrompt = page.getByRole("textbox", { name: "自定义打开提示语" });
  await page.getByTestId("visit-confirmation-toggle").uncheck();
  await expect(confirmationPrompt).toBeHidden();
  await page.getByTestId("visit-confirmation-toggle").check();
  await expect(confirmationPrompt).toBeVisible();
  await confirmationPrompt.fill("只打开与当前任务相关的内容。");
  await confirmationPrompt.press("Tab");
  await expect(page.getByTestId("auto-save-status")).toHaveText("已保存");
  const restrictionMode = page.getByRole("combobox", { name: "限制模式" });
  await expect(restrictionMode.getByRole("option")).toHaveText(["宽容", "心流", "严格"]);
  await restrictionMode.selectOption("flow");
  await expect(page.getByText("额度结束后选择短暂延长，然后进入结束页面。")).toBeVisible();
  await expect(page.getByTestId("period-toggle-period:home:all-day")).toBeChecked();
  await page.getByTestId("period-toggle-period:home:all-day").uncheck();
  await expect(page.getByTestId("auto-save-status")).toHaveText("已保存");
  await expect(page.getByRole("heading", { name: "内容降噪" })).toHaveCount(0);
});

test("configuration previews and applies one-click time period presets", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(buildRoot, "options.html")).href);

  await page.getByTestId("period-quick-add").click();
  const dialog = page.getByTestId("period-quick-add-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("三餐下饭", { exact: true })).toBeVisible();
  await expect(dialog.getByText("两段分割", { exact: true })).toBeVisible();
  await expect(dialog.getByText("午前使用", { exact: true })).toBeVisible();
  await expect(dialog.getByText("午后使用", { exact: true })).toBeVisible();
  await expect(dialog.getByText("晚间使用", { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-state="available"]')).toHaveCount(6);
  await expect(dialog.locator('[data-state="unavailable"]')).toHaveCount(18);
  await expect(dialog.getByTestId("period-quick-add-summary").locator("li")).toHaveCount(3);

  await dialog.getByTestId("period-preset-noon-split").check();
  await expect(dialog.locator('[data-state="available"]')).toHaveCount(2);
  await expect(dialog.getByTestId("period-quick-add-summary").locator("li")).toHaveCount(2);
  await expect(dialog.getByText("30 分钟 · 2 组 · 每组 15 分钟").first()).toBeVisible();
  await dialog.getByTestId("period-quick-add-confirm").click();
  await expect(page.locator(".period-item")).toHaveCount(2);
  await expect(page.getByTestId("auto-save-status")).toHaveText("已保存");

  await page.getByTestId("period-quick-add").click();
  await page.getByTestId("period-preset-custom").click();
  const customDialog = page.getByTestId("period-custom-preset-dialog");
  await expect(customDialog.getByRole("heading", { name: "自定义时间段预设" })).toBeVisible();
  await customDialog.getByTestId("period-custom-preset-name").fill("我的双时段");
  await customDialog.locator('input[type="text"]').nth(1).fill("上午");
  await customDialog.getByTestId("period-custom-add-row").click();
  await expect(customDialog.locator("fieldset")).toHaveCount(2);
  await customDialog.locator('input[type="text"]').nth(2).fill("晚上");
  await expect(customDialog.locator('[data-state="available"]')).toHaveCount(1);
  await customDialog.getByTestId("period-custom-save").click();
  await expect(page.getByText("自定义预设已保存并添加")).toBeVisible();
  await expect(page.getByTestId("auto-save-status")).toHaveText("已保存");

  await page.getByTestId("period-quick-add").click();
  await expect(page.getByText("我的双时段", { exact: true })).toBeVisible();
});

test("settings contains extension-wide options and links to the independent blocking page", async ({
  page
}) => {
  await page.goto(pathToFileURL(path.join(buildRoot, "home.html")).href);

  await expect(page.getByRole("heading", { name: "插件设置" })).toBeVisible();
  await expect(page.getByTestId("site-add-input")).toHaveCount(0);
  await expect(page.getByTestId("module-import-open")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "屏蔽" })).toBeVisible();
  await expect(page.getByTestId("settings-plan-auto-complete")).not.toBeChecked();
  await expect(page.getByTestId("settings-plan-all-blocking")).toBeChecked();
  await page.getByTestId("settings-plan-all-blocking").uncheck();
  await expect(page.getByTestId("settings-plan-all-blocking")).not.toBeChecked();
  await expect(page.getByTestId("settings-show-remaining-minutes")).toBeChecked();
  await expect(page.getByRole("heading", { name: "常规" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "结束页面" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "数据管理" })).toBeVisible();
  const dataManagement = page.locator('[data-settings-group="data-management"]');
  await dataManagement.locator("summary").click();
  await expect(dataManagement.getByTestId("configuration-import-button")).toBeVisible();
  await expect(dataManagement.getByTestId("configuration-export-button")).toBeVisible();
});

test("blocking page imports a user-selected local module without a remote installer", async ({
  page
}) => {
  await page.goto(pathToFileURL(path.join(buildRoot, "block.html")).href);
  await expect(page.getByRole("heading", { name: "屏蔽", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "前往 GitHub 下载" })).toBeVisible();
  await expect(page.getByRole("link", { name: "自制插件规范" })).toBeVisible();
  await expect(page.getByText("Hourleaf 不会自动下载或更新插件")).toBeVisible();
  await page.getByTestId("module-import-open").click();
  await expect(
    page.getByText("兼容内容必须声明作者，并使用 Hourleaf 规范化内容格式。")
  ).toHaveCount(0);
  await page.getByTestId("module-import-files").setInputFiles([
    {
      name: "hourleaf-module.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          format: "hourleaf.local-module",
          id: "example.local.e2e",
          name: "E2E 本地模块",
          author: "Hourleaf E2E",
          version: "1.0.0",
          matches: ["https://example.com/*"],
          domainPolicy: "timed",
          hideSelectors: [],
          filterGroups: [
            {
              id: "recommendations",
              name: "主页推荐",
              description: "隐藏主页推荐流。",
              selectors: [".recommendations"]
            }
          ],
          cssFiles: ["focus.css"],
          dnrRules: [],
          userScriptFiles: []
        })
      )
    },
    {
      name: "focus.css",
      mimeType: "text/css",
      buffer: Buffer.from(".recommendations { display: none; }")
    }
  ]);
  await expect(page.getByText("E2E 本地模块 1.0.0")).toBeVisible();
  await page.getByRole("checkbox", { name: /安全检测只能过滤/u }).check();
  await page.getByTestId("module-import-confirm").click();
  await expect(page.getByRole("heading", { name: "E2E 本地模块" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "启用 E2E 本地模块" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "屏蔽 主页推荐" })).toBeChecked();
});

test("plan expiry mode uses short options with a persistent explanation", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(buildRoot, "plan.html")).href);
  await expect(page.getByText("视图", { exact: true })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "计划视图" }).getByRole("radio")).toHaveCount(
    2
  );
  const listView = page.getByRole("radio", { name: "待办列表" });
  await listView.focus();
  await listView.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "思维导图" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await page.getByTestId("plan-add-open").click();

  const completionMode = page.getByTestId("plan-add-completion-mode");
  await expect(completionMode.getByRole("option")).toHaveText(["宽容", "心流", "严格"]);
  await expect(page.getByText("额度结束后选择短暂延长，然后进入结束页面。")).toBeVisible();
  await completionMode.selectOption("strict");
  await expect(page.getByText("额度结束后立即进入结束页面。")).toBeVisible();
});

test("terminal end page offers to close every related tab", async ({ page }) => {
  await page.goto(
    `${pathToFileURL(path.join(buildRoot, "end.html")).href}#source=focus&siteId=site%3Abilibili&reason=limit`
  );

  const closeRelatedTabs = page.getByRole("button", { name: "关闭当前所有相关标签页" });
  await expect(closeRelatedTabs).toBeVisible();
  await closeRelatedTabs.click();
  await expect(closeRelatedTabs).toBeDisabled();
});

test("dashboard exposes day, week, month and year without color-only data", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(buildRoot, "dashboard.html")).href);

  await expect(page.getByText("视图", { exact: true })).toBeVisible();
  await expect(page.getByTestId("dashboard-current-range")).toBeVisible();
  await expect(page.getByRole("heading", { name: "使用趋势" })).toBeVisible();
  const weekView = page.getByTestId("dashboard-range-week");
  await weekView.focus();
  await weekView.press("ArrowRight");
  await expect(page.getByTestId("dashboard-range-month")).toHaveAttribute("aria-checked", "true");
  for (const range of ["day", "week", "month", "year"]) {
    const control = page.getByTestId(`dashboard-range-${range}`);
    await expect(control).toBeVisible();
    await control.click();
    await expect(page.getByTestId("dashboard-total-time")).not.toBeEmpty();
  }

  await expect(page.getByTestId("dashboard-section-list")).not.toBeEmpty();
  const chart = page.getByTestId("dashboard-trend-chart");
  const accessibleName =
    (await chart.getAttribute("aria-label")) ?? (await chart.getAttribute("aria-labelledby"));
  expect(accessibleName).toBeTruthy();
});

test("visit confirmation shows the optional website prompt", async ({ page }) => {
  await page.goto(
    `${pathToFileURL(path.join(buildRoot, "end.html")).href}#source=confirmation&siteId=site%3Abilibili&returnUrl=${encodeURIComponent("https://www.bilibili.com/video/BV1xx411c7mD")}&waitSeconds=0`
  );

  await expect(page.getByText("先确认这次访问与当前任务相关。")).toBeVisible();
});
