import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPackFiles } from "../doubles/knowledge-pack-fixture.js";

/**
 * Packaging checks: the bundles build, the runtime bundle runs on its own from a directory that
 * holds nothing else (no repository, no node_modules, no npm or node on PATH), the VSIX packages
 * through vsce in library mode, and the package holds exactly the bounded runtime files.
 */

interface BuildModule {
  buildExtensionBundles(options?: { outDir?: string }): Promise<{ outDir: string; runtimeFile: string; extensionFile: string }>;
  bundleFileNames: { extension: string; runtime: string };
  bundleTarget: string;
  bundleFormat: string;
  extensionRoot: string;
  projectRoot: string;
}

interface PackageModule {
  packageExtension(options?: { outDir?: string; bundleDir?: string }): Promise<string>;
}

interface VerifyModule {
  verifyVsix(filePath: string): { ok: boolean; entries: readonly string[]; violations: readonly string[] };
  requiredEntries: readonly string[];
  prohibitedEntryRules: readonly { rule: string; pattern: RegExp }[];
}

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const extensionRoot = path.join(projectRoot, "vscode-extension");
const scriptUrl = (name: string): string => new URL(`../../vscode-extension/scripts/${name}`, import.meta.url).href;
const LF = String.fromCharCode(10);
const workspaces: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  workspaces.push(directory);
  return directory;
}

let buildModule: BuildModule;
let bundles: { outDir: string; runtimeFile: string; extensionFile: string };

beforeAll(async () => {
  buildModule = (await import(scriptUrl("build.mjs"))) as BuildModule;
  bundles = await buildModule.buildExtensionBundles({ outDir: temporaryDirectory("archi-agent-bundles-") });
}, 120_000);

afterAll(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("bundles", () => {
  it("builds both bundles as CommonJS for the Node 20 extension host", () => {
    expect(buildModule.bundleFormat).toBe("cjs");
    expect(buildModule.bundleTarget).toBe("node20");
    expect(statSync(bundles.runtimeFile).size).toBeGreaterThan(10_000);
    expect(statSync(bundles.extensionFile).size).toBeGreaterThan(1_000);
    expect(readdirSync(bundles.outDir).sort()).toEqual([buildModule.bundleFileNames.runtime, buildModule.bundleFileNames.extension].sort());
  });

  it("links the extension bundle to the editor API and the sibling runtime bundle only", () => {
    const text = readFileSync(bundles.extensionFile, "utf8");
    const specifiers = [...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);

    expect(new Set(specifiers)).toEqual(new Set(["vscode", "node:path", `./${buildModule.bundleFileNames.runtime}`]));
    expect(text).not.toContain("src/runtime/index");
  });

  it("keeps the runtime bundle free of the editor API, source maps and repository paths", () => {
    const text = readFileSync(bundles.runtimeFile, "utf8");
    const specifiers = [...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] ?? "");

    expect(specifiers.every((specifier) => specifier.startsWith("node:"))).toBe(true);
    expect(text).not.toMatch(/require\(\s*["']vscode["']\s*\)/);
    expect(text).not.toContain("sourceMappingURL");
    expect(text.toLowerCase()).not.toContain(projectRoot.toLowerCase().replace(/[\\/]+$/, ""));
    expect(text).not.toContain("child_process");
    expect(text).not.toMatch(/\bnpm\s+run\b/);
    expect(text).toContain("createArchiAgentRuntime");
  });
});

describe("clean runtime execution", () => {
  it("runs the packaged runtime from an empty directory with no repository, node_modules, npm or PATH", () => {
    const runtimeDir = temporaryDirectory("archi-agent-runtime-");
    const packRoot = temporaryDirectory("archi-agent-clean-pack-");
    const workingDir = temporaryDirectory("archi-agent-clean-cwd-");
    const emptyPath = temporaryDirectory("archi-agent-empty-path-");
    const packDirectory = path.join(packRoot, "architecture");
    mkdirSync(packDirectory);

    for (const [name, content] of Object.entries(buildPackFiles())) {
      writeFileSync(path.join(packDirectory, name), content, "utf8");
    }

    copyFileSync(bundles.runtimeFile, path.join(runtimeDir, buildModule.bundleFileNames.runtime));
    const flow = [
      "---",
      "diagram_name: observation-run",
      "flow_name: Observation run",
      "author: Clean Runtime Test",
      "---",
      "The Night Observer asks the Scheduler for observation slots.",
      "The Telescope Scheduler signals the Dome Controller and registers frames in the Archive.",
      ""
    ].join(LF);
    const script = [
      `const runtime = require("./${buildModule.bundleFileNames.runtime}");`,
      "const generator = {",
      '  generatorType: "clean-runtime-echo",',
      "  async generate(request) {",
      "    const context = request.context;",
      "    const known = new Map([...context.actors, ...context.systems].map((element) => [element.id, element]));",
      '    const kindOf = (element) => element.participantType === "actor" ? "actor" : element.systemKind === "database" ? "database" : element.systemKind === "queue" ? "queue" : "system";',
      '    const types = { REST_API: "REST API" };',
      "    const messages = context.relationships.map((relationship, index) => ({",
      "      from: { elementId: relationship.fromId }, to: { elementId: relationship.toId }, label: relationship.purpose,",
      "      interfaceType: types[relationship.interfaceType] ?? relationship.interfaceType,",
      "      ...(relationship.interfaceName === null ? {} : { interfaceName: relationship.interfaceName }),",
      '      ...(relationship.mode === "asynchronous" ? { async: true } : {}), order: index + 1 }));',
      "    const used = new Set(messages.flatMap((message) => [message.from.elementId, message.to.elementId]));",
      '    const participants = [...used].sort().map((id) => known.get(id)).map((element) => ({ origin: "knowledge-pack", elementId: element.id, canonicalName: element.canonicalName, kind: kindOf(element) }));',
      "    return { participants, messages };",
      "  }",
      "};",
      "const instance = runtime.createArchiAgentRuntime({ generatorFactory: () => generator });",
      "instance.generateSequenceDiagram({",
      `  flow: { kind: "document", text: ${JSON.stringify(flow)}, fileName: "observation-run.md" },`,
      `  knowledgePack: { kind: "local-directory", path: ${JSON.stringify(packDirectory)} },`,
      '  generator: { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "unused-model" }',
      "}).then((result) => {",
      "  process.stdout.write(JSON.stringify({ cwd: process.cwd(), status: result.status, stage: result.stage, diagramName: result.diagramName, plantUml: result.plantUml, report: result.groundingReport, summary: result.summary }));",
      "}, (error) => { process.stdout.write(JSON.stringify({ status: 'threw', name: error && error.name })); });",
      ""
    ].join(LF);
    const scriptPath = path.join(runtimeDir, "run.cjs");
    writeFileSync(scriptPath, script, "utf8");

    expect(existsSync(path.join(runtimeDir, "node_modules"))).toBe(false);

    const child = spawnSync(process.execPath, [scriptPath], {
      cwd: workingDir,
      env: { PATH: emptyPath, Path: emptyPath, SYSTEMROOT: process.env["SYSTEMROOT"] ?? "", TEMP: emptyPath, TMP: emptyPath, NODE_OPTIONS: "" },
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true
    });

    expect(child.error).toBeUndefined();
    expect(child.stderr).toBe("");
    expect(child.status).toBe(0);

    const output = JSON.parse(child.stdout) as { cwd: string; status: string; diagramName: string; plantUml: string; report: string; summary: { messageCount: number } };
    expect(output.status).toBe("success");
    expect(realpathSync(output.cwd)).toBe(workingDir);
    expect(output.diagramName).toBe("observation-run");
    expect(output.plantUml.startsWith("@startuml")).toBe(true);
    expect(output.summary.messageCount).toBe(3);
    expect(output.report).not.toContain(packRoot);
    expect(output.plantUml).not.toContain(projectRoot);
  }, 90_000);
});

describe("VSIX", () => {
  let vsixPath: string;
  let verifyModule: VerifyModule;

  beforeAll(async () => {
    const packageModule = (await import(scriptUrl("package-vsix.mjs"))) as PackageModule;
    verifyModule = (await import(scriptUrl("verify-vsix.mjs"))) as VerifyModule;
    vsixPath = await packageModule.packageExtension({ outDir: temporaryDirectory("archi-agent-vsix-"), bundleDir: temporaryDirectory("archi-agent-vsix-bundles-") });
  }, 180_000);

  it("packages and contains exactly the bounded runtime files", () => {
    const result = verifyModule.verifyVsix(vsixPath);

    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect([...result.entries].sort()).toEqual(
      ["[Content_Types].xml", "extension.vsixmanifest", "extension/package.json", "extension/readme.md", "extension/dist/archi-agent-runtime.js", "extension/dist/extension.js"].sort()
    );
    expect(path.basename(vsixPath)).toBe("archi-agent-0.2.0-alpha.1.vsix");
  });

  it("rejects prohibited content by rule", () => {
    const names = [".git/HEAD", "extension/.env", "extension/node_modules/zod/index.js", "extension/src/extension.ts", "extension/test/a.test.js", "extension/coverage/lcov.info", "extension/nested.vsix", "extension/samples/pack/systems.md", "extension/out/x.puml", "extension/dist/extension.js.map", "extension/debug.log", "extension/server.pem"];

    for (const name of names) {
      expect({ name, prohibited: verifyModule.prohibitedEntryRules.some(({ pattern }) => pattern.test(name)) }).toEqual({ name, prohibited: true });
    }

    for (const name of verifyModule.requiredEntries) {
      expect({ name, prohibited: verifyModule.prohibitedEntryRules.some(({ pattern }) => pattern.test(name)) }).toEqual({ name, prohibited: false });
    }
  });

  it("does not rely on npm, scripts or dependencies at run time", () => {
    const manifest = JSON.parse(readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as Record<string, unknown>;

    expect(manifest["scripts"]).toBeUndefined();
    expect(manifest["dependencies"]).toBeUndefined();
    expect(manifest["devDependencies"]).toBeUndefined();
    expect(manifest["main"]).toBe("./dist/extension.js");
    expect(readFileSync(path.join(extensionRoot, ".vscodeignore"), "utf8")).toContain("**");
  });

  it("fails verification for an archive that is not a VSIX", () => {
    const bogus = path.join(temporaryDirectory("archi-agent-bogus-"), "bogus.vsix");
    writeFileSync(bogus, "not a zip");
    const result = verifyModule.verifyVsix(bogus);

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.startsWith("unreadable-archive")).toBe(true);
  });
});

describe("source boundaries", () => {
  it("lets the extension sources reach the repository only through the runtime entry point", () => {
    const sourceDir = path.join(extensionRoot, "src");
    const files = readdirSync(sourceDir, { recursive: true })
      .map(String)
      .filter((name) => name.endsWith(".ts"));

    expect(files.length).toBeGreaterThan(5);

    for (const name of files) {
      const text = readFileSync(path.join(sourceDir, name), "utf8");
      const specifiers = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");

      for (const specifier of specifiers) {
        const reachesRepository = /(?:^|\/)\.\.\/\.\.\/src\//.test(specifier) || /\.\.\/\.\.\/\.\.\/src\//.test(specifier);
        expect({ name, specifier, ok: !reachesRepository || specifier.endsWith("src/runtime/index.js") }).toEqual({ name, specifier, ok: true });
        expect({ name, specifier, spawns: /child_process/.test(specifier) }).toEqual({ name, specifier, spawns: false });
      }
    }
  });

  it("keeps the runtime layer free of the editor API", () => {
    const runtimeDir = path.join(projectRoot, "src", "runtime");

    for (const name of readdirSync(runtimeDir)) {
      const text = readFileSync(path.join(runtimeDir, name), "utf8");
      expect({ name, editor: /from\s+["']vscode["']/.test(text) }).toEqual({ name, editor: false });
      expect({ name, cwd: /process\.cwd\(/.test(text) }).toEqual({ name, cwd: false });
      expect({ name, env: /process\.env/.test(text) }).toEqual({ name, env: false });
    }
  });
});
