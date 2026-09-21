import { element } from "../styles/dom";

/** Decorative C-series leaf hourglass; the adjacent brand text supplies its name. */
export function createBrandMark(large = false): HTMLElement {
  return element("span", {
    className: large ? "brand__mark brand__mark--large" : "brand__mark",
    attrs: { "aria-hidden": "true" },
    children: [
      element("img", {
        attrs: {
          src: large ? "icons/icon-128.png" : "icons/icon-48.png",
          ...(large ? {} : { srcset: "icons/icon-48.png 1x, icons/icon-128.png 2x" }),
          alt: "",
          width: large ? 64 : 34,
          height: large ? 64 : 34,
          draggable: false
        }
      })
    ]
  });
}
