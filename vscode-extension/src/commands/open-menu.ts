import * as vscode from "vscode";
import { commandIds, settingKeys, settingsSection } from "../contributions.js";

type MainChoice = "generate" | "configuration" | "knowledge" | "convert";
type ConfigChoice = "provider" | "model" | "set-key" | "delete-key" | "pack" | "verbose" | "other" | "back";

interface Choice<T extends string> extends vscode.QuickPickItem { readonly id: T }

export const mainChoices: readonly Choice<MainChoice>[] = Object.freeze([
  { id: "generate", label: "Generate Diagram" },
  { id: "configuration", label: "Configuration" },
  { id: "knowledge", label: "Knowledge Management" },
  { id: "convert", label: "Convert to Markdown" }
]);

export const configurationChoices: readonly Choice<ConfigChoice>[] = Object.freeze([
  { id: "provider", label: "Select Provider Profile" },
  { id: "model", label: "Select Model" },
  { id: "set-key", label: "Set/Update API Key" },
  { id: "delete-key", label: "Delete API Key" },
  { id: "pack", label: "Configure Knowledge Pack Path" },
  { id: "verbose", label: "Verbose Diagnostics" },
  { id: "other", label: "Other Archi Agent Settings" },
  { id: "back", label: "$(arrow-left) Back" }
]);

export const knowledgeChoices: readonly Choice<"pack" | "back">[] = Object.freeze([
  { id: "pack", label: "Configure Knowledge Pack Path" },
  { id: "back", label: "$(arrow-left) Back" }
]);

async function openSetting(key: string): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", `${settingsSection}.${key}`);
}

/** The Command Palette entry. Only selected leaves perform an operation. */
export async function openArchiAgentMenu(): Promise<void> {
  while (true) {
    const main = await vscode.window.showQuickPick(mainChoices, { title: "Archi Agent", placeHolder: "Choose a function" });
    if (!main) return;
    if (main.id === "generate") return void (await vscode.commands.executeCommand(commandIds.generateDiagram));
    if (main.id === "convert") return void (await vscode.commands.executeCommand(commandIds.convertToMarkdown));

    if (main.id === "knowledge") {
      const selected = await vscode.window.showQuickPick(knowledgeChoices, { title: "Archi Agent: Knowledge Management" });
      if (!selected) return;
      if (selected.id === "back") continue;
      return void (await openSetting(settingKeys.knowledgePackPath));
    }

    const selected = await vscode.window.showQuickPick(configurationChoices, { title: "Archi Agent: Configuration" });
    if (!selected) return;
    if (selected.id === "back") continue;
    const command = {
      provider: commandIds.selectProviderProfile,
      model: commandIds.selectModel,
      "set-key": commandIds.setApiKey,
      "delete-key": commandIds.deleteApiKey
    } as const;
    if (selected.id in command) {
      return void (await vscode.commands.executeCommand(command[selected.id as keyof typeof command]));
    }
    if (selected.id === "pack") return void (await openSetting(settingKeys.knowledgePackPath));
    if (selected.id === "verbose") return void (await openSetting(settingKeys.diagnosticsVerbose));
    return void (await vscode.commands.executeCommand("workbench.action.openSettings", settingsSection));
  }
}
