#!/usr/bin/env node
// Packaging script for the Unofficial Proton Mail Keyboard Shortcuts Extension.
// Zips the already-built dist/<target> trees into store-ready artifacts under
// dist/release/. Source maps and legal-comment files are excluded to match the
// uploaded packages. Run `npm run build` first (the `package` npm script does).
//
// Output names follow the existing convention:
//   dist/release/upmks-chrome-<version>.zip
//   dist/release/upmks-firefox-<version>.xpi
// (.xpi is just a zip; web-ext produces the archive for both targets.)

import { readFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const RELEASE = resolve(DIST, "release");

const IGNORE = ["*.map", "*.LEGAL.txt"];
const TARGETS = [
  { name: "chrome", ext: "zip" },
  { name: "firefox", ext: "xpi" },
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main() {
  const pkg = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8"));
  const version = pkg.version;

  for (const { name, ext } of TARGETS) {
    const sourceDir = resolve(DIST, name);
    if (!(await exists(sourceDir))) {
      throw new Error(`Missing ${sourceDir}. Run \`npm run build\` first.`);
    }
    const filename = `upmks-${name}-${version}.${ext}`;
    await run("npx", [
      "web-ext",
      "build",
      `--source-dir=${sourceDir}`,
      `--artifacts-dir=${RELEASE}`,
      `--filename=${filename}`,
      "--overwrite-dest",
      "--ignore-files",
      ...IGNORE,
    ]);
    console.log(`[${name}] packaged → dist/release/${filename}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
