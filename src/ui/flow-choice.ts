import { t } from "../shared/i18n";
import { element } from "../styles/dom";

type Continuation = { kind: "minutes"; minutes: number } | { kind: "video-end" };

/** One explicit choice and one submission; a resume retry never grants time twice. */
export function createFlowChoice(options: {
  videoAvailable: boolean;
  grant(continuation: Continuation): Promise<void>;
  resume(): Promise<void>;
  exclusive(run: () => Promise<void>): Promise<void>;
}): HTMLElement {
  let granted = false;
  let busy = false;
  const method = element("select", {
    className: "select",
    attrs: { "aria-label": t("pause.flowMethod") },
    children: [
      element("option", { text: t("pause.flowMinutes"), attrs: { value: "minutes" } }),
      ...(options.videoAvailable
        ? [element("option", { text: t("end.untilVideoEnd"), attrs: { value: "video-end" } })]
        : [])
    ]
  });
  const minutes = element("select", {
    className: "select",
    attrs: { "aria-label": t("end.extensionDuration") },
    children: Array.from({ length: 15 }, (_, index) =>
      element("option", {
        text: t("end.minuteOption", { minutes: index + 1 }),
        attrs: { value: index + 1, selected: index === 4 }
      })
    )
  });
  const minuteField = element("label", {
    className: "field",
    children: [element("span", { text: t("end.extendPrefix") }), minutes]
  });
  method.onchange = () => {
    minuteField.hidden = method.value !== "minutes";
  };
  const choices = element("fieldset", {
    className: "flow-choice__fields",
    children: [
      element("label", {
        className: "field",
        children: [element("span", { text: t("pause.flowMethod") }), method]
      }),
      minuteField
    ]
  });
  const feedback = element("p", {
    className: "end-unlock__feedback",
    attrs: { role: "status", "aria-live": "polite" }
  });
  const button = element("button", {
    className: "btn btn--primary",
    text: t("pause.flowConfirm"),
    attrs: { type: "button" }
  });
  button.onclick = () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    feedback.textContent = "";
    void options
      .exclusive(async () => {
        if (!granted) {
          const continuation: Continuation =
            method.value === "video-end"
              ? { kind: "video-end" }
              : { kind: "minutes", minutes: Number(minutes.value) };
          await options.grant(continuation);
          granted = true;
          choices.disabled = true;
        }
        await options.resume();
      })
      .catch(() => {
        feedback.textContent = t(granted ? "pause.resumeFailed" : "common.actionFailed");
        button.textContent = t(granted ? "pause.retryResume" : "pause.flowConfirm");
      })
      .finally(() => {
        busy = false;
        button.disabled = false;
      });
  };
  return element("div", {
    className: "end-unlock flow-choice",
    children: [
      element("h2", { text: t("end.flowTitle") }),
      element("p", { text: t("pause.flowOnce") }),
      choices,
      element("div", { className: "end-actions", children: [button, feedback] })
    ]
  });
}
