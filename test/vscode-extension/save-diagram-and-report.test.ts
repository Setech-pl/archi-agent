import { lstat, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenDiagramResults, saveDiagramAndReportCommand, saveDiagramAction } from "../../vscode-extension/src/commands/save-diagram-and-report.js";
import { makeDocument, resetDouble, state, Uri, window, workspace } from "../doubles/vscode-module-double.js";
import { art1Fixture } from "../doubles/art1-fixture.js";
import * as runtime from "../../src/runtime/index.js";
const roots: string[] = [];
beforeEach(resetDouble);
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const folder = (root: string, index = 0) => ({ name: `project-${index}`, uri: Uri.file(root), index });
async function fixture() { const f = await art1Fixture(); roots.push(f.root); return f; }
const first = (items: readonly any[]) => items[0];
describe("ART1 editor adapter", () => {
  it.each(["linked-root", "linked-results", "missing-root", "file-root", "file-results"])("explains persistent path rejection %s without futile Retry or artifacts", async (scenario) => {
    const f = await fixture(); let project = f.root;
    const outside = path.join(f.root, "outside"), resultParent = path.join(f.root, "archi-agent-results");
    let code: string, reason: string;
    if (scenario === "linked-root") {
      project = path.join(f.root, "linked-root"); await symlink(f.root, project); code = "symbolic-link"; reason = "real folder";
    } else if (scenario === "linked-results") {
      await mkdir(outside); await symlink(outside, resultParent); code = "symbolic-link"; reason = "without symbolic links";
    } else if (scenario === "missing-root") {
      project = path.join(f.root, "missing"); code = "not-found"; reason = "Restore it";
    } else if (scenario === "file-root") {
      project = path.join(f.root, "project-file"); await writeFile(project, "owner data"); code = "not-a-directory"; reason = "not a directory";
    } else {
      await writeFile(resultParent, "owner data"); code = "not-a-directory"; reason = "move any file blocking";
    }
    const originalEntries = await readdir(f.root);
    state.workspaceFolders = [folder(project)]; state.messageAnswers.push(saveDiagramAction);
    await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
    const message = state.messages.at(-1)!.text;
    expect(message).toContain(`(${code})`); expect(message).toContain(reason); expect(message).not.toContain("Retry");
    expect(message).not.toContain("stack"); expect(await readdir(f.root)).toEqual(originalEntries);
    if (scenario === "linked-results") expect(await readdir(outside)).toEqual([]);
    if (scenario === "file-root" || scenario === "file-results") expect(await readFile(scenario === "file-root" ? project : resultParent, "utf8")).toBe("owner data");
    expect(f.calls()).toBe(2);
  });
  it.each(["containment-violation", "invalid-path"] as const)("explains %s with controlled guidance and no exception details", async (code) => {
    const f = await fixture(); state.workspaceFolders = [folder(f.root)]; state.messageAnswers.push(saveDiagramAction);
    const progress = vi.spyOn(window, "withProgress").mockRejectedValueOnce(new runtime.LocalPathError(code));
    try {
      await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
      const message = state.messages.at(-1)!.text;
      expect(message).toContain(`(${code})`); expect(message).toContain(code === "containment-violation" ? "inside it" : "Check the path");
      expect(message).not.toContain("Retry"); expect(await readdir(f.root)).toEqual(["architecture"]);
    } finally { progress.mockRestore(); }
  });
  it("handles unknown errors without exposing the raw exception", async () => {
    const f = await fixture(); state.workspaceFolders = [folder(f.root)]; state.messageAnswers.push(saveDiagramAction);
    const progress = vi.spyOn(window, "withProgress").mockRejectedValueOnce(new Error("RAW_ERROR_SECRET_MARKER"));
    try {
      await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
      expect(state.messages.at(-1)!.text).toContain("(write-failed)");
      expect(state.messages.at(-1)!.text).not.toContain("RAW_ERROR_SECRET_MARKER");
      expect(await readdir(f.root)).toEqual(["architecture"]);
    } finally { progress.mockRestore(); }
  });
  it("does not claim preserved data at removed A when a concurrent B remains", async () => {
    const f = await fixture(); state.workspaceFolders = [folder(f.root)]; state.messageAnswers.push(saveDiagramAction);
    const save = runtime.saveDiagramBundle; let targetA = "", targetB = "";
    const injected = vi.spyOn(runtime, "saveDiagramBundle").mockImplementationOnce(async (project, artifact, plan, options) => {
      targetA = path.join(project, plan.relativeDirectory);
      return save(project, artifact, plan, { ...options, onStep: async (step, file) => {
        if (step === "before-verify" && file.endsWith("report.json")) {
          targetB = (await save(project, artifact, runtime.planDiagramBundle())).directory;
          throw new Error("RAW_ERROR_SECRET_MARKER");
        }
      } });
    });
    try {
      await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
      const message = state.messages.at(-1)!.text;
      expect(message).toContain("(write-failed)"); expect(message).not.toContain("Data may remain");
      expect(message).not.toContain("RAW_ERROR_SECRET_MARKER");
      await expect(lstat(targetA)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readdir(path.join(f.root, "archi-agent-results"))).toEqual([path.basename(targetB)]);
      expect(await readFile(path.join(targetB, "diagram.puml"), "utf8")).toBe(f.result.plantUml);
      expect(JSON.parse(await readFile(path.join(targetB, "report.json"), "utf8")).generationReport).toEqual(JSON.parse(f.result.groundingReport));
    } finally { injected.mockRestore(); }
  });
  it("reports uncertain cleanup without asserting that an absent destination contains preserved data", async () => {
    const f = await fixture(); state.workspaceFolders = [folder(f.root)]; state.messageAnswers.push(saveDiagramAction);
    let target = "";
    const injected = vi.spyOn(runtime, "saveDiagramBundle").mockImplementationOnce(async (project, _artifact, plan) => {
      target = path.join(project, plan.relativeDirectory);
      throw new runtime.StarterPackCreateError("write-failed", true, new Error("RAW_ERROR_SECRET_MARKER"));
    });
    try {
      await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
      await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
      const message = state.messages.at(-1)!.text;
      expect(message).toContain("Safe cleanup could not be confirmed");
      expect(message).toContain(`Data may remain at ${target} or in its parent`);
      expect(message).toContain("Inspect these locations and keep any edits");
      expect(message).not.toContain("Preserved data at"); expect(message).not.toContain("RAW_ERROR_SECRET_MARKER");
      expect(await readdir(f.root)).toEqual(["architecture"]);
    } finally { injected.mockRestore(); }
  });
  it.each(["foreign-edit", "uncertain-partial"])("still warns about preserved data for %s", async (scenario) => {
    const f = await fixture(); state.workspaceFolders = [folder(f.root)]; state.messageAnswers.push(saveDiagramAction);
    const save = runtime.saveDiagramBundle; let target = "";
    const injected = vi.spyOn(runtime, "saveDiagramBundle").mockImplementationOnce(async (project, artifact, plan, options) => {
      target = path.join(project, plan.relativeDirectory);
      return save(project, artifact, plan, { ...options, onStep: async (step, file, handle) => {
        if (scenario === "foreign-edit" && step === "after-write") {
          await writeFile(file, "owner edit"); throw new Error("RAW_ERROR_SECRET_MARKER");
        }
        if (scenario === "uncertain-partial" && step === "after-open") {
          await handle.writeFile("uncertain partial"); throw new Error("RAW_ERROR_SECRET_MARKER");
        }
      } });
    });
    try {
      await saveDiagramAndReportCommand(new OpenDiagramResults(), f.artifact);
      const message = state.messages.at(-1)!.text;
      expect(message).toContain("Safe cleanup could not be confirmed");
      expect(message).toContain(`Data may remain at ${target} or in its parent`); expect(message).toContain("keep any edits");
      expect(message).not.toContain("RAW_ERROR_SECRET_MARKER");
      expect(await readFile(path.join(target, "diagram.puml"), "utf8")).toBe(scenario === "foreign-edit" ? "owner edit" : "uncertain partial");
    } finally { injected.mockRestore(); }
  });
  it("no result instructs generation and performs no settings, provider or secret access", async () => {
    await saveDiagramAndReportCommand(new OpenDiagramResults());
    expect(state.messages[0]!.text).toContain("Use Create Diagram");
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
  it("keeps Save available when one or both previews change language, and removes it after both really close", async () => {
    const f = await fixture(), results = new OpenDiagramResults();
    const a = { ...makeDocument("diagram", { fileName: "language-a.puml" }), isClosed: false };
    const b = { ...makeDocument("report", { fileName: "language-b.json" }), isClosed: false };
    results.remember(f.artifact, [a, b] as never);
    results.close(a as never); expect(results.results()).toEqual([f.artifact]);
    results.close(b as never); expect(results.results()).toEqual([f.artifact]);
    state.workspaceFolders = [folder(f.root)]; state.quickPickAnswers.push(first); state.messageAnswers.push(saveDiagramAction);
    await saveDiagramAndReportCommand(results);
    expect(state.quickPicks[0]!.items).toHaveLength(1);
    const dirs = await readdir(path.join(f.root, "archi-agent-results")); expect(dirs).toHaveLength(1);
    expect(await readFile(path.join(f.root, "archi-agent-results", dirs[0]!, "diagram.puml"), "utf8")).toBe(f.result.plantUml);
    results.close({ ...a, isClosed: true } as never); expect(results.results()).toEqual([f.artifact]);
    results.close({ ...b, isClosed: true } as never); expect(results.results()).toEqual([]);
    expect(f.calls()).toBe(2);
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
