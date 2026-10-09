import { ConfigurationWorkbench } from "./workbench/configuration.js";
import { OpenDiagramResults, saveDiagramAndReportCommand } from "./commands/save-diagram-and-report.js";
import { buildKnowledgePackCommand } from "./commands/build-knowledge-pack.js";
import * as vscode from "vscode";
import { generateDiagramCommand } from "./commands/generate-sequence-diagram.js";
import { removeApiKey, setApiKey } from "./commands/api-key-management.js";
import { checkProviderConfiguration } from "./commands/check-provider-configuration.js";
import { commandIds, legacyCommandIds, outputChannelName } from "./contributions.js";
import { openArchiAgentMenu } from "./commands/open-menu.js";
import { convertToMarkdownCommand } from "./commands/convert-to-markdown.js";
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
  const runtime = createPackagedRuntime(context.extension?.packageJSON.version);
  const results = new OpenDiagramResults();
  const configuration = new ConfigurationWorkbench(runtime, output, context.secrets);
  context.subscriptions.push(configuration);
  if (vscode.workspace.onDidCloseTextDocument) context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((doc) => results.close(doc)));

  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.commands.registerCommand(commandIds.configuration, () => configuration.open()),
    vscode.commands.registerCommand(commandIds.help, () => vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.joinPath(context.extensionUri, "readme.md"))),
    vscode.commands.registerCommand(commandIds.saveDiagramAndReport, () => saveDiagramAndReportCommand(results).catch(() => {
      void vscode.window.showErrorMessage("Archi Agent: diagram and report save could not be completed. Retry Save Diagram and Report.");
    })),
    vscode.commands.registerCommand(commandIds.buildKnowledgePack, () => buildKnowledgePackCommand({ runtime, output, secrets: context.secrets })),
    vscode.commands.registerCommand(commandIds.open, () => openArchiAgentMenu().catch(() => {
      void vscode.window.showErrorMessage("Archi Agent: navigation could not be opened.");
    })),
    vscode.commands.registerCommand(commandIds.convertToMarkdown, () => convertToMarkdownCommand().catch(() => {
      void vscode.window.showErrorMessage("Archi Agent: conversion could not be completed.");
    })),
    vscode.commands.registerCommand(commandIds.configureKnowledgePack, () => configuration.open("knowledge")),
    vscode.commands.registerCommand(commandIds.generateDiagram, () =>
      generateDiagramCommand({ runtime, output, results, secrets: context.secrets }).catch((error: unknown) => {
        output.appendLine(`The generate command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    vscode.commands.registerCommand(commandIds.generateSequenceDiagram, () =>
      generateDiagramCommand({ runtime, output, results, secrets: context.secrets }).catch((error: unknown) => {
        output.appendLine(`The generate command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    vscode.commands.registerCommand(commandIds.selectProviderProfile, () => configuration.open("provider")),
    vscode.commands.registerCommand(commandIds.selectModel, () => configuration.open("provider")),
    vscode.commands.registerCommand(commandIds.checkProviderConfiguration, () =>
      checkProviderConfiguration(runtime, output, context.secrets).catch(() => {
        output.appendLine("The provider configuration check failed unexpectedly.");
        void vscode.window.showErrorMessage("Archi Agent: the provider configuration check could not be completed.");
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
