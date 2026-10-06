import { t } from "../shared/i18n";
import { element } from "../styles/dom";

/** All regions are side-by-side on wide screens; compact screens switch regions. */
export function createPauseLayout() {
  const sections = [
    { id: "overview", label: t("pause.overview") },
    { id: "statistics", label: t("pause.todayTotal") },
    { id: "actions", label: t("pause.nextAction") }
  ];
  const panels = sections.map(({ id, label }) =>
    element("section", {
      className: `pause-panel pause-panel--${id}`,
      attrs: { id: `pause-${id}`, "aria-label": label },
      dataset: { selected: String(id === "overview") }
    })
  );
  const controls = sections.map(({ id, label }, index) => {
    const button = element("button", {
      className: "pause-navigation__button",
      text: label,
      attrs: { type: "button", "aria-controls": `pause-${id}`, "aria-pressed": String(index === 0) }
    });
    button.onclick = () => {
      controls.forEach((control, position) =>
        control.setAttribute("aria-pressed", String(position === index))
      );
      panels.forEach((panel, position) => {
        panel.dataset.selected = String(position === index);
      });
    };
    return button;
  });
  const actionSet = element("fieldset", { className: "end-action-set" });
  panels[2]!.append(actionSet);
  return {
    navigation: element("nav", {
      className: "pause-navigation",
      attrs: { "aria-label": t("pause.sections") },
      children: controls
    }),
    layout: element("div", {
      className: "pause-layout",
      children: [panels[0], panels[2], panels[1]]
    }),
    overview: panels[0]!,
    statistics: panels[1]!,
    actions: actionSet
  };
}

/** Preserve complete user notes without letting arbitrarily long text stretch the page. */
export function createPauseNotes(notes: string[]): HTMLElement | null {
  const pages = notes.flatMap((note) => {
    const characters = Array.from(note.trim());
    const chunks: string[] = [];
    for (let offset = 0; offset < characters.length; offset += 120)
      chunks.push(characters.slice(offset, offset + 120).join(""));
    return chunks;
  });
  if (!pages.length) return null;
  let page = 0;
  const text = element("p", {
    className: "pause-notes__text",
    text: pages[0],
    attrs: { "aria-live": "polite" }
  });
  const previous = element("button", {
    className: "pause-page-button",
    text: "←",
    attrs: { type: "button", "aria-label": t("pause.previousPage") }
  });
  const next = element("button", {
    className: "pause-page-button",
    text: "→",
    attrs: { type: "button", "aria-label": t("pause.nextPage") }
  });
  const status = element("span", { attrs: { "aria-live": "polite" } });
  const update = () => {
    text.textContent = pages[page] ?? "";
    status.textContent = t("pause.pageNumber", { current: page + 1, total: pages.length });
    previous.disabled = page === 0;
    next.disabled = page === pages.length - 1;
  };
  previous.onclick = () => {
    page = Math.max(0, page - 1);
    update();
  };
  next.onclick = () => {
    page = Math.min(pages.length - 1, page + 1);
    update();
  };
  update();
  return element("aside", {
    className: "pause-notes",
    children: [
      text,
      ...(pages.length > 1
        ? [element("div", { className: "pause-pagination", children: [previous, status, next] })]
        : [])
    ]
  });
}
