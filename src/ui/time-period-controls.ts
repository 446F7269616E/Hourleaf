import { t } from "../shared/i18n";
import type { Weekday } from "../shared/types";
import { element } from "../styles/dom";
import { createClockInput } from "./clock-input";
import {
  createConfigurationDayPicker,
  createConfigurationField,
  createConfigurationToggle
} from "./configuration-controls";

/** Website and tab-group schedules edit the same name, weekdays, clock range and state. */
export function createTimePeriodControls(
  period: {
    name: string;
    enabled: boolean;
    days: Weekday[];
    startTime: string;
    endTime: string;
  },
  maxNameLength = 60
) {
  const name = element("input", {
    className: "input",
    attrs: {
      type: "text",
      value: period.name || t("options.defaultPeriodName"),
      maxlength: maxNameLength,
      required: true
    }
  });
  const start = createClockInput(period.startTime);
  const end = createClockInput(period.endTime);
  const dayPicker = createConfigurationDayPicker(t("options.periodDays"), period.days);
  const enabled = createConfigurationToggle(t("common.enabled"), period.enabled);
  return {
    name,
    start,
    end,
    dayPicker,
    enabled,
    nameField: createConfigurationField(t("options.periodName"), name),
    timeFields: element("div", {
      className: "time-fields",
      children: [
        createConfigurationField(t("options.periodStart"), start),
        element("span", { className: "time-fields__dash", text: t("options.periodTo") }),
        createConfigurationField(t("options.periodEnd"), end)
      ]
    }),
    enabledField: element("div", {
      className: "access-toggle-row",
      children: [element("strong", { text: t("common.enabled") }), enabled.label]
    })
  };
}
