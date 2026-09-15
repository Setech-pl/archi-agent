#!/usr/bin/env node
// Prepares the ignored dist directory for the offline demo build.
//
//   node scripts/prepare-demo-output.mjs clean     removes <project>/dist before compiling
//   node scripts/prepare-demo-output.mjs finalize  writes <project>/dist/package.json
//
// The script touches only the dist directory of this project, derived from its own location. It
// accepts no path argument, performs no network access and refuses to act when dist is a symbolic
// link, a junction or not a directory. The compiled demo is an ES module; dist/package.json states
// that explicitly so the output does not depend on any setting outside dist.

import { lstatSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(projectRoot, "dist");
const distManifest = `${JSON.stringify({ type: "module" }, null, 2)}\n`;

function distState() {
  let info;

  try {
    info = lstatSync(distDirectory);
  } catch (error) {
    if (error !== null && typeof error === "object" && error.code === "ENOENT") {
      return "missing";
    }

    throw new Error("dist cannot be inspected");
  }

  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error("dist must be a plain directory");
  }

  return "directory";
}

function run(mode) {
  if (mode === "clean") {
    if (distState() === "directory") {
      rmSync(distDirectory, { recursive: true, force: false });
    }

    return 0;
  }

  if (mode === "finalize") {
    if (distState() !== "directory") {
      throw new Error("dist does not exist; compile the demo first");
    }

    writeFileSync(path.join(distDirectory, "package.json"), distManifest, { encoding: "utf8" });
    return 0;
  }

  process.stderr.write("usage: node scripts/prepare-demo-output.mjs clean|finalize\n");
  return 2;
}

try {
  process.exitCode = process.argv.length === 3 ? run(process.argv[2]) : run(undefined);
} catch (error) {
  process.stderr.write(`prepare-demo-output: ${error instanceof Error ? error.message : "failed"}\n`);
  process.exitCode = 1;
}
