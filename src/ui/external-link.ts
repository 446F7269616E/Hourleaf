import { element, icon } from "../styles/dom";

export function createExternalLink(href: string, label: string): HTMLAnchorElement {
  return element("a", {
    className: "btn",
    attrs: { href, target: "_blank", rel: "noopener noreferrer" },
    children: [element("span", { text: label }), icon("external")]
  });
}
