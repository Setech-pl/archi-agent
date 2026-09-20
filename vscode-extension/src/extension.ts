import * as vscode from "vscode";
import { generateSequenceDiagramCommand } from "./commands/generate-sequence-diagram.js";
import { selectLocalModel, selectLocalProviderProfile } from "./commands/local-provider-selection.js";
import { commandIds, outputChannelName } from "./contributions.js";
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
    vscode.commands.registerCommand(commandIds.generateSequenceDiagram, () =>
      generateSequenceDiagramCommand({ runtime, output }).catch((error: unknown) => {
        output.appendLine(`The generate command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    vscode.commands.registerCommand(commandIds.selectLocalProviderProfile, () =>
      selectLocalProviderProfile(runtime, output).catch((error: unknown) => {
        output.appendLine(`The provider profile command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    vscode.commands.registerCommand(commandIds.selectLocalModel, () =>
      selectLocalModel(runtime, output).catch((error: unknown) => {
        output.appendLine(`The model selection command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    )
  );
}

export function deactivate(): void {
  // Nothing to release: every disposable is owned by the extension context.
}
