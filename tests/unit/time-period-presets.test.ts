import { describe, expect, it } from "vitest";
import { MAX_TIME_PERIODS, createDefaultTimePeriod } from "../../src/shared/config";
import {
  PERIOD_PRESETS,
  applyCustomPresetToPeriods,
  applyPresetToPeriods,
  buildCustomPresetPeriods,
  buildPresetPeriods
} from "../../src/shared/time-period-presets";
import type { TimePeriodSettings } from "../../src/shared/types";

function ids(): () => string {
  let value = 0;
  return () => `period:test-${++value}`;
}

describe("time period presets", () => {
  it("builds every preset as canonical timed periods with unique ids", () => {
    for (const preset of PERIOD_PRESETS) {
      const periods = buildPresetPeriods(preset.id, ids(), (key) => `name:${key}`);
      expect(periods).not.toBeNull();
      expect(new Set(periods?.map((period) => period.id)).size).toBe(periods?.length);
      for (const period of periods ?? []) {
        expect(period.name).toMatch(/^name:/u);
        expect(period.enabled).toBe(true);
        expect(period.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(period.behavior).toBe("timed");
        expect(period.limitMinutes).toBeGreaterThan(0);
        expect(period.groupCount).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("models meals, day-part, early-bird, and night-owl presets", () => {
    const meals = buildPresetPeriods("meals", ids()) ?? [];
    expect(
      meals.map(({ startTime, endTime, limitMinutes, groupCount }) => ({
        startTime,
        endTime,
        limitMinutes,
        groupCount
      }))
    ).toEqual([
      { startTime: "07:00", endTime: "09:00", limitMinutes: 30, groupCount: 1 },
      { startTime: "12:00", endTime: "14:00", limitMinutes: 30, groupCount: 1 },
      { startTime: "18:00", endTime: "20:00", limitMinutes: 30, groupCount: 1 }
    ]);
    const split = buildPresetPeriods("noon-split", ids()) ?? [];
    expect(
      split.map(({ startTime, endTime, limitMinutes, groupCount }) => ({
        startTime,
        endTime,
        limitMinutes,
        groupCount
      }))
    ).toEqual([
      { startTime: "06:00", endTime: "12:00", limitMinutes: 30, groupCount: 2 },
      { startTime: "12:00", endTime: "18:00", limitMinutes: 30, groupCount: 2 }
    ]);
    expect(buildPresetPeriods("morning", ids())?.[0]).toMatchObject({
      startTime: "06:00",
      endTime: "12:00",
      limitMinutes: 60,
      groupCount: 3
    });
    expect(buildPresetPeriods("afternoon", ids())?.[0]).toMatchObject({
      startTime: "12:00",
      endTime: "18:00",
      limitMinutes: 60,
      groupCount: 3
    });
    expect(buildPresetPeriods("evening", ids())?.[0]).toMatchObject({
      startTime: "18:00",
      endTime: "00:00",
      limitMinutes: 60,
      groupCount: 3
    });
    expect(buildPresetPeriods("early-bird", ids())).toMatchObject([
      { startTime: "00:00", endTime: "06:00", limitMinutes: 30, groupCount: 2 },
      { startTime: "06:00", endTime: "12:00", limitMinutes: 30, groupCount: 2 }
    ]);
    expect(buildPresetPeriods("night-owl", ids())).toMatchObject([
      { startTime: "12:00", endTime: "18:00", limitMinutes: 30, groupCount: 2 },
      { startTime: "18:00", endTime: "00:00", limitMinutes: 30, groupCount: 2 }
    ]);
  });

  it("replaces only the untouched default all-day period", () => {
    const original = createDefaultTimePeriod();
    const result = applyPresetToPeriods([original], "morning", ids());
    expect(result).toMatchObject({ ok: true, replacedDefault: true });
    if (result.ok) expect(result.periods).toHaveLength(1);

    const edited: TimePeriodSettings = { ...original, limitMinutes: 45 };
    const appended = applyPresetToPeriods([edited], "morning", ids());
    expect(appended).toMatchObject({ ok: true, replacedDefault: false });
    if (appended.ok) {
      expect(appended.periods).toHaveLength(2);
      expect(appended.periods[0]).toEqual(edited);
    }
  });

  it("creates fresh runtime periods when a named custom preset is reused", () => {
    const customPreset = {
      id: "preset:study-breaks",
      name: "学习间歇",
      periods: [
        {
          name: "上午休息",
          startTime: "09:00",
          endTime: "10:00",
          limitMinutes: 20,
          groupCount: 2
        },
        {
          name: "下午休息",
          startTime: "15:00",
          endTime: "16:00",
          limitMinutes: 30,
          groupCount: 1
        }
      ]
    };
    const createId = ids();
    const first = buildCustomPresetPeriods(customPreset, createId);
    const second = buildCustomPresetPeriods(customPreset, createId);
    expect(first).toEqual(expect.arrayContaining([expect.objectContaining({ enabled: true })]));
    expect(first.map((period) => period.id)).not.toEqual(second.map((period) => period.id));

    const applied = applyCustomPresetToPeriods([createDefaultTimePeriod()], customPreset, ids());
    expect(applied).toMatchObject({ ok: true, replacedDefault: true });
    if (applied.ok)
      expect(applied.periods.map((period) => period.name)).toEqual(["上午休息", "下午休息"]);
  });

  it("rejects unknown presets and capacity overflow without truncation", () => {
    expect(applyPresetToPeriods([], "missing", ids())).toEqual({
      ok: false,
      reason: "unknown-preset"
    });
    const full = Array.from({ length: MAX_TIME_PERIODS }, (_, index) => ({
      ...createDefaultTimePeriod(10),
      id: `period:existing-${index}`,
      name: `Existing ${index}`
    }));
    expect(applyPresetToPeriods(full, "morning", ids())).toEqual({
      ok: false,
      reason: "limit-reached"
    });
  });
});
