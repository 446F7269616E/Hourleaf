import { tabsGetCurrent } from "../shared/browser";
import { configureLocale, t } from "../shared/i18n";
import { sendRequest } from "../shared/messages";
import type { FocusSettings, PeriodRuntimeStatus, UsageSummary } from "../shared/types";
import { assertAppRoot, element, formatDuration } from "../styles/dom";
import { createBrandMark } from "../ui/brand-mark";
import { siteMatchesUrl } from "../shared/site-scope";

interface EndPageSettingsView {
  view?: "dashboard" | "message" | "minimal";
  motivationalMessage?: string;
}

interface EndPageContext {
  siteId?: string;
  targetId?: string;
  reason?: string;
  source?: "focus" | "plan" | "confirmation";
  itemId?: string;
  periodId?: string;
  groupIndex?: number;
  groupCount?: number;
  returnUrl?: string;
  waitSeconds?: number;
}

const app = assertAppRoot();
const context = readContext();

void render();

async function render(): Promise<void> {
  try {
    const settings = await sendRequest({ type: "GET_SETTINGS" });
    const preference = (settings as FocusSettings & { locale?: string }).locale;
    configureLocale(preference);
    if (context.source === "confirmation") {
      document.title = `${t("end.visitConfirmationTitle")} · Hourleaf`;
      app.replaceChildren(createVisitConfirmation(settings));
      return;
    }
    const usage = await sendRequest({ type: "GET_USAGE", period: "day" });
    document.title = `${t("end.title")} · Hourleaf`;
    const runtime = await loadPeriodRuntime(settings);
    app.replaceChildren(createEndView(settings, usage, runtime));
  } catch {
    configureLocale("system");
    document.title = `${t("end.title")} · Hourleaf`;
    app.replaceChildren(
      element("section", {
        className: "end-card end-card--minimal",
        children: [createBrandMark(true), element("h1", { text: t("end.title") })]
      })
    );
  }
}

function createVisitConfirmation(settings: FocusSettings): HTMLElement {
  const site = context.siteId ? settings.sites[context.siteId] : undefined;
  const returnUrl = normalizeHttpUrl(context.returnUrl);
  const policy = site?.visitConfirmation;
  const valid = Boolean(site && returnUrl && siteMatchesUrl(site, returnUrl) && policy?.enabled);
  const status = element("p", {
    className: "end-unlock__feedback",
    attrs: { role: "status", "aria-live": "polite" }
  });
  const confirm = element("button", {
    className: "btn btn--primary",
    attrs: { type: "button" },
    text: t("end.confirmVisit")
  });
  const cancel = element("a", {
    className: "btn",
    attrs: { href: "dashboard.html" },
    text: t("end.cancelVisit")
  });
  if (!valid) {
    confirm.disabled = true;
    status.textContent = t("end.visitConfirmationUnavailable");
  } else {
    const remainingSeconds = Math.min(
      60,
      Math.max(0, context.waitSeconds ?? policy?.waitSeconds ?? 3)
    );
    const waitEndsAt = Date.now() + remainingSeconds * 1_000;
    const updateWait = () => {
      const seconds = Math.max(0, Math.ceil((waitEndsAt - Date.now()) / 1_000));
      confirm.disabled = seconds > 0;
      confirm.textContent =
        seconds > 0 ? t("end.confirmVisitWait", { seconds }) : t("end.confirmVisit");
      if (seconds === 0) clearInterval(interval);
    };
    const interval = setInterval(updateWait, 250);
    updateWait();
    confirm.addEventListener("click", () => {
      void (async () => {
        confirm.disabled = true;
        status.textContent = t("end.openingVisit");
        try {
          const currentTab = await tabsGetCurrent();
          if (currentTab?.id === undefined) throw new Error("Confirmation tab unavailable");
          const result = await sendRequest({
            type: "GRANT_VISIT_CONFIRMATION",
            tabId: currentTab.id,
            url: returnUrl as string,
            siteId: site?.id as string
          });
          window.location.replace(result.url);
        } catch {
          status.textContent = t("common.actionFailed");
          confirm.disabled = false;
        }
      })();
    });
  }

  const siteLabel = site?.label || site?.hostname || t("end.currentPage");
  const card = element("section", {
    className: "end-card end-card--confirmation",
    attrs: { "aria-labelledby": "visit-confirmation-title" },
    children: [
      createBrandMark(true),
      element("p", { className: "end-eyebrow", text: "Hourleaf" }),
      element("h1", {
        text: t("end.visitConfirmationTitle"),
        attrs: { id: "visit-confirmation-title" }
      }),
      element("p", {
        className: "end-message",
        text: t("end.visitConfirmationMessage", { site: siteLabel })
      }),
      ...(policy?.prompt
        ? [
            element("p", {
              className: "end-visit-prompt",
              text: policy.prompt
            })
          ]
        : []),
      element("div", { className: "end-actions", children: [cancel, confirm] }),
      status
    ]
  });
  return element("div", { className: "end-backdrop", children: [card] });
}

function createEndView(
  settings: FocusSettings,
  usage: UsageSummary,
  runtime?: PeriodRuntimeStatus
): HTMLElement {
  const site = context.siteId ? settings.sites[context.siteId] : undefined;
  const target = context.targetId ? settings.targets[context.targetId] : undefined;
  const pageSettings =
    (settings as FocusSettings & { endPage?: EndPageSettingsView }).endPage ?? {};
  const view = pageSettings.view ?? "dashboard";
  const siteLabel = site?.label || site?.hostname || target?.label || "Hourleaf";
  const targetSeconds = context.targetId
    ? (usage.byTarget[context.targetId] ?? 0)
    : usage.totalSeconds;
  const groupCount = context.groupCount ?? runtime?.groupCount;
  const groupIndex = context.groupIndex ?? runtime?.usedGroups ?? runtime?.unlockedGroups;
  const message =
    context.reason === "group-boundary" && groupCount && groupIndex
      ? t("end.groupBoundaryMessage", {
          current: groupIndex,
          next: Math.min(groupCount, groupIndex + 1)
        })
      : context.reason === "blocked" || context.reason === "domain-block"
      ? t("end.blockedMessage", { site: siteLabel })
      : t("end.limitMessage", { site: siteLabel });

  const card = element("section", {
    className: `end-card end-card--${view}`,
    attrs: { "aria-labelledby": "end-page-title" },
    children: [
      createBrandMark(true),
      element("p", { className: "end-eyebrow", text: "Hourleaf" }),
      element("h1", { text: t("end.title"), attrs: { id: "end-page-title" } }),
      element("p", { className: "end-message", text: message })
    ]
  });

  if (pageSettings.motivationalMessage?.trim()) {
    card.append(
      element("blockquote", {
        className: "end-motivation",
        text: pageSettings.motivationalMessage.trim()
      })
    );
  }
  if (view === "dashboard") {
    card.append(
      element("div", {
        className: "end-summary",
        attrs: { "aria-label": t("end.todayUsage") },
        children: [
          element("span", { text: t("end.todayUsage") }),
          element("strong", { text: formatDuration(targetSeconds) })
        ]
      })
    );
  }
  if (groupCount && groupCount > 1 && groupIndex) {
    card.append(
      element("p", {
        className: "end-group-progress",
        text: t("end.groupProgress", { used: groupIndex, total: groupCount })
      })
    );
  }
  if (runtime?.canUnlock) card.append(createGroupUnlock(runtime, settings));
  const closeAction = element("button", {
    className: runtime?.canUnlock ? "btn" : "btn btn--primary",
    attrs: { type: "button" },
    text: t("end.closeRelatedTabs")
  });
  const closeStatus = element("p", {
    className: "end-unlock__feedback",
    attrs: { role: "status", "aria-live": "polite" }
  });
  closeAction.addEventListener("click", () => {
    void closeRelatedTabs(closeAction, closeStatus);
  });
  card.append(element("div", { className: "end-actions", children: [closeAction] }), closeStatus);
  return element("div", { className: "end-backdrop", children: [card] });
}

async function closeRelatedTabs(button: HTMLButtonElement, status: HTMLElement): Promise<void> {
  button.disabled = true;
  status.textContent = t("end.closingRelatedTabs");
  try {
    if (context.source === "focus" && context.siteId) {
      await sendRequest({ type: "CLOSE_RELATED_TABS", source: "focus", siteId: context.siteId });
      return;
    }
    if (context.source === "plan" && context.itemId) {
      await sendRequest({ type: "CLOSE_RELATED_TABS", source: "plan", itemId: context.itemId });
      return;
    }
    window.close();
  } catch {
    status.textContent = t("common.actionFailed");
    button.disabled = false;
  }
}

async function loadPeriodRuntime(
  settings: FocusSettings
): Promise<PeriodRuntimeStatus | undefined> {
  if (
    context.reason !== "group-boundary" ||
    !context.targetId ||
    !context.periodId ||
    !settings.targets[context.targetId]
  ) {
    return undefined;
  }
  let status = await sendRequest({
    type: "GET_PERIOD_RUNTIME",
    targetId: context.targetId,
    periodId: context.periodId
  });
  if (status.canUnlock && status.method === "wait" && !status.waitStartedAt) {
    try {
      status = await sendRequest({
        type: "START_PERIOD_GROUP_WAIT",
        targetId: context.targetId,
        periodId: context.periodId
      });
    } catch {
      // Another page may have resolved the transition while this end page was
      // loading. Render the current authoritative state instead of replacing
      // the whole page with a generic failure view.
      status = await sendRequest({
        type: "GET_PERIOD_RUNTIME",
        targetId: context.targetId,
        periodId: context.periodId
      });
    }
  }
  return status;
}

function createGroupUnlock(status: PeriodRuntimeStatus, settings: FocusSettings): HTMLElement {
  const panel = element("section", {
    className: "end-unlock",
    attrs: { "aria-labelledby": "end-unlock-title" }
  });
  panel.append(element("h2", { text: t("end.openNextGroup"), attrs: { id: "end-unlock-title" } }));
  panel.append(
    element("p", {
      className: "end-unlock__description",
      text: t("end.openNextGroupDescription", {
        next: Math.min(status.groupCount, status.unlockedGroups + 1)
      })
    })
  );
  const feedback = element("p", {
    className: "end-unlock__feedback",
    attrs: { role: "status", "aria-live": "polite" }
  });
  let proofInput: HTMLInputElement | undefined;

  if (status.method === "math" && status.mathChallenge) {
    panel.append(
      element("label", {
        className: "field",
        children: [
          element("span", {
            text: t("end.mathPrompt", {
              left: status.mathChallenge.left,
              right: status.mathChallenge.right
            })
          }),
          (proofInput = element("input", {
            className: "input",
            attrs: { type: "number", inputmode: "numeric", autocomplete: "off" }
          }))
        ]
      })
    );
  } else if (status.method === "password" && status.passwordConfigured) {
    panel.append(
      element("label", {
        className: "field",
        children: [
          element("span", { text: t("end.passwordPrompt") }),
          (proofInput = element("input", {
            className: "input",
            attrs: { type: "password", autocomplete: "current-password" }
          }))
        ]
      })
    );
  }

  const unlock = element("button", {
    className: "btn btn--primary",
    attrs: { type: "button" },
    text: t("end.openNextGroup")
  });
  if (status.method === "password" && !status.passwordConfigured) {
    unlock.disabled = true;
    feedback.textContent = t("end.passwordNotConfigured");
  }
  if (status.method === "wait" && status.waitEndsAt) {
    const updateWait = () => {
      const remainingMs = Math.max(0, (status.waitEndsAt ?? 0) - Date.now());
      unlock.disabled = remainingMs > 0;
      unlock.textContent =
        remainingMs > 0
          ? t("end.waitRemaining", { minutes: Math.max(1, Math.ceil(remainingMs / 60_000)) })
          : t("end.openNextGroup");
      if (remainingMs <= 0) clearInterval(interval);
    };
    const interval = setInterval(updateWait, 1_000);
    updateWait();
  }
  unlock.addEventListener("click", () => {
    void (async () => {
      unlock.disabled = true;
      feedback.textContent = "";
      try {
        const proof =
          status.method === "password"
            ? await sha256(proofInput?.value ?? "")
            : proofInput?.value.trim();
        await sendRequest({
          type: "UNLOCK_PERIOD_GROUP",
          targetId: status.targetId,
          periodId: status.periodId,
          ...(proof ? { proof } : {})
        });
        feedback.textContent = t("end.returningToSite");
        returnToUnlockedGroup(settings);
      } catch {
        feedback.textContent =
          status.method === "password"
            ? t("end.passwordIncorrect")
            : status.method === "math"
              ? t("end.answerIncorrect")
              : t("common.actionFailed");
        unlock.disabled = false;
        proofInput?.focus();
      }
    })();
  });
  panel.append(unlock, feedback);
  return panel;
}

function returnToUnlockedGroup(settings: FocusSettings): void {
  const returnUrl = normalizeHttpUrl(context.returnUrl);
  const target = context.targetId ? settings.targets[context.targetId] : undefined;
  const site = context.siteId
    ? settings.sites[context.siteId]
    : (target ? settings.sites[target.siteId] : undefined);

  // The hash is navigable user input. Only resume the exact configured website
  // scope; otherwise retain the legacy back-navigation fallback for end pages
  // opened by an older extension build that did not include a return URL.
  if (returnUrl && site && siteMatchesUrl(site, returnUrl)) {
    window.location.replace(returnUrl);
    return;
  }
  if (history.length > 1) {
    history.back();
    return;
  }
  window.location.replace("dashboard.html");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readContext(): EndPageContext {
  const params = new URLSearchParams(location.hash.replace(/^#/u, ""));
  const safeId = (value: string | null): string | undefined =>
    value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value) ? value : undefined;
  const source = params.get("source");
  return {
    ...(safeId(params.get("siteId")) ? { siteId: safeId(params.get("siteId")) } : {}),
    ...(safeId(params.get("targetId")) ? { targetId: safeId(params.get("targetId")) } : {}),
    ...(safeId(params.get("itemId")) ? { itemId: safeId(params.get("itemId")) } : {}),
    ...(safeId(params.get("periodId")) ? { periodId: safeId(params.get("periodId")) } : {}),
    ...(params.get("reason") ? { reason: params.get("reason")?.slice(0, 40) } : {}),
    ...(readBoundedInteger(params.get("groupIndex")) !== undefined
      ? { groupIndex: readBoundedInteger(params.get("groupIndex")) }
      : {}),
    ...(readBoundedInteger(params.get("groupCount")) !== undefined
      ? { groupCount: readBoundedInteger(params.get("groupCount")) }
      : {}),
    ...(normalizeHttpUrl(params.get("returnUrl"))
      ? { returnUrl: normalizeHttpUrl(params.get("returnUrl")) }
      : {}),
    ...(readWaitSeconds(params.get("waitSeconds")) !== undefined
      ? { waitSeconds: readWaitSeconds(params.get("waitSeconds")) }
      : {}),
    ...(source === "plan" || source === "focus" || source === "confirmation" ? { source } : {})
  };
}

function readBoundedInteger(value: string | null): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 24 ? parsed : undefined;
}

function readWaitSeconds(value: string | null): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 60 ? parsed : undefined;
}

function normalizeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
