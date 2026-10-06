import { sendRequest } from "../shared/messages";
import { t } from "../shared/i18n";
import { sha256 } from "../shared/unlock-challenge";
import type { FocusSettings } from "../shared/types";
import type { ProtectedAction } from "../background/protected-actions";
import { element } from "../styles/dom";

export async function openProtectedAction(
  action: ProtectedAction,
  onDone: (settings: FocusSettings) => void,
  protection?: FocusSettings["disableProtection"]
): Promise<void> {
  const ticket = await sendRequest({ type: "BEGIN_PROTECTED_ACTION", action });
  const destructive = action === "clear-all" || action === "reset";
  const warning =
    action === "clear-all"
      ? t("pause.clearWarning")
      : action === "reset"
        ? t("pause.resetWarning")
        : t("pause.disableWarning");
  const title =
    action === "clear-all"
      ? t("pause.clearAll")
      : action === "reset"
        ? t("settings.reset")
        : t("pause.disableProtection");
  const countdown = element("p", { attrs: { role: "timer" } });
  const input = element("input", {
    className: "input",
    attrs: {
      type: ticket.method === "password" ? "password" : "text",
      autocomplete: "off",
      maxlength: 128,
      "aria-label": ticket.phrase || t("end.passwordPrompt")
    }
  });
  const feedback = element("p", { attrs: { role: "status" } });
  const cancel = element("button", { className: "btn", text: t("common.cancel") });
  const confirm = element("button", {
    className: destructive ? "btn btn--danger" : "btn btn--primary",
    text: title
  });
  const dialog = element("dialog", {
    className: "dialog home-confirmation",
    attrs: { "aria-label": title },
    children: [
      element("h2", { text: title }),
      element("p", { className: "protected-warning", text: warning }),
      countdown,
      ...(ticket.phrase
        ? [element("p", { text: t("pause.typeConfirmation", { text: ticket.phrase }) })]
        : []),
      ...(ticket.phrase || ticket.method === "password" ? [input] : []),
      feedback,
      element("div", { className: "dialog__actions", children: [cancel, confirm] })
    ]
  });
  let busy = false;
  const update = () => {
    const seconds = Math.max(0, Math.ceil((ticket.readyAt - Date.now()) / 1000));
    countdown.textContent = seconds ? t("pause.waitSeconds", { seconds }) : t("pause.ready");
    input.disabled = busy || seconds > 0;
    confirm.disabled =
      busy ||
      seconds > 0 ||
      (ticket.phrase
        ? input.value !== ticket.phrase
        : ticket.method === "password" && !input.value);
  };
  input.oninput = update;
  cancel.onclick = () => dialog.close();
  confirm.onclick = () =>
    void (async () => {
      busy = true;
      update();
      try {
        const proof = ticket.method === "password" ? await sha256(input.value) : input.value;
        const result = await sendRequest({
          type: "COMPLETE_PROTECTED_ACTION",
          action,
          token: ticket.token,
          proof,
          protection
        });
        if (action === "clear-all") {
          localStorage.clear();
          sessionStorage.clear();
        }
        dialog.close();
        onDone(result);
      } catch {
        feedback.textContent = t("pause.retryProof");
        busy = false;
        update();
      }
    })();
  const timer = setInterval(update, 250);
  dialog.addEventListener("close", () => {
    clearInterval(timer);
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
  update();
}
