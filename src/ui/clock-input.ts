import { t } from "../shared/i18n";
import { timeToMinutes } from "../shared/schedule";
import { element } from "../styles/dom";

/** Native time inputs follow OS clock preferences; this control always uses HH:mm. */
export function createClockInput(value: string): HTMLInputElement {
  const input = element("input", {
    className: "input clock-input",
    attrs: {
      type: "text",
      inputmode: "numeric",
      autocomplete: "off",
      required: true,
      maxlength: 5,
      pattern: "(?:[01][0-9]|2[0-3]):[0-5][0-9]",
      placeholder: "HH:mm",
      title: t("common.clock24Hint"),
      value
    }
  });
  const normalize = (onBlur: boolean) => {
    let next = input.value;
    if (/^\d{4}$/.test(next)) next = `${next.slice(0, 2)}:${next.slice(2)}`;
    else if (onBlur && /^\d{3}$/.test(next)) next = `0${next[0]}:${next.slice(1)}`;
    else if (onBlur) {
      const match = /^(\d{1,2}):(\d{1,2})$/.exec(next);
      if (match) next = `${match[1]!.padStart(2, "0")}:${match[2]!.padStart(2, "0")}`;
    }
    if (next !== input.value && timeToMinutes(next) !== null) {
      input.value = next;
      if (onBlur) input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  input.addEventListener("input", () => normalize(false));
  input.addEventListener("blur", () => normalize(true));
  return input;
}

export function clockRangeHint(start: string, end: string): string {
  if (timeToMinutes(start) === null || timeToMinutes(end) === null) return "";
  return start === end
    ? t("options.fullDayNote")
    : start > end
      ? t("options.crossMidnightNote")
      : "";
}
