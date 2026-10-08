import { activeBlockingProfile } from "../../src/modules/local/profiles";
import { createDefaultSettings } from "../../src/shared/config";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createLocalModuleImportPreview,
  LocalModuleImportError,
  parseLocalModuleFiles
} from "../../src/modules/local/importer";
import { LocalModuleRepository } from "../../src/modules/local/repository";
import { LocalModuleService } from "../../src/modules/local/service";
import {
  localModuleMatches,
  normalizeLocalModuleDefinition,
  normalizeLocalModuleStore
} from "../../src/modules/local/validation";
import {
  LOCAL_MODULE_IMPORT_RISK_CODE,
  type LocalModuleImportErrorCode
} from "../../src/modules/local/types";
import { parseMessageRequest } from "../../src/shared/messages";
import type { ExtensionApi, StorageAreaLike } from "../../src/shared/browser";
import { STORAGE_KEYS } from "../../src/shared/storage-keys";

const manifest = {
  schemaVersion: 1,
  format: "hourleaf.local-module",
  id: "example.local.focus",
  name: "Example Focus",
  author: "Example Author",
  version: "1.0.0",
  description: "Local test module",
  matches: ["https://example.com/*"],
  domainPolicy: "always-block",
  hideSelectors: [".recommendations"],
  cssFiles: ["focus.css"],
  dnrRules: [],
  userScriptFiles: ["focus.user.js"]
};

describe("local module boundary", () => {
  it("keeps plan blocking edits separate through plan exit, worker restart and module updates", async () => {
    const storage = new MemoryStorage();
    (globalThis as typeof globalThis & { browser?: ExtensionApi }).browser = {
      runtime: {
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => undefined }
      },
      storage: { local: storage }
    };
    const repository = new LocalModuleRepository(storage);
    const definition = normalizeLocalModuleDefinition({
      ...manifest,
      css: "",
      userScript: "",
      hideSelectors: [],
      filterGroups: [
        { id: "feed", name: "Feed", selectors: [".feed"] },
        { id: "comments", name: "Comments", selectors: [".comments"] }
      ]
    })!;
    await repository.import(definition);
    await repository.setFilterGroupEnabled(definition.id, "comments", false);
    const service = new LocalModuleService(repository, "chromium");
    const original = await repository.get();
    expect((await service.getPageRules("https://example.com/", "normal")).hideSelectors).toEqual(
      []
    );
    expect((await service.getPageRules("https://example.com/", "plan")).hideSelectors).toEqual([
      ".feed",
      ".comments"
    ]);
    expect(await repository.get()).toEqual(original);
    await service.setFilterGroupEnabled(definition.id, "feed", false, "plan");
    expect((await service.getPageRules("https://example.com/", "plan")).hideSelectors).toEqual([
      ".comments"
    ]);
    const restarted = new LocalModuleService(new LocalModuleRepository(storage), "chromium");
    expect(
      (await restarted.getSnapshot("normal")).store.installations[definition.id]
    ).toMatchObject({ enabled: false, disabledFilterGroupIds: ["comments"] });
    expect((await restarted.getSnapshot("plan")).store.installations[definition.id]).toMatchObject({
      enabled: true,
      disabledFilterGroupIds: ["feed"]
    });
    await repository.import({
      ...definition,
      version: "1.1.0",
      filterGroups: [
        ...definition.filterGroups,
        { id: "related", name: "Related", description: "", selectors: [".related"] }
      ]
    });
    expect((await restarted.getPageRules("https://example.com/", "plan")).hideSelectors).toEqual([
      ".comments",
      ".related"
    ]);
    const settings = { ...createDefaultSettings().planMode, enabled: true };
    expect(activeBlockingProfile(settings, true)).toBe("plan");
    expect(activeBlockingProfile(settings, false)).toBe("normal");
    expect(activeBlockingProfile({ ...settings, enableAllBlocking: false }, true)).toBe("normal");
    expect(activeBlockingProfile({ ...settings, enabled: false }, true)).toBe("normal");
  });

  it("bounds declarative shadow roots and validates them again at normalization", () => {
    const base = { ...manifest, css: "", userScript: "" };
    expect(normalizeLocalModuleDefinition(base)?.shadowRoots).toEqual([]);
    for (const shadowRoots of [
      {},
      Array.from({ length: 9 }, () => ({ hostSelector: "#host" })),
      [{ hostSelector: " " }],
      [{ hostSelector: "#host { display:none }" }],
      [{ hostSelector: "#host", mountEvent: "bad event" }],
      [{ hostSelector: "#host", mountEvent: 123 }]
    ]) {
      expect(normalizeLocalModuleDefinition({ ...base, shadowRoots })).toBeNull();
    }
  });

  it("imports the release Bilibili module from its real repository files", () => {
    const readModuleFile = (name: string): string =>
      readFileSync(new URL(`../../optional-modules/bilibili/${name}`, import.meta.url), "utf8");
    const module = parseLocalModuleFiles([
      { name: "hourleaf-module.json", text: readModuleFile("hourleaf-module.json") },
      { name: "focus.css", text: readModuleFile("focus.css") },
      { name: "focus.user.js", text: readModuleFile("focus.user.js") }
    ]);

    expect(module).toMatchObject({
      id: "hourleaf.local.bilibili-focus",
      name: "Bilibili",
      version: "1.2.5",
      author: "Hourleaf contributors",
      domainPolicy: "timed"
    });
    expect(module.matches).toContain("https://www.bilibili.com/*");
    expect(module.hideSelectors).toEqual([]);
    expect(module.shadowRoots).toEqual([{ hostSelector: "#bewly", mountEvent: "bewlyMounted" }]);
    expect(module.filterGroups.map((group) => group.id)).toEqual([
      "home-recommendations",
      "dynamic-feed",
      "related-videos",
      "comments"
    ]);
    expect(module.capabilities).toEqual(
      expect.arrayContaining(["hide-elements", "css", "user-script"])
    );
  });

  it.each([
    {
      slug: "xiaohongshu",
      files: ["hourleaf-module.json", "focus.user.js"],
      id: "hourleaf.local.xiaohongshu-focus",
      match: "https://www.xiaohongshu.com/*",
      groups: ["home-recommendations"],
      capabilities: ["hide-elements", "user-script"]
    },
    {
      slug: "x",
      files: ["hourleaf-module.json"],
      id: "hourleaf.local.x-focus",
      match: "https://x.com/*",
      groups: ["home-timeline"],
      capabilities: ["hide-elements"]
    },
    {
      slug: "youtube",
      files: ["hourleaf-module.json"],
      id: "hourleaf.local.youtube-focus",
      match: "https://www.youtube.com/*",
      groups: ["home-recommendations", "shorts", "related-videos", "comments"],
      capabilities: ["hide-elements"]
    },
    {
      slug: "baidu-tieba",
      files: ["hourleaf-module.json"],
      id: "hourleaf.local.baidu-tieba-focus",
      match: "https://tieba.baidu.com/*",
      groups: ["home-recommendations"],
      capabilities: ["hide-elements"]
    }
  ])("imports the $slug module from its real repository files", (candidate) => {
    const module = parseLocalModuleFiles(
      candidate.files.map((name) => ({
        name,
        text: readFileSync(
          new URL(`../../optional-modules/${candidate.slug}/${name}`, import.meta.url),
          "utf8"
        )
      }))
    );

    expect(module).toMatchObject({
      id: candidate.id,
      version: "1.0.1",
      author: "Hourleaf contributors",
      domainPolicy: "timed",
      hideSelectors: []
    });
    expect(module.matches).toEqual([candidate.match]);
    expect(module.filterGroups.map((group) => group.id)).toEqual(candidate.groups);
    expect(module.capabilities).toEqual(expect.arrayContaining(candidate.capabilities));
  });

  it("resolves only files selected in the same local import", () => {
    const module = parseLocalModuleFiles([
      { name: "hourleaf-module.json", text: JSON.stringify(manifest) },
      { name: "focus.css", text: ".recommendations { opacity: .2; }" },
      { name: "focus.user.js", text: "document.documentElement.dataset.focus = 'on';" }
    ]);

    expect(module).toMatchObject({
      id: "example.local.focus",
      format: "hourleaf.local-module",
      author: "Example Author",
      matches: ["https://example.com/*"],
      domainPolicy: "always-block"
    });
    expect(module.capabilities).toEqual(
      expect.arrayContaining(["domain-policy", "hide-elements", "css", "user-script"])
    );
    expect(localModuleMatches(module, "https://example.com/path")).toBe(true);
    expect(localModuleMatches(module, "https://other.example/path")).toBe(false);
  });

  it("persists independent filter-group choices and applies only enabled selectors", async () => {
    const storage = new MemoryStorage();
    (globalThis as typeof globalThis & { browser?: ExtensionApi }).browser = {
      runtime: {
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => undefined }
      },
      storage: { local: storage }
    };
    const definition = parseLocalModuleFiles([
      {
        name: "hourleaf-module.json",
        text: JSON.stringify({
          ...manifest,
          cssFiles: [],
          userScriptFiles: [],
          hideSelectors: [".always-hidden"],
          shadowRoots: [{ hostSelector: "#custom-home", mountEvent: "homeMounted" }],
          filterGroups: [
            {
              id: "home-feed",
              name: "主页推荐",
              selectors: [".home-feed"]
            },
            {
              id: "comments",
              name: "评论",
              selectors: ["#comments"]
            }
          ]
        })
      }
    ]);
    const service = new LocalModuleService(new LocalModuleRepository(storage), "chromium");
    await service.import(definition);
    await service.setEnabled(definition.id, true);

    expect((await service.getPageRules("https://example.com/page")).hideSelectors).toEqual([
      ".always-hidden",
      ".home-feed",
      "#comments"
    ]);

    await service.setFilterGroupEnabled(definition.id, "home-feed", false);
    expect((await service.getPageRules("https://example.com/page")).shadowRules).toEqual([
      {
        hostSelector: "#custom-home",
        mountEvent: "homeMounted",
        css: "",
        hideSelectors: [".always-hidden", "#comments"]
      }
    ]);
    expect((await service.getPageRules("https://unrelated.example/page")).shadowRules).toEqual([]);
    expect((await service.getPageRules("https://example.com/page")).hideSelectors).toEqual([
      ".always-hidden",
      "#comments"
    ]);
    expect(
      (await service.getSnapshot()).store.installations[definition.id]?.disabledFilterGroupIds
    ).toEqual(["home-feed"]);
  });

  it("accepts standalone user-script metadata without fetching anything", () => {
    const module = parseLocalModuleFiles([
      {
        name: "focus.user.js",
        text: [
          "// ==UserScript==",
          "// @id example.local.script",
          "// @name Example Script",
          "// @author Example Author",
          "// @format hourleaf.local-module",
          "// @version 1.2.0",
          "// @match https://example.com/*",
          "// ==/UserScript==",
          "document.body.dataset.example = 'true';"
        ].join("\n")
      }
    ]);

    expect(module).toMatchObject({ id: "example.local.script", version: "1.2.0" });
    expect(module.userScript).toContain("document.body.dataset.example");
  });

  it("provides a non-persisted preview contract for explicit risk acknowledgement", () => {
    const module = parseLocalModuleFiles([
      { name: "hourleaf-module.json", text: JSON.stringify({ ...manifest, cssFiles: [] }) },
      { name: "focus.user.js", text: "document.body.dataset.focus = 'on';" }
    ]);

    const preview = createLocalModuleImportPreview(module);
    expect(preview).toMatchObject({
      id: "example.local.focus",
      name: "Example Focus",
      author: "Example Author",
      format: "hourleaf.local-module",
      version: "1.0.0",
      matches: ["https://example.com/*"],
      hasUserScript: true,
      riskDisclosure: {
        code: "review-content-and-assume-risk",
        acknowledgementRequired: true
      }
    });
    expect(preview.capabilities).toContain("user-script");
  });

  it("rejects imports without an author or the canonical format identifier", () => {
    expectImportError(
      [{ name: "hourleaf-module.json", text: JSON.stringify({ ...manifest, author: undefined }) }],
      "author-required"
    );
    expectImportError(
      [{ name: "hourleaf-module.json", text: JSON.stringify({ ...manifest, format: undefined }) }],
      "format-required"
    );
    expectImportError(
      [
        {
          name: "hourleaf-module.json",
          text: JSON.stringify({ ...manifest, format: "third-party.module" })
        }
      ],
      "unsupported-format"
    );
  });

  it("requires every standalone file to carry consistent normalized metadata", () => {
    expectImportError(
      [
        {
          name: "focus.user.js",
          text: [
            "// @id example.local.script",
            "// @name Example Script",
            "// @version 1.2.0",
            "// @match https://example.com/*"
          ].join("\n")
        }
      ],
      "author-required"
    );
  });

  it("blocks a small high-risk script subset at import time", () => {
    const unsafeSources = [
      "eval('document.body.remove()');",
      "fetch('https://collector.example/');",
      'const start = "/*";\nfetch("https://collector.example/");\nconst end = "*/";',
      "window['fetch']('https://collector.example/');",
      "new window.WebSocket('wss://collector.example/');",
      "chrome.runtime.sendMessage({});",
      "chrome['runtime'].sendMessage({});",
      "document.createElement('script');",
      "console.log(document.cookie);",
      "console.log(document['cookie']);",
      'setTimeout("document.body.remove()", 0);'
    ];
    for (const userScript of unsafeSources) {
      expectImportError(
        [
          {
            name: "hourleaf-module.json",
            text: JSON.stringify({ ...manifest, cssFiles: [], userScriptFiles: [], userScript })
          }
        ],
        "unsafe-user-script"
      );
    }

    const safe = parseLocalModuleFiles([
      {
        name: "hourleaf-module.json",
        text: JSON.stringify({
          ...manifest,
          cssFiles: [],
          userScriptFiles: [],
          userScript:
            "// fetch() is intentionally unavailable\ndocument.body.dataset.safe = 'true';"
        })
      }
    ]);
    expect(safe.userScript).toContain("dataset.safe");
  });

  it("rejects wildcard hosts, remote CSS and all local-module DNR rules", () => {
    const baseline = {
      schemaVersion: 1,
      format: "hourleaf.local-module",
      id: "example.local.invalid",
      name: "Invalid",
      author: "Example Author",
      version: "1.0.0",
      description: "",
      matches: ["https://example.com/*"],
      domainPolicy: "timed",
      hideSelectors: [],
      css: "",
      dnrRules: [],
      userScript: "",
      capabilities: []
    };

    expect(
      normalizeLocalModuleDefinition({ ...baseline, matches: ["https://*.example.com/*"] })
    ).toBeNull();
    expect(
      normalizeLocalModuleDefinition({
        ...baseline,
        css: "@import url('https://cdn.example/style.css');"
      })
    ).toBeNull();
    expect(
      normalizeLocalModuleDefinition({
        ...baseline,
        css: ".leak { background: image-set('https://cdn.example/pixel'); }"
      })
    ).toBeNull();
    expect(
      normalizeLocalModuleDefinition({
        ...baseline,
        dnrRules: [{ action: "block", urlFilter: "*", resourceTypes: ["script"] }]
      })
    ).toBeNull();
    expectImportError(
      [
        {
          name: "hourleaf-module.json",
          text: JSON.stringify({
            ...manifest,
            dnrRules: [{ action: "block", urlFilter: "*", resourceTypes: ["script"] }]
          })
        }
      ],
      "unsupported-dnr"
    );
  });

  it("does not retain legacy stored modules that lack required provenance", () => {
    const legacyDefinition = {
      ...normalizeLocalModuleDefinition({
        ...manifest,
        css: "",
        cssFiles: undefined,
        dnrRules: [],
        userScript: "",
        userScriptFiles: undefined
      })!,
      author: undefined,
      format: undefined
    };
    const store = normalizeLocalModuleStore({
      schemaVersion: 1,
      installations: {
        [legacyDefinition.id]: {
          definition: legacyDefinition,
          source: "local-file",
          enabled: true,
          importedAt: 1,
          updatedAt: 1
        }
      }
    });

    expect(store.installations).toEqual({});
  });

  it("normalizes imported modules again at the privileged message boundary", () => {
    const definition = parseLocalModuleFiles([
      { name: "hourleaf-module.json", text: JSON.stringify({ ...manifest, cssFiles: [] }) },
      { name: "focus.user.js", text: "document.body.dataset.focus = 'on';" }
    ]);
    const parsed = parseMessageRequest({
      version: 1,
      requestId: "local-module-1",
      type: "IMPORT_LOCAL_MODULE",
      payload: { module: definition, riskAcknowledgement: LOCAL_MODULE_IMPORT_RISK_CODE }
    });

    expect(parsed?.request).toMatchObject({
      type: "IMPORT_LOCAL_MODULE",
      module: { id: "example.local.focus" },
      riskAcknowledgement: LOCAL_MODULE_IMPORT_RISK_CODE
    });
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "local-module-missing-acknowledgement",
        type: "IMPORT_LOCAL_MODULE",
        payload: { module: definition }
      })
    ).toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "local-module-invalid-acknowledgement",
        type: "IMPORT_LOCAL_MODULE",
        payload: { module: definition, riskAcknowledgement: "accepted-without-review" }
      })
    ).toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "local-module-invalid-author",
        type: "IMPORT_LOCAL_MODULE",
        payload: {
          module: { ...definition, author: "" },
          riskAcknowledgement: LOCAL_MODULE_IMPORT_RISK_CODE
        }
      })
    ).toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "local-module-unsafe-script",
        type: "IMPORT_LOCAL_MODULE",
        payload: {
          module: { ...definition, userScript: "fetch('https://collector.example')" },
          riskAcknowledgement: LOCAL_MODULE_IMPORT_RISK_CODE
        }
      })
    ).toBeNull();
  });

  it("binds imported code to browser isolation and only cleans legacy local DNR rules", async () => {
    const storage = new MemoryStorage();
    const registeredScripts: unknown[][] = [];
    const dnrUpdates: unknown[] = [];
    (globalThis as typeof globalThis & { browser?: ExtensionApi }).browser = {
      runtime: {
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => undefined }
      },
      storage: { local: storage },
      userScripts: {
        getScripts: () => Promise.resolve([]),
        register: (scripts) => {
          registeredScripts.push(scripts);
          return Promise.resolve();
        },
        unregister: () => Promise.resolve()
      },
      declarativeNetRequest: {
        getDynamicRules: () => Promise.resolve([{ id: 2_000_123 }, { id: 77 }]),
        updateDynamicRules: (update) => {
          dnrUpdates.push(update);
          return Promise.resolve();
        }
      }
    };
    const definition = parseLocalModuleFiles([
      { name: "hourleaf-module.json", text: JSON.stringify({ ...manifest, cssFiles: [] }) },
      { name: "focus.user.js", text: "document.body.dataset.focus = 'on';" }
    ]);
    const service = new LocalModuleService(new LocalModuleRepository(storage));
    await service.import(definition);
    await service.setEnabled(definition.id, true);

    expect(registeredScripts.at(-1)?.[0]).toMatchObject({
      matches: ["https://example.com/*"],
      world: "USER_SCRIPT",
      allFrames: false,
      runAt: "document_idle"
    });
    expect(dnrUpdates.at(-1)).toEqual({ removeRuleIds: [2_000_123] });
    expect((await service.getSnapshot()).runtime.declarativeNetRequest).toBe("unsupported");
  });

  it("enforces Safari's no-user-script boundary in the privileged service", async () => {
    const storage = new MemoryStorage();
    const registeredScripts: unknown[][] = [];
    (globalThis as typeof globalThis & { browser?: ExtensionApi }).browser = {
      runtime: {
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => undefined }
      },
      storage: { local: storage },
      userScripts: {
        getScripts: () => Promise.resolve([]),
        register: (scripts) => {
          registeredScripts.push(scripts);
          return Promise.resolve();
        },
        unregister: () => Promise.resolve()
      }
    };
    const definition = parseLocalModuleFiles([
      { name: "hourleaf-module.json", text: JSON.stringify({ ...manifest, cssFiles: [] }) },
      { name: "focus.user.js", text: "document.body.dataset.focus = 'on';" }
    ]);
    const service = new LocalModuleService(new LocalModuleRepository(storage), "safari");

    await expect(service.import(definition)).rejects.toThrow("Safari 商店版");
    expect((await service.getSnapshot()).runtime.userScripts).toBe("disabled-by-platform");
    expect((await service.getSnapshot()).store.installations).toEqual({});

    const repository = new LocalModuleRepository(storage);
    await repository.import(definition);
    await repository.setEnabled(definition.id, true);
    await new LocalModuleService(repository, "safari").initialize();
    expect(registeredScripts).toEqual([]);
  });

  it("rechecks stored scripts immediately before User Scripts API registration", async () => {
    const storage = new MemoryStorage();
    const registeredScripts: unknown[][] = [];
    (globalThis as typeof globalThis & { browser?: ExtensionApi }).browser = {
      runtime: {
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => undefined }
      },
      storage: { local: storage },
      userScripts: {
        getScripts: () => Promise.resolve([]),
        register: (scripts) => {
          registeredScripts.push(scripts);
          return Promise.resolve();
        },
        unregister: () => Promise.resolve()
      }
    };
    const definition = parseLocalModuleFiles([
      {
        name: "hourleaf-module.json",
        text: JSON.stringify({
          ...manifest,
          cssFiles: [],
          dnrRules: [],
          userScriptFiles: [],
          userScript: "document.body.dataset.safe = 'true';"
        })
      }
    ]);
    await storage.set({
      [STORAGE_KEYS.localModules]: {
        schemaVersion: 1,
        installations: {
          [definition.id]: {
            definition: { ...definition, userScript: "fetch('https://collector.example')" },
            source: "local-file",
            enabled: true,
            importedAt: 1,
            updatedAt: 1
          }
        }
      }
    });

    const snapshot = await new LocalModuleService(
      new LocalModuleRepository(storage),
      "chromium"
    ).initialize();

    expect(registeredScripts).toEqual([]);
    expect(snapshot.runtime.warnings).toContain("unsafe-user-script");
  });
});

afterEach(() => {
  delete (globalThis as typeof globalThis & { browser?: ExtensionApi }).browser;
});

class MemoryStorage implements StorageAreaLike {
  private readonly values: Record<string, unknown> = {};

  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>> {
    if (typeof keys === "string") return Promise.resolve({ [keys]: this.values[keys] });
    return Promise.resolve({ ...this.values });
  }

  set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, structuredClone(items));
    return Promise.resolve();
  }
}

function expectImportError(
  files: readonly { name: string; text: string }[],
  code: LocalModuleImportErrorCode
): void {
  try {
    parseLocalModuleFiles(files);
    throw new Error("Expected local module import to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(LocalModuleImportError);
    expect(error).toMatchObject({ code, recoverable: true });
  }
}
