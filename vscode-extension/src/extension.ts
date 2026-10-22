import {updateEnterpriseCatalogCommand} from "./commands/update-enterprise-catalog.js";
import type { CapturedEnterpriseInput } from "./commands/enterprise-input.js";
import { buildEnterpriseCatalogCommand } from "./commands/build-enterprise-catalog.js";
import { profileConflict, assertProfileAvailable, showProfileConflict } from "./profile-availability.js";
import { getDocumentConversionCapabilities } from "../../src/runtime/index.js";
import { KnowledgeBrowser } from "./knowledge-browser.js";
import { verifyFlowCommand } from "./commands/verify-flow.js";
import { ConfigurationWorkbench } from "./workbench/configuration.js";
import { OpenDiagramResults, saveDiagramAndReportCommand } from "./commands/save-diagram-and-report.js";
import { buildKnowledgePackCommand, buildKnowledgePackFromActiveFileCommand } from "./commands/build-knowledge-pack.js";
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
  if(profileConflict()){showProfileConflict();return;}
  const registerAvailableCommand=(id:string,callback:(...args:any[])=>unknown)=>vscode.commands.registerCommand(id,(...args:any[])=>{
    if(profileConflict()){showProfileConflict();return;}
    assertProfileAvailable();return callback(...args);
  });
  const output = vscode.window.createOutputChannel(outputChannelName);
  const runtime = createPackagedRuntime(context.extension?.packageJSON.version);
  const results = new OpenDiagramResults();
  const browser = new KnowledgeBrowser();
  context.subscriptions.push(browser);
  const configuration = new ConfigurationWorkbench(runtime, output, context.secrets);
  context.subscriptions.push(configuration);
  if(vscode.extensions?.onDidChange)context.subscriptions.push(vscode.extensions.onDidChange(()=>{
    if(profileConflict()){configuration.dispose();browser.dispose();showProfileConflict();}
  }));
  void getDocumentConversionCapabilities().then(capabilities=>{
    if(capabilities.ocr==="installation-error")void vscode.window.showWarningMessage(`Archi Agent: installation error (${capabilities.code}). Reinstall ${capabilities.profile==="full"?"Full":"the extension"}; resources are never downloaded automatically.`);
  });
  if (vscode.workspace.onDidCloseTextDocument) context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((doc) => results.close(doc)));

  context.subscriptions.push(output);
  context.subscriptions.push(
    registerAvailableCommand(commandIds.updateEnterpriseCatalog,(captured?:CapturedEnterpriseInput)=>updateEnterpriseCatalogCommand({runtime,output,secrets:context.secrets,results},captured)),
    registerAvailableCommand(commandIds.buildEnterpriseCatalog, (captured?:CapturedEnterpriseInput) => buildEnterpriseCatalogCommand({runtime,output,secrets:context.secrets,results},captured)),
    registerAvailableCommand(commandIds.verifyFlow, () => verifyFlowCommand({runtime,output,secrets:context.secrets}).catch(()=>vscode.window.showErrorMessage("Archi Agent: verification failed. Check the source and input."))),
    registerAvailableCommand(commandIds.knowledgeBrowser, () => browser.reveal()),
    registerAvailableCommand(commandIds.buildKnowledgePackFromActiveFile, () => buildKnowledgePackFromActiveFileCommand({ runtime, output, secrets: context.secrets })),
    registerAvailableCommand(commandIds.configuration, () => configuration.open()),
    registerAvailableCommand(commandIds.help, () => vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.joinPath(context.extensionUri, /^pl(?:-|$)/iu.test(vscode.env.language) ? "README.pl.md" : "readme.md"))),
    registerAvailableCommand(commandIds.saveDiagramAndReport, () => saveDiagramAndReportCommand(results).catch(() => {
      void vscode.window.showErrorMessage("Archi Agent: diagram and report save could not be completed. Retry Save Diagram and Report.");
    })),
    registerAvailableCommand(commandIds.buildKnowledgePack, () => buildKnowledgePackCommand({ runtime, output, secrets: context.secrets })),
    registerAvailableCommand(commandIds.open, () => openArchiAgentMenu().catch(() => {
      void vscode.window.showErrorMessage("Archi Agent: navigation could not be opened.");
    })),
    registerAvailableCommand(commandIds.convertToMarkdown, () => convertToMarkdownCommand().catch(() => {
      void vscode.window.showErrorMessage("Archi Agent: conversion could not be completed.");
    })),
    registerAvailableCommand(commandIds.configureKnowledgePack, () => configuration.open("knowledge")),
    registerAvailableCommand(commandIds.generateDiagram, () =>
      generateDiagramCommand({ runtime, output, results, secrets: context.secrets }).catch((error: unknown) => {
        output.appendLine(`The generate command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    registerAvailableCommand(commandIds.generateSequenceDiagram, () =>
      generateDiagramCommand({ runtime, output, results, secrets: context.secrets }).catch((error: unknown) => {
        output.appendLine(`The generate command failed unexpectedly (${errorName(error)}).`);
        void vscode.window.showErrorMessage("Archi Agent: the command failed unexpectedly. See the Archi Agent output channel.");
      })
    ),
    registerAvailableCommand(commandIds.selectProviderProfile, () => configuration.open("provider")),
    registerAvailableCommand(commandIds.selectModel, () => configuration.open("provider")),
    registerAvailableCommand(commandIds.checkProviderConfiguration, () =>
      checkProviderConfiguration(runtime, output, context.secrets).catch(() => {
        output.appendLine("The provider configuration check failed unexpectedly.");
        void vscode.window.showErrorMessage("Archi Agent: the provider configuration check could not be completed.");
      })
    ),
    registerAvailableCommand(commandIds.setApiKey, () =>
      setApiKey(runtime, context.secrets, output).catch(() => {
        output.appendLine("The API key command failed unexpectedly (secret-storage-failed).");
        void vscode.window.showErrorMessage("Archi Agent: secure key storage is unavailable.");
      })
    ),
    registerAvailableCommand(commandIds.deleteApiKey, () =>
      removeApiKey(runtime, context.secrets, output).catch(() => {
        output.appendLine("The API key deletion command failed unexpectedly (secret-storage-failed).");
        void vscode.window.showErrorMessage("Archi Agent: secure key storage is unavailable.");
      })
    ),
    registerAvailableCommand(legacyCommandIds.selectLocalProviderProfile, () =>
      vscode.commands.executeCommand(commandIds.selectProviderProfile)
    ),
    registerAvailableCommand(legacyCommandIds.selectLocalModel, () => vscode.commands.executeCommand(commandIds.selectModel))
  );
}

export function deactivate(): void {
  // Nothing to release: every disposable is owned by the extension context.
}
