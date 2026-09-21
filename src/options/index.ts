import {
  createDefaultTimePeriod,
  MAX_CUSTOM_TIME_PERIOD_PRESETS,
  MAX_CUSTOM_TIME_PERIOD_PRESET_PERIODS,
  MAX_TIME_PERIODS
} from "../shared/config";
import { configureLocale, localizeDocumentTitle, t, type MessageKey } from "../shared/i18n";
import { sendRequest } from "../shared/messages";
import {
  MAX_VISIT_CONFIRMATION_PROMPT_LENGTH,
  type FocusSettings,
  type CustomTimePeriodPreset,
  type ManagedSite,
  type RestrictionMode,
  type SiteTargetSettings,
  type TimePeriodBehavior,
  type TimePeriodSettings,
  type Weekday
} from "../shared/types";
import { siteMatchesUrl } from "../shared/site-scope";
import {
  PERIOD_PRESETS,
  applyCustomPresetToPeriods,
  applyPresetToPeriods,
  buildCustomPresetPeriods,
  buildPresetPeriods,
  type PeriodPresetId
} from "../shared/time-period-presets";
import {
  assertAppRoot,
  describeError,
  element,
  formatClockTime,
  icon,
  setButtonBusy,
  toast
} from "../styles/dom";
import { createPageNavigation } from "../ui/page-navigation";
import { applyTheme } from "../ui/theme";
import {
  addManagedSite,
  normalizeWebsiteInput,
  removeManagedSite,
  requestWebsitePermission
} from "../ui/site-management";

const WEEKDAYS: ReadonlyArray<{
  value: Weekday;
  shortKey: MessageKey;
  labelKey: MessageKey;
}> = [
  { value: 1, shortKey: "weekday.mon.short", labelKey: "weekday.mon" },
  { value: 2, shortKey: "weekday.tue.short", labelKey: "weekday.tue" },
  { value: 3, shortKey: "weekday.wed.short", labelKey: "weekday.wed" },
  { value: 4, shortKey: "weekday.thu.short", labelKey: "weekday.thu" },
  { value: 5, shortKey: "weekday.fri.short", labelKey: "weekday.fri" },
  { value: 6, shortKey: "weekday.sat.short", labelKey: "weekday.sat" },
  { value: 0, shortKey: "weekday.sun.short", labelKey: "weekday.sun" }
];

const app = assertAppRoot();
let draft: FocusSettings | null = null;
let savedConfiguration: Pick<
  FocusSettings,
  "sites" | "targets" | "customTimePeriodPresets"
> | null = null;
let selectedSiteId: string | null = null;
let saveState: HTMLElement | null = null;
let saveStateText: HTMLElement | null = null;
let autoSaveTimer: number | undefined;
let saveLoop: Promise<boolean> | null = null;
let saveStatus: "saved" | "unsaved" | "saving" | "error" = "saved";
const pendingSiteIds = new Set<string>();
const pendingTargetIds = new Set<string>();
let customPresetsPending = false;

configureLocale("system");
window.addEventListener("beforeunload", (event) => {
  if (isDirty()) event.preventDefault();
});
void loadOptions();

async function loadOptions(preferredOrigin?: string): Promise<void> {
  renderLoading();
  try {
    draft = clone(await sendRequest({ type: "GET_SETTINGS" }));
    configureLocale(draft.locale);
    applyTheme(draft.theme);
    localizeDocumentTitle("configuration");
    selectedSiteId =
      (preferredOrigin
        ? Object.values(draft.sites).find((site) => siteMatchesUrl(site, preferredOrigin))?.id
        : selectedSiteId && draft.sites[selectedSiteId]
          ? selectedSiteId
          : sortedSites()[0]?.id) ?? null;
    savedConfiguration = configurationOf(draft);
    saveStatus = "saved";
    renderOptions();
  } catch (error) {
    renderError(describeError(error));
  }
}

function renderLoading(): void {
  app.replaceChildren(
    element("section", {
      className: "state-view",
      attrs: { "aria-busy": true, "aria-label": t("options.loadingLabel") },
      children: [
        element("div", {
          children: [
            element("div", { className: "state-view__icon", children: [icon("clock")] }),
            element("h2", { text: t("options.loading") })
          ]
        })
      ]
    })
  );
}

function renderError(message: string): void {
  const retry = element("button", {
    className: "btn btn--primary",
    text: t("options.reload"),
    attrs: { type: "button" }
  });
  retry.addEventListener("click", () => void loadOptions());
  app.replaceChildren(
    element("section", {
      className: "state-view",
      attrs: { role: "alert" },
      children: [
        element("div", {
          children: [
            element("div", { className: "state-view__icon", children: [icon("warning")] }),
            element("h2", { text: t("options.loadFailed") }),
            element("p", { text: message }),
            retry
          ]
        })
      ]
    })
  );
}

function renderOptions(): void {
  if (!draft) return;
  document.body.classList.add("options-page");
  saveStateText = element("span", {
    attrs: {
      role: "status",
      "aria-live": "polite",
      "aria-label": t("options.autoSaveStatus")
    }
  });
  saveState = element("div", {
    className: "save-state",
    attrs: {
      "data-testid": "auto-save-status"
    },
    children: [saveStateText]
  });
  updateSaveState();

  const site = selectedSiteId ? draft.sites[selectedSiteId] : undefined;
  const content = site
    ? element("div", {
        className: "settings-content options-workspace",
        children: [
          createSiteDirectory(),
          element("div", {
            className: "options-site-editor",
            children: [
              createSiteContext(site),
              createVisitConfirmationCard(site),
              createRestrictionModeCard(site),
              createTimePeriodWorkspace(site)
            ]
          })
        ]
      })
    : createEmptyState();

  app.replaceChildren(
    element("div", {
      className: "options-shell app-shell",
      children: [
        createPageNavigation({ currentPage: "options" }),
        element("header", {
          className: "options-header page-heading",
          children: [
            element("div", {
            children: [element("h1", { className: "page-title", text: t("options.title") })]
            }),
            element("div", {
              className: "options-header__actions",
              children: [createAddSiteButton()]
            })
          ]
        }),
        content
      ]
    })
  );
  updateSaveState();
}

function createEmptyState(): HTMLElement {
  return element("section", {
    className: "card options-empty-site",
    children: [
      icon("plus"),
      element("h2", { text: t("options.emptyTitle") }),
      element("p", { text: t("options.emptyDescription") })
    ]
  });
}

function createSiteDirectory(): HTMLElement {
  const sites = sortedSites();
  return element("aside", {
    className: "options-site-directory card",
    attrs: { "aria-label": t("options.siteDirectoryLabel") },
    children: [
      element("header", {
        children: [
          element("h2", { text: t("options.sites") }),
          element("span", {
            className: "status-chip",
            text: t("common.itemCount", { count: sites.length })
          })
        ]
      }),
      element("div", {
        className: "options-site-directory__list",
        children: sites.map((site) => {
          const selected = site.id === selectedSiteId;
          const button = element("button", {
            className: "options-site-directory__item",
            attrs: {
              type: "button",
              "aria-current": selected ? "page" : undefined
            },
            dataset: { selected: String(selected) },
            children: [
              element("span", {
                className: "options-site-directory__mark",
                text: (site.label || site.hostname).slice(0, 1).toUpperCase()
              }),
              element("span", {
                className: "options-site-directory__copy",
                children: [
                  element("strong", { text: site.label || site.hostname }),
                  element("small", { text: site.hostname })
                ]
              })
            ]
          });
          button.addEventListener("click", () => {
            selectedSiteId = site.id;
            renderOptions();
          });
          return button;
        })
      })
    ]
  });
}

function createSiteContext(site: ManagedSite): HTMLElement {
  const remove = element("button", {
    className: "btn btn--danger",
    text: t("options.removeSite"),
    attrs: { type: "button" }
  });
  remove.addEventListener("click", () => openRemoveSiteDialog(site));

  return element("section", {
    className: "site-context card",
    children: [
      element("div", {
        children: [
          element("span", { className: "site-context__eyebrow", text: t("options.currentSite") }),
          element("h2", { text: site.label || site.hostname }),
          element("p", { text: site.origin })
        ]
      }),
      element("div", {
        className: "site-context__meta",
        children: [remove]
      })
    ]
  });
}

function createRestrictionModeCard(site: ManagedSite): HTMLElement {
  const descriptionId = `restriction-mode-description-${site.id}`;
  const description = element("p", {
    className: "restriction-mode-card__description",
    text: t(`options.mode.${site.restrictionMode}Description`),
    attrs: { id: descriptionId, "aria-live": "polite" }
  });
  const mode = element("select", {
    className: "input restriction-mode-card__select",
    attrs: {
      "aria-label": t("options.restrictionMode"),
      "aria-describedby": descriptionId
    },
    children: (["lenient", "flow", "strict"] satisfies RestrictionMode[]).map((value) =>
      element("option", {
        text: t(`options.mode.${value}`),
        attrs: { value, selected: site.restrictionMode === value }
      })
    )
  });
  mode.addEventListener("change", () => {
    const current = draft?.sites[site.id];
    if (!current) return;
    current.restrictionMode = mode.value as RestrictionMode;
    current.updatedAt = Date.now();
    description.textContent = t(`options.mode.${current.restrictionMode}Description`);
    markSiteDirty(site.id);
  });

  return element("section", {
    className: "restriction-mode-card card",
    attrs: { "aria-labelledby": "restriction-mode-title" },
    children: [
      element("div", {
        className: "restriction-mode-card__primary",
        children: [
          element("div", {
            className: "restriction-mode-card__copy",
            children: [
              element("h2", {
                text: t("options.restrictionMode"),
                attrs: { id: "restriction-mode-title" }
              })
            ]
          }),
          element("div", {
            className: "restriction-mode-card__control",
            children: [mode, description]
          })
        ]
      })
    ]
  });
}

function createVisitConfirmationCard(site: ManagedSite): HTMLElement {
  const confirmation = site.visitConfirmation ?? { enabled: false, waitSeconds: 3 };
  site.visitConfirmation = confirmation;
  const waitSeconds = element("input", {
    className: "input visit-confirmation__wait",
    attrs: {
      type: "number",
      min: 0,
      max: 60,
      step: 1,
      value: confirmation.waitSeconds,
      "aria-label": t("options.visitConfirmationWait")
    }
  });
  const prompt = element("textarea", {
    className: "input visit-confirmation__prompt",
    text: confirmation.prompt ?? "",
    attrs: {
      rows: 2,
      maxlength: MAX_VISIT_CONFIRMATION_PROMPT_LENGTH,
      placeholder: t("options.visitConfirmationPromptPlaceholder"),
      "aria-label": t("options.visitConfirmationPrompt"),
      "aria-describedby": `visit-confirmation-prompt-hint-${site.id}`
    }
  });
  const confirmationSwitch = createToggle(
    t("options.visitConfirmation"),
    confirmation.enabled,
    "visit-confirmation-toggle"
  );
  const fields = element("div", {
    className: "visit-confirmation-card__fields",
    children: [
      element("label", {
        className: "visit-confirmation__field",
        children: [
          element("span", { text: t("options.visitConfirmationWait") }),
          element("span", {
            className: "visit-confirmation__wait-control",
            children: [waitSeconds, element("span", { text: t("common.seconds") })]
          })
        ]
      }),
      element("label", {
        className: "visit-confirmation__field visit-confirmation__field--prompt",
        children: [
          element("span", { text: t("options.visitConfirmationPrompt") }),
          prompt,
          element("small", {
            className: "field__hint",
            text: t("options.visitConfirmationPromptHint"),
            attrs: { id: `visit-confirmation-prompt-hint-${site.id}` }
          })
        ]
      })
    ]
  });
  const updateEnabledState = (): void => {
    fields.hidden = !confirmationSwitch.input.checked;
    waitSeconds.disabled = !confirmationSwitch.input.checked;
    prompt.disabled = !confirmationSwitch.input.checked;
  };
  confirmationSwitch.input.addEventListener("change", () => {
    const current = draft?.sites[site.id];
    if (!current) return;
    current.visitConfirmation = {
      ...(current.visitConfirmation ?? { enabled: false, waitSeconds: 3 }),
      enabled: confirmationSwitch.input.checked
    };
    current.updatedAt = Date.now();
    updateEnabledState();
    markSiteDirty(site.id);
  });
  waitSeconds.addEventListener("change", () => {
    const current = draft?.sites[site.id];
    if (!current) return;
    const value = clamp(waitSeconds.value, 0, 60, 3);
    waitSeconds.value = String(value);
    current.visitConfirmation = {
      ...(current.visitConfirmation ?? { enabled: false, waitSeconds: 3 }),
      waitSeconds: value
    };
    current.updatedAt = Date.now();
    markSiteDirty(site.id);
  });
  prompt.addEventListener("change", () => {
    const current = draft?.sites[site.id];
    if (!current) return;
    const value = prompt.value.trim().slice(0, MAX_VISIT_CONFIRMATION_PROMPT_LENGTH);
    prompt.value = value;
    const nextConfirmation = {
      ...(current.visitConfirmation ?? { enabled: false, waitSeconds: 3 }),
      ...(value ? { prompt: value } : {})
    };
    if (!value) delete nextConfirmation.prompt;
    current.visitConfirmation = nextConfirmation;
    current.updatedAt = Date.now();
    markSiteDirty(site.id);
  });
  updateEnabledState();

  return element("section", {
    className: "visit-confirmation-card card",
    attrs: { "aria-labelledby": `visit-confirmation-title-${site.id}` },
    children: [
      element("header", {
        className: "visit-confirmation-card__header",
        children: [
          element("div", {
            className: "visit-confirmation__copy",
            children: [
              element("h2", {
                text: t("options.visitConfirmation"),
                attrs: { id: `visit-confirmation-title-${site.id}` }
              }),
              element("p", { text: t("options.visitConfirmationDescription") })
            ]
          }),
          confirmationSwitch.label
        ]
      }),
      fields
    ]
  });
}

function createTimePeriodWorkspace(site: ManagedSite): HTMLElement {
  const targets = site.targetIds
    .map((id) => draft?.targets[id])
    .filter((target): target is SiteTargetSettings => Boolean(target));
  return element("section", {
    className: "period-workspace",
    attrs: { "aria-labelledby": "period-workspace-title" },
    children: [
      element("header", {
        className: "section-heading",
        children: [
          element("div", {
            children: [
              element("h2", {
                text: t("options.timePeriods"),
                attrs: { id: "period-workspace-title" }
              }),
              element("p", { text: t("options.timePeriodsDescription") })
            ]
          })
        ]
      }),
      element("div", {
        className: "generic-target-list",
        children: targets.map((target, targetIndex) => createTargetPeriods(target, targetIndex))
      })
    ]
  });
}

function createTargetPeriods(target: SiteTargetSettings, targetIndex: number): HTMLElement {
  const add = element("button", {
    className: "btn",
    attrs: {
      type: "button",
      "data-testid": targetIndex === 0 ? "period-add" : `period-add-${target.id}`
    },
    children: [icon("plus"), t("options.addPeriod")]
  });
  add.disabled = target.timePeriods.length >= MAX_TIME_PERIODS;
  add.addEventListener("click", () => openPeriodDialog(target));
  const quickAdd = element("button", {
    className: "btn btn--primary",
    attrs: {
      type: "button",
      "data-testid": targetIndex === 0 ? "period-quick-add" : `period-quick-add-${target.id}`
    },
    text: t("options.quickAdd")
  });
  quickAdd.addEventListener("click", () => openQuickAddDialog(target, quickAdd));

  return element("article", {
    className: "card period-target",
    children: [
      element("header", {
        className: "period-target__header",
        children: [
          element("div", {
            children: [
              element("h3", { text: target.label }),
              element("p", { text: `${target.timePeriods.length} · ${t("options.timePeriods")}` })
            ]
          }),
          element("div", {
            className: "period-target__actions",
            children: [quickAdd, add]
          })
        ]
      }),
      target.timePeriods.length > 0
        ? element("ul", {
            className: "period-list",
            children: target.timePeriods.map((period) => createPeriodItem(target, period))
          })
        : element("p", { className: "schedule-empty", text: t("options.noPeriods") })
    ]
  });
}

function openQuickAddDialog(target: SiteTargetSettings, trigger: HTMLButtonElement): void {
  let selectedPresetId: PeriodPresetId = "meals";
  let selectedCustomPresetId: string | null = null;
  const titleId = `period-quick-add-title-${target.id}`;
  const note = element("p", {
    className: "schedule-note",
    attrs: { role: "status", "aria-live": "polite" }
  });
  const preview = element("section", {
    className: "period-quick-add__preview",
    attrs: { "aria-live": "polite" }
  });
  const confirm = element("button", {
    className: "btn btn--primary",
    text: t("options.quickAdd.apply"),
    attrs: { type: "button", "data-testid": "period-quick-add-confirm" }
  });
  const cancel = element("button", {
    className: "btn",
    text: t("common.cancel"),
    attrs: { type: "button" }
  });
  const close = element("button", {
    className: "btn btn--icon",
    attrs: { type: "button", "aria-label": t("common.close") },
    children: [icon("close")]
  });
  const dialog = element("dialog", {
    className: "dialog period-quick-add",
    attrs: {
      "aria-labelledby": titleId,
      "data-testid": "period-quick-add-dialog"
    }
  });
  const previewPanel = element("div", {
    className: "period-quick-add__preview-panel",
    children: [
      preview,
      element("div", {
        className: "period-quick-add__apply",
        children: [confirm]
      })
    ]
  });
  const radios = PERIOD_PRESETS.map((preset, index) => {
    const input = element("input", {
      attrs: {
        type: "radio",
        name: `period-preset-${target.id}`,
        value: preset.id,
        checked: index === 0,
        "data-testid": `period-preset-${preset.id}`
      }
    });
    input.addEventListener("change", () => {
      if (!input.checked) return;
      selectedPresetId = preset.id;
      selectedCustomPresetId = null;
      note.textContent = "";
      renderPreview();
    });
    return element("label", {
      className: "period-quick-add__preset",
      children: [
        input,
        element("span", {
          children: [
            element("strong", { text: t(preset.labelKey as MessageKey) }),
            element("small", { text: t(preset.descriptionKey as MessageKey) })
          ]
        })
      ]
    });
  });
  const customPresets = (draft?.customTimePeriodPresets ?? []).map((preset) => {
    const input = element("input", {
      attrs: {
        type: "radio",
        name: `period-preset-${target.id}`,
        value: preset.id,
        "data-testid": `period-custom-preset-${preset.id}`
      }
    });
    input.addEventListener("change", () => {
      if (!input.checked) return;
      selectedCustomPresetId = preset.id;
      note.textContent = "";
      renderPreview();
    });
    return element("label", {
      className: "period-quick-add__preset",
      children: [
        input,
        element("span", {
          children: [
            element("strong", { text: preset.name }),
            element("small", {
              text: t("options.quickAdd.customPresetDescription", { count: preset.periods.length })
            })
          ]
        })
      ]
    });
  });
  const custom = element("button", {
    className: "period-quick-add__custom",
    text: t("options.quickAdd.custom"),
    attrs: { type: "button", "data-testid": "period-preset-custom" }
  });
  custom.addEventListener("click", () => {
    dialog.close();
    openCustomPresetDialog(target, trigger);
  });
  dialog.append(
    element("header", {
      className: "dialog__header",
      children: [
        element("div", {
          children: [
            element("h2", { text: t("options.quickAdd.title"), attrs: { id: titleId } }),
            element("p", { text: t("options.quickAdd.description") })
          ]
        }),
        close
      ]
    }),
    element("div", {
      className: "period-quick-add__layout",
      children: [
        element("div", {
          className: "period-quick-add__sidebar",
          children: [
            element("div", {
              className: "period-quick-add__preset-list",
              attrs: { role: "radiogroup", "aria-label": t("options.quickAdd.presetList") },
              children: [...radios, ...customPresets]
            }),
            custom
          ]
        }),
        previewPanel
      ]
    }),
    note,
    element("footer", {
      className: "dialog__footer",
      children: [cancel]
    })
  );

  function renderPreview(): void {
    const customPreset = selectedCustomPresetId
      ? draft?.customTimePeriodPresets.find((preset) => preset.id === selectedCustomPresetId)
      : undefined;
    const periods = customPreset
      ? buildCustomPresetPeriods(customPreset, previewIds())
      : (buildPresetPeriods(selectedPresetId, previewIds(), (key) => t(key as MessageKey)) ?? []);
    const timeline = element("div", {
      className: "period-quick-add__timeline",
      attrs: {
        role: "img",
        "aria-label": t("options.quickAdd.timelineLabel"),
        "data-testid": "period-quick-add-timeline"
      },
      children: Array.from({ length: 24 }, (_, hour) => {
        const periodIndex = periods.findIndex((period) => periodCoversHour(period, hour));
        return element("span", {
          className:
            periodIndex >= 0
              ? `period-quick-add__hour period-color-${periodIndex % 6}`
              : "period-quick-add__hour",
          attrs: {
            "aria-hidden": "true",
            title: `${String(hour).padStart(2, "0")}:00`,
            "data-hour": hour,
            "data-state": periodIndex >= 0 ? "available" : "unavailable"
          }
        });
      })
    });
    preview.replaceChildren(
      element("div", {
        className: "period-quick-add__timeline-wrap",
        children: [
          timeline,
          element("div", {
            className: "period-quick-add__timeline-scale",
            attrs: { "aria-hidden": "true" },
            children: ["00", "06", "12", "18", "24"].map((label) =>
              element("span", { text: label })
            )
          }),
          element("p", {
            className: "period-quick-add__legend",
            text: t("options.quickAdd.unavailable")
          })
        ]
      }),
      element("h3", { text: t("options.quickAdd.willAdd") }),
      element("ul", {
        className: "period-quick-add__summary",
        attrs: { "data-testid": "period-quick-add-summary" },
        children: periods.map((period, index) =>
          element("li", {
            children: [
              element("span", {
                className: `period-quick-add__swatch period-color-${index % 6}`,
                attrs: { "aria-hidden": "true" }
              }),
              element("div", {
                children: [
                  element("strong", { text: period.name }),
                  element("span", {
                    text: `${formatClockTime(period.startTime)}–${formatClockTime(period.endTime)}`
                  }),
                  element("small", {
                    text: t("options.groupSummary", {
                      limit: period.limitMinutes ?? 0,
                      groups: period.groupCount,
                      perGroup: formatGroupMinutes((period.limitMinutes ?? 0) / period.groupCount)
                    })
                  })
                ]
              })
            ]
          })
        )
      })
    );
  }

  close.addEventListener("click", () => dialog.close());
  cancel.addEventListener("click", () => dialog.close());
  confirm.addEventListener("click", () => {
    const current = draft?.targets[target.id];
    if (!current) return;
    const customPreset = selectedCustomPresetId
      ? draft?.customTimePeriodPresets.find((preset) => preset.id === selectedCustomPresetId)
      : undefined;
    const result = customPreset
      ? applyCustomPresetToPeriods(
          current.timePeriods,
          customPreset,
          () => createDefaultTimePeriod().id
        )
      : applyPresetToPeriods(
          current.timePeriods,
          selectedPresetId,
          () => createDefaultTimePeriod().id,
          (key) => t(key as MessageKey)
        );
    if (!result.ok) {
      note.textContent =
        result.reason === "limit-reached"
          ? t("options.periodLimitReached")
          : t("common.actionFailed");
      return;
    }
    current.timePeriods = result.periods;
    dialog.close();
    renderOptionsPreservingScroll();
    markTargetDirty(target.id);
    toast(t("options.quickAdd.added"));
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    trigger.focus();
  });
  document.body.append(dialog);
  renderPreview();
  dialog.showModal();
  radios[0]?.querySelector("input")?.focus();
}

function openCustomPresetDialog(target: SiteTargetSettings, trigger: HTMLButtonElement): void {
  type DraftPeriod = CustomTimePeriodPreset["periods"][number] & { key: string };
  let nextKey = 1;
  const periods: DraftPeriod[] = [
    {
      key: `custom-period-${nextKey++}`,
      name: "",
      startTime: "09:00",
      endTime: "10:00",
      limitMinutes: 45,
      groupCount: 1
    }
  ];
  const titleId = `custom-period-preset-title-${target.id}`;
  const name = element("input", {
    className: "input",
    attrs: {
      type: "text",
      required: true,
      maxlength: 60,
      "data-testid": "period-custom-preset-name"
    }
  });
  const note = element("p", { className: "schedule-note", attrs: { role: "status" } });
  const rows = element("div", { className: "period-custom-preset__rows" });
  const preview = element("section", {
    className: "period-quick-add__preview",
    attrs: { "aria-live": "polite" }
  });
  const addPeriod = element("button", {
    className: "btn",
    text: t("options.quickAdd.customAddPeriod"),
    attrs: { type: "button", "data-testid": "period-custom-add-row" }
  });
  const cancel = element("button", {
    className: "btn",
    text: t("common.cancel"),
    attrs: { type: "button" }
  });
  const save = element("button", {
    className: "btn btn--primary",
    text: t("options.quickAdd.customSaveAndAdd"),
    attrs: { type: "submit", "data-testid": "period-custom-save" }
  });
  const close = element("button", {
    className: "btn btn--icon",
    attrs: { type: "button", "aria-label": t("common.close") },
    children: [icon("close")]
  });
  const dialog = element("dialog", {
    className: "dialog period-quick-add period-custom-preset",
    attrs: {
      "aria-labelledby": titleId,
      "data-testid": "period-custom-preset-dialog"
    }
  });
  const form = element("form");
  const closeDialog = () => {
    dialog.close();
  };

  const updatePreview = () => {
    renderPeriodPreview(
      preview,
      periods.map((period, index) => ({
        id: `period:custom-preview-${index}`,
        name: period.name || t("options.quickAdd.customPeriodFallback", { count: index + 1 }),
        enabled: true,
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: period.startTime,
        endTime: period.endTime,
        behavior: "timed",
        limitMinutes: period.limitMinutes,
        groupCount: period.groupCount
      }))
    );
  };

  const renderRows = () => {
    rows.replaceChildren(
      ...periods.map((period, index) => {
        const periodName = element("input", {
          className: "input",
          attrs: {
            type: "text",
            maxlength: 60,
            required: true,
            value: period.name,
            placeholder: t("options.quickAdd.customPeriodFallback", { count: index + 1 })
          }
        });
        const start = element("input", {
          className: "input",
          attrs: { type: "time", required: true, value: period.startTime }
        });
        const end = element("input", {
          className: "input",
          attrs: { type: "time", required: true, value: period.endTime }
        });
        const limit = element("input", {
          className: "input",
          attrs: { type: "number", required: true, min: 1, max: 1440, value: period.limitMinutes }
        });
        const groups = element("input", {
          className: "input",
          attrs: { type: "number", required: true, min: 1, max: 24, value: period.groupCount }
        });
        const remove = element("button", {
          className: "btn btn--icon btn--danger",
          attrs: {
            type: "button",
            "aria-label": t("options.quickAdd.customRemovePeriod", { count: index + 1 })
          },
          children: [icon("trash")]
        });
        remove.disabled = periods.length === 1;
        const bind = (input: HTMLInputElement, update: (value: string) => void) => {
          input.addEventListener("input", () => {
            update(input.value);
            updatePreview();
          });
        };
        bind(periodName, (value) => (period.name = value));
        bind(start, (value) => (period.startTime = value));
        bind(end, (value) => (period.endTime = value));
        bind(limit, (value) => (period.limitMinutes = clamp(value, 1, 1440, 45)));
        bind(groups, (value) => (period.groupCount = clamp(value, 1, 24, 1)));
        remove.addEventListener("click", () => {
          periods.splice(index, 1);
          renderRows();
          updatePreview();
        });
        return element("fieldset", {
          className: "period-custom-preset__row",
          children: [
            element("legend", {
              text: t("options.quickAdd.customPeriodFallback", { count: index + 1 })
            }),
            createField(t("options.periodName"), periodName),
            element("div", {
              className: "time-fields",
              children: [
                createField(t("options.periodStart"), start),
                element("span", { className: "time-fields__dash", text: t("options.periodTo") }),
                createField(t("options.periodEnd"), end)
              ]
            }),
            element("div", {
              className: "period-dialog__timed",
              children: [
                createField(t("options.periodLimit"), limit, t("common.minutes")),
                createField(t("options.periodGroups"), groups),
                remove
              ]
            })
          ]
        });
      })
    );
  };

  addPeriod.addEventListener("click", () => {
    if (periods.length >= MAX_CUSTOM_TIME_PERIOD_PRESET_PERIODS) {
      note.textContent = t("options.quickAdd.customPeriodLimit");
      return;
    }
    periods.push({
      key: `custom-period-${nextKey++}`,
      name: "",
      startTime: "09:00",
      endTime: "10:00",
      limitMinutes: 45,
      groupCount: 1
    });
    note.textContent = "";
    renderRows();
    updatePreview();
    rows.querySelector<HTMLInputElement>("input")?.focus();
  });
  close.addEventListener("click", closeDialog);
  cancel.addEventListener("click", closeDialog);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const presetName = name.value.trim();
    if (!presetName) {
      note.textContent = t("options.quickAdd.customNameRequired");
      name.focus();
      return;
    }
    if (periods.some((period) => !period.name.trim())) {
      note.textContent = t("options.quickAdd.customPeriodNameRequired");
      return;
    }
    if ((draft?.customTimePeriodPresets.length ?? 0) >= MAX_CUSTOM_TIME_PERIOD_PRESETS) {
      note.textContent = t("options.quickAdd.customPresetLimit");
      return;
    }
    const customPreset: CustomTimePeriodPreset = {
      id: `preset:${createDefaultTimePeriod().id}`,
      name: presetName,
      periods: periods.map((period) => ({
        name: period.name.trim(),
        startTime: period.startTime,
        endTime: period.endTime,
        limitMinutes: period.limitMinutes,
        groupCount: period.groupCount
      }))
    };
    const current = draft?.targets[target.id];
    if (!draft || !current) return;
    const result = applyCustomPresetToPeriods(
      current.timePeriods,
      customPreset,
      () => createDefaultTimePeriod().id
    );
    if (!result.ok) {
      note.textContent = t("options.periodLimitReached");
      return;
    }
    draft.customTimePeriodPresets = [...draft.customTimePeriodPresets, customPreset];
    current.timePeriods = result.periods;
    closeDialog();
    renderOptionsPreservingScroll();
    markCustomPresetsDirty();
    markTargetDirty(target.id);
    toast(t("options.quickAdd.customAdded"));
  });

  form.append(
    element("header", {
      className: "dialog__header",
      children: [
        element("div", {
          children: [
            element("h2", { text: t("options.quickAdd.customTitle"), attrs: { id: titleId } }),
            element("p", { text: t("options.quickAdd.customDescription") })
          ]
        }),
        close
      ]
    }),
    element("div", {
      className: "period-quick-add__layout",
      children: [
        element("div", {
          className: "period-quick-add__sidebar",
          children: [createField(t("options.quickAdd.customName"), name), rows, addPeriod]
        }),
        preview
      ]
    }),
    note,
    element("footer", { className: "dialog__footer", children: [cancel, save] })
  );
  dialog.append(form);
  dialog.addEventListener("close", () => {
    dialog.remove();
    trigger.focus();
  });
  document.body.append(dialog);
  renderRows();
  updatePreview();
  dialog.showModal();
  name.focus();
}

function periodCoversHour(period: TimePeriodSettings, hour: number): boolean {
  const start = Number(period.startTime.slice(0, 2)) * 60 + Number(period.startTime.slice(3));
  const end = Number(period.endTime.slice(0, 2)) * 60 + Number(period.endTime.slice(3));
  const minute = hour * 60;
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function previewIds(): () => string {
  let index = 0;
  return () => `period:preview-${index++}`;
}

function renderPeriodPreview(preview: HTMLElement, periods: readonly TimePeriodSettings[]): void {
  const timeline = element("div", {
    className: "period-quick-add__timeline",
    attrs: {
      role: "img",
      "aria-label": t("options.quickAdd.timelineLabel"),
      "data-testid": "period-quick-add-timeline"
    },
    children: Array.from({ length: 24 }, (_, hour) => {
      const periodIndex = periods.findIndex((period) => periodCoversHour(period, hour));
      return element("span", {
        className:
          periodIndex >= 0
            ? `period-quick-add__hour period-color-${periodIndex % 6}`
            : "period-quick-add__hour",
        attrs: {
          "aria-hidden": "true",
          title: `${String(hour).padStart(2, "0")}:00`,
          "data-hour": hour,
          "data-state": periodIndex >= 0 ? "available" : "unavailable"
        }
      });
    })
  });
  preview.replaceChildren(
    element("div", {
      className: "period-quick-add__timeline-wrap",
      children: [
        timeline,
        element("div", {
          className: "period-quick-add__timeline-scale",
          attrs: { "aria-hidden": "true" },
          children: ["00", "06", "12", "18", "24"].map((label) => element("span", { text: label }))
        }),
        element("p", {
          className: "period-quick-add__legend",
          text: t("options.quickAdd.unavailable")
        })
      ]
    }),
    element("h3", { text: t("options.quickAdd.willAdd") }),
    element("ul", {
      className: "period-quick-add__summary",
      attrs: { "data-testid": "period-quick-add-summary" },
      children: periods.map((period, index) =>
        element("li", {
          children: [
            element("span", {
              className: `period-quick-add__swatch period-color-${index % 6}`,
              attrs: { "aria-hidden": true }
            }),
            element("div", {
              children: [
                element("strong", { text: displayPeriodName(period) }),
                element("span", {
                  text: `${formatClockTime(period.startTime)}–${formatClockTime(period.endTime)}`
                }),
                element("small", {
                  text: t("options.groupSummary", {
                    limit: period.limitMinutes ?? 0,
                    groups: period.groupCount,
                    perGroup: formatGroupMinutes((period.limitMinutes ?? 0) / period.groupCount)
                  })
                })
              ]
            })
          ]
        })
      )
    })
  );
}

function createPeriodItem(target: SiteTargetSettings, period: TimePeriodSettings): HTMLLIElement {
  const periodName = displayPeriodName(period);
  const periodToggle = createToggle(
    `${t("common.enabled")} ${periodName}`,
    period.enabled,
    `period-toggle-${period.id}`
  );
  const edit = element("button", {
    className: "btn btn--icon",
    attrs: { type: "button", "aria-label": `${t("common.edit")} ${periodName}` },
    children: [icon("edit")]
  });
  edit.addEventListener("click", () => openPeriodDialog(target, period));
  const remove = element("button", {
    className: "btn btn--icon btn--danger",
    attrs: { type: "button", "aria-label": `${t("common.delete")} ${periodName}` },
    children: [icon("trash")]
  });
  remove.addEventListener("click", () => {
    const current = draft?.targets[target.id];
    if (!current) return;
    current.timePeriods = current.timePeriods.filter((candidate) => candidate.id !== period.id);
    renderOptionsPreservingScroll();
    markTargetDirty(target.id);
  });
  const groupSummary =
    period.behavior === "timed" && period.limitMinutes !== null
      ? t("options.groupSummary", {
          limit: period.limitMinutes,
          groups: period.groupCount,
          perGroup: formatGroupMinutes(period.limitMinutes / period.groupCount)
        })
      : t(
          `options.period.${period.behavior === "timed" ? "timed" : period.behavior === "always-allow" ? "alwaysAllow" : "alwaysBlock"}`
        );
  const item = element("li", {
    className: "period-item",
    dataset: { enabled: String(period.enabled), behavior: period.behavior },
    children: [
      element("div", {
        className: "period-item__identity",
        children: [
          element("span", { className: "period-item__status", attrs: { "aria-hidden": true } }),
          element("div", {
            children: [
              element("strong", { text: periodName }),
              element("span", {
                text: `${formatDays(period.days)} · ${formatClockTime(period.startTime)}–${formatClockTime(period.endTime)}${period.startTime > period.endTime ? ` (${t("options.nextDay")})` : ""}`
              }),
              element("small", { text: groupSummary })
            ]
          })
        ]
      }),
      element("div", {
        className: "period-item__actions",
        children: [periodToggle.label, edit, remove]
      })
    ]
  });
  periodToggle.input.addEventListener("change", () => {
    const current = draft?.targets[target.id];
    const currentPeriod = current?.timePeriods.find((candidate) => candidate.id === period.id);
    if (!currentPeriod) return;
    currentPeriod.enabled = periodToggle.input.checked;
    item.dataset.enabled = String(currentPeriod.enabled);
    markTargetDirty(target.id);
  });
  return item;
}

function openPeriodDialog(target: SiteTargetSettings, existing?: TimePeriodSettings): void {
  const period = existing ? clone(existing) : createDefaultTimePeriod(45);
  const systemName = t("options.defaultPeriodName");
  const name = element("input", {
    className: "input",
    attrs: { type: "text", value: period.name || systemName, maxlength: 60, required: true }
  });
  const behavior = element("select", {
    className: "input",
    children: (["timed", "always-allow", "always-block"] satisfies TimePeriodBehavior[]).map(
      (value) =>
        element("option", {
          text: t(
            value === "timed"
              ? "options.period.timed"
              : value === "always-allow"
                ? "options.period.alwaysAllow"
                : "options.period.alwaysBlock"
          ),
          attrs: { value, selected: period.behavior === value }
        })
    )
  });
  const limit = element("input", {
    className: "input",
    attrs: {
      type: "number",
      min: 1,
      max: 1440,
      step: 1,
      value: period.limitMinutes ?? 45,
      required: true
    }
  });
  const groups = element("input", {
    className: "input",
    attrs: { type: "number", min: 1, max: 24, step: 1, value: period.groupCount, required: true }
  });
  const start = element("input", {
    className: "input",
    attrs: { type: "time", value: period.startTime, required: true }
  });
  const end = element("input", {
    className: "input",
    attrs: { type: "time", value: period.endTime, required: true }
  });
  const dayInputs = WEEKDAYS.map((day) => ({
    day,
    input: element("input", {
      attrs: {
        type: "checkbox",
        checked: period.days.includes(day.value),
        "aria-label": t(day.labelKey)
      }
    })
  }));
  const note = element("p", { className: "schedule-note", attrs: { role: "status" } });
  const enabled = createToggle(t("common.enabled"), period.enabled);
  const close = element("button", {
    className: "btn btn--icon",
    attrs: { type: "button", "aria-label": t("common.close") },
    children: [icon("close")]
  });
  const cancel = element("button", {
    className: "btn",
    text: t("common.cancel"),
    attrs: { type: "button" }
  });
  const submit = element("button", {
    className: "btn btn--primary",
    text: existing ? t("common.save") : t("common.add"),
    attrs: { type: "submit" }
  });
  const timedFields = element("div", {
    className: "period-dialog__timed",
    children: [
      createField(t("options.periodLimit"), limit, t("common.minutes")),
      createField(t("options.periodGroups"), groups)
    ]
  });
  const form = element("form", {
    className: "dialog period-dialog",
    attrs: { role: "dialog", "aria-modal": true, "aria-labelledby": "period-dialog-title" },
    children: [
      element("header", {
        className: "dialog__header",
        children: [
          element("h2", {
            text: existing ? t("options.editPeriod") : t("options.addPeriod"),
            attrs: { id: "period-dialog-title" }
          }),
          close
        ]
      }),
      createField(t("options.periodName"), name),
      createField(t("options.periodBehavior"), behavior),
      timedFields,
      element("fieldset", {
        className: "field schedule-weekdays",
        children: [
          element("legend", { text: t("options.periodDays") }),
          element("div", {
            className: "day-picker",
            children: dayInputs.map(({ day, input }) =>
              element("label", {
                attrs: { title: t(day.labelKey) },
                children: [input, t(day.shortKey)]
              })
            )
          })
        ]
      }),
      element("div", {
        className: "time-fields",
        children: [
          createField(t("options.periodStart"), start),
          element("span", { className: "time-fields__dash", text: t("options.periodTo") }),
          createField(t("options.periodEnd"), end)
        ]
      }),
      element("div", {
        className: "access-toggle-row",
        children: [element("strong", { text: t("common.enabled") }), enabled.label]
      }),
      note,
      element("footer", { className: "dialog__footer", children: [cancel, submit] })
    ]
  });
  const backdrop = element("div", { className: "dialog-backdrop", children: [form] });
  const closeDialog = () => backdrop.remove();
  const updateFields = () => {
    const timed = behavior.value === "timed";
    timedFields.hidden = !timed;
    limit.required = timed;
    groups.required = timed;
    note.textContent =
      start.value === end.value
        ? t("options.fullDayNote")
        : start.value > end.value
          ? t("options.crossMidnightNote")
          : "";
  };
  close.addEventListener("click", closeDialog);
  cancel.addEventListener("click", closeDialog);
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) closeDialog();
  });
  behavior.addEventListener("change", updateFields);
  start.addEventListener("input", updateFields);
  end.addEventListener("input", updateFields);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const days = dayInputs.filter(({ input }) => input.checked).map(({ day }) => day.value);
    if (days.length === 0) {
      note.textContent = t("options.selectOneDay");
      dayInputs[0]?.input.focus();
      return;
    }
    const current = draft?.targets[target.id];
    if (!current || (current.timePeriods.length >= MAX_TIME_PERIODS && !existing)) {
      note.textContent = t("options.periodLimitReached");
      return;
    }
    const nextBehavior = behavior.value as TimePeriodBehavior;
    const updated: TimePeriodSettings = {
      id: period.id,
      name: period.name === "" && name.value.trim() === systemName ? "" : name.value.trim(),
      enabled: enabled.input.checked,
      days,
      startTime: start.value,
      endTime: end.value,
      behavior: nextBehavior,
      limitMinutes: nextBehavior === "timed" ? clamp(limit.value, 1, 1440, 45) : null,
      groupCount: nextBehavior === "timed" ? clamp(groups.value, 1, 24, 1) : 1
    };
    const index = current.timePeriods.findIndex((candidate) => candidate.id === updated.id);
    if (index >= 0) current.timePeriods[index] = updated;
    else current.timePeriods.push(updated);
    closeDialog();
    renderOptionsPreservingScroll();
    markTargetDirty(target.id);
  });
  document.body.append(backdrop);
  updateFields();
  name.focus();
}

function displayPeriodName(period: TimePeriodSettings): string {
  return period.name || t("options.defaultPeriodName");
}

function createField(label: string, control: HTMLElement, suffix?: string): HTMLElement {
  return element("label", {
    className: "field",
    children: [
      element("span", { text: label }),
      suffix
        ? element("span", { className: "period-dialog__number", children: [control, suffix] })
        : control
    ]
  });
}

function createAddSiteButton(): HTMLButtonElement {
  const button = element("button", {
    className: "btn btn--primary",
    attrs: { type: "button", "data-testid": "site-add-button" },
    children: [icon("plus"), t("options.addSite")]
  });
  button.addEventListener("click", openAddSiteDialog);
  return button;
}

function openAddSiteDialog(): void {
  const input = element("input", {
    className: "input",
    attrs: {
      type: "text",
      inputmode: "url",
      autocomplete: "url",
      placeholder: "example.com",
      required: true,
      "data-testid": "site-add-input"
    }
  });
  const note = element("p", { className: "schedule-note", text: t("options.permissionNote") });
  const cancel = element("button", {
    className: "btn",
    text: t("common.cancel"),
    attrs: { type: "button" }
  });
  const submit = element("button", {
    className: "btn btn--primary",
    text: t("options.addSite"),
    attrs: { type: "submit" }
  });
  const dialog = element("dialog", {
    className: "dialog options-site-dialog",
    children: [
      element("form", {
        children: [
          element("h2", { text: t("options.addSite") }),
          createField(t("options.websiteInput"), input),
          note,
          element("footer", { className: "dialog__footer", children: [cancel, submit] })
        ]
      })
    ]
  });
  cancel.addEventListener("click", () => dialog.close());
  dialog.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      try {
        if (!(await flushAutoSave())) return;
        const website = normalizeWebsiteInput(input.value);
        setButtonBusy(submit, true, t("options.requestingPermission"));
        note.textContent =
          website.family === "bilibili"
            ? t("options.bilibiliScopeNote")
            : t("options.permissionNote");
        if (!(await requestWebsitePermission(website.permissionPatterns))) {
          note.textContent = t("options.permissionDenied");
          return;
        }
        setButtonBusy(submit, true, t("options.adding"));
        await addManagedSite(website.origin);
        dialog.close();
        toast(t("options.siteAdded"));
        await loadOptions(website.origin);
      } catch (error) {
        note.textContent = error instanceof Error ? error.message : describeError(error);
      } finally {
        setButtonBusy(submit, false);
      }
    })();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}

function openRemoveSiteDialog(site: ManagedSite): void {
  const cancel = element("button", {
    className: "btn",
    text: t("common.cancel"),
    attrs: { type: "button" }
  });
  const confirm = element("button", {
    className: "btn btn--danger",
    text: t("common.delete"),
    attrs: { type: "button" }
  });
  const dialog = element("dialog", {
    className: "dialog options-site-dialog",
    children: [
      element("h2", {
        text: t("options.removeSiteQuestion", { site: site.label || site.hostname })
      }),
      element("p", { text: t("options.removeSiteDetail") }),
      element("div", { className: "dialog__actions", children: [cancel, confirm] })
    ]
  });
  cancel.addEventListener("click", () => dialog.close());
  confirm.addEventListener("click", () => {
    void (async () => {
      setButtonBusy(confirm, true, t("options.deleting"));
      try {
        if (!(await flushAutoSave())) return;
        await removeManagedSite(site.id);
        selectedSiteId = null;
        dialog.close();
        toast(t("options.siteRemoved"));
        await loadOptions();
      } catch (error) {
        setButtonBusy(confirm, false);
        toast(describeError(error), "error");
      }
    })();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function createToggle(
  labelText: string,
  checked: boolean,
  testId?: string
): { label: HTMLLabelElement; input: HTMLInputElement } {
  const input = element("input", {
    attrs: {
      type: "checkbox",
      checked,
      "aria-label": labelText,
      ...(testId ? { "data-testid": testId } : {})
    }
  });
  return {
    input,
    label: element("label", {
      className: "switch",
      children: [input, element("span", { className: "sr-only", text: labelText })]
    })
  };
}

function sortedSites(): ManagedSite[] {
  return Object.values(draft?.sites ?? {}).sort((left, right) =>
    (left.label || left.hostname).localeCompare(right.label || right.hostname)
  );
}

function markSiteDirty(siteId: string): void {
  pendingSiteIds.add(siteId);
  scheduleAutoSave();
}

function markTargetDirty(targetId: string): void {
  pendingTargetIds.add(targetId);
  scheduleAutoSave();
}

function markCustomPresetsDirty(): void {
  customPresetsPending = true;
  scheduleAutoSave();
}

function scheduleAutoSave(): void {
  if (!isDirty()) {
    saveStatus = "saved";
    updateSaveState();
    return;
  }
  saveStatus = "unsaved";
  updateSaveState();
  if (autoSaveTimer !== undefined) window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = undefined;
    void flushAutoSave();
  }, 0);
}

/**
 * Serializes writes and always persists the latest draft after an in-flight write.
 * This prevents rapid controls from resolving out of order or dropping later edits.
 */
async function flushAutoSave(): Promise<boolean> {
  if (autoSaveTimer !== undefined) {
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = undefined;
  }
  if (saveLoop) return saveLoop;
  saveLoop = (async () => {
    while (
      draft &&
      (pendingSiteIds.size > 0 || pendingTargetIds.size > 0 || customPresetsPending)
    ) {
      saveStatus = "saving";
      updateSaveState();
      const siteId = pendingSiteIds.values().next().value;
      if (siteId) {
        pendingSiteIds.delete(siteId);
        const site = draft.sites[siteId];
        if (!site) continue;
        const persistedMode = site.restrictionMode;
        const persistedConfirmation = clone(
          site.visitConfirmation ?? { enabled: false, waitSeconds: 3 }
        );
        try {
          const normalized = await sendRequest({
            type: "UPDATE_MANAGED_SITE",
            siteId,
            patch: {
              restrictionMode: persistedMode,
              visitConfirmation: persistedConfirmation
            }
          });
          if (savedConfiguration) savedConfiguration.sites[siteId] = clone(normalized);
          const current = draft?.sites[siteId];
          if (
            current?.restrictionMode === persistedMode &&
            snapshot(current.visitConfirmation) === snapshot(persistedConfirmation)
          ) {
            draft.sites[siteId] = clone(normalized);
          }
        } catch (error) {
          pendingSiteIds.add(siteId);
          return handleAutoSaveError(error);
        }
        continue;
      }

      if (customPresetsPending) {
        customPresetsPending = false;
        const persistedPresets = clone(draft.customTimePeriodPresets);
        const persistedSnapshot = snapshot(persistedPresets);
        try {
          const normalized = await sendRequest({
            type: "UPDATE_SETTINGS",
            patch: { customTimePeriodPresets: persistedPresets }
          });
          if (savedConfiguration) {
            savedConfiguration.customTimePeriodPresets = clone(normalized.customTimePeriodPresets);
          }
          if (draft && snapshot(draft.customTimePeriodPresets) === persistedSnapshot) {
            draft.customTimePeriodPresets = clone(normalized.customTimePeriodPresets);
          }
        } catch (error) {
          customPresetsPending = true;
          return handleAutoSaveError(error);
        }
        continue;
      }

      const targetId = pendingTargetIds.values().next().value;
      if (!targetId) continue;
      pendingTargetIds.delete(targetId);
      const target = draft.targets[targetId];
      if (!target) continue;
      const persistedPeriods = clone(target.timePeriods);
      const persistedSnapshot = snapshot(persistedPeriods);
      try {
        const normalized = await sendRequest({
          type: "UPDATE_SITE_TARGET",
          targetId,
          patch: { timePeriods: persistedPeriods }
        });
        if (savedConfiguration) savedConfiguration.targets[targetId] = clone(normalized);
        const current = draft?.targets[targetId];
        if (current && snapshot(current.timePeriods) === persistedSnapshot) {
          draft.targets[targetId] = clone(normalized);
        }
      } catch (error) {
        pendingTargetIds.add(targetId);
        return handleAutoSaveError(error);
      }
    }
    saveStatus = "saved";
    updateSaveState();
    return true;
  })();
  try {
    return await saveLoop;
  } finally {
    saveLoop = null;
  }
}

function handleAutoSaveError(error: unknown): false {
  saveStatus = "error";
  updateSaveState();
  toast(describeError(error), "error");
  return false;
}

function updateSaveState(): void {
  if (!saveState || !saveStateText) return;
  saveState.dataset.status = saveStatus;
  saveStateText.textContent =
    saveStatus === "saving"
      ? t("common.saving")
      : saveStatus === "error"
        ? t("common.saveFailed")
        : saveStatus === "unsaved"
          ? t("common.unsaved")
          : t("common.saved");
  saveState.querySelector(".save-state__retry")?.remove();
  if (saveStatus === "error") {
    const retry = element("button", {
      className: "save-state__retry",
      text: t("common.retry"),
      attrs: { type: "button" }
    });
    retry.addEventListener("click", () => void flushAutoSave());
    saveState.append(retry);
  }
}

function renderOptionsPreservingScroll(): void {
  const scrollY = window.scrollY;
  renderOptions();
  window.scrollTo({ top: scrollY });
}

function formatDays(days: Weekday[]): string {
  if (days.length === 7) return t("options.everyDay");
  if ([1, 2, 3, 4, 5].every((day) => days.includes(day as Weekday)) && days.length === 5) {
    return t("options.weekdays");
  }
  if (days.length === 2 && days.includes(0) && days.includes(6)) return t("options.weekend");
  return WEEKDAYS.filter(({ value }) => days.includes(value))
    .map(({ shortKey }) => t(shortKey))
    .join(" · ");
}

function formatGroupMinutes(minutes: number): string {
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

function clamp(value: string, min: number, max: number, fallback: number): number {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function isDirty(): boolean {
  return Boolean(
    draft && savedConfiguration && snapshot(configurationOf(draft)) !== snapshot(savedConfiguration)
  );
}

function configurationOf(
  settings: FocusSettings
): Pick<FocusSettings, "sites" | "targets" | "customTimePeriodPresets"> {
  return clone({
    sites: settings.sites,
    targets: settings.targets,
    customTimePeriodPresets: settings.customTimePeriodPresets
  });
}

function snapshot(value: unknown): string {
  return JSON.stringify(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
