/**
 * Identifiers shared between the extension manifest (package.json) and the code. A test checks
 * that the manifest contributes exactly these commands and settings.
 */

export const commandIds = Object.freeze({
  generateSequenceDiagram: "archiAgent.generateSequenceDiagram"
});

export const settingsSection = "archiAgent";

/** Setting keys relative to the archiAgent section. */
export const settingKeys = Object.freeze({
  knowledgePackPath: "knowledgePackPath",
  localModelBaseUrl: "localModel.baseUrl",
  localModelId: "localModel.model",
  localModelTimeoutSeconds: "localModel.timeoutSeconds",
  defaultAuthor: "defaultAuthor"
});

export const outputChannelName = "Archi Agent";
