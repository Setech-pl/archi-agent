import type { ProviderProfile } from "../../core/llm/provider-profile.js";

export const anthropicRemoteProfileId = "cloud-anthropic";
export const openAiRemoteProfileId = "cloud-openai";
export const openRouterRemoteProfileId = "cloud-openrouter";

export const remoteProviderProfiles: readonly ProviderProfile[] = Object.freeze([
  Object.freeze({
    profileId: anthropicRemoteProfileId,
    providerKind: "anthropic-remote",
    displayName: "Anthropic",
    credentialRequirement: "api-key" as const,
    capabilities: Object.freeze({ modelListing: true, structuredChat: true })
  }),
  Object.freeze({
    profileId: openAiRemoteProfileId,
    providerKind: "openai-remote",
    displayName: "OpenAI",
    credentialRequirement: "api-key" as const,
    capabilities: Object.freeze({ modelListing: true, structuredChat: true })
  }),
  Object.freeze({
    profileId: openRouterRemoteProfileId,
    providerKind: "openrouter-remote",
    displayName: "OpenRouter",
    credentialRequirement: "api-key" as const,
    capabilities: Object.freeze({ modelListing: true, structuredChat: true })
  })
]);
