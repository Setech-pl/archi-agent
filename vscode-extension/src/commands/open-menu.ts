import * as vscode from "vscode";
import { commandIds } from "../contributions.js";
type MainChoice = "generate" | "save" | "configuration" | "knowledge" | "build" | "active" | "convert" | "help";
interface Choice extends vscode.QuickPickItem { readonly id: MainChoice }
export const mainChoices: readonly Choice[] = Object.freeze([
  { id: "generate", label: "Create Diagram" },
  { id: "save", label: "Save Diagram and Report" },
  { id: "configuration", label: "Configuration" },
  { id: "knowledge", label: "Knowledge Browser" },
  { id: "build", label: "Build Knowledge Pack from Documents" },
  { id: "active", label: "Build Knowledge Pack from Active File" },
  { id: "convert", label: "Convert to Markdown" },
  { id: "help", label: "Help" }
]);
/** Configuration shortcuts reveal the same panel; no competing configuration tree. */
export async function openArchiAgentMenu(): Promise<void> {
  const main = await vscode.window.showQuickPick(mainChoices, { title: "Archi Agent", placeHolder: "Choose a function" });
  if (!main) return;
  const command = { generate: commandIds.generateDiagram, save: commandIds.saveDiagramAndReport,
    configuration: commandIds.configuration, knowledge: commandIds.knowledgeBrowser, build: commandIds.buildKnowledgePack, active: commandIds.buildKnowledgePackFromActiveFile, convert: commandIds.convertToMarkdown, help: commandIds.help }[main.id];
  await vscode.commands.executeCommand(command);
}
