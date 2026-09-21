/**
 * Public entry point of the Archi Agent application runtime.
 *
 * Hosts (the VS Code extension today, other front ends later) import only this module. It is also
 * the entry point of the packaged runtime bundle, so everything a host needs at run time is
 * reachable from here without knowing the core layout.
 */

export { createArchiAgentRuntime, deriveDiagramName, runtimeLimits } from "./archi-agent-runtime.js";
export type { ArchiAgentRuntimeOptions, GeneratorFactory } from "./archi-agent-runtime.js";
export type {
  AmbiguityChoice,
  AmbiguityChoiceCandidate,
  ArchiAgentRuntime,
  CancellationSignal,
  FlowLanguage,
  FlowSource,
  GenerateSequenceDiagramFailure,
  GenerateSequenceDiagramRequest,
  GenerateSequenceDiagramResult,
  GenerateSequenceDiagramSuccess,
  GenerationSummary,
  GeneratorConfig,
  LegacyLocalGeneratorConfig,
  KnowledgePackSourceConfig,
  ListLocalModelsOptions,
  ListLocalModelsResult,
  LocalModelEndpointConfig,
  ProviderGeneratorConfig,
  ProviderCredential,
  ProviderModelSelection,
  RemoteProviderGeneratorConfig,
  RuntimeFailureStage,
  RuntimeIssue,
  RuntimeIssueDetailValue,
  RuntimeIssueSeverity
} from "./runtime-types.js";
export type { ProviderCapabilities, ProviderProfile } from "../core/llm/provider-profile.js";
export { apiKeyLimits, validateApiKey } from "../core/llm/api-key.js";
export type { ApiKeyValidationCode, ApiKeyValidationResult } from "../core/llm/api-key.js";
export { ProviderRegistry, ProviderRegistryError, providerRegistryErrorCodes } from "../core/llm/provider-registry.js";
export type { ProviderRegistryErrorCode } from "../core/llm/provider-registry.js";
export { defaultLocalModelBaseUrl, parseLoopbackEndpoint } from "../node/llm/loopback-endpoint.js";
export type { LoopbackEndpointCode } from "../node/llm/loopback-endpoint.js";
export {
  defaultBaseUrlForLocalProfile,
  localLmStudioProfileId,
  localOllamaProfileId,
  localProviderDefaultBaseUrls,
  localProviderProfiles
} from "../node/llm/local-provider-profiles.js";
export {
  anthropicRemoteProfileId,
  openAiRemoteProfileId,
  openRouterRemoteProfileId,
  remoteProviderProfiles
} from "../node/llm/remote-provider-profiles.js";
export { isSafeModelId } from "../core/pipeline/sequence-model-generator.js";
