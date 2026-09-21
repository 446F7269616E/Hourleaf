import { describe, expect, it } from "vitest";
import { isHttpUrl, parseMessageRequest } from "../../src/shared/messages";
import { createDefaultSettings } from "../../src/shared/config";
import { createConfigurationBackup } from "../../src/shared/configuration-backup";

describe("message boundary", () => {
  it("accepts only a fully validated configuration backup message", () => {
    const backup = createConfigurationBackup(
      createDefaultSettings(),
      { schemaVersion: 1, items: [] },
      { schemaVersion: 1, installations: {} },
      new Date(0)
    );
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "configuration-import",
        type: "IMPORT_CONFIGURATION",
        payload: { backup }
      })?.request
    ).toEqual({ type: "IMPORT_CONFIGURATION", backup });
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "configuration-import-bad",
        type: "IMPORT_CONFIGURATION",
        payload: { backup: { ...backup, schemaVersion: 99 } }
      })
    ).toBeNull();
  });
  it("accepts only scoped related-tab close requests", () => {
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "close-focus-tabs",
        type: "CLOSE_RELATED_TABS",
        payload: { source: "focus", siteId: "site:test" }
      })?.request
    ).toEqual({ type: "CLOSE_RELATED_TABS", source: "focus", siteId: "site:test" });
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "close-broad-tabs",
        type: "CLOSE_RELATED_TABS",
        payload: { source: "focus", siteId: "site:test", all: true }
      })
    ).toBeNull();
  });
  it("accepts a bounded versioned request", () => {
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "request-123",
        type: "GET_USAGE",
        payload: { period: "week", anchorDate: "2026-08-06" }
      })
    ).toEqual({
      requestId: "request-123",
      request: { type: "GET_USAGE", period: "week", anchorDate: "2026-08-06" }
    });
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "request-year",
        type: "GET_USAGE",
        payload: { period: "year" }
      })?.request
    ).toEqual({ type: "GET_USAGE", period: "year" });
  });

  it("rejects malformed, unknown and unsupported URL messages", () => {
    expect(
      parseMessageRequest({ version: 2, requestId: "x", type: "GET_SETTINGS", payload: {} })
    ).toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "x",
        type: "GET_PAGE_DECISION",
        payload: { url: "chrome://settings" }
      })
    ).toBeNull();
    expect(isHttpUrl("https://example.com/")).toBe(true);
    expect(isHttpUrl("file:///private/data")).toBe(false);
  });

  it("strictly validates plan mutations and navigation identities", () => {
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "plan-1",
        type: "ADD_PLAN_ITEM",
        payload: {
          title: "计划视频",
          url: "https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333",
          scheduledDurationMinutes: 45,
          completionMode: "flow",
          pauseOnVideoEnd: true
        }
      })
    ).toEqual({
      requestId: "plan-1",
      request: {
        type: "ADD_PLAN_ITEM",
        title: "计划视频",
        url: "https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333",
        scheduledDurationMinutes: 45,
        completionMode: "flow",
        pauseOnVideoEnd: true
      }
    });
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "plan-2",
        type: "GET_PLAN_NAVIGATION_DECISION",
        payload: { bvid: "BV1xx411c7mD" }
      })
    ).toEqual({
      requestId: "plan-2",
      request: { type: "GET_PLAN_NAVIGATION_DECISION", bvid: "BV1xx411c7mD" }
    });

    for (const payload of [
      { url: "file:///private/data", scheduledDurationMinutes: 45, completionMode: "flow" },
      { bvid: "BV-short", scheduledDurationMinutes: 45, completionMode: "flow" },
      {
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        scheduledDurationMinutes: 45,
        completionMode: "flow",
        unknown: true
      },
      {
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        title: "x".repeat(201),
        scheduledDurationMinutes: 45,
        completionMode: "flow"
      },
      {
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        scheduledDurationMinutes: 0,
        completionMode: "flow"
      },
      {
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        scheduledDurationMinutes: 45,
        completionMode: "unknown"
      },
      {
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        scheduledDurationMinutes: 45,
        completionMode: "strict",
        pauseOnVideoEnd: "yes"
      }
    ]) {
      expect(
        parseMessageRequest({
          version: 1,
          requestId: "bad-plan",
          type: "ADD_PLAN_ITEM",
          payload
        })
      ).toBeNull();
    }
  });

  it("validates plan defaults and bounded flow decisions", () => {
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "plan-settings",
        type: "SET_PLAN_MODE",
        payload: {
          defaultCompletionMode: "strict",
          autoCompleteOnStart: true,
          independentAccessTiming: false
        }
      })
    ).toEqual({
      requestId: "plan-settings",
      request: {
        type: "SET_PLAN_MODE",
        defaultCompletionMode: "strict",
        autoCompleteOnStart: true,
        independentAccessTiming: false
      }
    });

    expect(
      parseMessageRequest({
        version: 1,
        requestId: "plan-flow",
        type: "CONTINUE_PLAN_FLOW",
        payload: {
          itemId: "plan-item",
          continuation: { kind: "minutes", minutes: 15 },
          url: "https://example.com/planned"
        }
      })
    ).toEqual({
      requestId: "plan-flow",
      request: {
        type: "CONTINUE_PLAN_FLOW",
        itemId: "plan-item",
        continuation: { kind: "minutes", minutes: 15 },
        url: "https://example.com/planned"
      }
    });
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "plan-flow-video",
        type: "CONTINUE_PLAN_FLOW",
        payload: { itemId: "plan-item", continuation: { kind: "video-end" } }
      })
    ).not.toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "plan-pause-video",
        type: "STOP_PLAN_ACCESS",
        payload: {
          itemId: "plan-item",
          reason: "video-ended",
          url: "https://example.com/planned"
        }
      })
    ).not.toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "plan-flow-too-long",
        type: "CONTINUE_PLAN_FLOW",
        payload: { itemId: "plan-item", continuation: { kind: "minutes", minutes: 16 } }
      })
    ).toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "plan-stop",
        type: "STOP_PLAN_FLOW",
        payload: { itemId: "plan-item", reason: "video-ended" }
      })
    ).not.toBeNull();
  });

  it("validates bounded period runtime and website flow requests", () => {
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "period-unlock",
        type: "UNLOCK_PERIOD_GROUP",
        payload: { targetId: "target:test", periodId: "period:test", proof: "42" }
      })
    ).toEqual({
      requestId: "period-unlock",
      request: {
        type: "UNLOCK_PERIOD_GROUP",
        targetId: "target:test",
        periodId: "period:test",
        proof: "42"
      }
    });
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "period-flow",
        type: "GRANT_PERIOD_FLOW",
        payload: {
          url: "https://example.com/focus",
          targetId: "target:test",
          periodId: "period:test",
          continuation: { kind: "minutes", minutes: 15 }
        }
      })
    ).not.toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "period-flow-invalid",
        type: "GRANT_PERIOD_FLOW",
        payload: {
          url: "https://example.com/focus",
          targetId: "target:test",
          periodId: "period:test",
          continuation: { kind: "minutes", minutes: 16 }
        }
      })
    ).toBeNull();
  });

  it("validates visit confirmation settings and tab grants", () => {
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "visit-settings",
        type: "UPDATE_MANAGED_SITE",
        payload: {
          siteId: "site:test",
          patch: {
            visitConfirmation: {
              enabled: true,
              waitSeconds: 3,
              prompt: "确认当前任务需要这个网站"
            }
          }
        }
      })
    ).not.toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "visit-settings-invalid",
        type: "UPDATE_MANAGED_SITE",
        payload: {
          siteId: "site:test",
          patch: { visitConfirmation: { enabled: true, waitSeconds: 61 } }
        }
      })
    ).toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "visit-settings-prompt-too-long",
        type: "UPDATE_MANAGED_SITE",
        payload: {
          siteId: "site:test",
          patch: {
            visitConfirmation: { enabled: true, waitSeconds: 3, prompt: "x".repeat(161) }
          }
        }
      })
    ).toBeNull();
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "visit-grant",
        type: "GRANT_VISIT_CONFIRMATION",
        payload: { url: "https://example.com/focus", siteId: "site:test" }
      })
    ).toEqual({
      requestId: "visit-grant",
      request: {
        type: "GRANT_VISIT_CONFIRMATION",
        url: "https://example.com/focus",
        siteId: "site:test"
      }
    });
  });

  it("validates local module filter-group updates", () => {
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "module-filter",
        type: "SET_LOCAL_MODULE_FILTER_ENABLED",
        payload: {
          moduleId: "hourleaf.local.youtube-focus",
          groupId: "home-recommendations",
          enabled: false
        }
      })?.request
    ).toEqual({
      type: "SET_LOCAL_MODULE_FILTER_ENABLED",
      moduleId: "hourleaf.local.youtube-focus",
      groupId: "home-recommendations",
      enabled: false
    });
    expect(
      parseMessageRequest({
        version: 1,
        requestId: "module-filter-extra",
        type: "SET_LOCAL_MODULE_FILTER_ENABLED",
        payload: {
          moduleId: "hourleaf.local.youtube-focus",
          groupId: "home-recommendations",
          enabled: true,
          unexpected: true
        }
      })
    ).toBeNull();
  });
});
