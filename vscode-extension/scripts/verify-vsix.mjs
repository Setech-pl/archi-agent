#!/usr/bin/env node
// Verifies the content of a built Archi Agent VSIX.
//
//   node vscode-extension/scripts/verify-vsix.mjs [<file.vsix>]
//
// The package must contain exactly the bounded runtime files (manifest metadata, package.json, the
// two bundles and the README) and nothing else. The bundles are checked for their module contract:
// the extension bundle links to the editor API and to the sibling runtime bundle, the runtime bundle
// never links to the editor API, both require only Node built-ins, and neither carries the path of
// the source repository, an npm invocation or a child process. Findings are printed as entry names
// and rule identifiers only; the script prints no bundle content.

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import { bundleFileNames, extensionRoot, projectRoot } from "./build.mjs";
import { openVsix } from "./vsix-zip.mjs";

const manifestEntry = "extension/package.json";
const extensionBundleEntry = `extension/dist/${bundleFileNames.extension}`;
const runtimeBundleEntry = `extension/dist/${bundleFileNames.runtime}`;

export const requiredEntries = Object.freeze(["extension.vsixmanifest", "[Content_Types].xml", manifestEntry, extensionBundleEntry, runtimeBundleEntry]);

/** Optional entries that vsce adds from the allow-listed files; their names may be lower-cased by vsce. */
const optionalEntryPatterns = Object.freeze([/^extension\/readme\.md$/i, /^extension\/changelog\.md$/i, /^extension\/licen[cs]e(?:\.md|\.txt)?$/i]);

/** Explicit rejections, reported with their own rule identifier even though the allow-list would reject them anyway. */
export const prohibitedEntryRules = Object.freeze([
  { rule: "git-metadata", pattern: /(^|\/)\.git(\/|$|attributes|ignore)/ },
  { rule: "environment-file", pattern: /(^|\/)\.env(\.|$)/ },
  { rule: "node-modules", pattern: /(^|\/)node_modules\// },
  { rule: "typescript-source", pattern: /\.ts$/ },
  { rule: "test-files", pattern: /(^|\/)(?:test|tests|__tests__)\//i },
  { rule: "coverage", pattern: /(^|\/)coverage\// },
  { rule: "nested-package", pattern: /\.(?:vsix|zip|tgz|7z|tar|gz)$/i },
  { rule: "knowledge-pack-or-sample", pattern: /(^|\/)(?:samples|fixtures|architecture-diagrams|architecture)\//i },
  { rule: "generated-artifact", pattern: /\.(?:puml|grounding\.json)$/i },
  { rule: "source-map", pattern: /\.map$/i },
  { rule: "log-or-dump", pattern: /\.(?:log|dump|heapsnapshot)$/i },
  { rule: "credential-material", pattern: /\.(?:pem|key|p12|pfx|crt)$/i },
  { rule: "local-configuration", pattern: /(^|\/)\.vscode\// }
]);

export const bundleLimits = Object.freeze({ maxBundleBytes: 3 * 1024 * 1024 });

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

function requireSpecifiers(text) {
  const specifiers = new Set();
  const pattern = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    specifiers.add(match[1]);
  }

  return [...specifiers].sort();
}

function containsRepositoryPath(text) {
  const forms = new Set([projectRoot, projectRoot.split(path.sep).join("/"), projectRoot.split(path.sep).join("\\\\")]);
  const lower = text.toLowerCase();
  return [...forms].some((form) => form.length > 3 && lower.includes(form.toLowerCase()));
}

function isAllowedEntry(name) {
  return requiredEntries.includes(name) || optionalEntryPatterns.some((pattern) => pattern.test(name));
}

/**
 * Returns { ok, entries, violations }. Each violation is "<rule>: <entry or detail>" and never
 * contains file content.
 */
export function verifyVsix(filePath) {
  const violations = [];
  let archive;

  try {
    archive = openVsix(filePath);
  } catch (error) {
    return Object.freeze({ ok: false, entries: Object.freeze([]), violations: Object.freeze([`unreadable-archive: ${error instanceof Error ? error.message : "unknown"}`]) });
  }

  const names = archive.entries.map((entry) => entry.name);

  for (const required of requiredEntries) {
    if (!names.includes(required)) {
      violations.push(`missing-entry: ${required}`);
    }
  }

  for (const name of names) {
    for (const { rule, pattern } of prohibitedEntryRules) {
      if (pattern.test(name)) {
        violations.push(`${rule}: ${name}`);
      }
    }

    if (!isAllowedEntry(name)) {
      violations.push(`unexpected-entry: ${name}`);
    }
  }

  if (new Set(names).size !== names.length) {
    violations.push("duplicate-entry: the archive lists an entry twice");
  }

  if (names.includes(manifestEntry)) {
    let manifest;

    try {
      manifest = JSON.parse(archive.read(manifestEntry).toString("utf8"));
    } catch {
      violations.push("manifest-unreadable: extension/package.json is not JSON");
    }

    if (manifest !== undefined) {
      if (manifest.main !== `./dist/${bundleFileNames.extension}`) {
        violations.push("manifest-main: main must point to the extension bundle");
      }

      if (manifest.dependencies !== undefined && Object.keys(manifest.dependencies).length > 0) {
        violations.push("manifest-dependencies: the packaged manifest must declare no dependencies");
      }

      if (manifest.scripts !== undefined) {
        violations.push("manifest-scripts: the packaged manifest must declare no scripts");
      }

      if (typeof manifest.engines?.vscode !== "string") {
        violations.push("manifest-engine: engines.vscode is missing");
      }

      if (manifest.name !== "archi-agent" || manifest.publisher !== "setech-pl") {
        violations.push("manifest-identity: unexpected name or publisher");
      }

      const commands = Array.isArray(manifest.contributes?.commands) ? manifest.contributes.commands.map((entry) => entry.command) : [];

      if (!commands.includes("archiAgent.generateSequenceDiagram")) {
        violations.push("manifest-command: the generate command is not contributed");
      }
    }
  }

  const bundles = [
    { entry: extensionBundleEntry, expectVscode: true },
    { entry: runtimeBundleEntry, expectVscode: false }
  ];

  for (const { entry, expectVscode } of bundles) {
    if (!names.includes(entry)) {
      continue;
    }

    const content = archive.read(entry);

    if (content.length > bundleLimits.maxBundleBytes) {
      violations.push(`bundle-too-large: ${entry}`);
    }

    if (content.length === 0) {
      violations.push(`bundle-empty: ${entry}`);
    }

    const text = content.toString("utf8");
    const specifiers = requireSpecifiers(text);
    const allowed = new Set([...builtins, ...(expectVscode ? ["vscode", `./${bundleFileNames.runtime}`] : [])]);

    for (const specifier of specifiers) {
      if (!allowed.has(specifier)) {
        violations.push(`bundle-external-require: ${entry} requires ${specifier}`);
      }
    }

    if (expectVscode && !specifiers.includes("vscode")) {
      violations.push(`bundle-missing-editor-link: ${entry}`);
    }

    if (expectVscode && !specifiers.includes(`./${bundleFileNames.runtime}`)) {
      violations.push(`bundle-missing-runtime-link: ${entry}`);
    }

    if (!expectVscode && specifiers.includes("vscode")) {
      violations.push(`bundle-editor-leak: ${entry} requires vscode`);
    }

    if (containsRepositoryPath(text)) {
      violations.push(`bundle-repository-path: ${entry}`);
    }

    if (/\bnpm\s+run\b/.test(text) || specifiers.some((specifier) => /child_process$/.test(specifier))) {
      violations.push(`bundle-process-spawn: ${entry}`);
    }

    if (/\/\/# sourceMappingURL=/.test(text)) {
      violations.push(`bundle-source-map: ${entry}`);
    }
  }

  return Object.freeze({ ok: violations.length === 0, entries: Object.freeze(names), violations: Object.freeze(violations) });
}

/** The newest .vsix in the default build directory, when the caller names none. */
export function defaultVsixPath() {
  const buildDir = path.join(extensionRoot, "build");

  if (!existsSync(buildDir)) {
    return undefined;
  }

  const candidates = readdirSync(buildDir)
    .filter((name) => name.endsWith(".vsix"))
    .sort()
    .reverse();
  const first = candidates[0];
  return first === undefined ? undefined : path.join(buildDir, first);
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
  const argument = process.argv[2];
  const filePath = argument === undefined ? defaultVsixPath() : path.resolve(argument);

  if (filePath === undefined || process.argv.length > 3) {
    process.stderr.write("usage: node vscode-extension/scripts/verify-vsix.mjs [<file.vsix>]\n");
    process.exitCode = 2;
  } else {
    const result = verifyVsix(filePath);
    process.stdout.write(`Package: ${path.relative(projectRoot, filePath)}\n`);
    process.stdout.write(`Entries (${result.entries.length}):\n${result.entries.map((name) => `  ${name}`).join("\n")}\n`);

    if (result.ok) {
      process.stdout.write("Verification: OK (only the bounded runtime files are packaged).\n");
    } else {
      process.stdout.write(`Verification: FAILED\n${result.violations.map((line) => `  ${line}`).join("\n")}\n`);
      process.exitCode = 1;
    }
  }
}
