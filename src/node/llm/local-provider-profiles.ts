import type { ProviderProfile } from "../../core/llm/provider-profile.js";
import { ProviderRegistry } from "../../core/llm/provider-registry.js";

export const localLmStudioProfileId = "local-lm-studio";
export const localOllamaProfileId = "local-ollama";

export const localProviderDefaultBaseUrls = Object.freeze({
  [localLmStudioProfileId]: "http://127.0.0.1:1234/v1",
  [localOllamaProfileId]: "http://127.0.0.1:11434/v1"
} as const);

export const localProviderProfiles: readonly ProviderProfile[] = Object.freeze([
  Object.freeze({
    profileId: localLmStudioProfileId,
    providerKind: "openai-compatible-local",
    displayName: "LM Studio",
    credentialRequirement: "none",
    capabilities: Object.freeze({ modelListing: true, structuredChat: true })
  }),
  Object.freeze({
    profileId: localOllamaProfileId,
    providerKind: "openai-compatible-local",
    displayName: "Ollama",
    credentialRequirement: "none",
    capabilities: Object.freeze({ modelListing: true, structuredChat: true })
  })
]);

export const localProviderRegistry = new ProviderRegistry(localProviderProfiles);

export function defaultBaseUrlForLocalProfile(profileId: string): string | undefined {
  return localProviderDefaultBaseUrls[profileId as keyof typeof localProviderDefaultBaseUrls];
}
