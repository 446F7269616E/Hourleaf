import { describe, expect, it, vi } from "vitest";
import { applyDebugBuildPreset } from "../../src/debug/bootstrap";
import type { LocalModuleDefinition, LocalModuleSnapshot } from "../../src/modules/local/types";
import type { FocusSettings, ManagedSite } from "../../src/shared/types";

describe("local debug bootstrap", () => {
  it("refreshes every fixture but only enables newly installed modules", async () => {
    const existing = moduleDefinition("hourleaf.local.existing", "https://existing.test/*");
    const added = moduleDefinition("hourleaf.local.added", "https://added.test/*");
    const installations: LocalModuleSnapshot["store"]["installations"] = {
      [existing.id]: {
        definition: existing,
        source: "local-file",
        enabled: false,
        disabledFilterGroupIds: [],
        importedAt: 1,
        updatedAt: 1
      }
    };
    const snapshot = (): LocalModuleSnapshot => ({
      store: { schemaVersion: 1, installations },
      runtime: {
        userScripts: "available",
        declarativeNetRequest: "unsupported",
        warnings: []
      }
    });
    const importModule = vi.fn((definition: LocalModuleDefinition) => {
      installations[definition.id] = {
        definition,
        source: "local-file",
        enabled: installations[definition.id]?.enabled ?? false,
        disabledFilterGroupIds: [],
        importedAt: 1,
        updatedAt: 2
      };
      return Promise.resolve(snapshot());
    });
    const setEnabled = vi.fn((id: string, enabled: boolean) => {
      const installation = installations[id];
      if (!installation) throw new Error("missing test fixture");
      installation.enabled = enabled;
      return Promise.resolve(snapshot());
    });

    await applyDebugBuildPreset(
      { modules: [existing, added], sites: [] },
      {
        getSnapshot: () => Promise.resolve(snapshot()),
        import: importModule,
        setEnabled,
        remove: () => Promise.resolve(snapshot())
      },
      { list: () => Promise.resolve({ sites: {}, targets: {} }), addAuthorized: vi.fn() },
      { getModuleIds: () => Promise.resolve([existing.id]), setModuleIds: vi.fn() }
    );

    expect(importModule).toHaveBeenCalledTimes(2);
    expect(setEnabled).toHaveBeenCalledOnce();
    expect(setEnabled).toHaveBeenCalledWith(added.id, true);
    expect(installations[existing.id]?.enabled).toBe(false);
  });

  it("adds only websites that are not already configured", async () => {
    const existingSite = managedSite("site-existing", "https://existing.test");
    const addAuthorized = vi.fn((url: string) =>
      Promise.resolve({
        granted: true,
        origin: new URL(url).origin
      })
    );

    await applyDebugBuildPreset(
      {
        modules: [],
        sites: [
          { url: "https://existing.test", label: "Existing" },
          { url: "https://added.test", label: "Added" }
        ]
      },
      {
        getSnapshot: () => Promise.resolve(emptySnapshot()),
        import: () => Promise.resolve(emptySnapshot()),
        setEnabled: () => Promise.resolve(emptySnapshot()),
        remove: () => Promise.resolve(emptySnapshot())
      },
      {
        list: () => Promise.resolve({ sites: { [existingSite.id]: existingSite }, targets: {} }),
        addAuthorized
      },
      { getModuleIds: () => Promise.resolve([]), setModuleIds: vi.fn() }
    );

    expect(addAuthorized).toHaveBeenCalledOnce();
    expect(addAuthorized).toHaveBeenCalledWith("https://added.test", "Added");
  });

  it("removes only stale module ids recorded by the previous debug seed", async () => {
    const stale = moduleDefinition("hourleaf.local.stale", "https://stale.test/*");
    const manual = moduleDefinition("hourleaf.local.manual", "https://manual.test/*");
    const installations = Object.fromEntries(
      [stale, manual].map((definition) => [
        definition.id,
        {
          definition,
          source: "local-file" as const,
          enabled: true,
          disabledFilterGroupIds: [],
          importedAt: 1,
          updatedAt: 1
        }
      ])
    );
    const remove = vi.fn(() => Promise.resolve(emptySnapshot()));
    const setModuleIds = vi.fn(() => Promise.resolve());

    await applyDebugBuildPreset(
      { modules: [], sites: [] },
      {
        getSnapshot: () =>
          Promise.resolve({
            ...emptySnapshot(),
            store: { schemaVersion: 1, installations }
          }),
        import: () => Promise.resolve(emptySnapshot()),
        setEnabled: () => Promise.resolve(emptySnapshot()),
        remove
      },
      { list: () => Promise.resolve({ sites: {}, targets: {} }), addAuthorized: vi.fn() },
      { getModuleIds: () => Promise.resolve([stale.id]), setModuleIds }
    );

    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(stale.id);
    expect(remove).not.toHaveBeenCalledWith(manual.id);
    expect(setModuleIds).toHaveBeenCalledWith([]);
  });
});

function moduleDefinition(id: string, match: string): LocalModuleDefinition {
  return {
    schemaVersion: 1,
    format: "hourleaf.local-module",
    id,
    name: id,
    author: "Hourleaf contributors",
    version: "1.0.0",
    description: "",
    matches: [match],
    domainPolicy: "timed",
    hideSelectors: [],
    filterGroups: [],
    css: "",
    dnrRules: [],
    userScript: "",
    capabilities: []
  };
}

function emptySnapshot(): LocalModuleSnapshot {
  return {
    store: { schemaVersion: 1, installations: {} },
    runtime: {
      userScripts: "available",
      declarativeNetRequest: "unsupported",
      warnings: []
    }
  };
}

function managedSite(id: string, origin: string): ManagedSite {
  return {
    id,
    origin,
    hostname: new URL(origin).hostname,
    label: origin,
    enabled: true,
    restrictionMode: "strict",
    visitConfirmation: { enabled: false, waitSeconds: 3 },
    targetIds: [],
    createdAt: 1,
    updatedAt: 1
  } satisfies FocusSettings["sites"][string];
}
