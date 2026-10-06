import { configureLocale, localizeDocumentTitle, t, type MessageKey } from "../shared/i18n";
import { sendRequest } from "../shared/messages";
import { UI_THEMES, type DeepPartial, type FocusSettings, type UiTheme } from "../shared/types";
import { assertAppRoot, describeError, element, toast } from "../styles/dom";
import { createConfigurationBackupControls } from "../ui/configuration-backup";
import { createPageNavigation } from "../ui/page-navigation";
import { openProtectedAction } from "../ui/protected-action-dialog";
import { sha256 } from "../shared/unlock-challenge";
import { applyTheme } from "../ui/theme";
const app = assertAppRoot();
let settings: FocusSettings | null = null;
const settingsGroupStates = new Map<string, boolean>();
let settingsWriteQueue: Promise<void> = Promise.resolve();

document.body.classList.add("home-page");
configureLocale("system");
void loadSettings();

async function loadSettings(): Promise<void> {
  renderLoading();
  try {
    settings = await sendRequest({ type: "GET_SETTINGS" });
    configureLocale((settings as FocusSettings & { locale?: string }).locale);
    applyTheme(settings.theme);
    localizeDocumentTitle("settings");
    renderSettings();
  } catch (error) {
    renderError(describeError(error));
  }
}

function renderLoading(): void {
  app.replaceChildren(
    createShell(
      element("section", {
        className: "card state-view home-state",
        attrs: { "aria-busy": "true", "aria-label": t("settings.loading") },
        children: [element("h2", { text: t("settings.loading") })]
      })
    )
  );
}

function renderError(message: string): void {
  const retry = element("button", {
    className: "btn btn--primary",
    text: t("common.retry"),
    attrs: { type: "button" }
  });
  retry.addEventListener("click", () => void loadSettings());
  app.replaceChildren(
    createShell(
      element("section", {
        className: "card state-view home-state",
        attrs: { role: "alert" },
        children: [
          element("h2", { text: t("settings.loadFailed") }),
          element("p", { text: message }),
          retry
        ]
      })
    )
  );
}

function renderSettings(): void {
  if (!settings) return;
  const content = element("div", {
    className: "home-content",
    children: [
      element("header", {
        className: "home-heading page-heading",
        children: [element("h1", { className: "page-title", text: t("settings.title") })]
      }),
      element("div", {
        className: "home-settings",
        children: [createPluginSettingsPanel()]
      })
    ]
  });
  app.replaceChildren(createShell(content));
}

function createPluginSettingsPanel(): HTMLElement {
  if (!settings) return element("section");
  const focusToggle = createToggle(
    t("settings.focusEnabled"),
    settings.enabled,
    "settings-focus-toggle"
  );
  focusToggle.input.addEventListener("change", () => {
    if (!focusToggle.input.checked && settings?.disableProtection.method !== "none") {
      focusToggle.input.checked = true;
      void settleSettingsWrites()
        .then(() => openProtectedAction("disable", acceptSettings))
        .catch((error) => toast(describeError(error), "error"));
    } else void updateSettings({ enabled: focusToggle.input.checked }, focusToggle.input);
  });
  const locale = element("select", {
    className: "select",
    attrs: {
      value: settings.locale,
      "aria-label": t("settings.language")
    },
    children: [
      element("option", { attrs: { value: "system" }, text: t("locale.system") }),
      element("option", { attrs: { value: "zh-CN" }, text: t("locale.zhCN") }),
      element("option", { attrs: { value: "en" }, text: t("locale.en") })
    ]
  });
  locale.addEventListener("change", () => {
    void updateSettings({ locale: locale.value as FocusSettings["locale"] }, locale);
  });
  const theme = createThemeControl(settings.theme);
  const autoComplete = createToggle(
    t("settings.planAutoComplete"),
    settings.planMode.autoCompleteOnStart,
    "settings-plan-auto-complete"
  );
  autoComplete.input.addEventListener("change", () => {
    void updateSettings(
      { planMode: { autoCompleteOnStart: autoComplete.input.checked } },
      autoComplete.input
    );
  });
  const independentPlanTiming = createToggle(
    t("settings.planIndependentAccess"),
    settings.planMode.independentAccessTiming,
    "settings-plan-independent-access"
  );
  independentPlanTiming.input.addEventListener("change", () => {
    void updateSettings(
      { planMode: { independentAccessTiming: independentPlanTiming.input.checked } },
      independentPlanTiming.input
    );
  });
  const planBlocking = createToggle(
    t("settings.planEnableAllBlocking"),
    settings.planMode.enableAllBlocking,
    "settings-plan-all-blocking"
  );
  planBlocking.input.addEventListener("change", () => {
    void updateSettings(
      { planMode: { enableAllBlocking: planBlocking.input.checked } },
      planBlocking.input
    );
  });
  const iconMinutes = createToggle(
    t("settings.showRemainingMinutesOnIcon"),
    settings.showRemainingMinutesOnIcon,
    "settings-show-remaining-minutes"
  );
  iconMinutes.input.addEventListener("change", () => {
    void updateSettings(
      { showRemainingMinutesOnIcon: iconMinutes.input.checked },
      iconMinutes.input
    );
  });
  const motivation = element("textarea", {
    className: "input home-end-message",
    attrs: {
      maxlength: "500",
      rows: "3",
      placeholder: t("settings.motivationPlaceholder"),
      "aria-label": t("settings.motivation")
    },
    text: settings.endPage.motivationalMessage
  });
  motivation.addEventListener("change", () => {
    void updateSettings({ endPage: { motivationalMessage: motivation.value.trim() } }, motivation);
  });
  const unlockMethod = element("select", {
    className: "select",
    attrs: {
      value: settings.endPage.groupUnlock.method,
      "aria-label": t("settings.groupUnlock")
    },
    children: [
      element("option", { attrs: { value: "none" }, text: t("settings.unlock.none") }),
      element("option", { attrs: { value: "wait" }, text: t("settings.unlock.wait") }),
      element("option", { attrs: { value: "math" }, text: t("settings.unlock.math") }),
      element("option", { attrs: { value: "password" }, text: t("settings.unlock.password") })
    ]
  });
  const currentUnlockMethod = settings.endPage.groupUnlock.method;
  const hasPasswordVerifier = settings.endPage.groupUnlock.passwordVerifier.length === 64;
  unlockMethod.addEventListener("change", () => {
    if (unlockMethod.value === "password" && !hasPasswordVerifier) {
      unlockMethod.value = currentUnlockMethod;
      toast(t("settings.passwordRequired"), "error");
      password.focus();
      return;
    }
    void updateSettings(
      {
        endPage: {
          groupUnlock: {
            method: unlockMethod.value as FocusSettings["endPage"]["groupUnlock"]["method"]
          }
        }
      },
      unlockMethod
    );
  });
  const waitMinutes = element("input", {
    className: "input",
    attrs: {
      type: "number",
      min: "1",
      max: "10800",
      step: "1",
      value: settings.endPage.groupUnlock.waitSeconds,
      "aria-label": t("pause.waitDuration")
    }
  });
  waitMinutes.addEventListener("change", () => {
    void updateSettings(
      {
        endPage: {
          groupUnlock: { waitSeconds: clampNumberInput(waitMinutes, 1, 10800) }
        }
      },
      waitMinutes
    );
  });
  const password = element("input", {
    className: "input",
    attrs: {
      type: "password",
      maxlength: "128",
      autocomplete: "new-password",
      placeholder: t("settings.passwordPlaceholder"),
      "aria-label": t("settings.password")
    }
  });
  password.addEventListener("change", () => {
    if (!password.value) return;
    void (async () => {
      const verifier = await sha256(password.value);
      password.value = "";
      await updateSettings({ endPage: { groupUnlock: { passwordVerifier: verifier } } }, password);
    })();
  });
  const clearUsage = element("button", {
    className: "btn btn--danger",
    text: t("pause.clearAll"),
    attrs: { type: "button" }
  });
  clearUsage.onclick = () =>
    void settleSettingsWrites()
      .then(() => openProtectedAction("clear-all", acceptSettings))
      .catch((error) => toast(describeError(error), "error"));
  const resetSettings = element("button", {
    className: "btn",
    text: t("settings.reset"),
    attrs: { type: "button" }
  });
  resetSettings.onclick = () =>
    void settleSettingsWrites()
      .then(() => openProtectedAction("reset", acceptSettings))
      .catch((error) => toast(describeError(error), "error"));
  const repeatConfirmation = createToggle(
    t("pause.repeatConfirmation"),
    settings.endPage.repeatConfirmationInNewTabs,
    "settings-repeat-confirmation"
  );
  repeatConfirmation.input.onchange = () =>
    void updateSettings(
      { endPage: { repeatConfirmationInNewTabs: repeatConfirmation.input.checked } },
      repeatConfirmation.input
    );
  const flowCharge = createToggle(
    t("pause.flowCharge"),
    settings.endPage.flowConsumesNextGroup,
    "settings-flow-charge"
  );
  flowCharge.input.onchange = () =>
    void updateSettings(
      { endPage: { flowConsumesNextGroup: flowCharge.input.checked } },
      flowCharge.input
    );
  const difficulty = element("select", {
    className: "select",
    attrs: {
      value: settings.endPage.groupUnlock.mathDifficulty,
      "aria-label": t("pause.mathDifficulty")
    },
    children: [
      element("option", { attrs: { value: "equation" }, text: t("pause.equation") }),
      element("option", { attrs: { value: "calculus" }, text: t("pause.calculus") })
    ]
  });
  difficulty.onchange = () =>
    void updateSettings(
      { endPage: { groupUnlock: { mathDifficulty: difficulty.value as "equation" | "calculus" } } },
      difficulty
    );

  return element("section", {
    className: "home-settings__panel",
    attrs: { "aria-labelledby": "plugin-settings-title" },
    children: [
      createPanelHeading(
        "plugin-settings-title",
        t("settings.other"),
        t("settings.otherDescription")
      ),
      element("div", {
        className: "home-plugin-card card",
        children: [
          createSettingsGroup(
            "general",
            t("settings.general"),
            t("settings.generalDescription"),
            [
              createSettingRow(
                t("settings.focusEnabled"),
                t("settings.focusEnabledDescription"),
                focusToggle.label
              ),
              createSettingRow(
                t("pause.disableProtection"),
                t("pause.disableHint"),
                createDisableProtection()
              ),
              createSettingRow(t("settings.language"), t("settings.languageDescription"), locale),
              createSettingRow(t("settings.theme"), t("settings.themeDescription"), theme),
              createSettingRow(
                t("settings.planAutoComplete"),
                t("settings.planAutoCompleteDescription"),
                autoComplete.label
              ),
              createSettingRow(
                t("settings.planIndependentAccess"),
                t("settings.planIndependentAccessDescription"),
                independentPlanTiming.label
              ),
              createSettingRow(
                t("settings.planEnableAllBlocking"),
                t("settings.planEnableAllBlockingDescription"),
                planBlocking.label
              ),
              createSettingRow(
                t("settings.showRemainingMinutesOnIcon"),
                t("settings.showRemainingMinutesOnIconDescription"),
                iconMinutes.label
              )
            ],
            true
          ),
          createSettingsGroup(
            "end-page",
            t("settings.endPage"),
            t("settings.endPageDescription"),
            [
              createSettingRow(
                t("settings.motivation"),
                t("settings.motivationDescription"),
                motivation
              ),
              createSettingRow(
                t("settings.groupUnlock"),
                t("settings.groupUnlockDescription"),
                unlockMethod
              ),
              ...(settings.endPage.groupUnlock.method === "wait"
                ? [
                    createSettingRow(
                      t("pause.waitDuration"),
                      t("pause.waitHint"),
                      element("label", {
                        className: "home-number-control",
                        children: [waitMinutes, element("span", { text: t("common.seconds") })]
                      })
                    )
                  ]
                : []),
              ...(settings.endPage.groupUnlock.method === "math"
                ? [createSettingRow(t("pause.mathDifficulty"), t("pause.mathHint"), difficulty)]
                : []),
              createSettingRow(
                t("pause.repeatConfirmation"),
                t("pause.repeatConfirmationHint"),
                repeatConfirmation.label
              ),
              createSettingRow(t("pause.flowCharge"), t("pause.flowChargeHint"), flowCharge.label),
              createSettingRow(t("settings.password"), t("settings.passwordStored"), password)
            ],
            true
          ),
          createSettingsGroup(
            "data-management",
            t("settings.dataManagement"),
            t("settings.dataManagementDescription"),
            [
              element("div", {
                className: "home-settings__actions",
                children: createConfigurationBackupControls({
                  beforeRun: settleSettingsWrites,
                  afterImport: loadSettings
                })
              }),
              element("div", {
                className: "home-settings__actions",
                children: [resetSettings, clearUsage]
              })
            ],
            false
          )
        ]
      })
    ]
  });
}

function createSettingsGroup(
  id: string,
  title: string,
  description: string,
  children: HTMLElement[],
  open: boolean
): HTMLDetailsElement {
  const group = element("details", {
    className: "home-settings-group",
    attrs: { open: settingsGroupStates.get(id) ?? open, "data-settings-group": id },
    children: [
      element("summary", {
        className: "home-settings-group__summary",
        children: [
          element("div", {
            children: [element("h3", { text: title }), element("p", { text: description })]
          }),
          element("span", {
            className: "home-settings-group__chevron",
            attrs: { "aria-hidden": "true" }
          })
        ]
      }),
      element("div", { className: "home-settings-group__content", children })
    ]
  });
  group.addEventListener("toggle", () => settingsGroupStates.set(id, group.open));
  return group;
}

function createPanelHeading(id: string, title: string, description: string): HTMLElement {
  return element("header", {
    className: "home-settings__panel-heading",
    children: [element("h2", { text: title, attrs: { id } }), element("p", { text: description })]
  });
}

function createSettingRow(title: string, description: string, control: HTMLElement): HTMLElement {
  return element("div", {
    className: "home-setting-row",
    children: [
      element("div", {
        children: [element("strong", { text: title }), element("p", { text: description })]
      }),
      control
    ]
  });
}

async function updateSettings(
  patch: DeepPartial<FocusSettings>,
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): Promise<void> {
  control.disabled = true;
  const write = settingsWriteQueue.then(async () => {
    try {
      settings = await sendRequest({ type: "UPDATE_SETTINGS", patch });
      configureLocale(settings.locale);
      applyTheme(settings.theme);
      localizeDocumentTitle("settings");
      toast(t("common.saved"));
      renderSettings();
    } catch (error) {
      toast(describeError(error), "error");
      await loadSettings();
    }
  });
  settingsWriteQueue = write.catch(() => undefined);
  await write;
}

function createThemeControl(selectedTheme: UiTheme): HTMLFieldSetElement {
  const control = element("fieldset", {
    className: "home-theme-control",
    attrs: { "aria-label": t("settings.theme") },
    children: UI_THEMES.map((theme) => {
      const label = t(`settings.theme.${theme}` as MessageKey);
      const input = element("input", {
        attrs: {
          type: "radio",
          name: "settings-theme",
          value: theme,
          checked: selectedTheme === theme,
          "aria-label": label
        }
      });
      input.addEventListener("change", () => {
        if (!input.checked) return;
        applyTheme(theme);
        void updateSettings({ theme }, input);
      });
      return element("label", {
        className: "home-theme-control__option",
        dataset: { theme },
        children: [
          input,
          element("span", { className: "home-theme-control__swatch" }),
          element("span", { text: label })
        ]
      });
    })
  });
  return control;
}

async function settleSettingsWrites(): Promise<boolean> {
  await settingsWriteQueue;
  return true;
}

function createShell(content: HTMLElement): HTMLElement {
  return element("div", {
    className: "home-shell app-shell",
    children: [createPageNavigation({ currentPage: "home" }), content]
  });
}

function createToggle(
  labelText: string,
  checked: boolean,
  testId: string
): { label: HTMLLabelElement; input: HTMLInputElement } {
  const input = element("input", {
    attrs: { type: "checkbox", checked, "aria-label": labelText, "data-testid": testId }
  });
  const label = element("label", {
    className: "switch",
    children: [input, element("span", { className: "sr-only", text: labelText })]
  });
  return { label, input };
}

function clampNumberInput(input: HTMLInputElement, min: number, max: number): number {
  const parsed = Math.round(Number(input.value));
  const value = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
  input.value = String(value);
  return value;
}

function acceptSettings(next: FocusSettings): void {
  settings = next;
  configureLocale(next.locale);
  applyTheme(next.theme);
  renderSettings();
  toast(t("common.saved"));
}
function createDisableProtection(): HTMLElement {
  const policy = settings!.disableProtection;
  const method = element("select", {
    className: "select",
    attrs: {
      value: policy.method === "wait" ? String(policy.waitMinutes) : policy.method,
      "aria-label": t("pause.disableProtection")
    },
    children: [
      element("option", { attrs: { value: "none" }, text: t("common.disabled") }),
      ...[1, 3, 5, 10].map((minutes) =>
        element("option", {
          attrs: { value: minutes },
          text: t("common.minuteCount", { count: minutes })
        })
      ),
      element("option", { attrs: { value: "password" }, text: t("settings.unlock.password") })
    ]
  });
  const password = element("input", {
    className: "input",
    attrs: {
      type: "password",
      autocomplete: "new-password",
      maxlength: 128,
      placeholder: t("pause.shutdownPassword"),
      "aria-label": t("pause.shutdownPassword")
    }
  });
  const save = element("button", {
    className: "btn",
    text: t("common.save"),
    attrs: { type: "button" }
  });
  const update = () => {
    password.hidden = method.value !== "password";
  };
  method.onchange = update;
  update();
  save.onclick = () =>
    void (async () => {
      save.disabled = true;
      try {
        await settleSettingsWrites();
        const verifier = password.value ? await sha256(password.value) : policy.passwordVerifier;
        if (method.value === "password" && !verifier)
          throw new Error(t("settings.passwordRequired"));
        const next: FocusSettings["disableProtection"] = {
          method:
            method.value === "none" ? "none" : method.value === "password" ? "password" : "wait",
          waitMinutes: [1, 3, 5, 10].includes(Number(method.value))
            ? Number(method.value)
            : policy.waitMinutes,
          passwordVerifier: verifier
        };
        password.value = "";
        if (policy.method !== "none") await openProtectedAction("protection", acceptSettings, next);
        else
          acceptSettings(
            await sendRequest({ type: "UPDATE_SETTINGS", patch: { disableProtection: next } })
          );
      } catch (error) {
        toast(describeError(error), "error");
      } finally {
        save.disabled = false;
      }
    })();
  return element("div", {
    className: "home-protection-controls",
    children: [method, password, save]
  });
}
