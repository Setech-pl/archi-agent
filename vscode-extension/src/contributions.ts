/**
 * Identifiers shared between the extension manifest (package.json) and the code. A test checks
 * that the manifest contributes exactly these commands and settings.
 */

export const commandIds = Object.freeze({
  saveDiagramAndReport: "archiAgent.saveDiagramAndReport",
  buildKnowledgePack: "archiAgent.buildKnowledgePack",
  open: "archiAgent.open",
  configuration: "archiAgent.configuration",
  help: "archiAgent.help",
  convertToMarkdown: "archiAgent.convertToMarkdown",
  configureKnowledgePack: "archiAgent.configureKnowledgePack",
  generateDiagram: "archiAgent.generateDiagram",
  generateSequenceDiagram: "archiAgent.generateSequenceDiagram",
  selectProviderProfile: "archiAgent.selectProviderProfile",
  selectModel: "archiAgent.selectModel",
  checkProviderConfiguration: "archiAgent.checkProviderConfiguration",
  setApiKey: "archiAgent.setApiKey",
  deleteApiKey: "archiAgent.deleteApiKey"
});

/** Hidden compatibility aliases for command IDs shipped by P1. */
export const legacyCommandIds = Object.freeze({
  selectLocalProviderProfile: "archiAgent.selectLocalProviderProfile",
  selectLocalModel: "archiAgent.selectLocalModel"
});

export const settingsSection = "archiAgent";

/** Setting keys relative to the archiAgent section. */
export const settingKeys = Object.freeze({
  knowledgePackPath: "knowledgePackPath",
  localModelBaseUrl: "localModel.baseUrl",
  localModelId: "localModel.model",
  localModelProfile: "localModel.profile",
  localModelSelectedModel: "localModel.selectedModel",
  localModelSelectedModelProfile: "localModel.selectedModelProfile",
  localModelTimeoutSeconds: "localModel.timeoutSeconds",
  diagnosticsVerbose: "diagnostics.verbose",
  defaultAuthor: "defaultAuthor"
});

export const outputChannelName = "Archi Agent";
