import { MAX_TIME_PERIODS } from "./config";
import type { CustomTimePeriodPreset, TimePeriodSettings, Weekday } from "./types";

export const PERIOD_PRESET_IDS = [
  "meals",
  "noon-split",
  "morning",
  "afternoon",
  "evening",
  "early-bird",
  "night-owl"
] as const;

export type PeriodPresetId = (typeof PERIOD_PRESET_IDS)[number];

export interface PeriodPresetSegment {
  nameKey: string;
  startTime: string;
  endTime: string;
  limitMinutes: number;
  groupCount: number;
}

export interface PeriodPreset {
  id: PeriodPresetId;
  labelKey: string;
  descriptionKey: string;
  segments: readonly PeriodPresetSegment[];
}

export interface PeriodTemplate {
  name: string;
  startTime: string;
  endTime: string;
  limitMinutes: number;
  groupCount: number;
}

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  {
    id: "meals",
    labelKey: "options.quickAdd.preset.meals",
    descriptionKey: "options.quickAdd.preset.mealsDescription",
    segments: [
      {
        nameKey: "options.quickAdd.segment.breakfast",
        startTime: "07:00",
        endTime: "09:00",
        limitMinutes: 30,
        groupCount: 1
      },
      {
        nameKey: "options.quickAdd.segment.lunch",
        startTime: "12:00",
        endTime: "14:00",
        limitMinutes: 30,
        groupCount: 1
      },
      {
        nameKey: "options.quickAdd.segment.dinner",
        startTime: "18:00",
        endTime: "20:00",
        limitMinutes: 30,
        groupCount: 1
      }
    ]
  },
  {
    id: "noon-split",
    labelKey: "options.quickAdd.preset.noonSplit",
    descriptionKey: "options.quickAdd.preset.noonSplitDescription",
    segments: [
      {
        nameKey: "options.quickAdd.segment.beforeNoon",
        startTime: "06:00",
        endTime: "12:00",
        limitMinutes: 30,
        groupCount: 2
      },
      {
        nameKey: "options.quickAdd.segment.afterNoon",
        startTime: "12:00",
        endTime: "18:00",
        limitMinutes: 30,
        groupCount: 2
      }
    ]
  },
  {
    id: "morning",
    labelKey: "options.quickAdd.preset.morning",
    descriptionKey: "options.quickAdd.preset.morningDescription",
    segments: [
      {
        nameKey: "options.quickAdd.segment.morning",
        startTime: "06:00",
        endTime: "12:00",
        limitMinutes: 60,
        groupCount: 3
      }
    ]
  },
  {
    id: "afternoon",
    labelKey: "options.quickAdd.preset.afternoon",
    descriptionKey: "options.quickAdd.preset.afternoonDescription",
    segments: [
      {
        nameKey: "options.quickAdd.segment.afternoon",
        startTime: "12:00",
        endTime: "18:00",
        limitMinutes: 60,
        groupCount: 3
      }
    ]
  },
  {
    id: "evening",
    labelKey: "options.quickAdd.preset.evening",
    descriptionKey: "options.quickAdd.preset.eveningDescription",
    segments: [
      {
        nameKey: "options.quickAdd.segment.evening",
        startTime: "18:00",
        endTime: "00:00",
        limitMinutes: 60,
        groupCount: 3
      }
    ]
  },
  {
    id: "early-bird",
    labelKey: "options.quickAdd.preset.earlyBird",
    descriptionKey: "options.quickAdd.preset.earlyBirdDescription",
    segments: [
      {
        nameKey: "options.quickAdd.segment.beforeDawn",
        startTime: "00:00",
        endTime: "06:00",
        limitMinutes: 30,
        groupCount: 2
      },
      {
        nameKey: "options.quickAdd.segment.earlyMorning",
        startTime: "06:00",
        endTime: "12:00",
        limitMinutes: 30,
        groupCount: 2
      }
    ]
  },
  {
    id: "night-owl",
    labelKey: "options.quickAdd.preset.nightOwl",
    descriptionKey: "options.quickAdd.preset.nightOwlDescription",
    segments: [
      {
        nameKey: "options.quickAdd.segment.afternoon",
        startTime: "12:00",
        endTime: "18:00",
        limitMinutes: 30,
        groupCount: 2
      },
      {
        nameKey: "options.quickAdd.segment.evening",
        startTime: "18:00",
        endTime: "00:00",
        limitMinutes: 30,
        groupCount: 2
      }
    ]
  }
] as const;

const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export type ApplyPeriodPresetResult =
  | {
      ok: true;
      periods: TimePeriodSettings[];
      added: TimePeriodSettings[];
      replacedDefault: boolean;
    }
  | { ok: false; reason: "unknown-preset" | "limit-reached" };

export function buildPresetPeriods(
  presetId: string,
  createId: () => string,
  resolveName: (key: string) => string = (key) => key
): TimePeriodSettings[] | null {
  const preset = PERIOD_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) return null;
  return buildPeriodsFromTemplates(
    preset.segments.map((segment) => ({ ...segment, name: resolveName(segment.nameKey) })),
    createId
  );
}

export function buildCustomPresetPeriods(
  preset: CustomTimePeriodPreset,
  createId: () => string
): TimePeriodSettings[] {
  return buildPeriodsFromTemplates(preset.periods, createId);
}

export function buildPeriodsFromTemplates(
  templates: readonly PeriodTemplate[],
  createId: () => string
): TimePeriodSettings[] {
  return templates.map((template) => ({
    id: createId(),
    name: template.name,
    enabled: true,
    days: [...EVERY_DAY],
    startTime: template.startTime,
    endTime: template.endTime,
    behavior: "timed",
    limitMinutes: template.limitMinutes,
    groupCount: template.groupCount
  }));
}

export function applyPresetToPeriods(
  existing: readonly TimePeriodSettings[],
  presetId: string,
  createId: () => string,
  resolveName?: (key: string) => string
): ApplyPeriodPresetResult {
  const added = buildPresetPeriods(presetId, createId, resolveName);
  if (!added) return { ok: false, reason: "unknown-preset" };
  return applyPeriodsToExisting(existing, added);
}

export function applyCustomPresetToPeriods(
  existing: readonly TimePeriodSettings[],
  preset: CustomTimePeriodPreset,
  createId: () => string
): ApplyPeriodPresetResult {
  return applyPeriodsToExisting(existing, buildCustomPresetPeriods(preset, createId));
}

export function applyPeriodsToExisting(
  existing: readonly TimePeriodSettings[],
  added: TimePeriodSettings[]
): ApplyPeriodPresetResult {
  const replacedDefault = existing.length === 1 && isUntouchedDefaultPeriod(existing[0]);
  const retained = replacedDefault ? [] : existing;
  if (retained.length + added.length > MAX_TIME_PERIODS) {
    return { ok: false, reason: "limit-reached" };
  }
  return {
    ok: true,
    periods: [...retained.map(clonePeriod), ...added],
    added,
    replacedDefault
  };
}

export function isUntouchedDefaultPeriod(period: TimePeriodSettings | undefined): boolean {
  return Boolean(
    period &&
    period.name === "" &&
    period.enabled &&
    period.startTime === "00:00" &&
    period.endTime === "00:00" &&
    period.behavior === "timed" &&
    period.limitMinutes === null &&
    period.groupCount === 1 &&
    period.days.length === EVERY_DAY.length &&
    EVERY_DAY.every((day) => period.days.includes(day))
  );
}

function clonePeriod(period: TimePeriodSettings): TimePeriodSettings {
  return { ...period, days: [...period.days] };
}
