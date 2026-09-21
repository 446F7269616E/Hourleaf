import { sendRequest } from "../shared/messages";
import { t } from "../shared/i18n";
import { resolveSiteScope, type KnownSiteFamily } from "../shared/site-scope";

export async function addManagedSite(url: string): Promise<void> {
  const result = await sendRequest({ type: "ADD_MANAGED_SITE", url });
  if (!result.granted) throw new Error(t("options.permissionDenied"));
}

export async function removeManagedSite(siteId: string): Promise<void> {
  await sendRequest({ type: "REMOVE_MANAGED_SITE", siteId });
}

export function normalizeWebsiteInput(value: string): {
  origin: string;
  permissionPatterns: string[];
  family?: KnownSiteFamily;
} {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048) throw new Error(t("options.invalidWebsite"));
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(t("options.invalidWebsite"));
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error(t("options.httpOnly"));
  }
  const scope = resolveSiteScope(url);
  if (!scope) throw new Error(t("options.invalidWebsite"));
  return {
    origin: scope.canonicalOrigin,
    permissionPatterns: scope.matchPatterns,
    ...(scope.family ? { family: scope.family } : {})
  };
}

export async function requestWebsitePermission(patterns: string | string[]): Promise<boolean> {
  return requestWebsitePermissions(typeof patterns === "string" ? [patterns] : patterns);
}

async function requestWebsitePermissions(patterns: string[]): Promise<boolean> {
  const api = globalThis as typeof globalThis & {
    browser?: PermissionApi;
    chrome?: PermissionApi;
  };
  if (api.browser?.permissions?.request) {
    return Boolean(await api.browser.permissions.request({ origins: patterns }));
  }
  const permissions = api.chrome?.permissions;
  if (!permissions?.request) return false;
  return new Promise<boolean>((resolve) => permissions.request?.({ origins: patterns }, resolve));
}

export async function requestLocalModulePermissions(
  patterns: string[],
  needsUserScripts: boolean
): Promise<boolean> {
  const api = globalThis as typeof globalThis & {
    browser?: PermissionApi;
    chrome?: PermissionApi;
  };
  const permissions = api.browser?.permissions;
  if (permissions?.request) {
    try {
      return Boolean(
        await permissions.request({
          origins: patterns,
          ...(needsUserScripts ? { permissions: ["userScripts"] } : {})
        })
      );
    } catch {
      return Boolean(await permissions.request({ origins: patterns }));
    }
  }
  const chromePermissions = api.chrome?.permissions;
  if (!chromePermissions?.request) return false;
  return new Promise<boolean>((resolve) =>
    chromePermissions.request?.({ origins: patterns }, resolve)
  );
}

export async function hasWebsitePermission(pattern: string): Promise<boolean | null> {
  const api = globalThis as typeof globalThis & {
    browser?: PermissionApi;
    chrome?: PermissionApi;
  };
  if (api.browser?.permissions?.contains) {
    return Boolean(await api.browser.permissions.contains({ origins: [pattern] }));
  }
  const permissions = api.chrome?.permissions;
  if (!permissions?.contains) return null;
  return new Promise<boolean>((resolve) => permissions.contains?.({ origins: [pattern] }, resolve));
}

interface PermissionApi {
  permissions?: {
    request(
      permissions: { origins: string[]; permissions?: string[] },
      callback?: (granted: boolean) => void
    ): Promise<boolean> | void;
    contains(
      permissions: { origins: string[] },
      callback?: (granted: boolean) => void
    ): Promise<boolean> | void;
  };
}
