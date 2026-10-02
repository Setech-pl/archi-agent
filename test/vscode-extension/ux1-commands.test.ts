import { beforeEach, describe, expect, it, vi } from "vitest";
import { mainChoices, configurationChoices, knowledgeChoices, openArchiAgentMenu } from "../../vscode-extension/src/commands/open-menu.js";
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

describe("UX1 QuickPick navigation", () => {
  it("shows exactly four main functions and no future knowledge options", () => {
    expect(mainChoices.map((item) => item.label)).toEqual(["Generate Diagram", "Configuration", "Knowledge Management", "Convert to Markdown"]);
    expect(knowledgeChoices.map((item) => item.label)).toEqual(["Configure Knowledge Pack Path", "$(arrow-left) Back"]);
    expect(configurationChoices.map((item) => item.label)).toEqual([
      "Select Provider Profile", "Select Model", "Set/Update API Key", "Delete API Key",
      "Configure Knowledge Pack Path", "Verbose Diagnostics", "Other Archi Agent Settings", "$(arrow-left) Back"
    ]);
  });

  it.each([
    ["generate", commandIds.generateDiagram],
    ["convert", commandIds.convertToMarkdown]
  ])("routes %s to the existing command boundary", async (id, command) => {
    state.quickPickAnswers.push(choose(id));
    await openArchiAgentMenu();
    expect(state.executedCommands).toEqual([{ command, args: [] }]);
  });

  it.each([
    ["provider", commandIds.selectProviderProfile],
    ["model", commandIds.selectModel],
    ["set-key", commandIds.setApiKey],
    ["delete-key", commandIds.deleteApiKey]
  ])("routes Configuration/%s to the public command ID", async (id, command) => {
    state.quickPickAnswers.push(choose("configuration"), choose(id));
    await openArchiAgentMenu();
    expect(state.executedCommands).toEqual([{ command, args: [] }]);
  });

  it("opens exact settings from Configuration and Knowledge Management", async () => {
    state.quickPickAnswers.push(choose("configuration"), choose("verbose"));
    await openArchiAgentMenu();
    expect(state.executedCommands).toEqual([{ command: "workbench.action.openSettings", args: ["archiAgent.diagnostics.verbose"] }]);
    resetDouble();
    state.quickPickAnswers.push(choose("knowledge"), choose("pack"));
    await openArchiAgentMenu();
    expect(state.executedCommands).toEqual([{ command: "workbench.action.openSettings", args: ["archiAgent.knowledgePackPath"] }]);
  });

  it("Back and Escape perform no command or file operation", async () => {
    state.quickPickAnswers.push(choose("configuration"), choose("back"));
    await openArchiAgentMenu();
    expect(state.quickPicks).toHaveLength(3);
    expect(state.executedCommands).toEqual([]);
    expect(state.openedDocuments).toEqual([]);
    resetDouble();
    await openArchiAgentMenu();
    expect(state.executedCommands).toEqual([]);
  });
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
