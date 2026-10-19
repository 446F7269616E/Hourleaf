import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);
if (args.length !== 1 || !/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+){2,}$/.test(args[0] ?? "")) {
  throw new Error(
    "Usage: npm run prepare:safari -- <your registered reverse-DNS bundle identifier>"
  );
}
if (process.platform !== "darwin") throw new Error("Safari preparation requires macOS and Xcode");
const bundleIdentifier = args[0];
const source = path.join(root, "dist", "safari");
const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3 || manifest.version_name !== undefined) {
  throw new Error("Build the Safari release target before creating its Xcode project");
}
if ((manifest.permissions ?? []).includes("userScripts")) {
  throw new Error("Safari store candidates cannot execute imported user scripts");
}
const output = path.join(root, "safari");
const entries = await readdir(output).catch((error) => {
  if (error?.code === "ENOENT") return [];
  throw error;
});
if (entries.length > 0) {
  throw new Error(
    "safari/ already contains a project; preserve it and rebuild using Xcode's converter workflow"
  );
}
await mkdir(output, { recursive: true });
const result = spawnSync(
  "xcrun",
  [
    "safari-web-extension-converter",
    source,
    "--project-location",
    output,
    "--app-name",
    "Hourleaf",
    "--bundle-identifier",
    bundleIdentifier,
    "--swift",
    "--copy-resources",
    "--no-open",
    "--no-prompt"
  ],
  { cwd: root, stdio: "inherit" }
);
if (result.status !== 0) process.exit(result.status ?? 1);
await cp(
  path.join(root, "docs", "store", "safari", "PrivacyInfo.xcprivacy"),
  path.join(output, "PrivacyInfo.xcprivacy")
);
await writeFile(
  path.join(output, "PREPARATION.md"),
  [
    "# Safari submission preparation",
    "",
    `Bundle identifier supplied by developer: ${bundleIdentifier}`,
    "",
    "This project is unsigned. Select your Apple Developer team for every target in Xcode.",
    "Add PrivacyInfo.xcprivacy to the host app and web-extension targets' Copy Bundle Resources.",
    "Verify required-reason API usage in the generated native sources before archiving.",
    "Follow docs/store/SAFARI.md in the source repository for packaging and App Store Connect metadata.",
    "Keep this generated project when customizing native code. Do not overwrite it with a new conversion.",
    ""
  ].join("\n"),
  "utf8"
);
process.stdout.write(
  `Safari project created in ${output}. Complete signing and privacy target membership in Xcode.\n`
);
