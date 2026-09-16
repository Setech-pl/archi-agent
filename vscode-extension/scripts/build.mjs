#!/usr/bin/env node
// Builds the two bundles of the Archi Agent extension with esbuild.
//
//   node vscode-extension/scripts/build.mjs [--out <directory>]
//
// dist/archi-agent-runtime.js  the application runtime: core, Node adapters, runtime API and the
//                              single dependency (zod), bundled from src/runtime/index.ts;
// dist/extension.js            the editor layer, bundled from vscode-extension/src/extension.ts,
//                              with "vscode" external and the runtime import rewritten to the
//                              sibling runtime bundle.
//
// Both bundles are CommonJS for the Node 20 runtime of the VS Code 1.91 extension host. No source
// map is emitted, so the bundles carry no machine path. The script derives every path from its own
// location and performs no network access.

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const projectRoot = path.resolve(extensionRoot, "..");

/** Node 20 is the runtime of the VS Code 1.91 extension host (Electron 29). */
export const bundleTarget = "node20";
export const bundleFormat = "cjs";

export const bundleFileNames = Object.freeze({
  extension: "extension.js",
  runtime: "archi-agent-runtime.js"
});

const runtimeEntry = path.join(projectRoot, "src", "runtime", "index.ts");
const extensionEntry = path.join(extensionRoot, "src", "extension.ts");

function samePath(left, right) {
  const normalize = (value) => (process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value));
  return normalize(left) === normalize(right);
}

/** Rewrites every import of the runtime entry to the packaged runtime bundle next to extension.js. */
const runtimeBundlePlugin = {
  name: "archi-agent-runtime-bundle",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /runtime\/index\.js$/ }, (args) => {
      const candidate = path.resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
      return samePath(candidate, runtimeEntry) ? { path: `./${bundleFileNames.runtime}`, external: true } : undefined;
    });
  }
};

function commonOptions() {
  return {
    bundle: true,
    platform: "node",
    format: bundleFormat,
    target: [bundleTarget],
    sourcemap: false,
    minify: false,
    treeShaking: true,
    legalComments: "none",
    logLevel: "silent",
    absWorkingDir: projectRoot,
    define: { "process.env.NODE_ENV": '"production"' }
  };
}

export async function buildExtensionBundles(options = {}) {
  const outDir = path.resolve(options.outDir ?? path.join(extensionRoot, "dist"));

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const runtimeFile = path.join(outDir, bundleFileNames.runtime);
  const extensionFile = path.join(outDir, bundleFileNames.extension);

  await build({ ...commonOptions(), entryPoints: [runtimeEntry], outfile: runtimeFile });
  await build({ ...commonOptions(), entryPoints: [extensionEntry], outfile: extensionFile, external: ["vscode"], plugins: [runtimeBundlePlugin] });

  return Object.freeze({ outDir, runtimeFile, extensionFile });
}

function parseArguments(argv) {
  let outDir;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out" && index + 1 < argv.length) {
      outDir = argv[index + 1];
      index += 1;
    } else {
      throw new Error("usage: node vscode-extension/scripts/build.mjs [--out <directory>]");
    }
  }

  return outDir === undefined ? {} : { outDir };
}

function invokedDirectly() {
  const entry = process.argv[1];
  return entry !== undefined && samePath(fileURLToPath(import.meta.url), entry);
}

if (invokedDirectly()) {
  try {
    const result = await buildExtensionBundles(parseArguments(process.argv.slice(2)));
    process.stdout.write(`Built ${path.relative(projectRoot, result.runtimeFile)} and ${path.relative(projectRoot, result.extensionFile)} (${bundleFormat}, ${bundleTarget}).\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "The extension build failed."}\n`);
    process.exitCode = 1;
  }
}
