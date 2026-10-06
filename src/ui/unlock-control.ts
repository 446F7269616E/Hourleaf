import { element } from "../styles/dom";
import { t } from "../shared/i18n";
import type { GroupUnlockMethod } from "../shared/types";
import { sha256 } from "../shared/unlock-challenge";

/** Shared friction control; all proofs and deadlines are rechecked by the background. */
export function createUnlockControl(options: {
  method: GroupUnlockMethod;
  waitEndsAt?: number;
  mathChallenge?: { prompt: string };
  passwordConfigured?: boolean;
  label: string;
  run(proof?: string): Promise<void>;
}): HTMLElement {
  const panel = element("div", { className: "end-unlock" });
  const feedback = element("p", {
    className: "end-unlock__feedback",
    attrs: { role: "status", "aria-live": "polite" }
  });
  let input: HTMLInputElement | undefined;
  if (options.method === "math" || options.method === "password") {
    input = element("input", {
      className: "input",
      attrs: {
        type: options.method === "password" ? "password" : "number",
        autocomplete: "off",
        "aria-label":
          options.method === "password"
            ? t("end.passwordPrompt")
            : (options.mathChallenge?.prompt ?? t("settings.unlock.math"))
      }
    });
    panel.append(
      element("label", {
        className: "field",
        children: [
          element("span", {
            text:
              options.method === "password"
                ? t("end.passwordPrompt")
                : options.mathChallenge?.prompt
          }),
          input
        ]
      })
    );
  }
  const button = element("button", {
    className: "btn btn--primary",
    text: options.label,
    attrs: { type: "button" }
  });
  let busy = false;
  const update = () => {
    const remaining =
      options.method === "wait"
        ? Math.max(0, Math.ceil(((options.waitEndsAt ?? Infinity) - Date.now()) / 1000))
        : 0;
    button.disabled =
      busy || remaining > 0 || (options.method === "password" && !options.passwordConfigured);
    button.textContent = remaining ? t("pause.waitSeconds", { seconds: remaining }) : options.label;
  };
  if (options.method === "password" && !options.passwordConfigured)
    feedback.textContent = t("end.passwordNotConfigured");
  const timer = window.setInterval(() => {
    if (!panel.isConnected) {
      clearInterval(timer);
      return;
    }
    update();
  }, 250);
  update();
  button.addEventListener(
    "click",
    () =>
      void (async () => {
        busy = true;
        update();
        feedback.textContent = "";
        try {
          await options.run(
            options.method === "password" ? await sha256(input?.value ?? "") : input?.value.trim()
          );
        } catch {
          feedback.textContent = t("pause.retryProof");
          busy = false;
          update();
          input?.focus();
        }
      })()
  );
  panel.append(button, feedback);
  return panel;
}
