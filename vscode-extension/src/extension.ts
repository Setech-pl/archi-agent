import * as vscode from "vscode";
import { generateDiagramCommand, generateSequenceDiagramCommand } from "./commands/generate-sequence-diagram.js";
import { removeApiKey, setApiKey } from "./commands/api-key-management.js";
import { selectModel, selectProviderProfile } from "./commands/local-provider-selection.js";
import { commandIds, legacyCommandIds, outputChannelName } from "./contributions.js";
import { createPackagedRuntime } from "./runtime/packaged-runtime-adapter.js";

/**
 * Extension entry point. The editor layer is deliberately thin: it creates the packaged runtime
 * once, registers the command and forwards to the command module. Unexpected errors are reported
 * by name only; the runtime reports every expected failure as a value.
 */

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown-error";
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(outputChannelName);
  const runtime = createPackagedRuntime();

  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.commands.registerCommand(commandIds.generateDiagram, () =>
      generateDiagramCommand({ runtime, output, secrets: context.secrets }).catch((error: unknown) => {
        output.appendLine(`The generate command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    vscode.commands.registerCommand(commandIds.generateSequenceDiagram, () =>
      generateSequenceDiagramCommand({ runtime, output, secrets: context.secrets }).catch((error: unknown) => {
        output.appendLine(`The generate command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    vscode.commands.registerCommand(commandIds.selectProviderProfile, () =>
      selectProviderProfile(runtime, output).catch((error: unknown) => {
        output.appendLine(`The provider profile command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    vscode.commands.registerCommand(commandIds.selectModel, () =>
      selectModel(runtime, output, context.secrets).catch((error: unknown) => {
        output.appendLine(`The model selection command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    vscode.commands.registerCommand(commandIds.setApiKey, () =>
      setApiKey(runtime, context.secrets, output).catch(() => {
        output.appendLine("The API key command failed unexpectedly (secret-storage-failed).");
        void vscode.window.showErrorMessage("Archi Agent: secure key storage is unavailable.");
      })
    ),
    vscode.commands.registerCommand(commandIds.deleteApiKey, () =>
      removeApiKey(runtime, context.secrets, output).catch(() => {
        output.appendLine("The API key deletion command failed unexpectedly (secret-storage-failed).");
        void vscode.window.showErrorMessage("Archi Agent: secure key storage is unavailable.");
      })
    ),
    vscode.commands.registerCommand(legacyCommandIds.selectLocalProviderProfile, () =>
      vscode.commands.executeCommand(commandIds.selectProviderProfile)
    ),
    vscode.commands.registerCommand(legacyCommandIds.selectLocalModel, () => vscode.commands.executeCommand(commandIds.selectModel))
  );
}

export function deactivate(): void {
  // Nothing to release: every disposable is owned by the extension context.
}
