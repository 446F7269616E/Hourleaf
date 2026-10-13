import { createClockInput, clockRangeHint } from "./clock-input";
import { createConfigurationDirectory } from "./configuration-directory";
import { storageAddChangeListener } from "../shared/browser";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { sendRequest } from "../shared/messages";
import { t } from "../shared/i18n";
import {
  MAX_TAB_GROUP_WHITELIST_RULES,
  parseTabGroupWhitelistRule,
  type TabGroupWhitelistRule,
  type TabGroupWhitelistState
} from "../shared/tab-group-whitelist";
import { describeError, element, icon, setButtonBusy, toast, type IconName } from "../styles/dom";
import {
  createConfigurationField as field,
  createConfigurationToggle,
  createConfigurationDayPicker,
  formatConfigurationDays
} from "./configuration-controls";

const refreshers = new Set<() => boolean>();
let watchingStorage = false;

/** Owns its own writes; ordinary website autosave cannot overwrite group rules. */
export function createTabGroupWhitelist(options: {
  active: boolean;
  selectedRuleId: string | null;
  onSelect(ruleId: string | null): void;
  onSelectionChange(ruleId: string | null): void;
}): { directory: HTMLElement; editor: HTMLElement; addButton: HTMLButtonElement } {
  const directory = element("div", { className: "options-group-directory" });
  const editor = element("div", { className: "options-site-editor" });
  let selectedRuleId = options.selectedRuleId;
  const section = element("section", {
    className: "card period-target tab-group-whitelist",
    attrs: { "aria-label": t("groups.title") }
  });
  const addButton = button(t("groups.add"), () => void openEditor());
  addButton.prepend(icon("plus"));
  let state: TabGroupWhitelistState | undefined;
  let generation = 0;

  async function refresh(): Promise<void> {
    const current = ++generation;
    try {
      const next = await sendRequest({ type: "GET_TAB_GROUP_WHITELIST" });
      if (current !== generation || !directory.isConnected) return;
      state = next;
      render();
    } catch (error) {
      if (current !== generation || !directory.isConnected) return;
      directory.replaceChildren(
        createConfigurationDirectory({
          title: t("groups.title"),
          label: t("groups.title"),
          items: [],
          emptyLabel: t("common.actionFailed"),
          active: options.active,
          onSelect: () => options.onSelect(null)
        })
      );
      editor.replaceChildren(
        element("section", {
          className: "card options-empty-site",
          children: [
            element("h2", { text: t("groups.title") }),
            element("p", { text: describeError(error), attrs: { role: "alert" } }),
            button(t("common.retry"), () => void refresh())
          ]
        })
      );
    }
  }

  function render(): void {
    if (!state) return;
    addButton.disabled = !state.supported || state.rules.length >= MAX_TAB_GROUP_WHITELIST_RULES;
    if (!state.rules.some(({ rule }) => rule.id === selectedRuleId)) {
      selectedRuleId = state.rules[0]?.rule.id ?? null;
      options.onSelectionChange(selectedRuleId);
    }
    directory.replaceChildren(
      createConfigurationDirectory({
        title: t("groups.title"),
        label: t("groups.title"),
        emptyLabel: t("groups.empty"),
        active: options.active,
        onSelect: () => options.onSelect(selectedRuleId),
        items: state.rules.map(({ rule, groupId }) => ({
          id: rule.id,
          label: rule.name,
          detail: groupId === null ? t("groups.bindingExpired") : periodSummary(rule),
          mark: icon("focus"),
          selected: options.active && rule.id === selectedRuleId,
          onSelect: () => options.onSelect(rule.id)
        }))
      })
    );
    const selected = state.rules.find(({ rule }) => rule.id === selectedRuleId);
    if (!selected) {
      editor.replaceChildren(
        element("section", {
          className: "card options-empty-site",
          children: [
            icon("plus"),
            element("h2", { text: t("groups.empty") }),
            ...(!state.supported
              ? [element("p", { text: t("groups.unsupported"), attrs: { role: "status" } })]
              : [])
          ]
        })
      );
      return;
    }
    const group = state.groups.find((entry) => entry.id === selected.groupId);
    const remove = button(t("common.delete"), (control) => removeRule(selected.rule.id, control));
    remove.classList.add("btn--danger");
    editor.replaceChildren(
      element("section", {
        className: "site-context card",
        children: [
          element("div", {
            children: [
              element("span", { className: "site-context__eyebrow", text: t("groups.current") }),
              element("h2", { text: selected.rule.name }),
              element("p", {
                text: group ? groupLabel(group, state.groups) : t("groups.bindingExpired"),
                className: group ? "" : "tab-group-whitelist__unbound"
              })
            ]
          }),
          element("div", { className: "site-context__meta", children: [remove] })
        ]
      }),
      section
    );
    section.replaceChildren(
      element("header", {
        className: "period-target__header",
        children: [
          element("div", {
            children: [
              element("h3", { text: t("options.timePeriods") }),
              element("p", { text: t("common.itemCount", { count: 1 }) })
            ]
          }),
          iconButton("refresh", t("groups.refresh"), () => void refresh())
        ]
      }),
      ...(!state.supported
        ? [
            element("p", {
              className: "schedule-empty",
              text: t("groups.unsupported"),
              attrs: { role: "status" }
            })
          ]
        : []),
      element("ul", {
        className: "period-list",
        children: [createRuleItem(selected)]
      })
    );
  }

  function createRuleItem({ rule, groupId }: TabGroupWhitelistState["rules"][number]): HTMLElement {
    const group = state?.groups.find((entry) => entry.id === groupId);
    const toggle = createConfigurationToggle(`${t("common.enabled")} ${rule.name}`, rule.enabled);
    toggle.input.addEventListener("change", () => {
      toggle.input.disabled = true;
      void sendRequest({
        type: "SAVE_TAB_GROUP_WHITELIST",
        rule: { ...rule, enabled: toggle.input.checked }
      })
        .then((next) => {
          state = next;
          render();
        })
        .catch((error) => {
          toggle.input.checked = rule.enabled;
          toast(describeError(error), "error");
        })
        .finally(() => {
          toggle.input.disabled = false;
        });
    });
    return element("li", {
      className: "period-item tab-group-whitelist__rule",
      dataset: {
        enabled: String(rule.enabled),
        behavior: "always-allow",
        bound: String(Boolean(group))
      },
      children: [
        element("div", {
          className: "period-item__identity",
          children: [
            element("span", {
              className: "period-item__status",
              attrs: { "aria-hidden": true }
            }),
            element("div", {
              children: [
                element("strong", { text: rule.name }),
                element("span", {
                  text: periodSummary(rule)
                }),
                element("small", {
                  text: group ? groupLabel(group, state?.groups) : t("groups.bindingExpired"),
                  className: group ? "" : "tab-group-whitelist__unbound"
                })
              ]
            })
          ]
        }),
        element("div", {
          className: "period-item__actions",
          children: [
            toggle.label,
            iconButton("edit", `${t("common.edit")} ${rule.name}`, () => void openEditor(rule)),
            iconButton(
              "trash",
              `${t("common.delete")} ${rule.name}`,
              (control) => removeRule(rule.id, control),
              true
            )
          ]
        })
      ]
    });
  }

  async function removeRule(id: string, control: HTMLButtonElement): Promise<void> {
    setButtonBusy(control, true);
    try {
      state = await sendRequest({ type: "REMOVE_TAB_GROUP_WHITELIST", id });
      render();
    } catch (error) {
      toast(describeError(error), "error");
    } finally {
      setButtonBusy(control, false);
    }
  }

  async function openEditor(existing?: TabGroupWhitelistRule): Promise<void> {
    try {
      await refresh();
      if (!state) return;
      const binding = state.rules.find(({ rule }) => rule.id === existing?.id)?.groupId;
      const name = element("input", {
        className: "input",
        attrs: { type: "text", required: true, maxlength: 80, value: existing?.name ?? "" }
      });
      const select = element("select", {
        className: "input",
        children: [
          element("option", {
            text: existing ? t("groups.keepBinding") : t("groups.select"),
            attrs: { value: "" }
          }),
          ...state.groups.map((group) =>
            element("option", {
              text: groupLabel(group, state?.groups),
              attrs: { value: String(group.id) }
            })
          )
        ]
      });
      select.required = !existing;
      select.disabled = !state.supported;
      const start = createClockInput(existing?.startTime ?? "09:00");
      const end = createClockInput(existing?.endTime ?? "18:00");
      const dayPicker = createConfigurationDayPicker(
        t("groups.days"),
        existing?.days ?? [0, 1, 2, 3, 4, 5, 6]
      );
      const note = element("p", {
        className: "schedule-note",
        attrs: { role: "status", "aria-live": "polite" }
      });
      const timeNote = element("p", { className: "field__hint", attrs: { "aria-live": "polite" } });
      const updateTimeNote = () => {
        timeNote.textContent = clockRangeHint(start.value, end.value);
        timeNote.hidden = !timeNote.textContent;
      };
      start.addEventListener("input", updateTimeNote);
      end.addEventListener("input", updateTimeNote);
      updateTimeNote();
      const save = button(t("common.save"), () => undefined);
      save.type = "submit";
      save.classList.add("btn--primary");
      const dialog = element("dialog", {
        className: "dialog tab-group-whitelist__dialog",
        attrs: { "aria-labelledby": "tab-group-rule-title" }
      });
      const close = iconButton("close", t("common.close"), () => dialog.close());
      const form = element("form", {
        children: [
          element("header", {
            className: "dialog__header",
            children: [
              element("h2", {
                text: existing ? t("groups.edit") : t("groups.add"),
                attrs: { id: "tab-group-rule-title" }
              }),
              close
            ]
          }),
          field(t("groups.name"), name),
          field(t("groups.group"), select),
          ...(existing
            ? [
                element("p", {
                  className: "field__hint",
                  text: binding === null ? t("groups.unbound") : t("groups.keepBindingHint")
                })
              ]
            : []),
          dayPicker.field,
          element("div", {
            className: "time-fields",
            children: [
              field(t("groups.start"), start),
              element("span", { className: "time-fields__dash", text: t("options.periodTo") }),
              field(t("groups.end"), end)
            ]
          }),
          timeNote,
          note,
          element("footer", {
            className: "dialog__footer",
            children: [button(t("common.cancel"), () => dialog.close()), save]
          })
        ]
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const groupId = select.value === "" ? undefined : Number(select.value);
        const group = state?.groups.find((entry) => entry.id === groupId);
        const rule = parseTabGroupWhitelistRule({
          id: existing?.id ?? crypto.randomUUID(),
          name: name.value.trim() || group?.title || t("groups.title"),
          enabled: existing?.enabled ?? true,
          days: dayPicker.selectedDays(),
          startTime: start.value,
          endTime: end.value
        });
        if (!rule) {
          note.textContent = t("groups.invalid");
          return;
        }
        setButtonBusy(save, true);
        void sendRequest({
          type: "SAVE_TAB_GROUP_WHITELIST",
          rule,
          ...(groupId !== undefined ? { groupId } : {})
        })
          .then((next) => {
            state = next;
            render();
            dialog.close();
            options.onSelect(rule.id);
            toast(t("common.saved"));
          })
          .catch((error) => {
            note.textContent = describeError(error);
          })
          .finally(() => setButtonBusy(save, false));
      });
      dialog.append(form);
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
      name.focus();
    } catch (error) {
      toast(describeError(error), "error");
    }
  }
  addButton.disabled = true;
  if (!watchingStorage) {
    watchingStorage = true;
    const refreshConnected = () => {
      for (const refreshIfConnected of refreshers)
        if (!refreshIfConnected()) refreshers.delete(refreshIfConnected);
    };
    storageAddChangeListener((changes) => {
      if (changes[STORAGE_KEYS.settings] || changes[STORAGE_KEYS.tabGroupBindings])
        refreshConnected();
    });
    window.addEventListener("focus", refreshConnected);
  }
  refreshers.add(() => {
    if (!directory.isConnected) return false;
    void refresh();
    return true;
  });
  directory.replaceChildren(
    createConfigurationDirectory({
      title: t("groups.title"),
      label: t("groups.title"),
      items: [],
      active: options.active,
      emptyLabel: t("options.loading"),
      onSelect: () => options.onSelect(selectedRuleId)
    })
  );
  editor.replaceChildren(
    element("section", {
      className: "card options-empty-site",
      attrs: { "aria-busy": true },
      children: [element("p", { text: t("options.loading") })]
    })
  );
  void refresh();
  return { directory, editor, addButton };
}

function button(text: string, action: (control: HTMLButtonElement) => unknown): HTMLButtonElement {
  const control = element("button", { className: "btn", text, attrs: { type: "button" } });
  control.addEventListener("click", () => {
    void action(control);
  });
  return control;
}

function iconButton(
  name: IconName,
  label: string,
  action: (control: HTMLButtonElement) => unknown,
  danger = false
): HTMLButtonElement {
  const control = button(label, action);
  control.classList.add("btn--icon");
  if (danger) control.classList.add("btn--danger");
  control.setAttribute("aria-label", label);
  control.title = label;
  control.replaceChildren(icon(name));
  return control;
}

function groupLabel(
  group: TabGroupWhitelistState["groups"][number],
  groups: TabGroupWhitelistState["groups"] = []
): string {
  const title = group.title || t("groups.untitled");
  const sameTitle = groups.filter((entry) => entry.title === group.title);
  if (sameTitle.length <= 1) return title;
  const labels = [title];
  if (new Set(sameTitle.map((entry) => entry.windowId)).size > 1) {
    const windows = [...new Set(groups.map((entry) => entry.windowId))].sort((a, b) => a - b);
    labels.push(t("groups.window", { id: windows.indexOf(group.windowId) + 1 }));
  }
  const sameWindow = sameTitle.filter((entry) => entry.windowId === group.windowId);
  if (sameWindow.length > 1)
    labels.push(
      t("groups.number", { number: sameWindow.findIndex((entry) => entry.id === group.id) + 1 })
    );
  return labels.join(" · ");
}

function periodSummary(rule: TabGroupWhitelistRule): string {
  return `${formatConfigurationDays(rule.days)} · ${rule.startTime}–${rule.endTime}${rule.startTime === rule.endTime ? ` (${t("groups.allDay")})` : rule.startTime > rule.endTime ? ` (${t("options.nextDay")})` : ""}`;
}
