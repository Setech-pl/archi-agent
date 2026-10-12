import * as vscode from "vscode";
import { validateApiKey, type ArchiAgentRuntime, type ProviderProfile } from "../../../src/runtime/index.js";
import { settingKeys, settingsSection } from "../contributions.js";
import { deleteApiKey, readApiKey, storeApiKey } from "../api-key-storage.js";

function currentProfile(runtime: ArchiAgentRuntime, explicitProfileId?: string): ProviderProfile | undefined {
  const configured = vscode.workspace.getConfiguration(settingsSection).inspect(settingKeys.localModelProfile)?.globalValue;
  const profileId = explicitProfileId ?? (typeof configured === "string" ? configured : "local-lm-studio");
  return runtime.listProviderProfiles().find((profile) => profile.profileId === profileId);
}

export async function setApiKey(runtime: ArchiAgentRuntime, secrets: vscode.SecretStorage, output: vscode.OutputChannel, explicitProfileId?: string): Promise<void> {
  const profile = currentProfile(runtime, explicitProfileId);
  if (profile === undefined) {
    void vscode.window.showErrorMessage("Archi Agent: the selected provider profile is not registered.");
    return;
  }
  if (profile.credentialRequirement === "none") {
    void vscode.window.showInformationMessage(`Archi Agent: ${profile.displayName} does not use an API key.`);
    return;
  }
  const value = await vscode.window.showInputBox({
    title: `Archi Agent: set API key for ${profile.displayName}`,
    prompt: "The key is stored only in VS Code SecretStorage. It is never displayed after saving.",
    password: true,
    ignoreFocusOut: true,
    validateInput: (candidate) => {
      const validation = validateApiKey(candidate);
      return validation.ok
        ? undefined
        : validation.code === "credential-required"
          ? "Enter a non-empty API key."
          : "Use 1–1024 characters without edge whitespace or control characters.";
    }
  });
  if (value === undefined) return;
  if (!validateApiKey(value).ok) {
    void vscode.window.showErrorMessage("Archi Agent: the API key is invalid and was not saved.");
    return;
  }
  try {
    await storeApiKey(secrets, profile, value);
    void vscode.window.showInformationMessage(`Archi Agent: an API key is saved for ${profile.displayName}.`);
  } catch {
    output.appendLine("The API key could not be stored (secret-storage-write-failed).");
    void vscode.window.showErrorMessage("Archi Agent: the API key could not be stored securely.");
  }
}

export async function removeApiKey(runtime: ArchiAgentRuntime, secrets: vscode.SecretStorage, output: vscode.OutputChannel, explicitProfileId?: string): Promise<void> {
  const profile = currentProfile(runtime, explicitProfileId);
  if (profile === undefined) {
    void vscode.window.showErrorMessage("Archi Agent: the selected provider profile is not registered.");
    return;
  }
  if (profile.credentialRequirement === "none") {
    void vscode.window.showInformationMessage(`Archi Agent: ${profile.displayName} does not use an API key.`);
    return;
  }
  let saved: string | undefined;
  try {
    saved = await readApiKey(secrets, profile);
  } catch {
    output.appendLine("The API key could not be read (secret-storage-read-failed).");
    void vscode.window.showErrorMessage("Archi Agent: secure key storage could not be read.");
    return;
  }
  if (saved === undefined) {
    void vscode.window.showInformationMessage(`Archi Agent: no API key is saved for ${profile.displayName}.`);
    return;
  }
  const confirmation = await vscode.window.showWarningMessage(
    `Archi Agent: delete the saved API key for ${profile.displayName}?`,
    { modal: true },
    "Delete API Key"
  );
  if (confirmation !== "Delete API Key") return;
  try {
    await deleteApiKey(secrets, profile);
    void vscode.window.showInformationMessage(`Archi Agent: the saved API key for ${profile.displayName} was deleted.`);
  } catch {
    output.appendLine("The API key could not be deleted (secret-storage-delete-failed).");
    void vscode.window.showErrorMessage("Archi Agent: the API key could not be deleted from secure storage.");
  }
}
