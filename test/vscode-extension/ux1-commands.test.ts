import { beforeEach, describe, expect, it, vi } from "vitest";
import { mainChoices, openArchiAgentMenu } from "../../vscode-extension/src/commands/open-menu.js";
import { convertToMarkdownCommand } from "../../vscode-extension/src/commands/convert-to-markdown.js";
import { commandIds } from "../../vscode-extension/src/contributions.js";
import { resetDouble, state, Uri } from "../doubles/vscode-module-double.js";

const converter = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../src/runtime/index.js", () => ({ convertDocument: converter.run }));

const choose = (id: string) => (items: readonly unknown[]) => items.find((item) => (item as { id?: string }).id === id);

beforeEach(() => {
  resetDouble();
  converter.run.mockReset();
});

describe("UX4 menu navigation", () => {
  it("has one Create Diagram entry, screen shortcuts, conversion, save and help", () => {
    expect(mainChoices.map((item) => item.label)).toEqual(["Create Diagram", "Verify Flow (Sequence / prose)", "Save Diagram and Report", "Configuration", "Knowledge Browser", "Build Knowledge Pack from Documents", "Build Knowledge Pack from Active File", "Convert to Markdown", "Help"]);
  });
  it.each([["verify", commandIds.verifyFlow], ["generate", commandIds.generateDiagram], ["configuration", commandIds.configuration], ["knowledge", commandIds.knowledgeBrowser], ["build",commandIds.buildKnowledgePack], ["active",commandIds.buildKnowledgePackFromActiveFile], ["save", commandIds.saveDiagramAndReport], ["convert", commandIds.convertToMarkdown], ["help",commandIds.help]])("routes %s directly", async (id, command) => {
    state.quickPickAnswers.push(choose(id)); await openArchiAgentMenu();
    expect(state.executedCommands).toEqual([{ command, args: [] }]); expect(state.quickPicks).toHaveLength(1);
  });
  it("Escape performs no operation", async () => { await openArchiAgentMenu(); expect(state.executedCommands).toEqual([]); });
});

describe("standalone local converter command", () => {
  it("opens one untitled Markdown without any provider, key or Knowledge Pack configuration", async () => {
    state.openDialogAnswers.push([Uri.file("/synthetic/source.pdf")]);
    state.quickPickAnswers.push((items: readonly unknown[]) => items[0]);
    converter.run.mockResolvedValue({ status: "success", format: "pdf", markdown: "## Page 1\n\nSafe", counts: { pages: 1 } });
    await convertToMarkdownCommand();
    expect(converter.run).toHaveBeenCalledOnce();
    expect(converter.run.mock.calls[0]?.[1]).toMatchObject({ pdfOcrMode: "auto" });
    expect(state.openedDocuments).toHaveLength(1);
    expect(state.openedDocuments[0]).toMatchObject({ isUntitled: true, languageId: "markdown" });
    expect(state.openedDocuments[0]?.getText()).toBe("## Page 1\n\nSafe");
    expect(state.secretReads).toEqual([]);
    expect(state.configurationUpdates).toEqual([]);
    expect(state.outputLines).toEqual([]);
  });

  it("opens nothing after Escape, Cancel, error or a nonlocal URI", async () => {
    await convertToMarkdownCommand();
    expect(converter.run).not.toHaveBeenCalled();
    state.openDialogAnswers.push([Uri.file("/synthetic/source.pdf")]);
    state.quickPickAnswers.push((items: readonly unknown[]) => items[0]);
    state.progressCancelOnStart = true;
    converter.run.mockResolvedValue({ status: "success", format: "pdf", markdown: "text", counts: {} });
    await convertToMarkdownCommand();
    expect(state.openedDocuments).toEqual([]);
    resetDouble();
    state.openDialogAnswers.push([Uri.file("/synthetic/SECRET-NAME.pdf")]);
    state.quickPickAnswers.push((items: readonly unknown[]) => items[1]);
    converter.run.mockResolvedValue({ status: "failed", code: "corrupt-document" });
    await convertToMarkdownCommand();
    expect(state.openedDocuments).toEqual([]);
    expect(state.messages[0]?.text).not.toContain("SECRET-NAME");
    resetDouble();
    state.openDialogAnswers.push([{ scheme: "https", fsPath: "/synthetic/source.pdf", path: "/synthetic/source.pdf" }]);
    await convertToMarkdownCommand();
    expect(state.openedDocuments).toEqual([]);
    expect(state.secretReads).toEqual([]);
  });

  it("offers three PDF modes and does not ask for DOCX or XLSX", async () => {
    for (const [index, mode] of ["auto", "none", "all"].entries()) {
      resetDouble();
      state.openDialogAnswers.push([Uri.file("/synthetic/source.pdf")]);
      state.quickPickAnswers.push((items: readonly unknown[]) => items[index]);
      converter.run.mockResolvedValue({ status: "success", format: "pdf", markdown: "ok", counts: { pages: 1 } });
      await convertToMarkdownCommand();
      expect(converter.run.mock.lastCall?.[1]).toMatchObject({ pdfOcrMode: mode });
    }
    for (const ext of ["docx", "xlsx"]) {
      resetDouble();
      state.openDialogAnswers.push([Uri.file(`/synthetic/source.${ext}`)]);
      converter.run.mockResolvedValue({ status: "success", format: ext, markdown: "ok", counts: {} });
      await convertToMarkdownCommand();
      expect(state.quickPicks).toHaveLength(0);
      expect(converter.run.mock.lastCall?.[1]).toMatchObject({ pdfOcrMode: "none" });
    }
  });
});
