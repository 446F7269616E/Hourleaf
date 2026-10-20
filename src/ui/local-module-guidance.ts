import { t } from "../shared/i18n";
import { element, icon } from "../styles/dom";
import { createExternalLink } from "./external-link";

const REPOSITORY = "https://github.com/446F7269616E/Hourleaf";

export const LOCAL_MODULE_LINKS = {
  releases: `${REPOSITORY}/releases/latest`,
  catalog: `${REPOSITORY}/tree/main/optional-modules`,
  guide: `${REPOSITORY}/blob/main/docs/MODULE_DEVELOPMENT.md`,
  specification: `${REPOSITORY}/blob/main/docs/LOCAL_MODULES.md`,
  license: `${REPOSITORY}/blob/main/LICENSE`,
  contact: `${REPOSITORY}/issues`
} as const;

export function createLocalModuleDisclaimer(): HTMLElement {
  return element("aside", {
    className: "block-disclaimer",
    attrs: { "aria-label": t("block.disclaimerTitle") },
    children: [
      icon("info"),
      element("div", {
        children: [
          element("strong", { text: t("block.disclaimerTitle") }),
          element("p", { text: t("block.disclaimer") }),
          element("p", { text: t("block.disclaimerLimits") }),
          element("div", {
            className: "block-download__actions",
            children: [
              createExternalLink(LOCAL_MODULE_LINKS.license, t("block.openLicense")),
              createExternalLink(LOCAL_MODULE_LINKS.contact, t("block.contactDeveloper"))
            ]
          })
        ]
      })
    ]
  });
}

export function createLocalModuleImportGuidance(): HTMLElement {
  return element("details", {
    className: "home-import-guidance",
    children: [
      element("summary", { text: t("settings.importRequirements") }),
      element("ul", {
        children: [
          element("li", { text: t("settings.importManifestFiles") }),
          element("li", { text: t("settings.importStandaloneFiles") })
        ]
      }),
      element("p", { text: t("settings.importTrust") }),
      element("div", {
        className: "block-download__actions",
        children: [
          createExternalLink(LOCAL_MODULE_LINKS.specification, t("block.openImportSpec")),
          createExternalLink(LOCAL_MODULE_LINKS.guide, t("block.openGuide"))
        ]
      })
    ]
  });
}
