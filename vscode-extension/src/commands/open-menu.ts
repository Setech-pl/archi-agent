import { captureEnterpriseInput } from "./enterprise-input.js";
import * as vscode from "vscode";
import { commandIds } from "../contributions.js";
type MainChoice = "update-enterprise" | "enterprise" | "generate" | "verify" | "save" | "configuration" | "knowledge" | "build" | "active" | "convert" | "help";
interface Choice extends vscode.QuickPickItem { readonly id: MainChoice }
export const mainChoices: readonly Choice[] = Object.freeze([
  { id:"update-enterprise",label:"Update Enterprise Catalog / Aktualizuj katalog enterprise" },
  { id: "enterprise", label: "Build Business Capability Catalog / Utwórz katalog zdolności biznesowych" },
  { id: "generate", label: "Create Diagram" },
  { id: "verify", label: "Verify Flow (Sequence / prose)" },
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
  const captured=captureEnterpriseInput();
  const main = await vscode.window.showQuickPick(mainChoices, { title: "Archi Agent", placeHolder: "Choose a function" });
  if (!main) return;
  const command = { "update-enterprise":commandIds.updateEnterpriseCatalog, enterprise:commandIds.buildEnterpriseCatalog, generate: commandIds.generateDiagram, verify:commandIds.verifyFlow, save: commandIds.saveDiagramAndReport,
    configuration: commandIds.configuration, knowledge: commandIds.knowledgeBrowser, build: commandIds.buildKnowledgePack, active: commandIds.buildKnowledgePackFromActiveFile, convert: commandIds.convertToMarkdown, help: commandIds.help }[main.id];
  if(main.id==="enterprise"||main.id==="update-enterprise")await vscode.commands.executeCommand(command,captured);
  else await vscode.commands.executeCommand(command);
}
