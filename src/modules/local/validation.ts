import { normalizeFilterSchedules } from "./schedules";
import {
  LOCAL_MODULE_FORMAT,
  LOCAL_MODULE_CAPABILITIES,
  LOCAL_MODULE_SCHEMA_VERSION,
  type LocalModuleCapability,
  type LocalModuleDefinition,
  type LocalModuleDomainPolicy,
  type LocalModuleFilterGroup,
  type LocalModuleInstallation,
  type LocalModuleStore
} from "./types";

const LIMITS = Object.freeze({
  modules: 32,
  id: 100,
  name: 80,
  author: 100,
  description: 320,
  matches: 32,
  selectors: 128,
  selector: 300,
  filterGroups: 24,
  filterGroupId: 64,
  filterGroupName: 80,
  filterGroupDescription: 240,
  css: 100_000,
  script: 150_000,
  dnrRules: 0
});

const CAPABILITIES = new Set<string>(LOCAL_MODULE_CAPABILITIES);
const DOMAIN_POLICIES = new Set<LocalModuleDomainPolicy>(["timed", "always-allow", "always-block"]);

export type LocalModuleContentSafetyIssue =
  | "css-external-resource"
  | "script-code-generation"
  | "script-network-access"
  | "script-extension-api"
  | "script-element-injection"
  | "script-cookie-access";

const BLOCKED_USER_SCRIPT_PATTERNS: ReadonlyArray<{
  issue: Exclude<LocalModuleContentSafetyIssue, "css-external-resource">;
  pattern: RegExp;
}> = [
  {
    issue: "script-code-generation",
    pattern:
      /\b(?:eval|Function|importScripts|WebAssembly)\b|\bimport\s*(?:\?\.\s*)?\(|\b(?:setTimeout|setInterval)\b[\s"'`\]]*(?:\?\.\s*)?\(\s*["'`]/u
  },
  {
    issue: "script-network-access",
    pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u
  },
  {
    issue: "script-extension-api",
    pattern:
      /\b(?:chrome|browser)\s*(?:\?\.\s*|\.\s*|\[\s*["'`]\s*)(?:runtime|storage|tabs|permissions|scripting|declarativeNetRequest|downloads|cookies|history)\b|["'`](?:chrome|browser)["'`]\s*\]\s*\[\s*["'`](?:runtime|storage|tabs|permissions|scripting|declarativeNetRequest|downloads|cookies|history)\b/u
  },
  {
    issue: "script-element-injection",
    pattern: /\bcreateElement\b[\s"'`\]]*\(\s*["'`]script["'`]\s*\)|<script\b/iu
  },
  {
    issue: "script-cookie-access",
    pattern: /\bdocument\s*(?:\?\.\s*|\.\s*|\[\s*["'`]\s*)cookie\b/u
  }
];

export function normalizeLocalModuleDefinition(
  value: unknown,
  options: { checkUserScriptSafety?: boolean } = {}
): LocalModuleDefinition | null {
  if (!isRecord(value) || value.schemaVersion !== LOCAL_MODULE_SCHEMA_VERSION) return null;
  if (value.format !== LOCAL_MODULE_FORMAT || !isText(value.author, LIMITS.author)) return null;
  if (!isStableId(value.id) || !isVersion(value.version) || !isText(value.name, LIMITS.name)) {
    return null;
  }
  const description =
    typeof value.description === "string" ? cleanText(value.description, LIMITS.description) : "";
  const matches = normalizeMatches(value.matches);
  if (matches.length === 0) return null;
  const domainPolicy = DOMAIN_POLICIES.has(value.domainPolicy as LocalModuleDomainPolicy)
    ? (value.domainPolicy as LocalModuleDomainPolicy)
    : "timed";
  const hideSelectors = normalizeSelectors(value.hideSelectors);
  if (hideSelectors === null) return null;
  const filterGroups = normalizeFilterGroups(value.filterGroups);
  if (filterGroups === null) return null;
  const shadowRoots = normalizeShadowRoots(value.shadowRoots);
  if (shadowRoots === null) return null;
  let css = "";
  if (value.css !== undefined) {
    if (
      typeof value.css !== "string" ||
      value.css.length > LIMITS.css ||
      !isSelfContainedCss(value.css)
    ) {
      return null;
    }
    css = value.css;
  }
  let userScript = "";
  if (value.userScript !== undefined) {
    if (
      typeof value.userScript !== "string" ||
      value.userScript.length > LIMITS.script ||
      (options.checkUserScriptSafety !== false &&
        getLocalModuleContentSafetyIssue("", value.userScript) !== null)
    ) {
      return null;
    }
    userScript = value.userScript;
  }
  const dnrRules = normalizeDnrRules(value.dnrRules);
  if (dnrRules === null) return null;
  const inferred = inferCapabilities({
    domainPolicy,
    hideSelectors,
    filterGroups,
    css,
    userScript
  });
  const declared = Array.isArray(value.capabilities)
    ? value.capabilities.filter(
        (item): item is LocalModuleCapability => typeof item === "string" && CAPABILITIES.has(item)
      )
    : [];
  const capabilities = [...new Set([...declared, ...inferred])];
  return {
    schemaVersion: LOCAL_MODULE_SCHEMA_VERSION,
    format: LOCAL_MODULE_FORMAT,
    id: value.id,
    name: cleanText(value.name, LIMITS.name),
    author: cleanText(value.author, LIMITS.author),
    version: value.version,
    description,
    matches,
    domainPolicy,
    hideSelectors,
    filterGroups,
    css,
    dnrRules,
    userScript,
    capabilities,
    shadowRoots
  };
}

function normalizeShadowRoots(value: unknown): LocalModuleDefinition["shadowRoots"] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) return null;
  const roots: NonNullable<LocalModuleDefinition["shadowRoots"]> = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.hostSelector !== "string") return null;
    const selectors = normalizeSelectors([item.hostSelector]);
    if (!selectors || !item.hostSelector.trim()) return null;
    if (
      item.mountEvent !== undefined &&
      (typeof item.mountEvent !== "string" || !/^[a-zA-Z][\w:-]{0,63}$/u.test(item.mountEvent))
    )
      return null;
    roots.push({
      hostSelector: item.hostSelector,
      ...(typeof item.mountEvent === "string" ? { mountEvent: item.mountEvent } : {})
    });
  }
  return roots;
}

export function normalizeLocalModuleStore(value: unknown): LocalModuleStore {
  const store: LocalModuleStore = { schemaVersion: 1, installations: {} };
  if (!isRecord(value) || !isRecord(value.installations)) return store;
  for (const [id, raw] of Object.entries(value.installations).slice(0, LIMITS.modules)) {
    if (!isStableId(id) || !isRecord(raw)) continue;
    // Storage is read on every page-rule request. The script safety screen is
    // repeated at import/message boundaries and immediately before browser
    // registration, avoiding repeated scans of dormant script text here.
    const definition = normalizeLocalModuleDefinition(raw.definition, {
      checkUserScriptSafety: false
    });
    if (!definition || definition.id !== id) continue;
    const groupIds = definition.filterGroups.map((group) => group.id);
    const filterGroupSchedules = normalizeFilterSchedules(raw.filterGroupSchedules, groupIds);
    const planSchedules = normalizeFilterSchedules(
      isRecord(raw.planPreferences) ? raw.planPreferences.filterGroupSchedules : undefined,
      groupIds
    );
    if (!filterGroupSchedules || !planSchedules) continue;
    const importedAt = isTimestamp(raw.importedAt) ? raw.importedAt : 0;
    const updatedAt = isTimestamp(raw.updatedAt) ? raw.updatedAt : importedAt;
    const installation: LocalModuleInstallation = {
      definition,
      source: "local-file",
      enabled: raw.enabled === true,
      disabledFilterGroupIds: normalizeDisabledFilterGroupIds(
        raw.disabledFilterGroupIds,
        definition.filterGroups
      ),
      ...(raw.filterGroupSchedules !== undefined ? { filterGroupSchedules } : {}),
      ...(isRecord(raw.planPreferences)
        ? {
            planPreferences: {
              enabled: raw.planPreferences.enabled !== false,
              disabledFilterGroupIds: normalizeDisabledFilterGroupIds(
                raw.planPreferences.disabledFilterGroupIds,
                definition.filterGroups
              ),
              ...(raw.planPreferences.filterGroupSchedules !== undefined
                ? { filterGroupSchedules: planSchedules }
                : {})
            }
          }
        : {}),
      importedAt,
      updatedAt
    };
    store.installations[id] = installation;
  }
  return store;
}

export function localModuleMatches(
  definition: LocalModuleDefinition,
  input: string | URL
): boolean {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    return false;
  }
  return definition.matches.some((pattern) => pattern === `${url.origin}/*`);
}

export function originsFromLocalModule(definition: LocalModuleDefinition): string[] {
  return definition.matches.map((pattern) => pattern.slice(0, -2));
}

/**
 * A deliberately small import-time screen for capabilities that do not belong
 * in a focus module. This is not a claim that accepted user code is safe; the
 * browser-owned USER_SCRIPT world remains the actual privilege boundary.
 */
export function getLocalModuleContentSafetyIssue(
  css: string,
  userScript: string
): LocalModuleContentSafetyIssue | null {
  if (css && !isSelfContainedCss(css)) return "css-external-resource";
  if (!userScript) return null;
  const sourceWithoutComments = stripJavaScriptCommentsForSafetyScan(userScript);
  return (
    BLOCKED_USER_SCRIPT_PATTERNS.find(({ pattern }) => pattern.test(sourceWithoutComments))
      ?.issue ?? null
  );
}

function normalizeMatches(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > LIMITS.matches) return [];
  const matches = value.map(normalizeMatch).filter((item): item is string => item !== null);
  return [...new Set(matches)];
}

function normalizeMatch(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300 || !value.endsWith("/*")) return null;
  let url: URL;
  try {
    url = new URL(value.slice(0, -1));
  } catch {
    return null;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname ||
    url.hostname.includes("*") ||
    url.hostname.endsWith(".") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return `${url.origin}/*`;
}

function normalizeSelectors(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.selectors) return null;
  const selectors: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length < 1 ||
      item.length > LIMITS.selector ||
      /[{};]/u.test(item)
    ) {
      return null;
    }
    selectors.push(item);
  }
  return [...new Set(selectors)];
}

function normalizeFilterGroups(value: unknown): LocalModuleFilterGroup[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.filterGroups) return null;
  const groups: LocalModuleFilterGroup[] = [];
  const ids = new Set<string>();
  let selectorCount = 0;
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      item.id.length > LIMITS.filterGroupId ||
      !/^[a-z0-9][a-z0-9-]*$/u.test(item.id) ||
      ids.has(item.id) ||
      !isText(item.name, LIMITS.filterGroupName)
    ) {
      return null;
    }
    const selectors = normalizeSelectors(item.selectors);
    if (!selectors || selectors.length === 0) return null;
    selectorCount += selectors.length;
    if (selectorCount > LIMITS.selectors) return null;
    const description =
      typeof item.description === "string"
        ? cleanText(item.description, LIMITS.filterGroupDescription)
        : "";
    ids.add(item.id);
    groups.push({
      id: item.id,
      name: cleanText(item.name, LIMITS.filterGroupName),
      description,
      selectors
    });
  }
  return groups;
}

function normalizeDisabledFilterGroupIds(
  value: unknown,
  groups: readonly LocalModuleFilterGroup[]
): string[] {
  if (!Array.isArray(value)) return [];
  const validIds = new Set(groups.map((group) => group.id));
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && validIds.has(item))
    )
  ];
}

function normalizeDnrRules(value: unknown): LocalModuleDefinition["dnrRules"] | null {
  if (value === undefined) return [];
  return Array.isArray(value) && value.length === LIMITS.dnrRules ? [] : null;
}

function inferCapabilities(input: {
  domainPolicy: LocalModuleDomainPolicy;
  hideSelectors: string[];
  filterGroups: LocalModuleFilterGroup[];
  css: string;
  userScript: string;
}): LocalModuleCapability[] {
  const capabilities: LocalModuleCapability[] = [];
  if (input.domainPolicy !== "timed") capabilities.push("domain-policy");
  if (input.hideSelectors.length > 0 || input.filterGroups.length > 0) {
    capabilities.push("hide-elements");
  }
  if (input.css.trim()) capabilities.push("css");
  if (input.userScript.trim()) capabilities.push("user-script");
  return capabilities;
}

/**
 * Removes JavaScript comments without treating comment markers inside quoted
 * strings as syntax. The scanner is intentionally linear and bounded by the
 * module script size limit; template contents stay visible to the conservative
 * capability patterns.
 */
function stripJavaScriptCommentsForSafetyScan(source: string): string {
  let output = "";
  let state: "code" | "single" | "double" | "template" | "line-comment" | "block-comment" = "code";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "line-comment") {
      if (character === "\n" || character === "\r") {
        output += character;
        state = "code";
      } else {
        output += " ";
      }
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else {
        output += character === "\n" || character === "\r" ? character : " ";
      }
      continue;
    }
    if (state !== "code") {
      output += character;
      if (character === "\\") {
        if (next) {
          output += next;
          index += 1;
        }
        continue;
      }
      if (
        (state === "single" && character === "'") ||
        (state === "double" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (character === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line-comment";
    } else if (character === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block-comment";
    } else {
      output += character;
      if (character === "'") state = "single";
      else if (character === '"') state = "double";
      else if (character === "`") state = "template";
    }
  }

  return output;
}

function isSelfContainedCss(value: string): boolean {
  return !/[\\]|@import\b|(?:url|src|image|image-set|-webkit-image-set)\s*\(|javascript:|-moz-binding\s*:|behavior\s*:/iu.test(
    value
  );
}

function isStableId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= LIMITS.id &&
    /^[a-z0-9][a-z0-9._:-]+$/u.test(value)
  );
}

function isVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(value)
  );
}

function isText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" && value.length <= maxLength && cleanText(value, maxLength).length > 0
  );
}

function cleanText(value: string, maxLength: number): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
