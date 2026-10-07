import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenDiagramResults, saveDiagramAndReportCommand, saveDiagramAction } from "../../vscode-extension/src/commands/save-diagram-and-report.js";
import { makeDocument, resetDouble, state, Uri, window, workspace } from "../doubles/vscode-module-double.js";
import { art1Fixture } from "../doubles/art1-fixture.js";
const roots: string[] = [];
beforeEach(resetDouble);
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const folder = (root: string, index = 0) => ({ name: `project-${index}`, uri: Uri.file(root), index });
async function fixture() { const f = await art1Fixture(); roots.push(f.root); return f; }
const first = (items: readonly any[]) => items[0];
describe("ART1 editor adapter", () => {
  it("no result instructs generation and performs no settings, provider or secret access", async () => {
    await saveDiagramAndReportCommand(new OpenDiagramResults());
    expect(state.messages[0]!.text).toContain("Generate a Sequence or Component");
    expect(state.secretReads).toEqual([]); expect(state.configurationUpdates).toEqual([]); expect(state.quickPicks).toEqual([]); expect(state.progressTitles).toEqual([]);
  });
  it("does not adopt results without a linked runtime artifact", async () => {
    const results = new OpenDiagramResults(); results.remember(undefined, [makeDocument("manual") as never]);
    await saveDiagramAndReportCommand(results); expect(state.messages[0]!.text).toContain("no completed diagram");
  });
  it("requires a project and does not start configuration", async () => {
    const f = await fixture(); await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
    expect(state.messages[0]!.text).toContain("open a project folder"); expect(state.executedCommands).toEqual([]); expect(f.calls()).toBe(2);
  });
  it("saves a single project's original after active buffer and settings change", async () => {
    const f = await fixture(), results = new OpenDiagramResults();
    const diagram = makeDocument("MANUAL_EDIT_MARKER"), report = makeDocument("wrong report", { fileName: "other-report.json" });
    results.remember(f.artifact, [diagram, report] as never);
    state.workspaceFolders = [folder(f.root)]; state.activeTextEditor = { document: makeDocument("UNRELATED_BUFFER_MARKER") };
    state.configuration.set("archiAgent.localModel.model", "CHANGED_MODEL_MARKER"); state.secrets.set("secret", "SECRET_MARKER");
    state.quickPickAnswers.push(first); state.messageAnswers.push(saveDiagramAction);
    await saveDiagramAndReportCommand(results);
    const dirs = await readdir(path.join(f.root, "archi-agent-results"));
    const saved = path.join(f.root, "archi-agent-results", dirs[0]!);
    expect(await readFile(path.join(saved, "diagram.puml"), "utf8")).toBe(f.result.plantUml);
    expect(await readFile(path.join(saved, "report.json"), "utf8")).not.toContain("CHANGED_MODEL_MARKER");
    expect(state.secretReads).toEqual([]); expect(state.configurationUpdates).toEqual([]); expect(state.executedCommands).toEqual([]); expect(f.calls()).toBe(2);
    expect(state.quickPicks[0]!.items).toHaveLength(1); expect(state.messages[0]!.modal).toBe(true); expect(state.messages[0]!.text).toContain("Manual editor changes are excluded");
  });
  it("multi-root requires explicit project selection and writes only that project", async () => {
    const f = await fixture(), other = await fixture(); state.workspaceFolders = [folder(f.root), folder(other.root, 1)];
    state.quickPickAnswers.push((items) => items.at(-1)); state.messageAnswers.push(saveDiagramAction);
    await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
    expect(await readdir(path.join(other.root, "archi-agent-results"))).toHaveLength(1);
    expect(await readdir(f.root)).toEqual(["architecture"]); expect((state.quickPicks[0]!.options as any).title).toBe("Archi Agent: select save project");
  });
  it.each(["result", "project", "confirmation", "progress"])("Cancel at %s creates no artifacts", async (point) => {
    const f = await fixture(), results = new OpenDiagramResults(); results.remember(f.artifact, [makeDocument("x")] as never);
    state.workspaceFolders = point === "project" ? [folder(f.root), folder(f.root, 1)] : [folder(f.root)];
    state.quickPickAnswers.push(point === "result" ? () => undefined : first);
    if (point !== "confirmation") state.messageAnswers.push(saveDiagramAction);
    state.progressCancelOnStart = point === "progress";
    await saveDiagramAndReportCommand(results);
    expect(await readdir(f.root)).toEqual(["architecture"]); expect(f.calls()).toBe(2); expect(state.secretReads).toEqual([]);
  });
  it("selects an older completed result while multiple previews and a later result exist", async () => {
    const f = await fixture(), newer = await art1Fixture("component"); roots.push(newer.root);
    const results = new OpenDiagramResults(); results.remember(f.artifact, [makeDocument("old", { fileName: "old.puml" })] as never); results.remember(newer.artifact, [makeDocument("new", { fileName: "new.puml" })] as never);
    state.workspaceFolders = [folder(f.root)]; state.quickPickAnswers.push(first); state.messageAnswers.push(saveDiagramAction);
    await saveDiagramAndReportCommand(results);
    const dirs = await readdir(path.join(f.root, "archi-agent-results"));
    const report = JSON.parse(await readFile(path.join(f.root, "archi-agent-results", dirs[0]!, "report.json"), "utf8"));
    expect(report.resultId).toBe(f.artifact.resultId); expect(report.diagramType).toBe("sequence"); expect(state.quickPicks[0]!.items).toHaveLength(2);
  });
  it("keeps a result while either preview is open and drops it when both close", async () => {
    const f = await fixture(), results = new OpenDiagramResults(), a = makeDocument("diagram", { fileName: "a.puml" }), b = makeDocument("report", { fileName: "b.json" });
    results.remember(f.artifact, [a, b] as never); results.close(a as never); expect(results.results()).toEqual([f.artifact]);
    results.close(b as never); expect(results.results()).toEqual([]);
  });
  it("completion offers local opening of exact saved report", async () => {
    const f = await fixture(); state.workspaceFolders = [folder(f.root)]; state.messageAnswers.push(saveDiagramAction, "Open Report");
    const open = vi.spyOn(workspace, "openTextDocument").mockImplementationOnce((uri: any) => Promise.resolve(makeDocument("", { fileName: uri.fsPath })));
    try {
      await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
      expect(state.shownDocuments).toHaveLength(1); expect((open.mock.calls[0]![0] as any).fsPath.endsWith("report.json")).toBe(true);
    } finally { open.mockRestore(); }
  });
  it.each(["Open Diagram", "Open Report"])("preserves committed save when %s cannot read the file", async (action) => {
    const f = await fixture(); state.workspaceFolders = [folder(f.root)]; state.messageAnswers.push(saveDiagramAction, action);
    const open = vi.spyOn(workspace, "openTextDocument").mockRejectedValueOnce(new Error("RAW_OPEN_ERROR_SECRET_MARKER"));
    try {
      await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
      const dirs = await readdir(path.join(f.root, "archi-agent-results"));
      expect(dirs).toHaveLength(1);
      const saved = path.join(f.root, "archi-agent-results", dirs[0]!);
      expect(await readFile(path.join(saved, "diagram.puml"), "utf8")).toBe(f.result.plantUml);
      expect(JSON.parse(await readFile(path.join(saved, "report.json"), "utf8")).resultId).toBe(f.artifact.resultId);
      const warning = state.messages.at(-1)!.text;
      expect(warning).toContain(`are saved at ${saved}`); expect(warning).toContain("Open this file manually");
      expect(warning).not.toContain("Retry Save"); expect(warning).not.toContain("RAW_OPEN_ERROR_SECRET_MARKER");
      expect(f.calls()).toBe(2);
    } finally { open.mockRestore(); }
  });
  it.each(["Open Diagram", "Open Report"])("preserves committed save when %s cannot display the document", async (action) => {
    const f = await fixture(); state.workspaceFolders = [folder(f.root)]; state.messageAnswers.push(saveDiagramAction, action);
    const open = vi.spyOn(workspace, "openTextDocument").mockImplementationOnce((uri: any) => Promise.resolve(makeDocument("", { fileName: uri.fsPath })));
    const show = vi.spyOn(window, "showTextDocument").mockRejectedValueOnce(new Error("RAW_DISPLAY_ERROR_SECRET_MARKER"));
    try {
      await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
      const dirs = await readdir(path.join(f.root, "archi-agent-results")); expect(dirs).toHaveLength(1);
      const saved = path.join(f.root, "archi-agent-results", dirs[0]!);
      expect(await readdir(saved)).toEqual(["diagram.puml", "report.json"]);
      expect(await readFile(path.join(saved, "diagram.puml"), "utf8")).toBe(f.result.plantUml);
      expect(JSON.parse(await readFile(path.join(saved, "report.json"), "utf8")).resultId).toBe(f.artifact.resultId);
      const warning = state.messages.at(-1)!.text;
      expect(warning).toContain(`are saved at ${saved}`); expect(warning).toContain("Open this file manually");
      expect(warning).not.toContain("Retry Save"); expect(warning).not.toContain("RAW_DISPLAY_ERROR_SECRET_MARKER");
      expect(f.calls()).toBe(2);
    } finally { open.mockRestore(); show.mockRestore(); }
  });
});
