import { element, icon, type IconName } from "../styles/dom";
import { t, type MessageKey } from "../shared/i18n";
import { createBrandMark } from "./brand-mark";

export type AppPageId = "home" | "plan" | "dashboard" | "options" | "block";

export interface AppPageItem {
  id: AppPageId;
  href: string;
  labelKey: MessageKey;
  icon: IconName;
}

export const APP_PAGE_ITEMS: ReadonlyArray<AppPageItem> = [
  { id: "dashboard", href: "dashboard.html", labelKey: "nav.dashboard", icon: "bar-chart" },
  { id: "plan", href: "plan.html", labelKey: "nav.plan", icon: "calendar" },
  { id: "options", href: "options.html", labelKey: "nav.configuration", icon: "clock" },
  { id: "block", href: "block.html", labelKey: "nav.block", icon: "shield" },
  { id: "home", href: "home.html", labelKey: "nav.settings", icon: "settings" }
];

export interface PageNavigationOptions {
  currentPage: AppPageId;
  actions?: ReadonlyArray<HTMLElement | null | undefined>;
}

/** Shared, centered top bar for every full extension page. */
export function createPageNavigation({
  currentPage,
  actions = []
}: PageNavigationOptions): HTMLElement {
  const pageLinks = APP_PAGE_ITEMS.map((item) => {
    const label = t(item.labelKey);
    return element("a", {
      className: "app-navigation__link",
      attrs: {
        href: item.href,
        ...(item.id === currentPage ? { "aria-current": "page" } : {}),
        "aria-label": label
      },
      children: [
        icon(item.icon),
        element("span", { className: "app-navigation__label", text: label })
      ]
    });
  });
  const actionNodes = actions.filter(
    (action): action is HTMLElement => action instanceof HTMLElement
  );
  const help = createHelpDialog();

  return element("header", {
    className: "app-navigation",
    children: [
      createBrand(),
      element("nav", {
        className: "app-navigation__pages",
        attrs: { "aria-label": t("nav.mainLabel") },
        children: pageLinks
      }),
      element("div", {
        className: "app-navigation__actions",
        attrs: { "aria-label": t("nav.pageActions") },
        children: [...actionNodes, help.trigger]
      }),
      help.dialog
    ]
  });
}

function createHelpDialog(): { trigger: HTMLButtonElement; dialog: HTMLDialogElement } {
  const dialog = element("dialog", {
    className: "app-navigation__help-dialog",
    attrs: { "aria-labelledby": "page-guide-title" },
    children: [
      element("div", {
        className: "app-navigation__help-content",
        children: [
          element("header", {
            className: "app-navigation__help-header",
            children: [
              element("h2", { attrs: { id: "page-guide-title" }, text: t("nav.helpTitle") }),
              element("button", {
                className: "btn btn--icon",
                attrs: { type: "button", "aria-label": t("common.close") },
                children: [icon("close")]
              })
            ]
          }),
          element("ul", {
            className: "app-navigation__help-list",
            children: APP_PAGE_ITEMS.map((item) =>
              element("li", {
                children: [
                  icon(item.icon),
                  element("div", {
                    children: [
                      element("strong", { text: t(item.labelKey) }),
                      element("p", { text: t(`nav.help.${item.id}` as MessageKey) })
                    ]
                  })
                ]
              })
            )
          })
        ]
      })
    ]
  });
  const trigger = element("button", {
    className: "btn btn--icon app-navigation__help-trigger",
    attrs: { type: "button", "aria-label": t("nav.help") },
    children: [icon("help")]
  });
  trigger.addEventListener("click", () => dialog.showModal());
  dialog.querySelector("button")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  return { trigger, dialog };
}

function createBrand(): HTMLAnchorElement {
  return element("a", {
    className: "brand app-navigation__brand",
    attrs: { href: "dashboard.html", "aria-label": `Hourleaf ${t("nav.dashboard")}` },
    children: [
      createBrandMark(),
      element("span", {
        className: "brand__meta",
        children: [
          element("span", { text: "Hourleaf" }),
          element("small", { text: t("brand.tagline") })
        ]
      })
    ]
  });
}
