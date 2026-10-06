import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build } from "esbuild";

const root = process.cwd();
/** @typedef {"chromium" | "firefox" | "safari"} BrowserTarget */
/** @typedef {"release" | "debug"} BuildFlavor */
/** @typedef {{id: string, name: string, matches: string[]} & Record<string, unknown>} DebugModule */
/** @typedef {{url: string, label: string}} DebugSite */
/** @typedef {{modules: DebugModule[], sites: DebugSite[], hostPermissions: string[]}} DebugPreset */
/** @type {BrowserTarget[]} */
const supportedTargets = ["chromium", "firefox", "safari"];
const requestedTarget = process.argv[2] ?? "all";
if (
  requestedTarget !== "all" &&
  requestedTarget !== "debug" &&
  !supportedTargets.includes(/** @type {BrowserTarget} */ (requestedTarget))
) {
  throw new Error(`Unsupported target: ${requestedTarget}`);
}
/** @type {BrowserTarget[]} */
const targets =
  requestedTarget === "all"
    ? supportedTargets
    : requestedTarget === "debug"
      ? ["chromium"]
      : [/** @type {BrowserTarget} */ (requestedTarget)];
const buildFlavor = /** @type {BuildFlavor} */ (requestedTarget === "debug" ? "debug" : "release");

const extensionEntries = {
  background: path.join(root, "src/background/index.ts"),
  popup: path.join(root, "src/popup/index.ts"),
  home: path.join(root, "src/home/index.ts"),
  options: path.join(root, "src/options/index.ts"),
  dashboard: path.join(root, "src/dashboard/index.ts"),
  plan: path.join(root, "src/plan/index.ts"),
  block: path.join(root, "src/block/index.ts"),
  end: path.join(root, "src/end/index.ts"),
  content: path.join(root, "src/content/index.ts")
};

if (buildFlavor === "release") {
  // Remove directories produced by the former multi-extension release layout.
  await rm(path.join(root, "dist", "bundles"), { recursive: true, force: true });
  await rm(path.join(root, "dist", "modules"), { recursive: true, force: true });
}

const debugPreset =
  buildFlavor === "debug"
    ? await loadDebugPreset()
    : { modules: [], sites: [], hostPermissions: [] };
const debugOutdir =
  buildFlavor === "debug"
    ? resolveDebugOutputDirectory(process.argv[3] ?? path.resolve(root, "..", "b站插件debug"))
    : undefined;

for (const target of targets) {
  await buildExtension(
    target,
    buildFlavor,
    debugOutdir ?? path.join(root, "dist", target),
    debugPreset
  );
}

/**
 * @param {BrowserTarget} target
 * @param {BuildFlavor} flavor
 * @param {string} outdir
 * @param {Awaited<ReturnType<typeof loadDebugPreset>>} preset
 */
async function buildExtension(target, flavor, outdir, preset) {
  if (flavor === "debug") await prepareDebugOutputDirectory(outdir);
  else await rm(outdir, { recursive: true, force: true });
  await build({
    entryPoints: extensionEntries,
    outdir,
    bundle: true,
    format: "iife",
    target: browserTarget(target),
    entryNames: "[name]",
    plugins: flavor === "release" ? [releaseDebugBootstrapPlugin()] : [],
    sourcemap: false,
    minify: false,
    minifySyntax: true,
    define: {
      __HOURLEAF_BROWSER_TARGET__: JSON.stringify(target),
      __HOURLEAF_BUILD_FLAVOR__: JSON.stringify(flavor),
      __HOURLEAF_DEBUG_MODULES__: JSON.stringify(preset.modules),
      __HOURLEAF_DEBUG_SITES__: JSON.stringify(preset.sites)
    },
    legalComments: "none",
    logLevel: "info"
  });
  await cp(path.join(root, "static"), outdir, { recursive: true });
  const stylesOutdir = path.join(outdir, "styles");
  await mkdir(stylesOutdir, { recursive: true });
  for (const file of await readdir(path.join(root, "src/styles"))) {
    if (file.endsWith(".css")) {
      await cp(path.join(root, "src/styles", file), path.join(stylesOutdir, file));
    }
  }
  await cp(path.join(root, "_locales"), path.join(outdir, "_locales"), { recursive: true });
  const rawManifest = /** @type {unknown} */ (
    JSON.parse(await readFile(path.join(root, "manifests", `${target}.json`), "utf8"))
  );
  if (!isRecord(rawManifest)) throw new Error(`${target} manifest must be an object`);
  const manifest = rawManifest;
  await copyIcons(outdir);
  if (flavor === "debug") {
    manifest.name = "Hourleaf Debug";
    manifest.short_name = "Hourleaf Debug";
    manifest.version_name = `${String(manifest.version)}-debug`;
    manifest.host_permissions = preset.hostPermissions;
    if (isRecord(manifest.action)) {
      const action = { ...manifest.action, default_title: "Hourleaf Debug" };
      manifest.action = action;
    }
    await writeFile(
      path.join(outdir, "debug-build.json"),
      `${JSON.stringify(
        {
          format: "hourleaf.local-debug-build",
          schemaVersion: 1,
          moduleIds: preset.modules.map((module) => module.id)
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
  await writeFile(
    path.join(outdir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

/** @param {BrowserTarget} target */
function browserTarget(target) {
  if (target === "firefox") return "firefox121";
  if (target === "safari") return "safari17";
  return "chrome121";
}

/** @returns {import("esbuild").Plugin} */
function releaseDebugBootstrapPlugin() {
  return {
    name: "hourleaf-release-debug-bootstrap",
    setup(buildContext) {
      // esbuild evaluates filters with Go's regexp engine, which has no JS /u flag.
      buildContext.onResolve({ filter: /debug\/bootstrap$/ }, () => ({
        path: path.join(root, "src", "debug", "release.ts")
      }));
    }
  };
}

/** @returns {Promise<DebugPreset>} */
async function loadDebugPreset() {
  const optionalModulesDir = path.join(root, "optional-modules");
  const entries = (await readdir(optionalModulesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  /** @type {DebugModule[]} */
  const modules = [];
  /** @type {DebugSite[]} */
  const sites = [
    { url: "https://example.com", label: "Example 测试网站" },
    { url: "http://localhost:4173", label: "Hourleaf 本地视频测试" }
  ];
  /** @type {Set<string>} */
  const hostPermissions = new Set(["https://example.com/*", "http://localhost:4173/*"]);
  for (const entry of entries) {
    const sourceDir = path.join(optionalModulesDir, entry.name);
    const manifest = await readDebugModule(sourceDir);
    modules.push(manifest);
    const firstMatch = manifest.matches[0];
    if (!firstMatch) throw new Error(`${sourceDir} does not declare a website`);
    sites.push({ url: firstMatch.slice(0, -2), label: manifest.name });
    for (const match of manifest.matches) hostPermissions.add(match);
  }
  if (modules.length === 0)
    throw new Error("No optional modules are available for the debug build");
  // This is the single reviewed multi-origin family in src/shared/site-scope.ts.
  // Keep the debug install permission aligned with the runtime scope contract.
  if (sites.some((site) => new URL(site.url).hostname.endsWith(".bilibili.com"))) {
    hostPermissions.add("https://*.bilibili.com/*");
  }
  return { modules, sites, hostPermissions: [...hostPermissions].sort() };
}

/** @param {string} sourceDir @returns {Promise<DebugModule>} */
async function readDebugModule(sourceDir) {
  const manifestPath = path.join(sourceDir, "hourleaf-module.json");
  const rawManifest = /** @type {unknown} */ (JSON.parse(await readFile(manifestPath, "utf8")));
  if (
    !isRecord(rawManifest) ||
    rawManifest.schemaVersion !== 1 ||
    rawManifest.format !== "hourleaf.local-module" ||
    typeof rawManifest.id !== "string" ||
    typeof rawManifest.name !== "string" ||
    typeof rawManifest.author !== "string" ||
    typeof rawManifest.version !== "string" ||
    !Array.isArray(rawManifest.matches) ||
    rawManifest.matches.length === 0 ||
    !rawManifest.matches.every(
      (match) => typeof match === "string" && /^https?:\/\/[^/*:]+(?::\d+)?\/\*$/u.test(match)
    )
  ) {
    throw new Error(`${sourceDir} is not a canonical Hourleaf local module`);
  }
  const manifest = /** @type {DebugModule} */ (rawManifest);
  const css = await readReferencedModuleFiles(sourceDir, manifest.cssFiles, ".css");
  const userScript = await readReferencedModuleFiles(
    sourceDir,
    manifest.userScriptFiles,
    ".user.js"
  );
  return {
    ...manifest,
    css: [typeof manifest.css === "string" ? manifest.css : "", css].filter(Boolean).join("\n\n"),
    userScript: [typeof manifest.userScript === "string" ? manifest.userScript : "", userScript]
      .filter(Boolean)
      .join("\n\n"),
    dnrRules: Array.isArray(manifest.dnrRules) ? manifest.dnrRules : [],
    capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : []
  };
}

/** @param {string} sourceDir @param {unknown} filenames @param {string} suffix */
async function readReferencedModuleFiles(sourceDir, filenames, suffix) {
  if (filenames === undefined) return "";
  if (!Array.isArray(filenames) || filenames.length > 16) {
    throw new Error(`${sourceDir} contains invalid module file references`);
  }
  const sources = [];
  for (const filename of filenames) {
    if (
      typeof filename !== "string" ||
      filename !== path.basename(filename) ||
      !filename.toLocaleLowerCase().endsWith(suffix)
    ) {
      throw new Error(`${sourceDir} contains an unsafe module file reference`);
    }
    sources.push(await readFile(path.join(sourceDir, filename), "utf8"));
  }
  return sources.join("\n\n");
}

/** @param {string} value */
function resolveDebugOutputDirectory(value) {
  const candidate = path.resolve(value);
  const relative = path.relative(root, candidate);
  const insideRepository =
    relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  const localDebugRoot = path.join(root, ".local-debug");
  if (
    candidate === root ||
    (insideRepository &&
      candidate !== localDebugRoot &&
      !candidate.startsWith(`${localDebugRoot}${path.sep}`))
  ) {
    throw new Error("Debug output must be outside the repository or inside .local-debug/");
  }
  return candidate;
}

/** @param {string} outdir */
async function prepareDebugOutputDirectory(outdir) {
  const entries = await readdir(outdir).catch((error) => {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  });
  if (entries.length > 0) {
    /** @type {unknown} */
    let marker;
    try {
      marker = JSON.parse(await readFile(path.join(outdir, "debug-build.json"), "utf8"));
    } catch {
      throw new Error(`Refusing to replace a non-Hourleaf directory: ${outdir}`);
    }
    if (
      !isRecord(marker) ||
      marker.format !== "hourleaf.local-debug-build" ||
      marker.schemaVersion !== 1
    ) {
      throw new Error(`Refusing to replace a directory without a valid debug marker: ${outdir}`);
    }
  }
  // Preserve a mounted or sandbox-provided output root; only replace verified contents.
  await mkdir(outdir, { recursive: true });
  await Promise.all(
    entries.map((entry) => rm(path.join(outdir, entry), { recursive: true, force: true }))
  );
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {string} outdir */
async function copyIcons(outdir) {
  /** @type {Array<[string, number[], boolean]>} */
  const variants = [
    ["icon", [16, 32, 48, 128], false],
    ["toolbar", [16, 19, 24, 32, 38, 48], false],
    ["toolbar-white", [16, 19, 24, 32, 38, 48], true]
  ];
  for (const [prefix, sizes, requiresAlpha] of variants) {
    for (const size of sizes) {
      const filename = `${prefix}-${size}.png`;
      const bytes = await readFile(path.join(root, "public/icons", filename));
      if (
        bytes.length < 33 ||
        bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        bytes.readUInt32BE(16) !== size ||
        bytes.readUInt32BE(20) !== size ||
        (requiresAlpha && bytes[25] !== 4 && bytes[25] !== 6)
      ) {
        throw new Error(
          `Invalid icon dimensions or transparency: ${filename}; re-export the C-series icons`
        );
      }
    }
  }
  await cp(path.join(root, "public/icons"), path.join(outdir, "icons"), { recursive: true });
}
