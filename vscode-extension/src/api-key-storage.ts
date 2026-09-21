import type * as vscode from "vscode";
import {
  anthropicRemoteProfileId,
  openAiRemoteProfileId,
  openRouterRemoteProfileId,
  validateApiKey,
  type ProviderProfile
} from "../../src/runtime/index.js";

const secretIds = Object.freeze({
  [anthropicRemoteProfileId]: "archiAgent.cloudProvider.anthropic.apiKey",
  [openAiRemoteProfileId]: "archiAgent.cloudProvider.openai.apiKey",
  [openRouterRemoteProfileId]: "archiAgent.cloudProvider.openrouter.apiKey"
});

export function secretIdForProfile(profileId: string): string | undefined {
  return secretIds[profileId as keyof typeof secretIds];
}

export async function readApiKey(secrets: vscode.SecretStorage, profile: ProviderProfile): Promise<string | undefined> {
  if (profile.credentialRequirement === "none") return undefined;
  const id = secretIdForProfile(profile.profileId);
  const value = id === undefined ? undefined : await secrets.get(id);
  const validation = validateApiKey(value);
  return validation.ok ? validation.value : undefined;
}

export async function storeApiKey(secrets: vscode.SecretStorage, profile: ProviderProfile, value: string): Promise<void> {
  const id = secretIdForProfile(profile.profileId);
  const validation = validateApiKey(value);
  if (profile.credentialRequirement !== "api-key" || id === undefined || !validation.ok) {
    throw new Error("invalid-api-key");
  }
  await secrets.store(id, validation.value);
}

export async function deleteApiKey(secrets: vscode.SecretStorage, profile: ProviderProfile): Promise<void> {
  const id = secretIdForProfile(profile.profileId);
  if (profile.credentialRequirement !== "api-key" || id === undefined) throw new Error("credential-not-supported");
  await secrets.delete(id);
}
