/**
 * Adds native-like roving focus and arrow-key selection to a button-based
 * radiogroup. Each button still owns its domain-specific click behavior.
 */
export function enableRadioButtonGroup(buttons: readonly HTMLButtonElement[]): void {
  if (buttons.length === 0) return;
  for (const [index, button] of buttons.entries()) {
    button.tabIndex = button.getAttribute("aria-checked") === "true" ? 0 : -1;
    button.addEventListener("keydown", (event) => {
      const nextIndex = resolveNextIndex(event.key, index, buttons.length);
      if (nextIndex === null) return;
      event.preventDefault();
      const next = buttons[nextIndex];
      next?.focus();
      next?.click();
    });
  }
}

function resolveNextIndex(key: string, index: number, length: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + length) % length;
  return null;
}
