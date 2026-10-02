#!/usr/bin/env node
// Verifies the content of a built Archi Agent VSIX.
//
//   node vscode-extension/scripts/verify-vsix.mjs [<file.vsix>]
//
// The package must contain exactly the bounded runtime files (manifest metadata, package.json, the
// three bundles, README and third-party notices) and nothing else. The bundles are checked for their module contract:
// the extension bundle links to the editor API and to the sibling runtime bundle, the runtime bundle
// never links to the editor API, both require only Node built-ins, and neither carries the path of
// the source repository, an npm invocation or a child process. Findings are printed as entry names
// and rule identifiers only; the script prints no bundle content.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import { createHash } from "node:crypto";
import { bundleFileNames, extensionRoot, projectRoot } from "./build.mjs";
import { openVsix } from "./vsix-zip.mjs";

const manifestEntry = "extension/package.json";
const extensionBundleEntry = `extension/dist/${bundleFileNames.extension}`;
const runtimeBundleEntry = `extension/dist/${bundleFileNames.runtime}`;
const converterWorkerEntry = `extension/dist/${bundleFileNames.converterWorker}`;
const noticesEntry = "extension/THIRD_PARTY_NOTICES.md";
const trialManifestEntry = "extension/ux2-trial/resource-manifest.json";
const productManifestEntry = "extension/ux2-ocr/resource-manifest.json";

export const requiredEntries = Object.freeze(["extension.vsixmanifest", "[Content_Types].xml", manifestEntry, extensionBundleEntry, runtimeBundleEntry, converterWorkerEntry, noticesEntry]);

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
export function verifyVsix(filePath, options = {}) {
  const violations = [];
  let archive;

  try {
    archive = openVsix(filePath);
  } catch (error) {
    return Object.freeze({ ok: false, entries: Object.freeze([]), violations: Object.freeze([`unreadable-archive: ${error instanceof Error ? error.message : "unknown"}`]) });
  }

  const names = archive.entries.map((entry) => entry.name);
  let trialEntries = new Set();
  const productOcr = names.includes(productManifestEntry);
  if (!productOcr && !options.ux2Trial && !options.legacy) violations.push("ocr-resources-missing: product VSIX must include local OCR");
  const ocrPrefix = productOcr ? "extension/ux2-ocr/" : "extension/ux2-trial/";
  const ocrManifestEntry = productOcr ? productManifestEntry : trialManifestEntry;
  if (options.ux2Trial || productOcr) {
    try {
      const archiveManifestBytes = archive.read(ocrManifestEntry);
      const manifest = options.externalTrialManifest
        ? JSON.parse(readFileSync(options.externalTrialManifest, "utf8"))
        : JSON.parse(archiveManifestBytes.toString("utf8"));
      if (options.externalTrialManifest && !archiveManifestBytes.equals(readFileSync(options.externalTrialManifest)))
        violations.push("trial-external-manifest-mismatch");
      const originalPlatforms = ["darwin-arm64", "darwin-x64", "linux-x64-gnu", "linux-arm64-gnu", "win32-x64-msvc", "win32-arm64-msvc"];
      const recheckPlatforms = ["darwin-arm64", "darwin-x64", "linux-x64-gnu", "linux-arm64-gnu", "linux-x64-musl", "linux-arm64-musl", "win32-x64-msvc", "win32-arm64-msvc"];
      const platformList = JSON.stringify(manifest.platforms);
      if (![1, 2].includes(manifest.schema) || (!productOcr && (manifest.schema === 2) !== !!options.externalTrialManifest) ||
        manifest.baselineSha256 !== "7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056" ||
        (platformList !== JSON.stringify(originalPlatforms) && platformList !== JSON.stringify(recheckPlatforms)) ||
        !Array.isArray(manifest.files) || !Array.isArray(manifest.baselineEntries)) throw new Error("invalid trial manifest");
      if (manifest.schema === 2) {
        const pinned = manifest.pdfjsPatch;
        const patchFile = path.join(projectRoot, "experiments/ux2-ocr/patches/pdfjs-dist-4.10.38-operator-list-error.patch");
        const pdfEntry = manifest.files.find((file) => file.path === "node_modules/pdfjs-dist/legacy/build/pdf.mjs");
        const workerEntry = manifest.files.find((file) => file.path === "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
        if (pinned?.version !== "4.10.38" ||
          pinned.originalSha256 !== "081d3b6f426d38a8029766f8839f505e9cbf2c81a71d62c26eada142e6c21ae4" ||
          pinned.workerSha256 !== "5e9f76bd5e65fbd1602b29fc50e50490aeeacd34a715b2282b73f7e8029242e0" ||
          pinned.patchSha256 !== createHash("sha256").update(readFileSync(patchFile)).digest("hex") ||
          pinned.patchedSha256 !== pdfEntry?.sha256 || pinned.workerSha256 !== workerEntry?.sha256 ||
          manifest.versions?.["pdfjs-dist"] !== "4.10.38" || platformList !== JSON.stringify(recheckPlatforms))
          throw new Error("invalid pinned PDF.js patch manifest");
      }
      for (const entry of productOcr ? [] : manifest.baselineEntries) {
        if (typeof entry.path !== "string" || typeof entry.bytes !== "number" || !/^[a-f0-9]{64}$/.test(entry.sha256) || entry.path.startsWith("extension/ux2-trial/"))
          throw new Error("invalid baseline entry");
        const bytes = archive.read(entry.path);
        if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
          violations.push(`baseline-hash: ${entry.path}`);
      }
      trialEntries = new Set([ocrManifestEntry]);
      for (const file of manifest.files) {
        if (typeof file.path !== "string" || !/^[A-Za-z0-9@._/-]+$/.test(file.path) || file.path.includes("..") ||
          typeof file.bytes !== "number" || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("invalid trial file entry");
        const entry = `${ocrPrefix}${file.path}`;
        if (trialEntries.has(entry)) throw new Error("duplicate trial file entry");
        trialEntries.add(entry);
        const bytes = archive.read(entry);
        if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256)
          violations.push(`trial-hash: ${entry}`);
      }
      for (const platform of manifest.platforms) {
        if (!manifest.files.some((file) => file.path.startsWith(`node_modules/@napi-rs/canvas-${platform}/`) && file.path.endsWith(".node")))
          violations.push(`trial-platform-missing: ${platform}`);
      }
      for (const resource of ["convert.mjs", "TRIAL_NOTICES.md", "licenses/SKIA-LICENSE", "assets/lang/LICENSE-tessdata-fast",
        "assets/lang/pol.traineddata", "assets/lang/eng.traineddata",
        "node_modules/pdfjs-dist/legacy/build/pdf.mjs", "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
        "node_modules/tesseract.js/src/worker-script/node/index.js", "node_modules/tesseract.js-core/tesseract-core-simd.wasm"]) {
        if (!manifest.files.some((file) => file.path === resource)) violations.push(`trial-resource-missing: ${resource}`);
      }
      if (manifest.schema === 2) for (const resource of ["ocr-parent.mjs", "ocr-child.mjs"])
        if (!manifest.files.some((file) => file.path === resource)) violations.push(`trial-resource-missing: ${resource}`);
    } catch (error) {
      violations.push(`trial-manifest: ${error instanceof Error ? error.message : "invalid"}`);
    }
  }

  for (const required of requiredEntries) {
    if (!names.includes(required)) {
      violations.push(`missing-entry: ${required}`);
    }
  }

  for (const name of names) {
    if (trialEntries.has(name)) continue;
    for (const { rule, pattern } of prohibitedEntryRules) {
      if (pattern.test(name)) {
        violations.push(`${rule}: ${name}`);
      }
    }

    if (!isAllowedEntry(name)) {
      violations.push(`unexpected-entry: ${name}`);
    }

    if (typeof options.forbiddenText === "string" && options.forbiddenText.length > 0) {
      try {
        if (archive.read(name).includes(Buffer.from(options.forbiddenText, "utf8"))) {
          violations.push(`forbidden-text: ${name}`);
        }
      } catch {
        violations.push(`entry-unreadable: ${name}`);
      }
    }
  }
  if (options.ux2Trial || productOcr) {
    for (const entry of trialEntries) if (!names.includes(entry)) violations.push(`trial-missing: ${entry}`);
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

      const requiredCommands = [
        "archiAgent.open",
        "archiAgent.convertToMarkdown",
        "archiAgent.generateDiagram",
        "archiAgent.generateSequenceDiagram",
        "archiAgent.selectProviderProfile",
        "archiAgent.selectModel",
        "archiAgent.setApiKey",
        "archiAgent.deleteApiKey"
      ];

      if (requiredCommands.some((command) => !commands.includes(command))) {
        violations.push("manifest-command: a required command is not contributed");
      }

      const properties = manifest.contributes?.configuration?.properties ?? {};

      if (Object.keys(properties).some((setting) => /api.?key|secret|credential/i.test(setting))) {
        violations.push("manifest-secret-setting: credentials must not be ordinary settings");
      }

      for (const setting of [
        "archiAgent.localModel.profile",
        "archiAgent.localModel.selectedModel",
        "archiAgent.localModel.selectedModelProfile"
      ]) {
        if (properties[setting]?.scope !== "machine") {
          violations.push(`manifest-setting-scope: ${setting} must have machine scope`);
        }
      }
    }
  }

  const bundles = [
    { entry: extensionBundleEntry, expectVscode: true },
    { entry: runtimeBundleEntry, expectVscode: false },
    { entry: converterWorkerEntry, expectVscode: false }
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
    if (/sk-ant-api\d{2}-[A-Za-z0-9_-]{16,}|sk-or-v1-[A-Fa-f0-9]{16,}|sk-proj-[A-Za-z0-9_-]{16,}/.test(text)) {
      violations.push(`bundle-credential-pattern: ${entry}`);
    }
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
  const trial = process.argv[2] === "--ux2-trial";
  const legacy = process.argv[2] === "--legacy";
  const argument = process.argv[trial || legacy ? 3 : 2];
  const externalTrialManifest = trial && process.argv[4] === "--manifest" ? process.argv[5] : undefined;
  const filePath = argument === undefined ? defaultVsixPath() : path.resolve(argument);

  if (filePath === undefined || process.argv.length > (trial ? (externalTrialManifest ? 6 : 4) : legacy ? 4 : 3)) {
    process.stderr.write("usage: node vscode-extension/scripts/verify-vsix.mjs [--ux2-trial|--legacy] [<file.vsix>] [--manifest <external.json>]\n");
    process.exitCode = 2;
  } else {
    const result = verifyVsix(filePath, { ux2Trial: trial, legacy, externalTrialManifest });
    process.stdout.write(`Package: ${path.relative(projectRoot, filePath)}\n`);
    process.stdout.write(`Entries (${result.entries.length})${trial || result.entries.includes(productManifestEntry) ? " (OCR resources checked by SHA-256)" : ":\n" + result.entries.map((name) => `  ${name}`).join("\n")}\n`);

    if (result.ok) {
      process.stdout.write(trial ? "Verification: OK (base files and trial resources checked).\n" : "Verification: OK (only the bounded runtime files are packaged).\n");
    } else {
      process.stdout.write(`Verification: FAILED\n${result.violations.map((line) => `  ${line}`).join("\n")}\n`);
      process.exitCode = 1;
    }
  }
}
