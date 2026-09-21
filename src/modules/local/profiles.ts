import type { PlanModeSettings } from "../../shared/types";
import type {
  LocalModuleInstallation,
  LocalModulePreferences,
  LocalModuleProfile,
  LocalModuleStore
} from "./types";

export function activeBlockingProfile(
  settings: PlanModeSettings,
  hasActiveGrant: boolean
): LocalModuleProfile {
  return settings.enabled && settings.enableAllBlocking && hasActiveGrant ? "plan" : "normal";
}

export function modulePreferences(
  installation: LocalModuleInstallation,
  profile: LocalModuleProfile
): LocalModulePreferences {
  return profile === "plan"
    ? (installation.planPreferences ?? { enabled: true, disabledFilterGroupIds: [] })
    : installation;
}

/** A read-only projection: never persist this store over the ordinary preferences. */
export function projectModuleStore(
  store: LocalModuleStore,
  profile: LocalModuleProfile
): LocalModuleStore {
  return {
    ...store,
    installations: Object.fromEntries(
      Object.entries(store.installations).map(([id, installation]) => [
        id,
        { ...installation, ...modulePreferences(installation, profile) }
      ])
    )
  };
}
