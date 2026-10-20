import { element, icon } from "../styles/dom";

export function createExternalLink(
  href: string,
  label: string,
  className = "btn"
): HTMLAnchorElement {
  return element("a", {
    className,
    attrs: { href, target: "_blank", rel: "noopener noreferrer" },
    children: [element("span", { text: label }), icon("external")]
  });
}
