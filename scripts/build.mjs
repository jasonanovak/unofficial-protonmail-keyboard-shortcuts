#!/usr/bin/env node
// Build script for the Unofficial Proton Mail Keyboard Shortcuts Extension.
// Emits dist/chrome and dist/firefox from a single source tree.
// See DESIGN.md §5.

import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir, cp, rm, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src");
const DIST = resolve(ROOT, "dist");

const ALL_TARGETS = ["chrome", "firefox"];

function parseArgs(argv) {
  const args = { target: null, watch: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--target=")) args.target = a.slice("--target=".length);
    else if (a === "--watch") args.watch = true;
  }
  if (args.target && !ALL_TARGETS.includes(args.target)) {
    throw new Error(`Unknown --target=${args.target}. Expected one of: ${ALL_TARGETS.join(", ")}`);
  }
  return args;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function emitManifest(target, outDir) {
  const raw = JSON.parse(await readFile(resolve(SRC, "manifest.template.json"), "utf8"));
  const overrides = raw.$browser_overrides ?? {};
  delete raw.$browser_overrides;
  const merged = { ...raw, ...(overrides[target] ?? {}) };
  await writeFile(
    resolve(outDir, "manifest.json"),
    JSON.stringify(merged, null, 2) + "\n",
    "utf8",
  );
}

async function copyAssets(outDir) {
  await cp(resolve(SRC, "options/options.html"), resolve(outDir, "options.html"));
  await cp(resolve(SRC, "options/options.css"), resolve(outDir, "options.css"));
  const iconsDir = resolve(SRC, "icons");
  if (await exists(iconsDir)) {
    await cp(iconsDir, resolve(outDir, "icons"), { recursive: true });
  }
}

function esbuildOptions(outDir) {
  return {
    entryPoints: {
      content: resolve(SRC, "content/index.ts"),
      options: resolve(SRC, "options/options.ts"),
    },
    outdir: outDir,
    bundle: true,
    format: "iife",
    target: ["chrome109", "firefox109"],
    sourcemap: "linked",
    logLevel: "info",
    legalComments: "linked",
  };
}

async function buildTarget(target, { watch }) {
  const outDir = resolve(DIST, target);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const opts = esbuildOptions(outDir);
  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    console.log(`[${target}] watching for changes...`);
  } else {
    await esbuild.build(opts);
  }

  await copyAssets(outDir);
  await emitManifest(target, outDir);
  console.log(`[${target}] built → ${outDir}`);
}

async function main() {
  const { target, watch } = parseArgs(process.argv);
  const targets = target ? [target] : ALL_TARGETS;
  for (const t of targets) {
    await buildTarget(t, { watch });
  }
  if (watch) {
    // Keep the process alive; esbuild contexts handle reload on their own.
    await new Promise(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
