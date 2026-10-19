import { t } from "../shared/i18n";
import { element } from "../styles/dom";

/** Equal side columns keep actions in the center at every viewport size. */
export function createPauseLayout() {
  const sections = [
    { id: "overview", label: t("pause.overview") },
    { id: "actions", label: t("pause.nextAction") },
    { id: "statistics", label: t("pause.todayTotal") }
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
      panels[index]?.scrollIntoView({ block: "start" });
    };
    return button;
  });
  const actionSet = element("fieldset", { className: "end-action-set" });
  const messages = element("div", {
    className: "pause-message-slot",
    attrs: { "aria-label": t("settings.endView.message") }
  });
  panels[1]!.append(messages, actionSet);
  return {
    navigation: element("nav", {
      className: "pause-navigation",
      attrs: { "aria-label": t("pause.sections") },
      children: controls
    }),
    layout: element("div", {
      className: "pause-layout-viewport",
      children: [element("div", { className: "pause-layout", children: panels })]
    }),
    overview: panels[0]!,
    statistics: panels[2]!,
    actions: actionSet,
    messages
  };
}

/** Center the action column when a narrow viewport needs horizontal scrolling. */
export function centerPauseActions(root: ParentNode): void {
  const viewport = root.querySelector<HTMLElement>(".pause-layout-viewport");
  if (viewport) viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
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
