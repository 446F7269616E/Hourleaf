import { t } from "../shared/i18n";
import { element } from "../styles/dom";

export interface ConfigurationDirectoryItem {
  id: string;
  label: string;
  detail: string;
  mark: string | Node;
  selected: boolean;
  onSelect(): void;
}

/** Both configuration categories share layout, selection and accessibility. */
export function createConfigurationDirectory(options: {
  title: string;
  label: string;
  items: ConfigurationDirectoryItem[];
  emptyLabel: string;
  active: boolean;
  onSelect(): void;
}): HTMLElement {
  const heading = element("button", {
    className: "options-directory__heading",
    text: options.title,
    attrs: { type: "button", "aria-controls": "configuration-editor" }
  });
  heading.addEventListener("click", options.onSelect);
  return element("section", {
    className: "options-site-directory card",
    attrs: { "aria-label": options.label },
    dataset: { active: String(options.active) },
    children: [
      element("header", {
        children: [
          element("h2", { children: [heading] }),
          element("span", {
            className: "status-chip",
            text: t("common.itemCount", { count: options.items.length })
          })
        ]
      }),
      element("div", {
        className: "options-site-directory__list",
        children:
          options.items.length > 0
            ? options.items.map((item) => {
                const control = element("button", {
                  className: "options-site-directory__item",
                  attrs: {
                    type: "button",
                    "aria-current": item.selected ? "page" : undefined,
                    "aria-controls": "configuration-editor",
                    title: `${item.label} · ${item.detail}`
                  },
                  dataset: { selected: String(item.selected), id: item.id },
                  children: [
                    element("span", {
                      className: "options-site-directory__mark",
                      attrs: { "aria-hidden": true },
                      children: [item.mark]
                    }),
                    element("span", {
                      className: "options-site-directory__copy",
                      children: [
                        element("strong", { text: item.label }),
                        element("small", { text: item.detail })
                      ]
                    })
                  ]
                });
                control.addEventListener("click", item.onSelect);
                return control;
              })
            : [
                (() => {
                  const empty = element("button", {
                    className: "options-directory__empty",
                    text: options.emptyLabel,
                    attrs: { type: "button", "aria-controls": "configuration-editor" }
                  });
                  empty.addEventListener("click", options.onSelect);
                  return empty;
                })()
              ]
      })
    ]
  });
}
