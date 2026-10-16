import { element } from "../styles/dom";
import { mountViewportScrollPanel } from "./viewport-scroll-panel";

/** Shared master/detail layout; mount after inserting the workspace into the page. */
export function createConfigurationWorkspace(options: {
  directory: HTMLElement[];
  content: HTMLElement[];
  label: string;
  editorId?: string;
}): { workspace: HTMLElement; mount(): () => void } {
  const sidebar = element("aside", {
    className: "options-sidebar",
    attrs: { "aria-label": options.label },
    children: options.directory
  });
  return {
    workspace: element("div", {
      className: "options-workspace configuration-workspace",
      children: [
        sidebar,
        element("div", {
          className: "options-detail-editor",
          attrs: { id: options.editorId ?? "configuration-editor" },
          children: options.content
        })
      ]
    }),
    mount: () => mountViewportScrollPanel(sidebar)
  };
}

/** Repainting after a save keeps the current place and directory keyboard focus. */
export function preserveConfigurationPosition(root: HTMLElement, render: () => void): void {
  const scrollY = window.scrollY;
  const sidebarScroll = root.querySelector<HTMLElement>(".options-sidebar")?.scrollTop ?? 0;
  const focused = document.activeElement;
  const itemId =
    focused instanceof HTMLElement && focused.closest(".options-sidebar")
      ? focused.dataset.id
      : undefined;
  render();
  const sidebar = root.querySelector<HTMLElement>(".options-sidebar");
  if (sidebar) {
    sidebar.scrollTop = sidebarScroll;
    if (itemId) {
      const item = [...sidebar.querySelectorAll<HTMLElement>("[data-id]")].find(
        (candidate) => candidate.dataset.id === itemId
      );
      item?.focus({ preventScroll: true });
    }
  }
  window.scrollTo({ top: scrollY });
}
