import * as vscode from "vscode";
import { commandIds } from "../contributions.js";
type MainChoice = "generate" | "save" | "configuration" | "knowledge" | "convert" | "help";
interface Choice extends vscode.QuickPickItem { readonly id: MainChoice }
export const mainChoices: readonly Choice[] = Object.freeze([
  { id: "generate", label: "Create Diagram" },
  { id: "save", label: "Save Diagram and Report" },
  { id: "configuration", label: "Configuration" },
  { id: "knowledge", label: "Knowledge Management", description: "Open Configuration → Knowledge Management" },
  { id: "convert", label: "Convert to Markdown" },
  { id: "help", label: "Help" }
]);
/** Configuration shortcuts reveal the same panel; no competing configuration tree. */
export async function openArchiAgentMenu(): Promise<void> {
  const main = await vscode.window.showQuickPick(mainChoices, { title: "Archi Agent", placeHolder: "Choose a function" });
  if (!main) return;
  const command = { generate: commandIds.generateDiagram, save: commandIds.saveDiagramAndReport,
    configuration: commandIds.configuration, knowledge: commandIds.configureKnowledgePack, convert: commandIds.convertToMarkdown, help: commandIds.help }[main.id];
  await vscode.commands.executeCommand(command);
}
