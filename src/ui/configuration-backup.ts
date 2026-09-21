import { formatLocalDate } from "../shared/analytics";
import {
  MAX_CONFIGURATION_BACKUP_BYTES,
  configurationBackupPermissionPatterns,
  parseConfigurationBackup,
  type ConfigurationBackupDocument
} from "../shared/configuration-backup";
import { t } from "../shared/i18n";
import { sendRequest } from "../shared/messages";
import { describeError, element, icon, setButtonBusy, toast } from "../styles/dom";
import { requestWebsitePermission } from "./site-management";

export interface ConfigurationBackupControlsOptions {
  beforeRun?: () => Promise<boolean>;
  afterImport?: () => Promise<void>;
}

export function createConfigurationBackupControls(
  options: ConfigurationBackupControlsOptions = {}
): HTMLElement[] {
  return [createImportButton(options), createExportButton(options)];
}

function createExportButton(options: ConfigurationBackupControlsOptions): HTMLButtonElement {
  const button = element("button", {
    className: "btn",
    attrs: { type: "button", "data-testid": "configuration-export-button" },
    text: t("options.backup.export")
  });
  button.addEventListener("click", () => {
    void (async () => {
      try {
        if (options.beforeRun && !(await options.beforeRun())) return;
        setButtonBusy(button, true, t("options.backup.exporting"));
        const backup = await sendRequest({ type: "GET_CONFIGURATION_BACKUP" });
        downloadConfigurationBackup(backup);
        toast(t("options.backup.exported"));
      } catch (error) {
        toast(describeError(error), "error");
      } finally {
        setButtonBusy(button, false);
      }
    })();
  });
  return button;
}

function createImportButton(options: ConfigurationBackupControlsOptions): HTMLButtonElement {
  const button = element("button", {
    className: "btn",
    attrs: { type: "button", "data-testid": "configuration-import-button" },
    text: t("options.backup.import")
  });
  button.addEventListener("click", () => {
    const input = element("input", {
      attrs: { type: "file", accept: ".json,application/json" }
    });
    input.hidden = true;
    input.addEventListener("cancel", () => input.remove());
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        input.remove();
        return;
      }
      void readConfigurationBackup(file)
        .then((backup) => openImportDialog(backup, options))
        .catch(() => toast(t("options.backup.invalid"), "error"))
        .finally(() => input.remove());
    });
    document.body.append(input);
    input.click();
  });
  return button;
}

async function readConfigurationBackup(file: File): Promise<ConfigurationBackupDocument> {
  if (file.size <= 0 || file.size > MAX_CONFIGURATION_BACKUP_BYTES) {
    throw new Error("Invalid configuration backup size");
  }
  return parseConfigurationBackup(JSON.parse(await file.text()) as unknown);
}

function openImportDialog(
  backup: ConfigurationBackupDocument,
  options: ConfigurationBackupControlsOptions
): void {
  const titleId = "configuration-backup-dialog-title";
  const cancel = element("button", {
    className: "btn",
    text: t("common.cancel"),
    attrs: { type: "button" }
  });
  const confirm = element("button", {
    className: "btn btn--primary",
    text: t("options.backup.confirm"),
    attrs: { type: "button", "data-testid": "configuration-import-confirm" }
  });
  const note = element("p", {
    className: "configuration-backup-dialog__status",
    attrs: { role: "status", "aria-live": "polite" }
  });
  const dialog = element("dialog", {
    className: "dialog configuration-backup-dialog",
    attrs: { "aria-labelledby": titleId },
    children: [
      element("h2", { text: t("options.backup.importTitle"), attrs: { id: titleId } }),
      element("p", { text: t("options.backup.importDescription") }),
      element("dl", {
        className: "configuration-backup-dialog__summary",
        children: [
          createSummaryItem(
            t("options.backup.websites"),
            Object.keys(backup.data.settings.sites).length
          ),
          createSummaryItem(t("options.backup.planItems"), backup.data.planQueue.items.length),
          createSummaryItem(
            t("options.backup.modulePreferences"),
            backup.data.localModules.preferences.length
          )
        ]
      }),
      element("p", {
        className: "configuration-backup-dialog__privacy",
        children: [icon("shield"), element("span", { text: t("options.backup.exclusions") })]
      }),
      note,
      element("div", { className: "dialog__actions", children: [cancel, confirm] })
    ]
  });
  cancel.addEventListener("click", () => dialog.close());
  confirm.addEventListener("click", () => {
    void (async () => {
      try {
        if (options.beforeRun && !(await options.beforeRun())) return;
        const localModules = await sendRequest({ type: "GET_LOCAL_MODULES" });
        const patterns = configurationBackupPermissionPatterns(backup, localModules.store);
        if (patterns.length > 0) {
          setButtonBusy(confirm, true, t("options.requestingPermission"));
          if (!(await requestWebsitePermission(patterns))) {
            note.textContent = t("options.backup.permissionDenied");
            return;
          }
        }
        setButtonBusy(confirm, true, t("options.backup.importing"));
        const result = await sendRequest({ type: "IMPORT_CONFIGURATION", backup });
        dialog.close();
        toast(
          result.runtimeWarningCount > 0
            ? t("options.backup.importedWithRuntimeWarning")
            : result.skippedLocalModulePreferenceCount > 0
              ? t("options.backup.importedWithSkipped", {
                  count: result.skippedLocalModulePreferenceCount
                })
              : t("options.backup.imported")
        );
        await options.afterImport?.();
      } catch {
        note.textContent = t("options.backup.importFailed");
      } finally {
        setButtonBusy(confirm, false);
      }
    })();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  confirm.focus();
}

function createSummaryItem(label: string, value: number): HTMLElement {
  return element("div", {
    children: [element("dt", { text: label }), element("dd", { text: String(value) })]
  });
}

function downloadConfigurationBackup(backup: ConfigurationBackupDocument): void {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" })
  );
  const link = element("a", {
    attrs: {
      href: url,
      download: `hourleaf-configuration-${formatLocalDate(new Date(backup.exportedAt))}.json`
    }
  });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
