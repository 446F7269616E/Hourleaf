import { clockRangeHint } from "./clock-input";
import { createTimePeriodControls } from "./time-period-controls";
import { preserveConfigurationPosition } from "./configuration-workspace";
import { createConfigurationDirectory } from "./configuration-directory";
import { storageAddChangeListener } from "../shared/browser";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { sendRequest } from "../shared/messages";
import { t } from "../shared/i18n";
import {
  MAX_TAB_GROUP_WHITELIST_RULES,
  MAX_TAB_GROUP_WHITELIST_PERIODS,
  tabGroupWhitelistPeriods,
  parseTabGroupWhitelistPeriod,
  type TabGroupWhitelistPeriod,
  parseTabGroupWhitelistRule,
  type TabGroupWhitelistRule,
  type TabGroupWhitelistState
} from "../shared/tab-group-whitelist";
import { describeError, element, icon, setButtonBusy, toast, type IconName } from "../styles/dom";
import {
  createConfigurationField as field,
  createConfigurationToggle,
  formatConfigurationDays
} from "./configuration-controls";

const refreshers = new Set<() => boolean>();
let watchingStorage = false;
let cachedState: TabGroupWhitelistState | undefined;
let writeQueue: Promise<void> = Promise.resolve();
let pendingWrites = 0;

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
  let state = cachedState;
  let generation = 0;

  async function refresh(): Promise<void> {
    const current = ++generation;
    try {
      if (pendingWrites > 0) await writeQueue;
      if (current !== generation) return;
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
    cachedState = state;
    if (directory.isConnected) preserveConfigurationPosition(document.body, renderContent);
  }

  function renderContent(): void {
    if (!state) return;
    cachedState = state;
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
        items: state.rules.map(({ rule, groupId, bindingStatus }) => ({
          id: rule.id,
          label: rule.name,
          detail:
            groupId === null
              ? unboundLabel(bindingStatus)
              : t("groups.periodCount", { count: tabGroupWhitelistPeriods(rule).length }),
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
                text: group
                  ? groupLabel(group, state.groups)
                  : unboundLabel(selected.bindingStatus),
                className: group ? "" : "tab-group-whitelist__unbound"
              })
            ]
          }),
          element("div", {
            className: "site-context__meta",
            children: [button(t("groups.edit"), () => void openEditor(selected.rule)), remove]
          })
        ]
      }),
      section
    );
    const periods = tabGroupWhitelistPeriods(selected.rule);
    const addPeriod = button(t("options.addPeriod"), () => openPeriodEditor(selected.rule.id));
    addPeriod.prepend(icon("plus"));
    addPeriod.disabled = periods.length >= MAX_TAB_GROUP_WHITELIST_PERIODS;
    section.replaceChildren(
      element("header", {
        className: "period-target__header",
        children: [
          element("div", {
            children: [
              element("h3", { text: t("options.timePeriods") }),
              element("p", { text: t("groups.periodCount", { count: periods.length }) })
            ]
          }),
          element("div", {
            className: "period-target__actions",
            children: [addPeriod, iconButton("refresh", t("groups.refresh"), () => void refresh())]
          })
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
      periods.length > 0
        ? element("ul", {
            className: "period-list",
            children: periods.map((period) => createPeriodItem(selected.rule.id, period))
          })
        : element("p", { className: "schedule-empty", text: t("options.noPeriods") })
    );
  }

  function createPeriodItem(ruleId: string, period: TabGroupWhitelistPeriod): HTMLElement {
    const toggle = createConfigurationToggle(
      `${t("common.enabled")} ${period.name}`,
      period.enabled
    );
    toggle.input.addEventListener("change", () => {
      const checked = toggle.input.checked;
      toggle.input.disabled = true;
      void updatePeriods(ruleId, (periods) =>
        periods.map((entry) => (entry.id === period.id ? { ...entry, enabled: checked } : entry))
      )
        .catch((error) => {
          toggle.input.checked = period.enabled;
          toast(describeError(error), "error");
        })
        .finally(() => {
          toggle.input.disabled = false;
        });
    });
    return element("li", {
      className: "period-item",
      dataset: { enabled: String(period.enabled), behavior: "always-allow" },
      children: [
        element("div", {
          className: "period-item__identity",
          children: [
            element("span", { className: "period-item__status", attrs: { "aria-hidden": true } }),
            element("div", {
              children: [
                element("strong", { text: period.name }),
                element("span", { text: periodSummary(period) }),
                element("small", { text: t("options.period.alwaysAllow") })
              ]
            })
          ]
        }),
        element("div", {
          className: "period-item__actions",
          children: [
            toggle.label,
            iconButton("edit", `${t("common.edit")} ${period.name}`, () =>
              openPeriodEditor(ruleId, period)
            ),
            iconButton(
              "trash",
              `${t("common.delete")} ${period.name}`,
              (control) => {
                setButtonBusy(control, true);
                return updatePeriods(ruleId, (periods) =>
                  periods.filter(({ id }) => id !== period.id)
                )
                  .catch((error) => toast(describeError(error), "error"))
                  .finally(() => setButtonBusy(control, false));
              },
              true
            )
          ]
        })
      ]
    });
  }

  function enqueueWrite(action: () => Promise<void>): Promise<void> {
    pendingWrites++;
    generation++;
    const write = writeQueue.then(action).finally(() => {
      pendingWrites--;
    });
    writeQueue = write.catch(() => undefined);
    return write;
  }

  function updatePeriods(
    ruleId: string,
    update: (periods: TabGroupWhitelistPeriod[]) => TabGroupWhitelistPeriod[]
  ): Promise<void> {
    return enqueueWrite(async () => {
      state = await sendRequest({ type: "GET_TAB_GROUP_WHITELIST" });
      const current = state.rules.find(({ rule }) => rule.id === ruleId)?.rule;
      if (!current) throw new Error(t("common.actionFailed"));
      const periods = update(tabGroupWhitelistPeriods(current));
      if (periods.length > MAX_TAB_GROUP_WHITELIST_PERIODS)
        throw new Error(t("options.periodLimitReached"));
      state = await sendRequest({
        type: "SAVE_TAB_GROUP_WHITELIST",
        rule: { ...current, enabled: true, timePeriods: periods }
      });
      render();
    });
  }

  function openPeriodEditor(ruleId: string, existing?: TabGroupWhitelistPeriod): void {
    const current = state?.rules.find(({ rule }) => rule.id === ruleId)?.rule;
    if (!current) return;
    const initial = existing ?? {
      id: crypto.randomUUID(),
      name: t("options.defaultPeriodName"),
      enabled: true,
      days: [0, 1, 2, 3, 4, 5, 6] as const,
      startTime: "00:00",
      endTime: "00:00"
    };
    const controls = createTimePeriodControls({ ...initial, days: [...initial.days] }, 80);
    const { name, start, end, dayPicker, enabled } = controls;
    const note = element("p", { className: "schedule-note", attrs: { role: "status" } });
    const updateNote = () => {
      note.textContent = clockRangeHint(start.value, end.value);
    };
    start.addEventListener("input", updateNote);
    end.addEventListener("input", updateNote);
    updateNote();
    const save = button(existing ? t("common.save") : t("common.add"), () => undefined);
    save.type = "submit";
    save.classList.add("btn--primary");
    const dialog = element("dialog", {
      className: "dialog tab-group-whitelist__dialog",
      attrs: { "aria-labelledby": "tab-group-period-title" }
    });
    const form = element("form", {
      children: [
        element("header", {
          className: "dialog__header",
          children: [
            element("h2", {
              text: existing ? t("options.editPeriod") : t("options.addPeriod"),
              attrs: { id: "tab-group-period-title" }
            }),
            iconButton("close", t("common.close"), () => dialog.close())
          ]
        }),
        controls.nameField,
        dayPicker.field,
        controls.timeFields,
        controls.enabledField,
        note,
        element("footer", {
          className: "dialog__footer",
          children: [button(t("common.cancel"), () => dialog.close()), save]
        })
      ]
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const days = dayPicker.selectedDays();
      if (!days.length) {
        note.textContent = t("options.selectOneDay");
        dayPicker.inputs[0]?.input.focus();
        return;
      }
      const period = parseTabGroupWhitelistPeriod({
        id: initial.id,
        name: name.value.trim(),
        enabled: enabled.input.checked,
        days,
        startTime: start.value,
        endTime: end.value
      });
      if (!period) {
        note.textContent = t("groups.invalid");
        return;
      }
      setButtonBusy(save, true);
      void updatePeriods(ruleId, (periods) => {
        if (existing && !periods.some(({ id }) => id === existing.id))
          throw new Error(t("common.actionFailed"));
        return existing
          ? periods.map((entry) => (entry.id === existing.id ? period : entry))
          : [...periods, period];
      })
        .then(() => dialog.close())
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
  }

  async function removeRule(id: string, control: HTMLButtonElement): Promise<void> {
    if (!window.confirm(t("groups.removeConfirm"))) return;
    setButtonBusy(control, true);
    try {
      await enqueueWrite(async () => {
        state = await sendRequest({ type: "REMOVE_TAB_GROUP_WHITELIST", id });
        render();
      });
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
      const waiting =
        state.rules.find(({ rule }) => rule.id === existing?.id)?.bindingStatus === "waiting";
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
      let suggestedName = "";
      select.addEventListener("change", () => {
        if (existing) return;
        const group = state?.groups.find((entry) => String(entry.id) === select.value);
        const next = group ? (group.title.trim() || t("groups.untitled")).slice(0, 80) : "";
        // Follow the selected group until the user chooses a custom name.
        if (!name.value.trim() || name.value === suggestedName) name.value = next;
        suggestedName = next;
      });
      const note = element("p", {
        className: "schedule-note",
        attrs: { role: "status", "aria-live": "polite" }
      });
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
          field(t("groups.group"), select),
          field(t("groups.name"), name),
          ...(existing
            ? [
                element("p", {
                  className: "field__hint",
                  text: waiting
                    ? t("groups.waitingHint")
                    : binding === null
                      ? t("groups.unbound")
                      : t("groups.keepBindingHint")
                })
              ]
            : []),
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
          days: existing?.days ?? [0, 1, 2, 3, 4, 5, 6],
          startTime: existing?.startTime ?? "00:00",
          endTime: existing?.endTime ?? "00:00",
          ...(existing
            ? { timePeriods: tabGroupWhitelistPeriods(existing) }
            : {
                timePeriods: [
                  {
                    id: crypto.randomUUID(),
                    name: t("options.defaultPeriodName"),
                    enabled: true,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: "00:00",
                    endTime: "00:00"
                  }
                ]
              })
        });
        if (!rule) {
          note.textContent = t("groups.invalid");
          return;
        }
        setButtonBusy(save, true);
        void enqueueWrite(async () => {
          state = await sendRequest({ type: "GET_TAB_GROUP_WHITELIST" });
          const latest = state.rules.find(({ rule: candidate }) => candidate.id === rule.id)?.rule;
          if (existing && !latest) throw new Error(t("common.actionFailed"));
          state = await sendRequest({
            type: "SAVE_TAB_GROUP_WHITELIST",
            rule: latest
              ? { ...latest, name: rule.name, timePeriods: tabGroupWhitelistPeriods(latest) }
              : rule,
            ...(groupId !== undefined ? { groupId } : {})
          });
        })
          .then(() => {
            selectedRuleId = rule.id;
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
      if (existing) name.focus();
      else select.focus();
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
      if (
        changes[STORAGE_KEYS.settings] ||
        changes[STORAGE_KEYS.tabGroupBindings] ||
        changes[STORAGE_KEYS.tabGroupBindingRecords]
      )
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
  if (state) renderContent();
  void refresh();
  return { directory, editor, addButton };
}

function unboundLabel(status: TabGroupWhitelistState["rules"][number]["bindingStatus"]): string {
  return t(status === "waiting" ? "groups.waiting" : "groups.bindingExpired");
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

function periodSummary(rule: TabGroupWhitelistPeriod): string {
  return `${formatConfigurationDays(rule.days)} · ${rule.startTime}–${rule.endTime}${rule.startTime === rule.endTime ? ` (${t("groups.allDay")})` : rule.startTime > rule.endTime ? ` (${t("options.nextDay")})` : ""}`;
}
