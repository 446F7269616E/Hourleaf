import { isDailyTimeRangeActive } from "../../shared/schedule";
import { siteScopeKey } from "../../shared/site-scope";
import type { FocusSettings, TimePeriodSettings } from "../../shared/types";
import type {
  LocalModuleDefinition,
  LocalModuleFilterSchedules,
  LocalModuleInstallation,
  LocalModuleTimePeriodReference
} from "./types";

export const MAX_FILTER_TIME_PERIODS = 64;
type ScheduleSettings = Pick<FocusSettings, "sites" | "targets">;
type ScheduleModule = Pick<LocalModuleDefinition, "matches">;

/** Use reviewed website families; arbitrary websites retain exact-origin scope. */
function matchesModuleWebsite(origin: string, module: ScheduleModule): boolean {
  const scope = siteScopeKey(origin);
  return (
    scope !== null && module.matches.some((pattern) => siteScopeKey(pattern.slice(0, -2)) === scope)
  );
}

export interface ConfiguredFilterTimePeriod extends LocalModuleTimePeriodReference {
  website: string;
  target: string;
  period: Pick<TimePeriodSettings, "name" | "startTime" | "endTime">;
}

export function configuredFilterTimePeriods(
  settings: ScheduleSettings,
  module: ScheduleModule
): ConfiguredFilterTimePeriod[] {
  return Object.values(settings.targets).flatMap((target) => {
    const site = settings.sites[target.siteId];
    if (!site || !site.targetIds.includes(target.id) || !matchesModuleWebsite(site.origin, module))
      return [];
    return target.timePeriods.map((period) => ({
      targetId: target.id,
      periodId: period.id,
      website: site.label || site.hostname,
      target: target.label,
      period: {
        name: period.name,
        startTime: period.startTime,
        endTime: period.endTime
      }
    }));
  });
}

/** Same bounded canonical representation for storage, messages, and backups. */
export function normalizeFilterSchedules(
  value: unknown,
  groupIds?: readonly string[]
): LocalModuleFilterSchedules | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 24) return null;
  const normalized: Array<[string, LocalModuleTimePeriodReference[]]> = [];
  for (const [groupId, references] of entries) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(groupId) || !Array.isArray(references)) return null;
    if (references.length > MAX_FILTER_TIME_PERIODS) return null;
    const unique = new Map<string, LocalModuleTimePeriodReference>();
    for (const reference of references) {
      if (!reference || typeof reference !== "object" || Array.isArray(reference)) return null;
      const raw = reference as Record<string, unknown>;
      if (
        Object.keys(raw).length !== 2 ||
        !isReferenceId(raw.targetId) ||
        !isReferenceId(raw.periodId)
      )
        return null;
      const item = { targetId: raw.targetId, periodId: raw.periodId };
      unique.set(JSON.stringify(item), item);
    }
    if (!groupIds || groupIds.includes(groupId))
      normalized.push([groupId, [...unique.values()].sort(compareTimePeriodReferences)]);
  }
  return Object.fromEntries(normalized.sort(([left], [right]) => left.localeCompare(right)));
}

function compareTimePeriodReferences(
  left: LocalModuleTimePeriodReference,
  right: LocalModuleTimePeriodReference
): number {
  return left.targetId.localeCompare(right.targetId) || left.periodId.localeCompare(right.periodId);
}

export function filterScheduleReferences(
  schedules: LocalModuleFilterSchedules | undefined,
  groupId: string
): LocalModuleTimePeriodReference[] | undefined {
  return schedules && Object.hasOwn(schedules, groupId) ? schedules[groupId] : undefined;
}

export function referencedTimePeriod(
  reference: LocalModuleTimePeriodReference,
  settings: ScheduleSettings,
  module: ScheduleModule
): TimePeriodSettings | undefined {
  const target = settings.targets[reference.targetId];
  const site = target && settings.sites[target.siteId];
  if (!target || !site?.targetIds.includes(target.id) || !matchesModuleWebsite(site.origin, module))
    return undefined;
  return target.timePeriods.find((period) => period.id === reference.periodId);
}

export function isFilterScheduleActive(
  references: readonly LocalModuleTimePeriodReference[] | undefined,
  settings: ScheduleSettings | undefined,
  module: ScheduleModule,
  now = new Date()
): boolean {
  if (references === undefined) return true;
  return Boolean(
    settings &&
    references.some((reference) => {
      const period = referencedTimePeriod(reference, settings, module);
      return period && isDailyTimeRangeActive(period, now);
    })
  );
}

/** Wake at daily blacklist edges even when the website's source period is disabled. */
export function nextFilterScheduleCheck(
  installations: readonly Pick<LocalModuleInstallation, "definition" | "filterGroupSchedules">[],
  settings: ScheduleSettings,
  now = new Date()
): number | undefined {
  let next = Infinity;
  const checked = new Set<string>();
  for (const installation of installations) {
    for (const reference of Object.values(installation.filterGroupSchedules ?? {}).flat()) {
      const key = JSON.stringify([installation.definition.matches, reference]);
      if (checked.has(key)) continue;
      checked.add(key);
      const period = referencedTimePeriod(reference, settings, installation.definition);
      if (!period || period.startTime === period.endTime) continue;
      // Full-day ranges do not change with the clock; overnight ranges use both edges.
      for (let day = 0; day <= 1; day += 1) {
        for (const time of [period.startTime, period.endTime]) {
          const [hour, minute] = time.split(":").map(Number);
          const boundary = new Date(now);
          boundary.setDate(boundary.getDate() + day);
          boundary.setHours(hour ?? 0, minute ?? 0, 0, 0);
          const timestamp = boundary.getTime();
          if (timestamp > now.getTime()) next = Math.min(next, timestamp);
        }
      }
    }
  }
  return Number.isFinite(next) ? next : undefined;
}

function isReferenceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(value);
}
