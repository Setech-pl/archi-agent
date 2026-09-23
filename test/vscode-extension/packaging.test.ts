import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createArchiAgentRuntime, type GenerateSequenceDiagramRequest } from "../../src/runtime/index.js";
import { buildPackFiles } from "../doubles/knowledge-pack-fixture.js";
import { ContextEchoGenerator } from "../doubles/context-echo-generator.js";
import { RemoteJsonTransportDouble } from "../doubles/remote-json-transport-double.js";

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
  verifyVsix(filePath: string, options?: { forbiddenText?: string }): { ok: boolean; entries: readonly string[]; violations: readonly string[] };
  requiredEntries: readonly string[];
  prohibitedEntryRules: readonly { rule: string; pattern: RegExp }[];
}

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const extensionRoot = path.join(projectRoot, "vscode-extension");
const scriptUrl = (name: string): string => new URL(`../../vscode-extension/scripts/${name}`, import.meta.url).href;
const LF = String.fromCharCode(10);
const workspaces: string[] = [];
const syntheticSecretSentinel = "ARCHI_AGENT_TEST_SENTINEL_DO_NOT_PACKAGE_7F3A";

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

  it("keeps the synthetic sentinel out of both production bundles", () => {
    expect(readFileSync(bundles.runtimeFile, "utf8")).not.toContain(syntheticSecretSentinel);
    expect(readFileSync(bundles.extensionFile, "utf8")).not.toContain(syntheticSecretSentinel);
  });
});

describe("synthetic secret leak guard", () => {
  it("keeps the sentinel out of generated artifacts, diagnostics and thrown errors", async () => {
    const root = temporaryDirectory("archi-agent-sentinel-pack-");
    const packDirectory = path.join(root, "architecture");
    mkdirSync(packDirectory);
    for (const [name, content] of Object.entries(buildPackFiles())) writeFileSync(path.join(packDirectory, name), content, "utf8");
    const flow = [
      "---",
      "diagram_name: sentinel-run",
      "flow_name: Sentinel run",
      "author: Packaging Test",
      "---",
      "The Night Observer asks the Scheduler for observation slots.",
      "The Telescope Scheduler signals the Dome Controller and registers frames in the Archive.",
      ""
    ].join(LF);
    const baseRequest = {
      flow: { kind: "document" as const, text: flow, fileName: "sentinel-run.md" },
      knowledgePack: { kind: "local-directory" as const, path: packDirectory }
    };
    const echo = new ContextEchoGenerator();
    await createArchiAgentRuntime({ generatorFactory: () => echo }).generateSequenceDiagram({
      ...baseRequest,
      generator: { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "echo" }
    });
    const grounded = echo.requests[0];
    if (grounded === undefined) throw new Error("missing synthetic grounded request");
    const model = await echo.generate(grounded);
    const request: GenerateSequenceDiagramRequest = {
      ...baseRequest,
      generator: {
        kind: "remote-provider",
        profileId: "cloud-openai",
        modelId: "gpt-test",
        credential: { type: "api-key", value: syntheticSecretSentinel }
      }
    };
    const success = await createArchiAgentRuntime({
      remoteTransport: new RemoteJsonTransportDouble(
        JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(model), refusal: null } }] })
      )
    }).generateSequenceDiagram(request);
    expect(JSON.stringify(success)).not.toContain(syntheticSecretSentinel);

    const failure = await createArchiAgentRuntime({
      remoteTransport: { exchange: () => Promise.reject(Object.assign(new Error(syntheticSecretSentinel), { code: "connection-failed" })) }
    }).generateSequenceDiagram(request);
    expect(JSON.stringify(failure)).not.toContain(syntheticSecretSentinel);
    expect(String(failure)).not.toContain(syntheticSecretSentinel);
  });
});

describe("clean runtime execution", () => {
  it("runs runtime extracted from VSIX in an empty directory with no repository, node_modules, npm or PATH", async () => {
    const runtimeDir = temporaryDirectory("archi-agent-runtime-");
    const packRoot = temporaryDirectory("archi-agent-clean-pack-");
    const workingDir = temporaryDirectory("archi-agent-clean-cwd-");
    const emptyPath = temporaryDirectory("archi-agent-empty-path-");
    const packDirectory = path.join(packRoot, "architecture");
    mkdirSync(packDirectory);

    for (const [name, content] of Object.entries(buildPackFiles())) {
      writeFileSync(path.join(packDirectory, name), content, "utf8");
    }

    const packageModule = (await import(scriptUrl("package-vsix.mjs"))) as PackageModule;
    const { openVsix } = await import(scriptUrl("vsix-zip.mjs")) as { openVsix(filePath: string): { read(name: string): Buffer } };
    const vsix = await packageModule.packageExtension({ outDir: temporaryDirectory("archi-agent-clean-vsix-") });
    writeFileSync(path.join(runtimeDir, buildModule.bundleFileNames.runtime), openVsix(vsix).read(`extension/dist/${buildModule.bundleFileNames.runtime}`));
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
      '      async: relationship.mode === "asynchronous", isResponse: false, order: index + 1 }));',
      "    const used = new Set(messages.flatMap((message) => [message.from.elementId, message.to.elementId]));",
      '    const participants = [...used].sort().map((id) => known.get(id)).map((element) => ({ origin: "knowledge-pack", elementId: element.id, canonicalName: element.canonicalName, kind: kindOf(element) }));',
      "    return { participants, messages };",
      "  }",
      "};",
      "let diagramCalls = 0;",
      "const diagramClient = { clientType: 'clean-runtime-chat', generationMetadata: { modelId: 'unused-model', temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },",
      "  async complete(chat) { diagramCalls += 1; if (diagramCalls === 2) return { source: 'content', value: { accepted: true, confirmedUserStatedFactIds: [], violations: [] } };",
      "    const snapshot = JSON.parse(chat.messages[1].content).snapshot;",
      "    const catalog = JSON.parse(chat.messages[1].content).operationCatalog;",
      "    const operation = catalog.find((entry) => entry.fromId === 'telescope-scheduler' && entry.toId === 'image-archive' && entry.kind === 'request');",
      "    return { source: 'content', value: { version: 3, groundedSteps: [{ order: 1, operationId: operation.operationId, label: 'Registers frames' }], userStatedSteps: [] } }; } };",
      "const instance = runtime.createArchiAgentRuntime({ generatorFactory: () => generator, diagramClientFactory: () => diagramClient });",
      "const generationRequest = {",
      `  flow: { kind: "document", text: ${JSON.stringify(flow)}, fileName: "observation-run.md" },`,
      `  knowledgePack: { kind: "local-directory", path: ${JSON.stringify(packDirectory)} },`,
      '  generator: { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "unused-model" }',
      "};",
      "Promise.all([instance.generateSequenceDiagram(generationRequest), instance.generateDiagram({ ...generationRequest, diagramType: 'sequence' })]).then(([result, d1]) => {",
      "  process.stdout.write(JSON.stringify({ cwd: process.cwd(), status: result.status, stage: result.stage, diagramName: result.diagramName, plantUml: result.plantUml, report: result.groundingReport, summary: result.summary, d1Status: d1.status, d1Stage: d1.stage, d1Issues: d1.issues, d1PlantUml: d1.plantUml, d1Report: d1.groundingReport }));",
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

    const output = JSON.parse(child.stdout) as { cwd: string; status: string; diagramName: string; plantUml: string; report: string; summary: { messageCount: number }; d1Status: string; d1Stage?: string; d1Issues?: unknown; d1PlantUml: string; d1Report: string };
    expect(output.status).toBe("success");
    expect(realpathSync(output.cwd)).toBe(workingDir);
    expect(output.diagramName).toBe("observation-run");
    expect(output.plantUml.startsWith("@startuml")).toBe(true);
    expect(output.summary.messageCount).toBe(3);
    expect(output.report).not.toContain(packRoot);
    expect(output.plantUml).not.toContain(projectRoot);
    expect({ status: output.d1Status, stage: output.d1Stage, issues: output.d1Issues }).toEqual({ status: "success", stage: undefined, issues: undefined });
    expect(output.d1PlantUml).toContain("Registers frames (DB: Archive Writer)");
    expect(output.d1Report).not.toContain(packRoot);
    expect(JSON.parse(output.d1Report)).toMatchObject({ reportSchemaVersion: 2, generationPath: "reviewed-plan-rendered" });
  }, 90_000);
});

describe("VSIX", () => {
  let vsixPath: string;
  let verifyModule: VerifyModule;

  beforeAll(async () => {
    const packageModule = (await import(scriptUrl("package-vsix.mjs"))) as PackageModule;
    verifyModule = (await import(scriptUrl("verify-vsix.mjs"))) as VerifyModule;
    vsixPath = await packageModule.packageExtension({ outDir: temporaryDirectory("archi-agent-vsix-") });
  }, 180_000);

  it("packages and contains exactly the bounded runtime files", () => {
    const result = verifyModule.verifyVsix(vsixPath, { forbiddenText: syntheticSecretSentinel });

    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect([...result.entries].sort()).toEqual(
      ["[Content_Types].xml", "extension.vsixmanifest", "extension/package.json", "extension/readme.md", "extension/dist/archi-agent-runtime.js", "extension/dist/extension.js"].sort()
    );
    expect(path.basename(vsixPath)).toBe("archi-agent-0.2.0-alpha.1.vsix");
  });

  it("packages the corrected D1.2 plan-validation mapping in the runtime bundle", async () => {
    const { openVsix } = await import(scriptUrl("vsix-zip.mjs")) as { openVsix(filePath: string): { read(name: string): Buffer } };
    const runtime = openVsix(vsixPath).read("extension/dist/archi-agent-runtime.js").toString("utf8");
    expect(runtime).toContain("diagram-plan-invalid");
    expect(runtime).toContain("interaction-mode-mismatch");
    expect(runtime).toContain("reviewed_sequence_plan");
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
