export { inspectArchitectureSource, validStructurizrConfiguration } from "./architecture-source.js";
/**
 * Public entry point of the Archi Agent application runtime.
 *
 * Hosts (the VS Code extension today, other front ends later) import only this module. It is also
 * the entry point of the packaged runtime bundle, so everything a host needs at run time is
 * reachable from here without knowing the core layout.
 */

export { createArchiAgentRuntime, deriveDiagramName, runtimeLimits } from "./archi-agent-runtime.js";
export { createKnowledgeSnapshot, knowledgeSnapshotFromPack } from "../core/knowledge-pack/knowledge-snapshot.js";
export type { KnowledgeSnapshot, KnowledgeSource, KnowledgeContribution, KnowledgeRecord, KnowledgeFact,
  KnowledgeProvenance, KnowledgeGap, KnowledgeConflict } from "../core/knowledge-pack/knowledge-snapshot.js";
export { convertDocument } from "./convert-document.js";
export { createStarterKnowledgePack, cleanupStarterKnowledgePack, validateKnowledgePackDirectory, inspectKnowledgePackDirectory, defaultKnowledgePackPath } from "./knowledge-pack-onboarding.js";
export { StarterPackCreateError } from "./knowledge-pack-onboarding.js";
export { LocalPathError } from "../node/local-file-path.js";
export type { StarterPackCreateCode } from "./knowledge-pack-onboarding.js";
export type { FirstSystem, StarterPackReceipt } from "./knowledge-pack-onboarding.js";
export { conversionLimits } from "../core/document-conversion/contract.js";
export type { ConvertDocumentOptions, PdfOcrMode } from "./convert-document.js";
export type { ConvertFormat, ConvertErrorCode, ConvertOutcome } from "../core/document-conversion/contract.js";
export type { ArchiAgentRuntimeOptions, GeneratorFactory } from "./archi-agent-runtime.js";
export type { DiagnosticSink } from "../core/pipeline/diagnostics.js";
export type {
  AmbiguityChoice,
  AmbiguityChoiceCandidate,
  ArchiAgentRuntime,
  CancellationSignal,
  FlowLanguage,
  FlowSource,
  DiagramType,
  GenerateDiagramRequest,
  GenerateDiagramOutcome,
  GenerateDiagramUnverified,
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
export { classifyProviderDiagnostic, providerDiagnosticCode } from "../core/llm/provider-diagnostic.js";
export type { ProviderDiagnostic, DiagnosticExecution, DiagnosticFinding, DiagnosticOperation } from "../core/llm/provider-diagnostic.js";
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
export { diagramTypes, isDiagramType, isSupportedDiagramType } from "../core/model/diagram-type.js";

export { documentCandidateLimits, documentCandidateJsonSchema, normalizeDocumentText } from "../core/knowledge-pack/builder/document-candidates.js";
export type { DocumentSource, DocumentSourceBundle, DocumentCandidateResult, VerifiedDocumentCandidate } from "../core/knowledge-pack/builder/document-candidates.js";
export type { DocumentInput, ExtractDocumentCandidatesRequest, ExtractDocumentCandidatesOutcome, DocumentExtractionOptions } from "./extract-document-candidates.js";
export { KnowledgePackReviewSession, PackReviewError, validateDocumentSelection } from "./knowledge-pack-review.js";
export type { PackReviewState, PackPreview } from "./knowledge-pack-review.js";
export type { CandidateDecision, KnowledgePackDraft, KnowledgePackCandidate } from "../core/knowledge-pack/builder/knowledge-pack-candidate.js";

export { planDiagramBundle, saveDiagramBundle, isCompletedDiagramArtifact, serializeArtifactConfiguration } from "./diagram-artifact.js";
export type { DiagramArtifact, DiagramBundlePlan } from "./diagram-artifact.js";

export type { KnowledgePack, SourceLocation } from "../core/knowledge-pack/knowledge-pack.schema.js";
export { FlowVerificationSession } from "./verify-flow.js";
export {inspectC4Source} from "./architecture-source.js";
export type { VerifyFlowRequest, VerifyFlowOutcome, VerifyFlowStart, AliasSavePlan, AliasSavePlanOutcome } from "./verify-flow.js";
export type { NameDecision, VerifyFlowReport } from "../core/verification/compare-flow.js";

export { createLocalReadPolicy, assertLocalReadPath } from "../node/local-read-policy.js";
export type { LocalReadPolicy } from "../node/local-read-policy.js";
export { readLocalTextInput, parseLocalJson } from "./local-text-input.js";
export { inspectKnowledgeForHost } from "./architecture-source.js";
export { serializeFlowVerificationForHost, portableVerificationOutcome, portableDiagramOutcome, validateHostResult,
  hostResultSchema, portableVerificationSchema, portableVerificationOutcomeSchema, portableDiagramOutcomeSchema,
  inspectionOutcomeSchema, nameDecisionSchema, digestSchema, HostResultError } from "./host-results.js";
export type { PortableVerificationV1, HostResultV1 } from "./host-results.js";
export { resolveLocalReadReference } from "./local-text-input.js";

export { getDocumentConversionCapabilities } from "./document-conversion-capabilities.js";
export { inspectEnterpriseSource, generateCapabilityMap } from "./capability-map.js";
export type { EnterpriseSourceConfig } from "./enterprise-source.js";
export type {CapabilityMapView} from "./capability-map.js";
export type {EnterpriseCatalog,EnterpriseEvidence} from "../core/enterprise/enterprise-catalog.js";
export {createEnterpriseResponse,validateEnterpriseResponse,enterpriseResponseSchema,enterpriseInputSchema,enterpriseOutputSchema,enterpriseStateSchema,enterpriseTool,enterpriseTransferLimits} from "../core/enterprise/enterprise-transfer.js";
export type {EnterpriseResponseV1} from "../core/enterprise/enterprise-transfer.js";
export {capabilityMapSelectionSchema} from "../core/enterprise/capability-map.js";
export type { CapabilityMapSelection } from "../core/enterprise/capability-map.js";
export type { EnterpriseSnapshot } from "../core/enterprise/enterprise-catalog.js";
export type { DocumentConversionCapabilities } from "./document-conversion-capabilities.js";

export {mcpKnowledgeServerSchema}from"../node/mcp-knowledge-source.js";
export type {McpKnowledgeServerConfig}from"../node/mcp-knowledge-source.js";
export {createKnowledgeResponse,validateKnowledgeResponse,knowledgeResponseSchema,knowledgeFromContributions,contributionsVersion}from"../core/knowledge-pack/knowledge-transfer.js";
export type{KnowledgeResponseV1}from"../core/knowledge-pack/knowledge-transfer.js";
