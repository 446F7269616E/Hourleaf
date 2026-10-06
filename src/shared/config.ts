import {
  CONTENT_FILTER_IDS,
  type ContentFilterId,
  type ContentFilterSettings,
  type CustomTimePeriodPreset,
  type DeepPartial,
  type FocusSettings,
  type EndPageSettings,
  type ManagedSite,
  MAX_VISIT_CONFIRMATION_PROMPT_LENGTH,
  type PlanModeSettings,
  SECTION_IDS,
  type SectionId,
  type SectionRule,
  type SiteId,
  type SiteTargetSettings,
  type TargetId,
  type TemporaryAccessSettings,
  type TimeAccessRule,
  type TimeAccessEffect,
  type TimePeriodSettings,
  UI_THEMES,
  type UiTheme,
  type Weekday
} from "./types";
import { normalizeSiteMatchPatterns } from "./site-scope";

export const SETTINGS_SCHEMA_VERSION = 5 as const;
export const MAX_TIME_ACCESS_RULES = 64;
export const MAX_TIME_PERIODS = 64;
export const MAX_CUSTOM_TIME_PERIOD_PRESETS = 32;
export const MAX_CUSTOM_TIME_PERIOD_PRESET_PERIODS = 16;
export const MAX_MANAGED_SITES = 256;
export const MAX_TARGETS = 512;

const DEFAULT_BLOCKED_SECTIONS: ReadonlySet<SectionId> = new Set(["home", "dynamic", "popular"]);

const DEFAULT_HIDDEN_ELEMENTS: Readonly<Record<ContentFilterId, boolean>> = Object.freeze({
  "home-feed": false,
  "dynamic-feed": false,
  "related-videos": true,
  comments: false,
  "search-suggestions": true,
  ads: true,
  "top-navigation": false
});

function defaultRule(section: SectionId): SectionRule {
  return {
    enabled: DEFAULT_BLOCKED_SECTIONS.has(section),
    dailyLimitMinutes: null,
    schedules: []
  };
}

export const DEFAULT_SETTINGS: Readonly<FocusSettings> = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  enabled: true,
  showRemainingMinutesOnIcon: true,
  locale: "system",
  theme: "verdant",
  disableProtection: Object.freeze({ method: "none", waitMinutes: 1, passwordVerifier: "" }),
  endPage: Object.freeze({
    view: "dashboard",
    motivationalMessage: "",
    flowConsumesNextGroup: false,
    repeatConfirmationInNewTabs: false,
    groupUnlock: Object.freeze({
      method: "wait",
      waitMinutes: 0.5,
      waitSeconds: 30,
      mathDifficulty: "equation",
      passwordVerifier: ""
    })
  }),
  sites: Object.freeze({}),
  targets: Object.freeze({}),
  customTimePeriodPresets: [] as CustomTimePeriodPreset[],
  sectionRules: Object.freeze(
    Object.fromEntries(
      SECTION_IDS.map((section) => [section, Object.freeze(defaultRule(section))])
    ) as Record<SectionId, SectionRule>
  ),
  temporaryAccess: Object.freeze({
    enabled: true,
    durationMinutes: 5,
    maxUsesPerDay: 3
  }),
  planMode: Object.freeze({
    enabled: false,
    independentAccessTiming: true,
    enableAllBlocking: true,
    watchDurationMinutes: 45,
    defaultCompletionMode: "flow",
    autoCompleteOnStart: false
  }),
  contentFilters: Object.freeze({
    enabled: true,
    hiddenElements: DEFAULT_HIDDEN_ELEMENTS,
    videoCards: Object.freeze({ enabled: false, keywords: [], regexPatterns: [] }),
    slashToSearch: true
  }),
  legacyCapsules: Object.freeze({
    bilibili: Object.freeze({
      schemaVersion: 2 as const,
      sectionRules: Object.freeze(
        Object.fromEntries(
          SECTION_IDS.map((section) => [section, Object.freeze(defaultRule(section))])
        ) as Record<SectionId, SectionRule>
      ),
      planMode: Object.freeze({
        enabled: false,
        independentAccessTiming: true,
        enableAllBlocking: true,
        watchDurationMinutes: 45,
        defaultCompletionMode: "flow",
        autoCompleteOnStart: false
      }),
      contentFilters: Object.freeze({
        enabled: true,
        hiddenElements: DEFAULT_HIDDEN_ELEMENTS,
        videoCards: Object.freeze({ enabled: false, keywords: [], regexPatterns: [] }),
        slashToSearch: true
      })
    })
  })
});

export function createDefaultSettings(): FocusSettings {
  return cloneSettings(DEFAULT_SETTINGS);
}

export function mergeSettings(
  base: FocusSettings,
  patch: DeepPartial<FocusSettings>
): FocusSettings {
  const merged: FocusSettings = {
    ...base,
    ...patch,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: patch.enabled ?? base.enabled,
    showRemainingMinutesOnIcon: patch.showRemainingMinutesOnIcon ?? base.showRemainingMinutesOnIcon,
    locale: patch.locale ?? base.locale,
    theme: patch.theme ?? base.theme,
    disableProtection: { ...base.disableProtection, ...patch.disableProtection },
    endPage: {
      ...base.endPage,
      ...(patch.endPage ?? {}),
      groupUnlock: {
        ...base.endPage.groupUnlock,
        ...(patch.endPage?.groupUnlock ?? {})
      }
    },
    sites: { ...base.sites },
    targets: { ...base.targets },
    customTimePeriodPresets: patch.customTimePeriodPresets
      ? normalizeCustomTimePeriodPresets(patch.customTimePeriodPresets)
      : base.customTimePeriodPresets.map(cloneCustomTimePeriodPreset),
    sectionRules: { ...base.sectionRules },
    temporaryAccess: {
      ...base.temporaryAccess,
      ...(patch.temporaryAccess ?? {})
    },
    planMode: {
      ...base.planMode,
      ...(patch.planMode ?? {})
    },
    contentFilters: {
      ...base.contentFilters,
      ...(patch.contentFilters ?? {}),
      hiddenElements: {
        ...base.contentFilters.hiddenElements,
        ...(patch.contentFilters?.hiddenElements ?? {})
      },
      videoCards: {
        ...base.contentFilters.videoCards,
        ...(patch.contentFilters?.videoCards ?? {})
      }
    },
    legacyCapsules: base.legacyCapsules
  };

  for (const [siteId, sitePatch] of Object.entries(patch.sites ?? {})) {
    const current = base.sites[siteId];
    if (current && sitePatch) {
      const { visitConfirmation, ...flatSitePatch } = sitePatch;
      merged.sites[siteId] = {
        ...current,
        ...flatSitePatch,
        ...(visitConfirmation
          ? {
              visitConfirmation: {
                ...(current.visitConfirmation ?? { enabled: true, waitSeconds: 3 }),
                ...visitConfirmation
              }
            }
          : {})
      };
    }
  }
  for (const [targetId, targetPatch] of Object.entries(patch.targets ?? {})) {
    const current = base.targets[targetId];
    if (!current || !targetPatch) continue;
    merged.targets[targetId] = {
      ...current,
      ...targetPatch,
      schedules: targetPatch.schedules
        ? targetPatch.schedules.map((rule) => ({ ...rule, days: [...(rule.days ?? [])] }))
        : current.schedules.map(cloneSchedule),
      timePeriods: targetPatch.timePeriods
        ? targetPatch.timePeriods.map((period) => ({
            ...period,
            days: [...(period.days ?? [])]
          }))
        : current.timePeriods.map(cloneTimePeriod),
      temporaryAccess: {
        ...current.temporaryAccess,
        ...(targetPatch.temporaryAccess ?? {})
      }
    } as SiteTargetSettings;
  }

  for (const section of SECTION_IDS) {
    const rulePatch = patch.sectionRules?.[section];
    merged.sectionRules[section] = {
      ...base.sectionRules[section],
      ...(rulePatch ?? {}),
      dailyLimitMinutes:
        rulePatch?.dailyLimitMinutes === undefined
          ? base.sectionRules[section].dailyLimitMinutes
          : rulePatch.dailyLimitMinutes,
      schedules: rulePatch?.schedules
        ? rulePatch.schedules.slice(0, MAX_TIME_ACCESS_RULES).map((schedule) => ({
            id: schedule.id ?? createId(),
            name: schedule.name ?? "时间规则",
            enabled: schedule.enabled ?? true,
            effect: schedule.effect ?? "block",
            days: schedule.days ?? [],
            startTime: schedule.startTime ?? "09:00",
            endTime: schedule.endTime ?? "18:00"
          }))
        : base.sectionRules[section].schedules.map(cloneSchedule)
    };
  }

  merged.legacyCapsules = {
    bilibili: {
      schemaVersion: 2,
      sectionRules: merged.sectionRules,
      planMode: merged.planMode,
      contentFilters: merged.contentFilters
    }
  };

  return normalizeSettings(merged);
}

/**
 * Treats persisted data as untrusted and returns a complete, bounded settings object.
 * This is the schema migration boundary for stored settings.
 */
export function normalizeSettings(value: unknown): FocusSettings {
  const defaults = createUnsafeDefaultSettings();
  if (!isRecord(value)) return defaults;

  const rawCapsules = isRecord(value.legacyCapsules) ? value.legacyCapsules : {};
  const rawBilibili = isRecord(rawCapsules.bilibili) ? rawCapsules.bilibili : value;
  const rawRules = isRecord(value.sectionRules)
    ? value.sectionRules
    : isRecord(rawBilibili.sectionRules)
      ? rawBilibili.sectionRules
      : {};
  const sectionRules = {} as Record<SectionId, SectionRule>;

  for (const section of SECTION_IDS) {
    const rawRule = isRecord(rawRules[section]) ? rawRules[section] : {};
    sectionRules[section] = {
      enabled:
        typeof rawRule.enabled === "boolean"
          ? rawRule.enabled
          : defaults.sectionRules[section].enabled,
      dailyLimitMinutes: normalizeDailyLimit(rawRule.dailyLimitMinutes),
      schedules: Array.isArray(rawRule.schedules)
        ? rawRule.schedules.slice(0, MAX_TIME_ACCESS_RULES).map(normalizeSchedule).filter(isDefined)
        : []
    };
  }

  const rawAccess = isRecord(value.temporaryAccess) ? value.temporaryAccess : {};
  const temporaryAccess: TemporaryAccessSettings = {
    enabled:
      typeof rawAccess.enabled === "boolean" ? rawAccess.enabled : defaults.temporaryAccess.enabled,
    durationMinutes: clampInteger(rawAccess.durationMinutes, 1, 60, 5),
    maxUsesPerDay: clampInteger(rawAccess.maxUsesPerDay, 0, 50, 3)
  };

  const rawPlanMode = isRecord(value.planMode)
    ? value.planMode
    : isRecord(rawBilibili.planMode)
      ? rawBilibili.planMode
      : {};
  const planMode: PlanModeSettings = {
    enabled: typeof rawPlanMode.enabled === "boolean" ? rawPlanMode.enabled : false,
    independentAccessTiming:
      typeof rawPlanMode.independentAccessTiming === "boolean"
        ? rawPlanMode.independentAccessTiming
        : true,
    enableAllBlocking: rawPlanMode.enableAllBlocking !== false,
    watchDurationMinutes: clampInteger(rawPlanMode.watchDurationMinutes, 1, 360, 45),
    defaultCompletionMode:
      rawPlanMode.defaultCompletionMode === "lenient" ||
      rawPlanMode.defaultCompletionMode === "strict"
        ? rawPlanMode.defaultCompletionMode
        : "flow",
    autoCompleteOnStart: rawPlanMode.autoCompleteOnStart === true
  };

  const rawEndPage = isRecord(value.endPage) ? value.endPage : {};
  const rawGroupUnlock = isRecord(rawEndPage.groupUnlock) ? rawEndPage.groupUnlock : {};
  const endPage: EndPageSettings = {
    view:
      rawEndPage.view === "message" || rawEndPage.view === "minimal"
        ? rawEndPage.view
        : ("dashboard" as const),
    motivationalMessage:
      typeof rawEndPage.motivationalMessage === "string"
        ? rawEndPage.motivationalMessage.trim().slice(0, 500)
        : "",
    flowConsumesNextGroup: rawEndPage.flowConsumesNextGroup === true,
    repeatConfirmationInNewTabs: rawEndPage.repeatConfirmationInNewTabs === true,
    groupUnlock: {
      method:
        rawGroupUnlock.method === "wait" ||
        rawGroupUnlock.method === "math" ||
        rawGroupUnlock.method === "password"
          ? rawGroupUnlock.method
          : rawGroupUnlock.method === "none"
            ? "none"
            : "wait",
      waitMinutes:
        Math.max(
          1,
          Math.min(
            10800,
            Number(
              rawGroupUnlock.waitSeconds ??
                (typeof rawGroupUnlock.waitMinutes === "number"
                  ? rawGroupUnlock.waitMinutes * 60
                  : 30)
            ) || 30
          )
        ) / 60,
      waitSeconds: clampInteger(
        rawGroupUnlock.waitSeconds ??
          (typeof rawGroupUnlock.waitMinutes === "number" ? rawGroupUnlock.waitMinutes * 60 : 30),
        1,
        10800,
        30
      ),
      mathDifficulty: rawGroupUnlock.mathDifficulty === "calculus" ? "calculus" : "equation",
      passwordVerifier:
        typeof rawGroupUnlock.passwordVerifier === "string" &&
        /^[a-f0-9]{64}$/u.test(rawGroupUnlock.passwordVerifier)
          ? rawGroupUnlock.passwordVerifier
          : ""
    }
  };

  const contentFilters = normalizeContentFilters(
    value.contentFilters ?? rawBilibili.contentFilters,
    defaults.contentFilters
  );
  const { sites, targets } = normalizeManagedConfiguration(value.sites, value.targets);
  const customTimePeriodPresets = normalizeCustomTimePeriodPresets(value.customTimePeriodPresets);

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
    showRemainingMinutesOnIcon:
      typeof value.showRemainingMinutesOnIcon === "boolean"
        ? value.showRemainingMinutesOnIcon
        : defaults.showRemainingMinutesOnIcon,
    locale: value.locale === "zh-CN" || value.locale === "en" ? value.locale : ("system" as const),
    theme: isUiTheme(value.theme) ? value.theme : defaults.theme,
    endPage,
    disableProtection: normalizeDisableProtection(value.disableProtection),
    sites,
    targets,
    customTimePeriodPresets,
    sectionRules,
    temporaryAccess,
    planMode,
    contentFilters,
    legacyCapsules: {
      bilibili: { schemaVersion: 2, sectionRules, planMode, contentFilters }
    }
  };
}

function normalizeManagedConfiguration(
  sitesValue: unknown,
  targetsValue: unknown
): { sites: Record<SiteId, ManagedSite>; targets: Record<TargetId, SiteTargetSettings> } {
  const sites: Record<SiteId, ManagedSite> = {};
  const targets: Record<TargetId, SiteTargetSettings> = {};
  const rawSites = isRecord(sitesValue) ? sitesValue : {};
  const rawTargets = isRecord(targetsValue) ? targetsValue : {};

  for (const [siteId, rawValue] of Object.entries(rawSites).slice(0, MAX_MANAGED_SITES)) {
    if (!isStableId(siteId) || !isRecord(rawValue)) continue;
    const origin = normalizeOrigin(rawValue.origin);
    if (!origin) continue;
    const matchPatterns = normalizeSiteMatchPatterns(origin, rawValue.matchPatterns);
    const createdAt = normalizeTimestamp(rawValue.createdAt);
    const updatedAt = normalizeTimestamp(rawValue.updatedAt, createdAt);
    sites[siteId] = {
      id: siteId,
      origin,
      ...(matchPatterns ? { matchPatterns } : {}),
      hostname: new URL(origin).hostname,
      label: normalizeLabel(rawValue.label, new URL(origin).hostname),
      // Schema v4.1 removes the hidden website master switch. Keep the field
      // true as a storage compatibility mirror so an old disabled value cannot
      // silently override the visible per-period switches.
      enabled: true,
      restrictionMode:
        rawValue.restrictionMode === "lenient" || rawValue.restrictionMode === "flow"
          ? rawValue.restrictionMode
          : "strict",
      visitConfirmation: normalizeVisitConfirmation(rawValue.visitConfirmation),
      targetIds: [],
      createdAt,
      updatedAt
    };
  }

  for (const [targetId, rawValue] of Object.entries(rawTargets).slice(0, MAX_TARGETS)) {
    if (!isStableId(targetId) || !isRecord(rawValue) || !isStableId(rawValue.siteId)) continue;
    const site = sites[rawValue.siteId];
    if (!site) continue;
    const rawAccess = isRecord(rawValue.temporaryAccess) ? rawValue.temporaryAccess : {};
    const schedules = Array.isArray(rawValue.schedules)
      ? rawValue.schedules.slice(0, MAX_TIME_ACCESS_RULES).map(normalizeSchedule).filter(isDefined)
      : [];
    const timePeriods = Array.isArray(rawValue.timePeriods)
      ? rawValue.timePeriods.slice(0, MAX_TIME_PERIODS).map(normalizeTimePeriod).filter(isDefined)
      : migrateLegacyTimePeriods(
          schedules,
          rawValue.dailyLimitMinutes,
          targetId,
          rawValue.accessPolicy
        );
    const target: SiteTargetSettings = {
      id: targetId,
      siteId: site.id,
      label: normalizeLabel(rawValue.label, site.label),
      // Availability is now exclusively controlled by timePeriods[].enabled.
      enabled: true,
      // Schema v4 evaluates availability exclusively through time periods. The
      // legacy direct policy is absorbed above only when canonical periods are
      // absent, then normalized away so it cannot silently override UI edits.
      accessPolicy: "timed",
      dailyLimitMinutes: normalizeDailyLimit(rawValue.dailyLimitMinutes),
      schedules,
      timePeriods,
      temporaryAccess: {
        enabled: typeof rawAccess.enabled === "boolean" ? rawAccess.enabled : true,
        durationMinutes: clampInteger(rawAccess.durationMinutes, 1, 60, 5),
        maxUsesPerDay: clampInteger(rawAccess.maxUsesPerDay, 0, 50, 3)
      },
      ...(isStableId(rawValue.moduleId) ? { moduleId: rawValue.moduleId } : {}),
      ...(isStableId(rawValue.moduleSectionId)
        ? { moduleSectionId: rawValue.moduleSectionId }
        : {}),
      ...(isStableId(rawValue.moduleTargetId) ? { moduleTargetId: rawValue.moduleTargetId } : {}),
      ...(typeof rawValue.moduleEnabled === "boolean"
        ? { moduleEnabled: rawValue.moduleEnabled }
        : {})
    };
    targets[targetId] = target;
    site.targetIds.push(targetId);
  }
  for (const [siteId, rawValue] of Object.entries(rawSites).slice(0, MAX_MANAGED_SITES)) {
    const site = sites[siteId];
    if (!site || !isRecord(rawValue) || !Array.isArray(rawValue.targetIds)) continue;
    for (const targetId of rawValue.targetIds.slice(0, MAX_TARGETS)) {
      if (
        isStableId(targetId) &&
        targets[targetId]?.moduleId &&
        !site.targetIds.includes(targetId)
      ) {
        site.targetIds.push(targetId);
      }
    }
  }
  return { sites, targets };
}

function normalizeContentFilters(
  value: unknown,
  defaults: ContentFilterSettings
): ContentFilterSettings {
  const raw = isRecord(value) ? value : {};
  const rawHidden = isRecord(raw.hiddenElements) ? raw.hiddenElements : {};
  const hiddenElements = {} as Record<ContentFilterId, boolean>;
  for (const id of CONTENT_FILTER_IDS) {
    hiddenElements[id] =
      typeof rawHidden[id] === "boolean" ? rawHidden[id] : defaults.hiddenElements[id];
  }

  const rawCards = isRecord(raw.videoCards) ? raw.videoCards : {};
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    hiddenElements,
    videoCards: {
      enabled: typeof rawCards.enabled === "boolean" ? rawCards.enabled : false,
      keywords: normalizeFilterTerms(rawCards.keywords),
      regexPatterns: normalizeFilterTerms(rawCards.regexPatterns)
    },
    slashToSearch: typeof raw.slashToSearch === "boolean" ? raw.slashToSearch : true
  };
}

function normalizeFilterTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean);
  return [...new Set(normalized)].slice(0, 50);
}

function normalizeSchedule(value: unknown): TimeAccessRule | undefined {
  if (!isRecord(value)) return undefined;
  const startTime = normalizeTime(value.startTime);
  const endTime = normalizeTime(value.endTime);
  if (!startTime || !endTime) return undefined;

  const uniqueDays = Array.isArray(value.days)
    ? [...new Set(value.days.filter(isWeekday))].sort((a, b) => a - b)
    : [];

  return {
    id: isStableId(value.id) ? value.id : createId(),
    name: typeof value.name === "string" ? value.name.trim().slice(0, 60) : "时间规则",
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    // schema v1 schedules were block-only. A missing effect is migrated without
    // changing the user's existing access windows.
    effect: isTimeAccessEffect(value.effect) ? value.effect : "block",
    days: uniqueDays,
    startTime,
    endTime
  };
}

function normalizeTimePeriod(value: unknown): TimePeriodSettings | undefined {
  if (!isRecord(value)) return undefined;
  const startTime = normalizeTime(value.startTime);
  const endTime = normalizeTime(value.endTime);
  if (!startTime || !endTime) return undefined;
  const days = Array.isArray(value.days)
    ? [...new Set(value.days.filter(isWeekday))].sort((left, right) => left - right)
    : [];
  if (days.length === 0) return undefined;
  const behavior =
    value.behavior === "always-allow" || value.behavior === "always-block"
      ? value.behavior
      : "timed";
  return {
    id: isStableId(value.id) ? value.id : createId(),
    name: normalizeTimePeriodName(value.name),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    days,
    startTime,
    endTime,
    behavior,
    limitMinutes: behavior === "timed" ? normalizeDailyLimit(value.limitMinutes) : null,
    groupCount: behavior === "timed" ? clampInteger(value.groupCount, 1, 24, 1) : 1
  };
}

function migrateLegacyTimePeriods(
  schedules: TimeAccessRule[],
  rawDailyLimit: unknown,
  targetId: string,
  rawAccessPolicy?: unknown
): TimePeriodSettings[] {
  if (rawAccessPolicy === "always-allow" || rawAccessPolicy === "always-block") {
    return [
      {
        ...createDefaultTimePeriod(),
        id: `period:legacy-policy:${targetId}`.slice(0, 128),
        behavior: rawAccessPolicy
      }
    ];
  }
  if (schedules.length === 0) {
    return [
      {
        ...createDefaultTimePeriod(normalizeDailyLimit(rawDailyLimit)),
        id: `period:legacy-default:${targetId}`.slice(0, 128)
      }
    ];
  }
  const migrated: TimePeriodSettings[] = schedules.map((schedule) => ({
    id: `period:${schedule.id}`.slice(0, 128),
    name: schedule.name,
    enabled: schedule.enabled,
    days: [...schedule.days],
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    behavior: schedule.effect === "allow" ? "always-allow" : "always-block",
    limitMinutes: null,
    groupCount: 1
  }));
  // Legacy block-only schedules allowed time outside the blocked windows and
  // then applied the target's daily allowance. Preserve that behavior with an
  // all-day timed fallback. Any legacy allow rule formed a closed allowlist.
  if (!schedules.some((schedule) => schedule.effect === "allow")) {
    migrated.push({
      ...createDefaultTimePeriod(normalizeDailyLimit(rawDailyLimit)),
      id: `period:legacy-fallback:${targetId}`.slice(0, 128)
    });
  }
  return migrated;
}

export function createDefaultTimePeriod(limitMinutes: number | null = null): TimePeriodSettings {
  return {
    id: createId().replace(/^schedule-/u, "period-"),
    // Empty is the locale-independent marker for the system-provided name. UI
    // surfaces translate it at render time instead of persisting one language.
    name: "",
    enabled: true,
    days: [0, 1, 2, 3, 4, 5, 6],
    startTime: "00:00",
    endTime: "00:00",
    behavior: "timed",
    limitMinutes,
    groupCount: 1
  };
}

function normalizeTimePeriodName(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = value.trim().slice(0, 60);
  return name === "全天" || name === "时间段" ? "" : name;
}

function normalizeCustomTimePeriodPresets(value: unknown): CustomTimePeriodPreset[] {
  if (!Array.isArray(value)) return [];
  const presets: CustomTimePeriodPreset[] = [];
  const usedIds = new Set<string>();
  for (const rawPreset of value.slice(0, MAX_CUSTOM_TIME_PERIOD_PRESETS)) {
    if (!isRecord(rawPreset) || !isStableId(rawPreset.id) || usedIds.has(rawPreset.id)) continue;
    const name = normalizeTimePeriodName(rawPreset.name);
    if (!name || !Array.isArray(rawPreset.periods)) continue;
    const periods = rawPreset.periods
      .slice(0, MAX_CUSTOM_TIME_PERIOD_PRESET_PERIODS)
      .map(normalizeCustomTimePeriodPresetPeriod)
      .filter(isDefined);
    if (periods.length === 0) continue;
    usedIds.add(rawPreset.id);
    presets.push({ id: rawPreset.id, name, periods });
  }
  return presets;
}

function normalizeCustomTimePeriodPresetPeriod(
  value: unknown
): CustomTimePeriodPreset["periods"][number] | undefined {
  if (!isRecord(value)) return undefined;
  const startTime = normalizeTime(value.startTime);
  const endTime = normalizeTime(value.endTime);
  if (!startTime || !endTime) return undefined;
  return {
    name: normalizeTimePeriodName(value.name),
    startTime,
    endTime,
    limitMinutes: clampInteger(value.limitMinutes, 1, 1440, 45),
    groupCount: clampInteger(value.groupCount, 1, 24, 1)
  };
}

export function isTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeTime(value: unknown): string | undefined {
  return isTimeOfDay(value) ? value : undefined;
}

function isWeekday(value: unknown): value is Weekday {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 6;
}

function isUiTheme(value: unknown): value is UiTheme {
  return typeof value === "string" && (UI_THEMES as readonly string[]).includes(value);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function cloneSettings(settings: Readonly<FocusSettings>): FocusSettings {
  const sectionRules = {} as Record<SectionId, SectionRule>;
  for (const section of SECTION_IDS) {
    sectionRules[section] = {
      enabled: settings.sectionRules[section].enabled,
      dailyLimitMinutes: settings.sectionRules[section].dailyLimitMinutes,
      schedules: settings.sectionRules[section].schedules.map(cloneSchedule)
    };
  }
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: settings.enabled,
    showRemainingMinutesOnIcon: settings.showRemainingMinutesOnIcon,
    locale: settings.locale,
    theme: settings.theme,
    disableProtection: { ...settings.disableProtection },
    endPage: {
      ...settings.endPage,
      groupUnlock: { ...settings.endPage.groupUnlock }
    },
    sites: Object.fromEntries(
      Object.entries(settings.sites).map(([id, site]) => [
        id,
        {
          ...site,
          targetIds: [...site.targetIds],
          ...(site.matchPatterns ? { matchPatterns: [...site.matchPatterns] } : {}),
          ...(site.visitConfirmation ? { visitConfirmation: { ...site.visitConfirmation } } : {})
        }
      ])
    ),
    customTimePeriodPresets: settings.customTimePeriodPresets.map(cloneCustomTimePeriodPreset),
    targets: Object.fromEntries(
      Object.entries(settings.targets).map(([id, target]) => [
        id,
        {
          ...target,
          schedules: target.schedules.map(cloneSchedule),
          timePeriods: target.timePeriods.map(cloneTimePeriod),
          temporaryAccess: { ...target.temporaryAccess }
        }
      ])
    ),
    sectionRules,
    temporaryAccess: { ...settings.temporaryAccess },
    planMode: { ...settings.planMode },
    contentFilters: {
      ...settings.contentFilters,
      hiddenElements: { ...settings.contentFilters.hiddenElements },
      videoCards: {
        ...settings.contentFilters.videoCards,
        keywords: [...settings.contentFilters.videoCards.keywords],
        regexPatterns: [...settings.contentFilters.videoCards.regexPatterns]
      }
    },
    legacyCapsules: {
      bilibili: {
        schemaVersion: 2,
        sectionRules,
        planMode: { ...settings.planMode },
        contentFilters: {
          ...settings.contentFilters,
          hiddenElements: { ...settings.contentFilters.hiddenElements },
          videoCards: {
            ...settings.contentFilters.videoCards,
            keywords: [...settings.contentFilters.videoCards.keywords],
            regexPatterns: [...settings.contentFilters.videoCards.regexPatterns]
          }
        }
      }
    }
  };
}

function createUnsafeDefaultSettings(): FocusSettings {
  const sectionRules = {} as Record<SectionId, SectionRule>;
  for (const section of SECTION_IDS) sectionRules[section] = defaultRule(section);
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: true,
    disableProtection: { method: "none", waitMinutes: 1, passwordVerifier: "" },
    showRemainingMinutesOnIcon: true,
    locale: "system",
    theme: "verdant",
    endPage: {
      view: "dashboard",
      motivationalMessage: "",
      flowConsumesNextGroup: false,
      repeatConfirmationInNewTabs: false,
      groupUnlock: {
        method: "wait",
        waitMinutes: 0.5,
        waitSeconds: 30,
        mathDifficulty: "equation",
        passwordVerifier: ""
      }
    },
    sites: {},
    targets: {},
    customTimePeriodPresets: [],
    sectionRules,
    temporaryAccess: { enabled: true, durationMinutes: 5, maxUsesPerDay: 3 },
    planMode: {
      enabled: false,
      independentAccessTiming: true,
      enableAllBlocking: true,
      watchDurationMinutes: 45,
      defaultCompletionMode: "flow",
      autoCompleteOnStart: false
    },
    contentFilters: {
      enabled: true,
      hiddenElements: { ...DEFAULT_HIDDEN_ELEMENTS },
      videoCards: { enabled: false, keywords: [], regexPatterns: [] },
      slashToSearch: true
    },
    legacyCapsules: {}
  };
}

function cloneCustomTimePeriodPreset(preset: CustomTimePeriodPreset): CustomTimePeriodPreset {
  return {
    ...preset,
    periods: preset.periods.map((period) => ({ ...period }))
  };
}

function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback.slice(0, 80);
  return value.trim().slice(0, 80) || fallback.slice(0, 80);
}

function normalizeTimestamp(value: unknown, fallback = Date.now()): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function normalizeVisitConfirmation(value: unknown): {
  enabled: boolean;
  waitSeconds: number;
  prompt?: string;
} {
  const raw = isRecord(value) ? value : {};
  const prompt =
    typeof raw.prompt === "string"
      ? raw.prompt.trim().slice(0, MAX_VISIT_CONFIRMATION_PROMPT_LENGTH)
      : "";
  return {
    enabled: true,
    waitSeconds: clampInteger(raw.waitSeconds, 0, 60, 3),
    ...(prompt ? { prompt } : {})
  };
}

export function isStableId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function cloneSchedule(schedule: TimeAccessRule): TimeAccessRule {
  return { ...schedule, days: [...schedule.days] };
}

function cloneTimePeriod(period: TimePeriodSettings): TimePeriodSettings {
  return { ...period, days: [...period.days] };
}

function isTimeAccessEffect(value: unknown): value is TimeAccessEffect {
  return value === "allow" || value === "block";
}

function normalizeDailyLimit(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1_440, Math.max(1, Math.round(value)));
}

function createId(): string {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === "function") return cryptoObject.randomUUID();
  return `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function normalizeDisableProtection(value: unknown): FocusSettings["disableProtection"] {
  const raw = isRecord(value) ? value : {};
  return {
    method: raw.method === "wait" || raw.method === "password" ? raw.method : "none",
    waitMinutes: [1, 3, 5, 10].includes(Number(raw.waitMinutes)) ? Number(raw.waitMinutes) : 1,
    passwordVerifier:
      typeof raw.passwordVerifier === "string" && /^[a-f0-9]{64}$/.test(raw.passwordVerifier)
        ? raw.passwordVerifier
        : ""
  };
}
