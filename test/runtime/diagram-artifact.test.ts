import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planDiagramBundle, saveDiagramBundle, serializeArtifactConfiguration, createKnowledgeSnapshot, createArchiAgentRuntime } from "../../src/runtime/index.js";
import { captureDiagramArtifact } from "../../src/runtime/diagram-artifact.js";
import { ContextEchoGenerator } from "../doubles/context-echo-generator.js";
import { art1Fixture } from "../doubles/art1-fixture.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(type: "sequence" | "component" = "sequence") { const f = await art1Fixture(type); roots.push(f.root); return f; }
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
describe("ART1 completed original bundle", () => {
  it.each(["sequence", "component"] as const)("saves exact %s bytes, report evidence and correct SHA without requests or source reads", async (type) => {
    const f = await fixture(type), expected = f.result.plantUml, originalReport = JSON.parse(f.result.groundingReport);
    const knowledge = f.artifact.metadata.knowledge, configuration = f.artifact.metadata.configuration;
    await rm(f.pack, { recursive: true });
    (f.request.generator as any).modelId = "CHANGED_MODEL";
    const saved = await saveDiagramBundle(f.root, f.artifact, planDiagramBundle());
    const diagram = await readFile(path.join(saved.directory, "diagram.puml"));
    const report = JSON.parse(await readFile(path.join(saved.directory, "report.json"), "utf8"));
    expect(diagram.equals(Buffer.from(expected))).toBe(true);
    expect(report.diagram).toEqual({ file: "diagram.puml", encoding: "utf8", byteLength: diagram.length, sha256: sha(diagram) });
    expect(report.generationReport.facts).toEqual(originalReport.facts);
    expect(report.generationReport.sources).toEqual(originalReport.sources);
    expect(report.generationReport.snapshotDigest.value).toBe(f.result.digest);
    expect(report.knowledge).toEqual(knowledge); expect(report.configuration).toEqual(configuration);
    expect(report.sourceReferences.knowledgePack).toEqual({ reference: "architecture", availability: "project-relative" });
    expect(report.versions.extension).toBe("0.3.0-alpha.4"); expect(report.versions.runtime).toBeNull();
    expect(report.runId).toBeNull(); expect(f.calls()).toBe(2);
    expect(await readdir(saved.directory)).toEqual(["diagram.puml", "report.json"]);
    const text = JSON.stringify(report);
    for (const marker of ["SECRET_MARKER", "TOKEN_MARKER", "RAW_ERROR_MARKER", "CHANGED_MODEL", f.root, f.request.flow.kind === "document" ? f.request.flow.text : "..."])
      expect(text).not.toContain(marker);
    expect(text).not.toContain("Authorization"); expect(text).not.toContain("baseUrl");
  });
  it("keeps earlier original distinct after another generation and repeated saves", async () => {
    const f = await fixture(), first = f.artifact;
    const result = await f.app.generateDiagram!({ ...f.request, diagramType: "component" });
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    const a = await saveDiagramBundle(f.root, first, planDiagramBundle());
    const b = await saveDiagramBundle(f.root, result.artifact!, planDiagramBundle());
    const c = await saveDiagramBundle(f.root, first, planDiagramBundle());
    const read = async (dir: string) => JSON.parse(await readFile(path.join(dir, "report.json"), "utf8"));
    expect((await read(a.directory)).resultId).toBe((await read(c.directory)).resultId);
    expect((await read(a.directory)).bundleId).not.toBe((await read(c.directory)).bundleId);
    expect((await read(b.directory)).resultId).not.toBe(first.resultId);
    expect(f.calls()).toBe(4);
  });
  it("freezes originals and rejects fabricated or missing linked results before mutation", async () => {
    const f = await fixture(); expect(Object.isFrozen(f.artifact)).toBe(true); expect(Object.isFrozen(f.artifact.report)).toBe(true);
    for (const artifact of [undefined, { ...f.artifact }, { ...f.artifact, plantUml: "edited" }]) {
      const plan = planDiagramBundle();
      await expect(saveDiagramBundle(f.root, artifact as any, plan)).rejects.toThrow();
      await expect(lstat(path.join(f.root, plan.relativeDirectory))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });
  it("canonical configuration serialization is ordered, Unicode preserving and deterministic", () => {
    const a = { z: ["ż", 2], a: { y: false, x: null } }, b = { a: { x: null, y: false }, z: ["ż", 2] };
    expect(serializeArtifactConfiguration(a)).toBe('{"a":{"x":null,"y":false},"z":["ż",2]}');
    expect(sha(serializeArtifactConfiguration(a))).toBe(sha(serializeArtifactConfiguration(b)));
    expect(() => serializeArtifactConfiguration({ bad: undefined } as any)).toThrow();
  });
  it("captures diagnostic run identity and digest matching the exact canonical configuration", async () => {
    const f = await fixture(), lines: string[] = [];
    const result = await f.app.generateDiagram!({ ...f.request, diagnosticSink: (s) => lines.push(s) });
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    expect(result.artifact!.metadata.runId).toBe(JSON.parse(lines[0]!).runId);
    const c = result.artifact!.metadata.configuration as any;
    expect(c.sha256).toBe(sha(serializeArtifactConfiguration(c.projection)));
  });
  it.each([false, true])("refuses existing destinations including empty=%s", async (empty) => {
    const f = await fixture(), plan = planDiagramBundle(), target = path.join(f.root, plan.relativeDirectory);
    await mkdir(target, { recursive: true }); if (!empty) await writeFile(path.join(target, "foreign"), "keep");
    await expect(saveDiagramBundle(f.root, f.artifact, plan)).rejects.toMatchObject({ code: "location-exists" });
    expect(await readdir(target)).toEqual(empty ? [] : ["foreign"]);
  });
  it("allows exactly one concurrent save into the same planned target", async () => {
    const f = await fixture(), plan = planDiagramBundle();
    const results = await Promise.allSettled([saveDiagramBundle(f.root, f.artifact, plan), saveDiagramBundle(f.root, f.artifact, plan)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await readdir(path.join(f.root, plan.relativeDirectory))).toEqual(["diagram.puml", "report.json"]);
  });
  it("allows concurrent independent bundles", async () => {
    const f = await fixture(); const saved = await Promise.all([saveDiagramBundle(f.root, f.artifact, planDiagramBundle()), saveDiagramBundle(f.root, f.artifact, planDiagramBundle())]);
    expect(saved[0].directory).not.toBe(saved[1].directory);
  });
  it.each(["before", "after-open", "after-write", "before-close", "before-verify"])("handles Cancel %s with conditional cleanup", async (step) => {
    const f = await fixture(), plan = planDiagramBundle(), controller = new AbortController();
    if (step === "before") controller.abort();
    await expect(saveDiagramBundle(f.root, f.artifact, plan, { signal: controller.signal,
      onStep: (s) => { if (s === step) controller.abort(); } })).rejects.toMatchObject({ code: "cancelled" });
    await expect(lstat(path.join(f.root, plan.relativeDirectory))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.each(["after-open", "after-write", "before-close", "before-verify"] as const)("cleans only owned data on fault %s", async (step) => {
    const f = await fixture(), plan = planDiagramBundle();
    await expect(saveDiagramBundle(f.root, f.artifact, plan, { onStep: (s) => { if (s === step) throw new Error("raw fault SECRET_MARKER"); } })).rejects.toThrow();
    await expect(lstat(path.join(f.root, plan.relativeDirectory))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("preserves foreign edits with concrete recovery after write failure", async () => {
    const f = await fixture(), plan = planDiagramBundle(), target = path.join(f.root, plan.relativeDirectory);
    await expect(saveDiagramBundle(f.root, f.artifact, plan, { onStep: async (s, file) => {
      if (s === "after-write") { await writeFile(file, "foreign edit"); throw new Error("injected"); }
    } })).rejects.toMatchObject({ cleanupIncomplete: true });
    expect(await readFile(path.join(target, "diagram.puml"), "utf8")).toBe("foreign edit");
  });
  it("preserves foreign added files and parent when rolling back", async () => {
    const f = await fixture(), plan = planDiagramBundle(), target = path.join(f.root, plan.relativeDirectory);
    await expect(saveDiagramBundle(f.root, f.artifact, plan, { onStep: async (s) => {
      if (s === "before-verify") { await writeFile(path.join(target, "foreign"), "keep"); throw new Error("injected"); }
    } })).rejects.toMatchObject({ cleanupIncomplete: true });
    expect(await readdir(target)).toEqual(["foreign"]);
  });
  it("does not report success or silently merge a foreign addition", async () => {
    const f = await fixture(), plan = planDiagramBundle(), target = path.join(f.root, plan.relativeDirectory);
    await expect(saveDiagramBundle(f.root, f.artifact, plan, { onStep: async (s, file) => {
      if (s === "before-verify" && file.endsWith("report.json")) await writeFile(path.join(target, "foreign"), "keep");
    } })).rejects.toMatchObject({ code: "file-changed", cleanupIncomplete: true });
    expect(await readdir(target)).toEqual(["foreign"]);
  });
  it("preserves replaced ancestor and moved owned data", async () => {
    const f = await fixture(), plan = planDiagramBundle(), parent = path.join(f.root, "archi-agent-results");
    await mkdir(parent);
    await expect(saveDiagramBundle(f.root, f.artifact, plan, { onStep: async (s) => {
      if (s === "before-verify") { await rename(parent, parent + "-moved"); await mkdir(parent); throw new Error("injected"); }
    } })).rejects.toMatchObject({ cleanupIncomplete: true });
    expect(await readdir(parent)).toEqual([]); expect(await readdir(parent + "-moved")).toHaveLength(1);
  });
  it("rejects symlinked parent and root, traversal and forged plan", async () => {
    const f = await fixture(), outside = path.join(f.root, "outside"); await mkdir(outside);
    await symlink(outside, path.join(f.root, "archi-agent-results"));
    await expect(saveDiagramBundle(f.root, f.artifact, planDiagramBundle())).rejects.toThrow();
    await symlink(f.root, path.join(f.root, "linked-root"));
    await expect(saveDiagramBundle(path.join(f.root, "linked-root"), f.artifact, planDiagramBundle())).rejects.toThrow();
    for (const relativeDirectory of ["../escape", "a/../../escape", "/absolute", "a\\b", "a/CON", "a/.."])
      await expect(saveDiagramBundle(f.root, f.artifact, { ...planDiagramBundle(), relativeDirectory })).rejects.toThrow();
    expect(await readdir(outside)).toEqual([]);
  });
  it("uses the same save path for the existing compatibility Sequence report and warnings", async () => {
    const f = await fixture();
    const app = createArchiAgentRuntime({ generatorFactory: () => new ContextEchoGenerator() });
    const result = await app.generateSequenceDiagram(f.request);
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    const saved = await saveDiagramBundle(f.root, result.artifact!, planDiagramBundle());
    const report = JSON.parse(await readFile(path.join(saved.directory, "report.json"), "utf8"));
    expect(report.generationReport).toEqual(JSON.parse(result.groundingReport));
    expect(report.knowledge.generationSnapshotDigest).toBe(result.digest);
  });
  it("captures caller configuration before asynchronous input loading", async () => {
    const f = await fixture(), request = { ...f.request, generator: { ...f.request.generator } };
    const pending = f.app.generateDiagram!(request);
    (request.generator as any).modelId = "CHANGED_DURING_AWAIT";
    const result = await pending; expect(result.status).toBe("success"); if (result.status !== "success") return;
    expect((result.artifact!.metadata.configuration as any).projection.modelId).toBe("test-model");
  });
  it("allowlists nested report metadata, source digests and safe configuration without raw transport data", async () => {
    const f = await fixture(), report = JSON.parse(f.result.groundingReport);
    report.rawError = "RAW_ERROR_MARKER"; report.generator.credential = { value: "SECRET_MARKER" };
    report.generator.modelId = "https://user:TOKEN_MARKER@host/model?api_key=SECRET_MARKER";
    report.sources.evidence[0].headers = { Authorization: "TOKEN_MARKER" }; report.facts[0].rawResponse = "TRANSPORT_MARKER";
    const knowledge = createKnowledgeSnapshot([{ source: { id: "knowledge-pack", kind: "markdown-pack", scope: {} }, records: {} }]);
    const captured = captureDiagramArtifact({ ...f.result, groundingReport: JSON.stringify(report) }, f.request,
      { ...knowledge, documentProvenance: [{ version: 1, bundleDigest: "c".repeat(64), sources: [{ sourceId: "source-" + "a".repeat(64),
        originalDigest: "a".repeat(64), textDigest: "b".repeat(64), type: "md", rawSource: "DOCUMENT_COPY_MARKER" } as any], entries: [] }] }, "sequence", null, null);
    const saved = await saveDiagramBundle(f.root, captured, planDiagramBundle()), text = await readFile(path.join(saved.directory, "report.json"), "utf8");
    for (const marker of ["RAW_ERROR_MARKER", "SECRET_MARKER", "TOKEN_MARKER", "TRANSPORT_MARKER", "DOCUMENT_COPY_MARKER"]) expect(text).not.toContain(marker);
    const written = JSON.parse(text); expect(written.generationReport.generator.modelId).toBeNull();
    expect(written.knowledge.documents).toEqual([{ id: "source-" + "a".repeat(64), type: "md", originalDigest: "a".repeat(64), textDigest: "b".repeat(64) }]);
    expect(written.generationReport.facts[0].source).toEqual(report.facts[0].source);
  });
  it("preserves a foreign second-file collision while removing the proven first file", async () => {
    const f = await fixture(), plan = planDiagramBundle(), target = path.join(f.root, plan.relativeDirectory);
    await expect(saveDiagramBundle(f.root, f.artifact, plan, { onStep: async (s, file) => {
      if (s === "before-verify" && file.endsWith("diagram.puml")) await writeFile(path.join(target, "report.json"), "foreign report");
    } })).rejects.toMatchObject({ code: "location-exists", cleanupIncomplete: true });
    expect(await readdir(target)).toEqual(["report.json"]); expect(await readFile(path.join(target, "report.json"), "utf8")).toBe("foreign report");
  });
  it("rejects a symlink substitution during write without writing or cleaning its target", async () => {
    const f = await fixture(), plan = planDiagramBundle(), target = path.join(f.root, plan.relativeDirectory), outside = path.join(f.root, "outside");
    await mkdir(outside);
    await expect(saveDiagramBundle(f.root, f.artifact, plan, { onStep: async (s) => {
      if (s === "before-verify") { await rename(target, target + "-moved"); await symlink(outside, target); }
    } })).rejects.toMatchObject({ cleanupIncomplete: true });
    expect(await readdir(outside)).toEqual([]); expect((await lstat(target)).isSymbolicLink()).toBe(true);
    expect(await readdir(target + "-moved")).toEqual(["diagram.puml"]);
  });
  it("commits after final verification; late Cancel does not roll back", async () => {
    const f = await fixture(), controller = new AbortController();
    const saved = await saveDiagramBundle(f.root, f.artifact, planDiagramBundle(), { signal: controller.signal });
    controller.abort(); expect(await readdir(saved.directory)).toHaveLength(2);
  });
});
