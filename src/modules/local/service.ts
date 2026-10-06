import { projectModuleStore } from "./profiles";
import {
  filterScheduleReferences,
  isFilterScheduleActive,
  nextFilterScheduleCheck
} from "./schedules";
import type { FocusSettings } from "../../shared/types";
import {
  declarativeNetRequestGetDynamicRules,
  declarativeNetRequestUpdateDynamicRules,
  hasDeclarativeNetRequestApi,
  hasUserScriptsApi,
  permissionsContains,
  userScriptsGetRegistered,
  userScriptsRegister,
  userScriptsUnregister
} from "../../shared/browser";
import { LocalModuleRepository } from "./repository";
import type {
  LocalModuleProfile,
  LocalModuleDefinition,
  LocalModuleInstallation,
  LocalModuleDomainPolicy,
  LocalModulePlatform,
  LocalModuleRuntimeStatus,
  LocalModuleSnapshot,
  LocalModuleStore,
  LocalModuleWarningCode,
  LocalPageRules,
  LocalModuleTimePeriodReference
} from "./types";
import { getLocalModuleContentSafetyIssue, localModuleMatches } from "./validation";

const USER_SCRIPT_PREFIX = "hourleaf-local-";
const DNR_RULE_ID_START = 2_000_000;
const DNR_RULE_ID_END = 2_999_999;

function enabledSelectors(
  installation: LocalModuleInstallation,
  settings?: FocusSettings,
  now = new Date()
): string[] {
  return [
    ...installation.definition.hideSelectors,
    ...installation.definition.filterGroups
      .filter((group) => !installation.disabledFilterGroupIds.includes(group.id))
      .filter((group) =>
        isFilterScheduleActive(
          filterScheduleReferences(installation.filterGroupSchedules, group.id),
          settings,
          installation.definition,
          now
        )
      )
      .flatMap((group) => group.selectors)
  ];
}
declare const __HOURLEAF_BROWSER_TARGET__: Exclude<LocalModulePlatform, "unknown">;

export class LocalModuleService {
  private writeQueue: Promise<unknown> = Promise.resolve();
  private runtimeProfile: LocalModuleProfile = "normal";
  private coreEnabled = true;
  private lastWarnings: LocalModuleWarningCode[] = [];

  constructor(
    private readonly repository = new LocalModuleRepository(),
    private readonly platform: LocalModulePlatform = resolveLocalModulePlatform()
  ) {}

  async setRuntimeProfile(profile: LocalModuleProfile, coreEnabled = true): Promise<void> {
    await this.enqueue(async () => {
      if (this.runtimeProfile === profile && this.coreEnabled === coreEnabled) return;
      this.runtimeProfile = profile;
      this.coreEnabled = coreEnabled;
      await this.reconcile(await this.repository.get());
    });
  }

  async initialize(): Promise<LocalModuleSnapshot> {
    return this.enqueue(async () => this.reconcile(await this.repository.get()));
  }

  async getSnapshot(profile: LocalModuleProfile = "normal"): Promise<LocalModuleSnapshot> {
    return {
      profile,
      store: projectModuleStore(await this.repository.get(), profile),
      runtime: this.runtimeStatus()
    };
  }

  async import(definition: LocalModuleDefinition): Promise<LocalModuleSnapshot> {
    if (this.platform === "safari" && definition.userScript.trim()) {
      throw new Error("Safari 商店版不导入或执行用户脚本");
    }
    return this.enqueue(async () => this.reconcile(await this.repository.import(definition)));
  }

  async setEnabled(
    id: string,
    enabled: boolean,
    profile: LocalModuleProfile = "normal"
  ): Promise<LocalModuleSnapshot> {
    return this.enqueue(async () => {
      const store = await this.repository.setEnabled(id, enabled, Date.now(), profile);
      await this.reconcile(store);
      return this.getSnapshot(profile);
    });
  }

  async setFilterGroupEnabled(
    id: string,
    groupId: string,
    enabled: boolean,
    profile: LocalModuleProfile = "normal"
  ): Promise<LocalModuleSnapshot> {
    return this.enqueue(async () => {
      await this.repository.setFilterGroupEnabled(id, groupId, enabled, Date.now(), profile);
      return this.getSnapshot(profile);
    });
  }

  async remove(id: string): Promise<LocalModuleSnapshot> {
    return this.enqueue(async () => this.reconcile(await this.repository.remove(id)));
  }

  async setFilterGroupSchedule(
    id: string,
    groupId: string,
    periods: LocalModuleTimePeriodReference[] | null,
    profile: LocalModuleProfile = "normal"
  ): Promise<LocalModuleSnapshot> {
    return this.enqueue(async () => {
      await this.repository.setFilterGroupSchedule(id, groupId, periods, Date.now(), profile);
      return this.getSnapshot(profile);
    });
  }

  async getPageRules(
    url: string,
    profile: LocalModuleProfile = "normal",
    settings?: FocusSettings,
    now = new Date()
  ): Promise<LocalPageRules> {
    const installations = await this.enabledInstallationsFor(url, profile);
    const definitions = installations.map((installation) => installation.definition);
    return {
      moduleIds: definitions.map((definition) => definition.id),
      ...(settings
        ? {
            nextScheduleCheckAt: nextFilterScheduleCheck(installations, settings, now)
          }
        : {}),
      shadowRules: installations.flatMap((installation) =>
        (installation.definition.shadowRoots ?? []).map((root) => ({
          ...root,
          css: installation.definition.css,
          hideSelectors: enabledSelectors(installation, settings, now)
        }))
      ),
      hideSelectors: [
        ...new Set(
          installations.flatMap((installation) => enabledSelectors(installation, settings, now))
        )
      ],
      css: definitions
        .filter((definition) => definition.css.trim())
        .map((definition) => `/* Hourleaf local module: ${definition.id} */\n${definition.css}`)
        .join("\n\n")
    };
  }

  async getDomainPolicy(url: string): Promise<LocalModuleDomainPolicy> {
    const policies = (await this.enabledDefinitionsFor(url)).map(
      (definition) => definition.domainPolicy
    );
    if (policies.includes("always-block")) return "always-block";
    if (policies.includes("always-allow")) return "always-allow";
    return "timed";
  }

  private async enabledDefinitionsFor(url: string): Promise<LocalModuleDefinition[]> {
    return (await this.enabledInstallationsFor(url)).map((installation) => installation.definition);
  }

  private async enabledInstallationsFor(url: string, profile: LocalModuleProfile = "normal") {
    const store = projectModuleStore(await this.repository.get(), profile);
    return Object.values(store.installations)
      .filter((installation) => installation.enabled)
      .filter((installation) => localModuleMatches(installation.definition, url));
  }

  private async reconcile(store: LocalModuleStore): Promise<LocalModuleSnapshot> {
    const warnings: LocalModuleWarningCode[] = [];
    await this.reconcileUserScripts(projectModuleStore(store, this.runtimeProfile), warnings);
    await this.reconcileDnr(warnings);
    this.lastWarnings = warnings;
    return { store, runtime: this.runtimeStatus() };
  }

  private async reconcileUserScripts(
    store: LocalModuleStore,
    warnings: LocalModuleWarningCode[]
  ): Promise<void> {
    const scriptInstallations = Object.values(store.installations).filter(
      (installation) =>
        this.coreEnabled && installation.enabled && installation.definition.userScript.trim()
    );
    let enabledScripts = scriptInstallations.filter(
      (installation) =>
        getLocalModuleContentSafetyIssue("", installation.definition.userScript) === null
    );
    if (enabledScripts.length !== scriptInstallations.length) {
      warnings.push("unsafe-user-script");
    }
    if (this.platform === "safari") {
      if (enabledScripts.length > 0) {
        warnings.push("safari-user-script-disabled");
      }
      return;
    }
    if (!hasUserScriptsApi()) {
      if (enabledScripts.length > 0) {
        warnings.push("user-scripts-api-unavailable");
      }
      return;
    }
    try {
      if (this.runtimeProfile === "plan") {
        const permitted = await Promise.all(
          enabledScripts.map(async (installation) => {
            const matches = (
              await Promise.all(
                installation.definition.matches.map(async (match) =>
                  (await permissionsContains([match])) ? match : null
                )
              )
            ).filter((match): match is string => match !== null);
            return { ...installation, definition: { ...installation.definition, matches } };
          })
        );
        enabledScripts = permitted.filter(
          (installation) => installation.definition.matches.length > 0
        );
      }
      const registered = await userScriptsGetRegistered();
      const ownedIds = registered
        .map((script) => script.id)
        .filter((id) => id.startsWith(USER_SCRIPT_PREFIX));
      if (ownedIds.length > 0) await userScriptsUnregister(ownedIds);
      if (enabledScripts.length === 0) return;
      await userScriptsRegister(
        enabledScripts.map((installation) => ({
          id: userScriptId(installation.definition.id),
          matches: installation.definition.matches,
          js: [{ code: installation.definition.userScript }],
          runAt: "document_idle" as const,
          world: "USER_SCRIPT" as const,
          allFrames: false as const
        }))
      );
    } catch {
      warnings.push("user-scripts-permission-required");
    }
  }

  private async reconcileDnr(warnings: LocalModuleWarningCode[]): Promise<void> {
    if (!hasDeclarativeNetRequestApi()) return;
    try {
      const current = await declarativeNetRequestGetDynamicRules();
      const removeRuleIds = current
        .map((rule) => rule.id)
        .filter((id) => id >= DNR_RULE_ID_START && id <= DNR_RULE_ID_END);
      if (removeRuleIds.length === 0) return;
      await declarativeNetRequestUpdateDynamicRules({ removeRuleIds });
    } catch {
      warnings.push("legacy-dnr-cleanup-failed");
    }
  }

  private runtimeStatus(): LocalModuleRuntimeStatus {
    return {
      userScripts:
        this.platform === "safari"
          ? "disabled-by-platform"
          : hasUserScriptsApi()
            ? "available"
            : "permission-required",
      declarativeNetRequest: "unsupported",
      warnings: [...this.lastWarnings]
    };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }
}

function resolveLocalModulePlatform(): LocalModulePlatform {
  if (typeof __HOURLEAF_BROWSER_TARGET__ !== "undefined") {
    return __HOURLEAF_BROWSER_TARGET__;
  }
  return "unknown";
}

function userScriptId(moduleId: string): string {
  let hash = 2_166_136_261;
  for (const character of moduleId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `${USER_SCRIPT_PREFIX}${(hash >>> 0).toString(36)}`;
}
