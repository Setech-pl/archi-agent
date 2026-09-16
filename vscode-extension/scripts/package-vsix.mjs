#!/usr/bin/env node
// Builds the bundles and packages the Archi Agent extension as a VSIX with @vscode/vsce.
//
//   node vscode-extension/scripts/package-vsix.mjs [--out <directory>]
//
// The package is written to vscode-extension/build/<name>-<version>.vsix (ignored by Git). vsce runs
// in library mode with dependency detection disabled, so it neither calls npm nor needs a
// node_modules directory inside the extension folder; the bundles already contain everything.
// Nothing is published: this script never contacts a marketplace.

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVSIX } from "@vscode/vsce";
import { buildExtensionBundles, extensionRoot, projectRoot } from "./build.mjs";

export async function packageExtension(options = {}) {
  const outDir = path.resolve(options.outDir ?? path.join(extensionRoot, "build"));
  const manifest = JSON.parse(readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
  const packagePath = path.join(outDir, `${manifest.name}-${manifest.version}.vsix`);

  await buildExtensionBundles(options.bundleDir === undefined ? {} : { outDir: options.bundleDir });
  mkdirSync(outDir, { recursive: true });
  rmSync(packagePath, { force: true });

  await createVSIX({
    cwd: extensionRoot,
    packagePath,
    dependencies: false,
    skipLicense: true,
    allowMissingRepository: true,
    updatePackageJson: false
  });

  return packagePath;
}

function parseArguments(argv) {
  let outDir;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out" && index + 1 < argv.length) {
      outDir = argv[index + 1];
      index += 1;
    } else {
      throw new Error("usage: node vscode-extension/scripts/package-vsix.mjs [--out <directory>]");
    }
  }

  return outDir === undefined ? {} : { outDir };
}

function invokedDirectly() {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  const normalize = (value) => (process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value));
  return normalize(fileURLToPath(import.meta.url)) === normalize(entry);
}

if (invokedDirectly()) {
  try {
    const packagePath = await packageExtension(parseArguments(process.argv.slice(2)));
    process.stdout.write(`VSIX written: ${path.relative(projectRoot, packagePath)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Packaging failed."}\n`);
    process.exitCode = 1;
  }
}
