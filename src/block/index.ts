import { storageAddChangeListener } from "../shared/browser";
import { localizeLocalModuleCopy } from "../ui/local-module-copy";
import { STORAGE_KEYS } from "../shared/storage-keys";
import {
  createLocalModuleImportPreview,
  LocalModuleImportError,
  parseLocalModuleFiles
} from "../modules/local/importer";
import {
  LOCAL_MODULE_IMPORT_RISK_CODE,
  type LocalModuleDefinition,
  type LocalModuleFile,
  type LocalModuleInstallation,
  type LocalModuleSnapshot,
  type LocalModuleWarningCode
} from "../modules/local/types";
import { originsFromLocalModule } from "../modules/local/validation";
import {
  localModuleAllowsUserScripts,
  resolveLocalModulePlatform
} from "../modules/local/capabilities";
import { configureLocale, localizeDocumentTitle, t } from "../shared/i18n";
import { sendRequest } from "../shared/messages";
import { assertAppRoot, describeError, element, icon, setButtonBusy, toast } from "../styles/dom";
import { createConfigurationDirectory } from "../ui/configuration-directory";
import {
  createConfigurationWorkspace,
  preserveConfigurationPosition
} from "../ui/configuration-workspace";
import { createPageNavigation } from "../ui/page-navigation";
import { applyAppearance } from "../ui/theme";
import { createFilterTimePeriodPicker } from "../ui/filter-time-periods";
import { configuredFilterTimePeriods, filterScheduleReferences } from "../modules/local/schedules";
import type { FocusSettings } from "../shared/types";
import { addManagedSite, requestLocalModulePermissions } from "../ui/site-management";
import { createExternalLink as externalLink } from "../ui/external-link";
import {
  createLocalModuleDisclaimer,
  createLocalModuleImportGuidance,
  LOCAL_MODULE_LINKS
} from "../ui/local-module-guidance";

const app = assertAppRoot();
let localModules: LocalModuleSnapshot | null = null;
let scheduleSettings: FocusSettings | null = null;
let loadGeneration = 0;
let selectedModuleId: string | null = null;
let selectedCategory: "modules" | "download" = "modules";
let releaseSidebarSizing: (() => void) | undefined;

document.body.classList.add("block-page");
configureLocale("system");
void loadPage();
storageAddChangeListener((changes, area) => {
  if (
    (area === "local" && changes[STORAGE_KEYS.settings]) ||
    (area === "session" && changes[STORAGE_KEYS.planAccess])
  )
    void loadPage();
});

async function loadPage(): Promise<void> {
  const generation = ++loadGeneration;
  if (!localModules) renderState(t("block.loading"), true);
  try {
    const [settings, snapshot] = await Promise.all([
      sendRequest({ type: "GET_SETTINGS" }),
      sendRequest({ type: "GET_LOCAL_MODULES" })
    ]);
    if (generation !== loadGeneration) return;
    configureLocale(settings.locale);
    applyAppearance(settings);
    localizeDocumentTitle("block");
    localModules = snapshot;
    scheduleSettings = settings;
    renderPage();
  } catch (error) {
    renderError(describeError(error));
  }
}

function renderPage(): void {
  if (!localModules) return;
  const importButton = element("button", {
    className: "btn btn--primary",
    attrs: { type: "button", "data-testid": "module-import-open" },
    children: [icon("plus"), element("span", { text: t("settings.importModule") })]
  });
  importButton.addEventListener("click", openImportDialog);
  const installations = Object.values(localModules.store.installations).sort((left, right) =>
    localizeLocalModuleCopy(left.definition).name.localeCompare(
      localizeLocalModuleCopy(right.definition).name
    )
  );

  if (!installations.some(({ definition }) => definition.id === selectedModuleId)) {
    selectedModuleId = installations[0]?.definition.id ?? null;
  }
  preserveConfigurationPosition(app, () => {
    releaseSidebarSizing?.();
    const selected = installations.find(({ definition }) => definition.id === selectedModuleId);
    const workspace = createConfigurationWorkspace({
      label: t("block.title"),
      editorId: "block-editor",
      directory: [
        createConfigurationDirectory({
          title: t("block.installed"),
          label: t("block.installed"),
          editorId: "block-editor",
          active: selectedCategory === "modules",
          emptyLabel: t("settings.noModules"),
          onSelect: () => {
            selectedCategory = "modules";
            renderPage();
          },
          items: installations.map((installation) => {
            const definition = localizeLocalModuleCopy(installation.definition);
            return {
              id: definition.id,
              label: definition.name,
              detail: installation.enabled ? t("common.enabled") : t("common.disabled"),
              mark: moduleInitial(definition.name),
              selected: selectedCategory === "modules" && selectedModuleId === definition.id,
              onSelect: () => {
                selectedCategory = "modules";
                selectedModuleId = definition.id;
                renderPage();
              }
            };
          })
        }),
        createConfigurationDirectory({
          title: t("block.download"),
          label: t("block.download"),
          editorId: "block-editor",
          active: selectedCategory === "download",
          emptyLabel: "",
          onSelect: () => {
            selectedCategory = "download";
            renderPage();
          },
          items: [
            {
              id: "download",
              label: t("block.download"),
              detail: t("block.openReleases"),
              mark: icon("shield"),
              selected: selectedCategory === "download",
              onSelect: () => {
                selectedCategory = "download";
                renderPage();
              }
            }
          ]
        })
      ],
      content: [
        element("div", {
          className: "block-library",
          children:
            selectedCategory === "download"
              ? [createDownloadPanel()]
              : [createWarnings(), selected ? createModuleCard(selected) : createEmptyState()]
        })
      ]
    });
    app.replaceChildren(
      createShell(
        element("div", {
          className: "block-content",
          children: [
            element("header", {
              className: "block-heading page-heading",
              children: [
                element("h1", { className: "page-title", text: t("block.title") }),
                importButton
              ]
            }),
            workspace.workspace
          ]
        })
      )
    );
    releaseSidebarSizing = workspace.mount();
  });
}

function createDownloadPanel(): HTMLElement {
  return element("section", {
    className: "card block-download",
    attrs: { "aria-labelledby": "block-download-title" },
    children: [
      element("div", {
        className: "block-download__copy",
        children: [
          element("span", { className: "block-download__icon", children: [icon("shield")] }),
          element("div", {
            children: [
              element("h2", { attrs: { id: "block-download-title" }, text: t("block.download") }),
              element("p", { text: t("block.downloadDescription") })
            ]
          })
        ]
      }),
      element("div", {
        className: "block-download__actions",
        children: [
          externalLink(LOCAL_MODULE_LINKS.catalog, t("block.openCatalog"), "btn btn--soft"),
          externalLink(LOCAL_MODULE_LINKS.releases, t("block.openReleases")),
          externalLink(LOCAL_MODULE_LINKS.guide, t("block.openGuide"))
        ]
      }),
      createLocalModuleDisclaimer()
    ]
  });
}

function createWarnings(): HTMLElement | null {
  if (!localModules || localModules.runtime.warnings.length === 0) return null;
  return element("ul", {
    className: "home-module-warnings",
    attrs: { role: "status" },
    children: localModules.runtime.warnings.map((warning) =>
      element("li", { text: describeLocalModuleWarning(warning) })
    )
  });
}

function createEmptyState(): HTMLElement {
  return element("section", {
    className: "card block-empty",
    children: [
      element("span", { className: "block-empty__icon", children: [icon("shield")] }),
      element("h3", { text: t("settings.noModules") }),
      element("p", { text: t("block.emptyDescription") })
    ]
  });
}

function createModuleCard(installation: LocalModuleInstallation): HTMLElement {
  const definition = localizeLocalModuleCopy(installation.definition);
  const { enabled } = installation;
  const filterTimePeriods = scheduleSettings
    ? configuredFilterTimePeriods(scheduleSettings, definition)
    : [];
  const profile = localModules?.profile ?? "normal";
  const moduleToggle = createToggle(
    t("settings.enableModule", { module: definition.name }),
    enabled,
    `local-module-${definition.id}`
  );
  moduleToggle.input.addEventListener("change", () => {
    void setModuleEnabled(definition.id, moduleToggle.input.checked, moduleToggle.input);
  });
  const removeButton = element("button", {
    className: "btn btn--danger",
    text: t("common.delete"),
    attrs: { type: "button" }
  });
  removeButton.addEventListener("click", () => {
    openConfirmation({
      title: t("settings.moduleRemoveQuestion", { module: definition.name }),
      detail: t("settings.moduleRemoveDetail"),
      actionLabel: t("common.delete"),
      onConfirm: async () => {
        localModules = await sendRequest({ type: "REMOVE_LOCAL_MODULE", moduleId: definition.id });
        toast(t("settings.moduleRemoved"));
        renderPage();
      }
    });
  });

  return element("article", {
    className: "card block-module",
    attrs: { "aria-labelledby": `module-title-${definition.id}` },
    children: [
      element("header", {
        className: "block-module__header",
        children: [
          element("span", {
            className: "block-module__mark",
            text: moduleInitial(definition.name)
          }),
          element("div", {
            className: "block-module__copy",
            children: [
              element("div", {
                className: "block-module__title-line",
                children: [
                  element("h3", {
                    attrs: { id: `module-title-${definition.id}` },
                    text: definition.name
                  }),
                  element("span", {
                    className: `status-chip${enabled ? " status-chip--success" : ""}`,
                    text: enabled ? t("common.enabled") : t("common.disabled")
                  })
                ]
              }),
              element("p", {
                text: definition.description || `${definition.id} · ${definition.version}`
              }),
              element("small", {
                text: `${t("settings.moduleSites")}: ${definition.matches.join(", ")}`
              })
            ]
          }),
          element("div", {
            className: "block-module__actions",
            children: [moduleToggle.label, removeButton]
          })
        ]
      }),
      element("section", {
        className: "block-module__filters",
        attrs: { "aria-label": t("block.filterSettings", { module: definition.name }) },
        children: [
          element("header", {
            children: [
              element("h4", { text: t("block.filterTitle") }),
              element("p", { text: t("block.filterDescription") })
            ]
          }),
          definition.filterGroups.length > 0
            ? element("div", {
                className: "block-filter-list",
                children: definition.filterGroups.map((group) => {
                  const checked = !installation.disabledFilterGroupIds.includes(group.id);
                  const toggle = createToggle(
                    t("block.enableFilter", { filter: group.name }),
                    checked,
                    `module-filter-${definition.id}-${group.id}`
                  );
                  toggle.input.disabled = !enabled;
                  toggle.input.addEventListener("change", () => {
                    void setFilterGroupEnabled(
                      definition.id,
                      group.id,
                      toggle.input.checked,
                      toggle.input
                    );
                  });
                  return element("div", {
                    className: `block-filter-row${enabled && checked ? "" : " block-filter-row--disabled"}`,
                    children: [
                      element("div", {
                        className: "block-filter-row__header",
                        children: [
                          element("div", {
                            className: "block-filter-row__copy",
                            children: [
                              element("strong", { text: group.name }),
                              group.description ? element("p", { text: group.description }) : null
                            ]
                          }),
                          toggle.label
                        ]
                      }),
                      createFilterTimePeriodPicker({
                        filterName: group.name,
                        choices: filterTimePeriods,
                        selected: filterScheduleReferences(
                          installation.filterGroupSchedules,
                          group.id
                        ),
                        disabled: !enabled || !checked,
                        onChange: async (periods) => {
                          localModules = await sendRequest({
                            type: "SET_LOCAL_MODULE_FILTER_SCHEDULE",
                            moduleId: definition.id,
                            groupId: group.id,
                            periods,
                            profile
                          });
                        }
                      })
                    ]
                  });
                })
              })
            : element("p", {
                className: "block-module__no-filters",
                text: t("block.noFilterGroups")
              })
        ]
      }),
      element("footer", {
        className: "block-module__meta",
        children: [
          detail(t("settings.moduleAuthor"), definition.author),
          detail(t("settings.moduleVersion"), definition.version),
          detail(
            t("settings.moduleCapabilities"),
            definition.capabilities.length > 0
              ? formatCapabilities(definition.capabilities)
              : t("settings.metadataOnly")
          )
        ]
      })
    ]
  });
}

function detail(label: string, value: string): HTMLElement {
  return element("span", {
    children: [element("strong", { text: `${label}: ` }), document.createTextNode(value)]
  });
}

function openImportDialog(): void {
  let candidate: LocalModuleDefinition | null = null;
  let selectionGeneration = 0;
  const allowsScripts = localModuleAllowsUserScripts(resolveLocalModulePlatform());
  const fileInput = element("input", {
    className: "input",
    attrs: {
      type: "file",
      multiple: true,
      accept: allowsScripts
        ? ".json,.css,.user.js,application/json,text/css,text/javascript"
        : ".json,.css,application/json,text/css",
      "data-testid": "module-import-files"
    }
  });
  const preview = element("div", {
    className: "home-import-preview",
    attrs: { role: "status", "aria-live": "polite" },
    text: t("settings.importInitial")
  });
  const acknowledgement = element("input", {
    attrs: { type: "checkbox", "aria-label": t("settings.importDisclaimer") }
  });
  acknowledgement.disabled = true;
  const confirm = element("button", {
    className: "btn btn--primary",
    text: t("settings.importConfirm"),
    attrs: { type: "button", "data-testid": "module-import-confirm" }
  });
  confirm.disabled = true;
  const dialog = element("dialog", {
    className: "dialog home-import-dialog",
    attrs: {
      "aria-labelledby": "module-import-title",
      "aria-describedby": "module-import-description"
    },
    children: [
      element("div", {
        className: "home-import-dialog__surface",
        children: [
          element("header", {
            className: "home-import-dialog__header",
            children: [
              element("div", {
                children: [
                  element("h2", {
                    attrs: { id: "module-import-title" },
                    text: t("settings.importTitle")
                  }),
                  element("p", {
                    attrs: { id: "module-import-description" },
                    text: t("settings.importDescription")
                  })
                ]
              }),
              closeButton(() => dialog.close())
            ]
          }),
          element("div", {
            className: "home-import-dialog__body",
            children: [
              createLocalModuleImportGuidance(),
              element("label", {
                className: "home-import-picker",
                children: [
                  element("strong", { text: t("settings.importFiles") }),
                  element("span", {
                    text: t(
                      allowsScripts
                        ? "settings.importFilesDescription"
                        : "settings.importDeclarativeFilesDescription"
                    )
                  }),
                  fileInput
                ]
              }),
              element("p", {
                className: "home-import-local-note",
                text: t(
                  allowsScripts
                    ? "settings.importPlatformChromium"
                    : "settings.importPlatformDeclarative"
                )
              }),
              preview,
              element("p", {
                className: "home-import-local-note",
                text: t("settings.importLocal")
              }),
              createLocalModuleDisclaimer(),
              element("label", {
                className: "home-import-acknowledgement",
                children: [
                  acknowledgement,
                  element("span", { text: t("settings.importDisclaimer") })
                ]
              })
            ]
          }),
          element("footer", {
            className: "home-import-dialog__footer",
            children: [
              element("button", {
                className: "btn",
                text: t("common.cancel"),
                attrs: { type: "button" }
              }),
              confirm
            ]
          })
        ]
      })
    ]
  });
  const cancel = dialog.querySelector<HTMLButtonElement>("footer .btn:not(.btn--primary)");
  cancel?.addEventListener("click", () => dialog.close());
  fileInput.addEventListener("change", () => {
    const generation = ++selectionGeneration;
    candidate = null;
    acknowledgement.checked = false;
    acknowledgement.disabled = true;
    confirm.disabled = true;
    preview.textContent = t("settings.importReading");
    preview.setAttribute("aria-busy", "true");
    void (async () => {
      try {
        const files = await Promise.all(
          [...(fileInput.files ?? [])].map(async (file): Promise<LocalModuleFile> => ({
            name: file.name,
            text: await file.text()
          }))
        );
        if (generation !== selectionGeneration || !dialog.isConnected) return;
        const parsed = parseLocalModuleFiles(files);
        if (
          parsed.userScript.trim() &&
          !localModuleAllowsUserScripts(resolveLocalModulePlatform())
        ) {
          preview.textContent = t("settings.userScriptUnsupported");
          return;
        }
        candidate = parsed;
        const value = createLocalModuleImportPreview(localizeLocalModuleCopy(candidate));
        preview.replaceChildren(
          element("strong", { text: `${value.name} ${value.version}` }),
          element("p", {
            text: `${t("settings.importSelectedFiles")}: ${files.map(({ name }) => name).join(", ")}`
          }),
          element("p", { text: `${t("settings.moduleAuthor")}: ${value.author}` }),
          element("p", { text: `${t("settings.moduleSites")}: ${value.matches.join(", ")}` }),
          element("p", {
            text: `${t("settings.moduleCapabilities")}: ${formatCapabilities(value.capabilities) || t("settings.metadataOnly")}`
          })
        );
        acknowledgement.disabled = false;
      } catch (error) {
        if (generation !== selectionGeneration || !dialog.isConnected) return;
        preview.textContent =
          error instanceof LocalModuleImportError
            ? describeImportError(error)
            : describeError(error);
      } finally {
        if (generation === selectionGeneration) preview.removeAttribute("aria-busy");
      }
    })();
  });
  acknowledgement.addEventListener("change", () => {
    confirm.disabled = !candidate || !acknowledgement.checked;
  });
  confirm.addEventListener("click", () => {
    if (!candidate || !acknowledgement.checked || fileInput.disabled) return;
    fileInput.disabled = true;
    acknowledgement.disabled = true;
    void importModule(candidate, confirm, dialog).finally(() => {
      fileInput.disabled = false;
      acknowledgement.disabled = !candidate;
      confirm.disabled = !candidate || !acknowledgement.checked;
    });
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

async function importModule(
  definition: LocalModuleDefinition,
  button: HTMLButtonElement,
  dialog: HTMLDialogElement
): Promise<void> {
  setButtonBusy(button, true);
  try {
    if (
      definition.userScript.trim() &&
      !localModuleAllowsUserScripts(resolveLocalModulePlatform())
    ) {
      toast(t("settings.userScriptUnsupported"), "error");
      return;
    }
    const granted = await requestLocalModulePermissions(
      definition.matches,
      definition.userScript.trim().length > 0
    );
    if (!granted) throw new Error(t("settings.permissionDenied"));
    for (const origin of originsFromLocalModule(definition)) await addManagedSite(origin);
    await sendRequest({
      type: "IMPORT_LOCAL_MODULE",
      module: definition,
      riskAcknowledgement: LOCAL_MODULE_IMPORT_RISK_CODE
    });
    localModules = await sendRequest({
      type: "SET_LOCAL_MODULE_ENABLED",
      moduleId: definition.id,
      enabled: true
    });
    selectedModuleId = definition.id;
    selectedCategory = "modules";
    dialog.close();
    toast(t("settings.moduleImported"));
    renderPage();
  } catch (error) {
    toast(describeError(error), "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function setModuleEnabled(
  moduleId: string,
  enabled: boolean,
  input: HTMLInputElement
): Promise<void> {
  input.disabled = true;
  try {
    localModules = await sendRequest({
      type: "SET_LOCAL_MODULE_ENABLED",
      moduleId,
      enabled,
      profile: localModules?.profile ?? "normal"
    });
    toast(enabled ? t("settings.moduleEnabled") : t("settings.moduleDisabled"));
    renderPage();
  } catch (error) {
    toast(describeError(error), "error");
    await loadPage();
  }
}

async function setFilterGroupEnabled(
  moduleId: string,
  groupId: string,
  enabled: boolean,
  input: HTMLInputElement
): Promise<void> {
  input.disabled = true;
  try {
    localModules = await sendRequest({
      type: "SET_LOCAL_MODULE_FILTER_ENABLED",
      profile: localModules?.profile ?? "normal",
      moduleId,
      groupId,
      enabled
    });
    toast(t("common.saved"));
    renderPage();
  } catch (error) {
    toast(describeError(error), "error");
    await loadPage();
  }
}

function formatCapabilities(capabilities: LocalModuleDefinition["capabilities"]): string {
  return capabilities
    .map((capability) =>
      t(
        capability === "domain-policy"
          ? "settings.capability.domainPolicy"
          : capability === "hide-elements"
            ? "settings.capability.hideElements"
            : capability === "css"
              ? "settings.capability.css"
              : "settings.capability.userScript"
      )
    )
    .join(", ");
}

function describeImportError(error: LocalModuleImportError): string {
  if (error.code === "selection-required" || error.code === "file-limit-exceeded") {
    return t("settings.importError.selection");
  }
  if (["invalid-file", "duplicate-file", "unsupported-file-type"].includes(error.code)) {
    return t("settings.importError.file");
  }
  if (error.code === "invalid-reference" || error.code === "missing-reference") {
    return t("settings.importError.reference");
  }
  if (error.code === "metadata-required" || error.code === "metadata-conflict") {
    return t("settings.importError.metadata");
  }
  if (["unsafe-css", "unsafe-user-script", "unsupported-dnr"].includes(error.code)) {
    return t("settings.importError.unsafe");
  }
  return t("settings.importError.manifest");
}

function describeLocalModuleWarning(warning: LocalModuleWarningCode): string {
  return t(
    warning === "unsafe-user-script"
      ? "settings.warning.unsafeUserScript"
      : warning === "safari-user-script-disabled" || warning === "platform-user-script-disabled"
        ? "settings.warning.platformUserScriptDisabled"
        : warning === "user-scripts-api-unavailable"
          ? "settings.warning.userScriptsApiUnavailable"
          : warning === "user-scripts-permission-required"
            ? "settings.warning.userScriptsPermissionRequired"
            : "settings.warning.legacyDnrCleanupFailed"
  );
}

function renderState(label: string, busy: boolean): void {
  releaseSidebarSizing?.();
  releaseSidebarSizing = undefined;
  app.replaceChildren(
    createShell(
      element("section", {
        className: "card state-view block-state",
        attrs: { ...(busy ? { "aria-busy": "true" } : {}), "aria-label": label },
        children: [element("h2", { text: label })]
      })
    )
  );
}

function renderError(message: string): void {
  releaseSidebarSizing?.();
  releaseSidebarSizing = undefined;
  const retry = element("button", {
    className: "btn btn--primary",
    text: t("common.retry"),
    attrs: { type: "button" }
  });
  retry.addEventListener("click", () => void loadPage());
  app.replaceChildren(
    createShell(
      element("section", {
        className: "card state-view block-state",
        attrs: { role: "alert" },
        children: [
          element("h2", { text: t("block.loadFailed") }),
          element("p", { text: message }),
          retry
        ]
      })
    )
  );
}

function createShell(content: HTMLElement): HTMLElement {
  return element("div", {
    className: "block-shell app-shell",
    children: [createPageNavigation({ currentPage: "block" }), content]
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
  return {
    input,
    label: element("label", {
      className: "switch",
      children: [input, element("span", { className: "sr-only", text: labelText })]
    })
  };
}

function closeButton(close: () => void): HTMLButtonElement {
  const button = element("button", {
    className: "btn btn--icon",
    attrs: { type: "button", title: t("common.close"), "aria-label": t("common.close") },
    children: [icon("close")]
  });
  button.addEventListener("click", close);
  return button;
}

function moduleInitial(name: string): string {
  return [...name.trim()][0]?.toLocaleUpperCase() ?? "M";
}

interface ConfirmationOptions {
  title: string;
  detail: string;
  actionLabel: string;
  onConfirm(): Promise<void>;
}

function openConfirmation(options: ConfirmationOptions): void {
  const cancel = element("button", {
    className: "btn",
    text: t("common.cancel"),
    attrs: { type: "button" }
  });
  const confirm = element("button", {
    className: "btn btn--danger",
    text: options.actionLabel,
    attrs: { type: "button" }
  });
  const dialog = element("dialog", {
    className: "dialog block-confirmation",
    attrs: { "aria-labelledby": "block-confirmation-title" },
    children: [
      element("h2", { attrs: { id: "block-confirmation-title" }, text: options.title }),
      element("p", { text: options.detail }),
      element("div", { className: "dialog__actions", children: [cancel, confirm] })
    ]
  });
  cancel.addEventListener("click", () => dialog.close());
  confirm.addEventListener("click", () => {
    void (async () => {
      setButtonBusy(confirm, true);
      try {
        await options.onConfirm();
        dialog.close();
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
