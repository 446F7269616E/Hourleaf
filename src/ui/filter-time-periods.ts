import type { ConfiguredFilterTimePeriod } from "../modules/local/schedules";
import { MAX_FILTER_TIME_PERIODS } from "../modules/local/schedules";
import type { LocalModuleTimePeriodReference } from "../modules/local/types";
import { t } from "../shared/i18n";
import { describeError, element, icon, toast } from "../styles/dom";

interface FilterTimePeriodOptions {
  filterName: string;
  choices: readonly ConfiguredFilterTimePeriod[];
  selected: readonly LocalModuleTimePeriodReference[] | undefined;
  disabled: boolean;
  onChange(periods: LocalModuleTimePeriodReference[] | null): Promise<void>;
}

/** Inline reusable picker; keeps expansion, focus, and list position during saves. */
export function createFilterTimePeriodPicker(options: FilterTimePeriodOptions): HTMLElement {
  let selected = options.selected;
  const details = element("details", { className: "block-filter-periods" });
  const value = element("span", { className: "block-filter-periods__value" });
  const summary = element("summary", {
    attrs: { "aria-label": t("block.filterPeriodLabel", { filter: options.filterName }) },
    children: [
      element("span", {
        className: "block-filter-periods__label",
        text: t("block.activeTimePeriods")
      }),
      value,
      icon("chevron")
    ]
  });
  details.append(summary);
  let inputs = new Map<string, HTMLInputElement>();
  let list: HTMLElement | undefined;
  let panel: HTMLFieldSetElement | undefined;
  let saving = false;

  function render(): void {
    const scrollTop = list?.scrollTop ?? 0;
    inputs = new Map();
    value.textContent =
      selected === undefined
        ? t("block.anyTime")
        : selected.length === 0
          ? t("block.noSelectedPeriods")
          : t("block.selectedPeriods", { count: selected.length });
    summary.setAttribute(
      "aria-label",
      `${t("block.filterPeriodLabel", { filter: options.filterName })} · ${value.textContent}`
    );
    panel?.remove();
    panel = undefined;
    if (!details.open) return;
    const always = element("input", {
      attrs: {
        type: "checkbox",
        checked: selected === undefined,
        "data-testid": "filter-periods-unrestricted"
      }
    });
    inputs.set("always", always);
    const fieldset = element("fieldset", {
      attrs: {
        disabled: options.disabled,
        "aria-label": t("block.filterPeriodLabel", { filter: options.filterName })
      }
    });
    panel = fieldset;
    always.addEventListener("change", () => {
      void save(always.checked ? null : [], "always", fieldset);
    });
    const choices = options.choices.map((choice) => {
      const reference = { targetId: choice.targetId, periodId: choice.periodId };
      const key = referenceKey(reference);
      const checked = selected?.some((item) => referenceKey(item) === key) ?? false;
      const input = element("input", { attrs: { type: "checkbox", checked } });
      inputs.set(key, input);
      input.disabled = !checked && (selected?.length ?? 0) >= MAX_FILTER_TIME_PERIODS;
      input.addEventListener("change", () => {
        const next = (selected ?? []).filter((item) => referenceKey(item) !== key);
        if (input.checked) next.push(reference);
        void save(next, key, fieldset);
      });
      const period = choice.period;
      return element("label", {
        className: "block-filter-period-choice",
        children: [
          input,
          element("span", {
            children: [
              element("span", {
                className: "block-filter-period-choice__name",
                text: period.name || t("options.periodName")
              }),
              element("small", { text: `${choice.website} · ${choice.target}` }),
              element("small", {
                text: `${t("options.everyDay")} · ${period.startTime === period.endTime ? t("block.allDay") : `${period.startTime}–${period.endTime}`}`
              })
            ]
          })
        ]
      });
    });
    const missing = (selected ?? []).filter(
      (reference) =>
        !options.choices.some((choice) => referenceKey(choice) === referenceKey(reference))
    );
    list = element("div", {
      className: "block-filter-period-list",
      children: [
        ...choices,
        ...missing.map((reference) => {
          const key = referenceKey(reference);
          const input = element("input", { attrs: { type: "checkbox", checked: true } });
          inputs.set(key, input);
          input.addEventListener("change", () => {
            void save(
              (selected ?? []).filter((item) => referenceKey(item) !== key),
              key,
              fieldset
            );
          });
          return element("label", {
            className: "block-filter-period-choice",
            children: [input, element("span", { text: t("block.unavailablePeriod") })]
          });
        }),
        options.choices.length === 0
          ? element("p", {
              className: "block-filter-periods__empty",
              text: t("block.noTimePeriods")
            })
          : null
      ]
    });
    fieldset.append(
      element("label", {
        className: "block-filter-period-choice block-filter-period-choice--always",
        children: [always, t("block.anyTime")]
      }),
      list,
      element("p", { className: "block-filter-periods__hint", text: t("block.filterPeriodsHint") })
    );
    details.append(fieldset);
    list.scrollTop = scrollTop;
  }

  async function save(
    periods: LocalModuleTimePeriodReference[] | null,
    focusKey: string,
    fieldset: HTMLFieldSetElement
  ): Promise<void> {
    if (saving) return;
    saving = true;
    fieldset.disabled = true;
    details.setAttribute("aria-busy", "true");
    try {
      await options.onChange(periods);
      selected = periods ?? undefined;
      toast(t("common.saved"));
    } catch (error) {
      toast(describeError(error), "error");
    } finally {
      saving = false;
      details.removeAttribute("aria-busy");
      const restoreFocus =
        document.activeElement === document.body || details.contains(document.activeElement);
      render();
      if (restoreFocus)
        (inputs.get(focusKey) ?? inputs.get("always") ?? summary).focus({ preventScroll: true });
    }
  }

  details.addEventListener("toggle", () => {
    if (!saving) render();
  });
  render();
  return details;
}

function referenceKey(reference: LocalModuleTimePeriodReference): string {
  return JSON.stringify([reference.targetId, reference.periodId]);
}
