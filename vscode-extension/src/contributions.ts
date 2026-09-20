/**
 * Identifiers shared between the extension manifest (package.json) and the code. A test checks
 * that the manifest contributes exactly these commands and settings.
 */

export const commandIds = Object.freeze({
  generateSequenceDiagram: "archiAgent.generateSequenceDiagram",
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
  defaultAuthor: "defaultAuthor"
});

export const outputChannelName = "Archi Agent";
