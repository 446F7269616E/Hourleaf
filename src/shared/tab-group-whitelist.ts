import { isScheduleActive, timeToMinutes } from "./schedule";
import type { Weekday } from "./types";

export const MAX_TAB_GROUP_WHITELIST_RULES = 64;

/** Portable settings deliberately contain no browser group ID. */
export interface TabGroupWhitelistRule {
  id: string;
  name: string;
  enabled: boolean;
  days: Weekday[];
  startTime: string;
  endTime: string;
}

export interface TabGroupWhitelistState {
  supported: boolean;
  groups: Array<{ id: number; title: string; windowId: number }>;
  rules: Array<{ rule: TabGroupWhitelistRule; groupId: number | null }>;
}

export function parseTabGroupWhitelistRule(value: unknown): TabGroupWhitelistRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) => !["id", "name", "enabled", "days", "startTime", "endTime"].includes(key)
    ) ||
    typeof raw.id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.id) ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    raw.name.length > 80 ||
    typeof raw.enabled !== "boolean" ||
    !Array.isArray(raw.days) ||
    raw.days.length === 0 ||
    raw.days.length > 7 ||
    raw.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(raw.days).size !== raw.days.length ||
    typeof raw.startTime !== "string" ||
    timeToMinutes(raw.startTime) === null ||
    typeof raw.endTime !== "string" ||
    timeToMinutes(raw.endTime) === null
  )
    return null;
  return {
    id: raw.id,
    name: raw.name.trim(),
    enabled: raw.enabled,
    days: raw.days.filter(isWeekday).sort((a, b) => a - b),
    startTime: raw.startTime,
    endTime: raw.endTime
  };
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function normalizeTabGroupWhitelistRules(value: unknown): TabGroupWhitelistRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, MAX_TAB_GROUP_WHITELIST_RULES).flatMap((raw) => {
    const rule = parseTabGroupWhitelistRule(raw);
    if (!rule || seen.has(rule.id)) return [];
    seen.add(rule.id);
    return [rule];
  });
}

export function isTabGroupWhitelistActive(rule: TabGroupWhitelistRule, now: Date): boolean {
  return isScheduleActive({ ...rule, effect: "allow" }, now);
}
