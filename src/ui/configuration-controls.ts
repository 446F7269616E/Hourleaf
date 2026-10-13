import { t, type MessageKey } from "../shared/i18n";
import type { Weekday } from "../shared/types";
import { element } from "../styles/dom";

const WEEKDAYS: ReadonlyArray<{ day: Weekday; short: MessageKey; label: MessageKey }> = [
  { day: 1, short: "weekday.mon.short", label: "weekday.mon" },
  { day: 2, short: "weekday.tue.short", label: "weekday.tue" },
  { day: 3, short: "weekday.wed.short", label: "weekday.wed" },
  { day: 4, short: "weekday.thu.short", label: "weekday.thu" },
  { day: 5, short: "weekday.fri.short", label: "weekday.fri" },
  { day: 6, short: "weekday.sat.short", label: "weekday.sat" },
  { day: 0, short: "weekday.sun.short", label: "weekday.sun" }
];

/** Shared presentation primitives for website and tab-group configuration. */
export function createConfigurationField(
  label: string,
  control: HTMLElement,
  suffix?: string
): HTMLLabelElement {
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

export function createConfigurationToggle(
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

export function createConfigurationDayPicker(
  label: string,
  days: readonly Weekday[]
): {
  field: HTMLFieldSetElement;
  inputs: Array<{ day: Weekday; input: HTMLInputElement }>;
  selectedDays(): Weekday[];
} {
  const inputs = WEEKDAYS.map((day) => ({
    ...day,
    input: element("input", {
      attrs: { type: "checkbox", checked: days.includes(day.day), "aria-label": t(day.label) }
    })
  }));
  const field = element("fieldset", {
    className: "field schedule-weekdays",
    children: [
      element("legend", { text: label }),
      element("div", {
        className: "day-picker",
        children: inputs.map(({ input, short, label: labelKey }) =>
          element("label", {
            attrs: { title: t(labelKey) },
            children: [input, t(short)]
          })
        )
      })
    ]
  });
  return {
    field,
    inputs,
    selectedDays: () => inputs.filter(({ input }) => input.checked).map(({ day }) => day)
  };
}

export function formatConfigurationDays(days: readonly Weekday[]): string {
  if (days.length === 7) return t("options.everyDay");
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day as Weekday)))
    return t("options.weekdays");
  if (days.length === 2 && days.includes(0) && days.includes(6)) return t("options.weekend");
  return WEEKDAYS.filter(({ day }) => days.includes(day))
    .map(({ short }) => t(short))
    .join(" · ");
}
