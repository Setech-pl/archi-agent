import path from "node:path";
import { parseFlowDocument, type FlowDocument } from "../core/grounding/grounded-context-builder.js";
import type { AmbiguityReport } from "../core/grounding/grounded-context.js";
import { loadKnowledgePack, type KnowledgePackLoadIssue } from "../core/knowledge-pack/knowledge-pack-loader.js";
import { validateRelativePath } from "../core/knowledge-pack/knowledge-pack-source.js";
import { KnowledgePackError, safeMessageFor } from "../core/knowledge-pack/source-errors.js";
import { containsControlCharacter, countUnicodeCharacters, knowledgePackLimits } from "../core/knowledge-pack/source-limits.js";
import { isFilenameSafeDiagramId } from "../core/output/naming.js";
import { baseNameFor } from "../core/output/output-planner.js";
import { generateSequenceDiagram } from "../core/pipeline/generate-sequence-diagram.js";
import { generateDiagram } from "../core/pipeline/generate-diagram.js";
import { isSupportedDiagramType } from "../core/model/diagram-type.js";
import type { PipelineOutcome } from "../core/pipeline/generation-outcome.js";
import { StructuredChatSequenceModelGenerator, isSafeModelId, type SequenceModelGenerator } from "../core/pipeline/sequence-model-generator.js";
import { structuredChatLimits } from "../core/llm/structured-chat-client.js";
import type { StructuredChatClient } from "../core/llm/structured-chat-client.js";
import { ProviderRegistry, ProviderRegistryError } from "../core/llm/provider-registry.js";
import type { ModelIssue } from "../core/validation/model-validator.js";
import type { ValidationIssue } from "../core/validation/validation-issue.js";
import { BoundedReadError, maxFlowFileBytes, readBoundedTextFile } from "../node/bounded-file-reader.js";
import { canonicalDirectory, LocalPathError } from "../node/local-file-path.js";
import { parseLoopbackEndpoint, type LoopbackEndpoint } from "../node/llm/loopback-endpoint.js";
import { defaultBaseUrlForLocalProfile, localProviderProfiles } from "../node/llm/local-provider-profiles.js";
import { OpenAiCompatibleLocalChatClient } from "../node/llm/openai-compatible-local-chat-client.js";
import {
  listLocalModels,
  LocalModelError,
  localTransportLimits,
  OpenAiCompatibleLocalGenerator
} from "../node/llm/openai-compatible-local-generator.js";
import { AnthropicRemoteChatClient, listAnthropicRemoteModels } from "../node/llm/anthropic-remote-chat-client.js";
import {
  listOpenAiCompatibleRemoteModels,
  OpenAiCompatibleRemoteChatClient
} from "../node/llm/openai-compatible-remote-chat-client.js";
import { RemoteProviderError, type RemoteJsonTransport } from "../node/llm/remote-json-transport.js";
import { remoteProviderProfiles } from "../node/llm/remote-provider-profiles.js";
import { NodeKnowledgePackSource } from "../node/node-knowledge-pack-source.js";
import type {
  AmbiguityChoice,
  ArchiAgentRuntime,
  CancellationSignal,
  FlowSource,
  GenerateDiagramRequest,
  GenerateSequenceDiagramFailure,
  GenerateSequenceDiagramRequest,
  GenerateSequenceDiagramResult,
  GeneratorConfig,
  KnowledgePackSourceConfig,
  ListLocalModelsOptions,
  ListLocalModelsResult,
  LocalModelEndpointConfig,
  ProviderModelSelection,
  RuntimeFailureStage,
  RuntimeIssue
} from "./runtime-types.js";

/**
 * Node implementation of the Archi Agent runtime.
 *
 * It resolves the request sources with the existing Node adapters (bounded reads, link-free path
 * resolution, the Node Knowledge Pack source), builds the generator from the configuration, runs
 * the unchanged core pipeline and maps its outcome to the public result contract. It reads nothing
 * relative to the working directory: every path in a request is absolute and every logical name in
 * a result is a bare file name. It writes nothing; the host decides what to do with the artifacts.
 */

const LF = String.fromCharCode(10);
const defaultFlowFileName = "flow.md";
const defaultPackDirectoryName = "knowledge-pack";
const defaultAuthor = "Archi Agent";
const maxDiagramIdChars = 64;

export const runtimeLimits = Object.freeze({
  maxFlowFileBytes,
  maxFlowSourceChars: knowledgePackLimits.maxFlowSourceChars,
  maxFrontMatterValueChars: knowledgePackLimits.maxFrontMatterValueChars,
  defaultTimeoutMs: localTransportLimits.defaultTimeoutMs,
  maxTimeoutMs: localTransportLimits.maxTimeoutMs
});

/** Test seam for local generation. Remote adapters are selected from the fixed provider registry. */
export type GeneratorFactory = (config: GeneratorConfig, endpoint: LoopbackEndpoint) => SequenceModelGenerator;

export interface ArchiAgentRuntimeOptions {
  readonly generatorFactory?: GeneratorFactory;
  /** Structured-chat seam for the D1 local path; remote adapters use remoteTransport. */
  readonly diagramClientFactory?: (config: GeneratorConfig, endpoint: LoopbackEndpoint) => StructuredChatClient;
  /** Test/application-composition seam; production uses the fixed local and cloud registry. */
  readonly providerRegistry?: ProviderRegistry;
  /** Resolves adapter-owned defaults for an injected registry; production uses local profile defaults. */
  readonly defaultBaseUrlForProfile?: (profileId: string) => string | undefined;
  /** Controlled transport seam for remote-provider tests; production uses Node HTTPS. */
  readonly remoteTransport?: RemoteJsonTransport;
}

type ChatClientResolution =
  | { readonly ok: true; readonly client: StructuredChatClient }
  | { readonly ok: false; readonly issues: readonly RuntimeIssue[] };

function resolveDiagramClient(
  config: GeneratorConfig,
  registry: ProviderRegistry,
  defaultBaseUrl: (profileId: string) => string | undefined,
  remoteTransport: RemoteJsonTransport | undefined,
  localFactory: (config: GeneratorConfig, endpoint: LoopbackEndpoint) => StructuredChatClient
): ChatClientResolution {
  let profile;
  if ("profileId" in config) {
    try { profile = registry.resolve(config.profileId); }
    catch { return { ok: false, issues: [issue("unknown-provider-profile", "The provider profile is not registered.")] }; }
    if (!profile.capabilities.structuredChat) return { ok: false, issues: [issue("provider-capability-unavailable", "The provider profile does not support structured chat.")] };
  }
  if (!isSafeModelId(config.modelId)) return { ok: false, issues: [issue("unsafe-model-id", "The model identifier is empty or unsafe.")] };
  try {
    if (config.kind === "remote-provider") {
      if (profile?.credentialRequirement !== "api-key" || config.credential?.type !== "api-key")
        return { ok: false, issues: [issue("credential-required", "An API key is required for the selected provider profile.")] };
      const common = { modelId: config.modelId, apiKey: config.credential.value,
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
        ...(remoteTransport === undefined ? {} : { transport: remoteTransport }) };
      const client = profile.providerKind === "anthropic-remote" ? new AnthropicRemoteChatClient(common)
        : profile.providerKind === "openai-remote" ? new OpenAiCompatibleRemoteChatClient({ ...common, provider: "openai" })
        : profile.providerKind === "openrouter-remote" ? new OpenAiCompatibleRemoteChatClient({ ...common, provider: "openrouter" }) : undefined;
      return client ? { ok: true, client } : { ok: false, issues: [issue("unknown-provider-profile", "The provider profile is not registered.")] };
    }
    const baseUrl = "profileId" in config ? config.baseUrl ?? defaultBaseUrl(config.profileId) : config.baseUrl;
    if (baseUrl === undefined) return { ok: false, issues: [issue("unknown-provider-profile", "The provider profile is not registered.")] };
    const endpoint = parseLoopbackEndpoint(baseUrl);
    if (!endpoint.ok) return { ok: false, issues: [issue(endpoint.code, endpointMessage)] };
    return { ok: true, client: localFactory(config, endpoint.endpoint) };
  } catch (error) {
    const code = error instanceof LocalModelError || error instanceof RemoteProviderError ? error.code : "generator-unavailable";
    return { ok: false, issues: [issue(code, "The generator could not be created from the configuration.")] };
  }
}

type FlowResolution =
  | { readonly ok: true; readonly flow: FlowDocument; readonly flowFile: string }
  | { readonly ok: false; readonly issues: readonly RuntimeIssue[] };

function issue(code: string, message: string, extra: Partial<RuntimeIssue> = {}): RuntimeIssue {
  return Object.freeze({ severity: "error", code, message, ...extra });
}

function fromValidationIssue(source: ValidationIssue): RuntimeIssue {
  const location = source.location;
  return Object.freeze({
    severity: source.severity,
    code: source.code,
    message: source.message,
    ...(location?.file === undefined ? {} : { file: location.file }),
    ...(location?.line === undefined ? {} : { line: location.line }),
    ...(location?.column === undefined ? {} : { column: location.column }),
    ...(source.details === undefined ? {} : { details: source.details })
  });
}

function fromModelIssue(source: ModelIssue): RuntimeIssue {
  return Object.freeze({
    severity: source.severity,
    code: source.code,
    message: source.message,
    ...(source.path === undefined ? {} : { path: source.path }),
    ...(source.details === undefined ? {} : { details: source.details })
  });
}

function fromLoadIssue(source: KnowledgePackLoadIssue): RuntimeIssue {
  return Object.freeze({
    severity: source.severity,
    code: source.code,
    message: source.message,
    ...(source.file === undefined ? {} : { file: source.file }),
    ...(source.line === undefined ? {} : { line: source.line }),
    ...(source.column === undefined ? {} : { column: source.column }),
    ...(source.limit === undefined ? {} : { details: { limit: source.limit } })
  });
}

function fromKnowledgePackError(error: KnowledgePackError): RuntimeIssue {
  return issue(error.code, safeMessageFor(error.code), {
    ...(error.file === undefined ? {} : { file: error.file }),
    ...(error.line === undefined ? {} : { line: error.line }),
    ...(error.column === undefined ? {} : { column: error.column }),
    ...(error.limit === undefined ? {} : { details: { limit: error.limit } })
  });
}

function failure(
  stage: RuntimeFailureStage,
  issues: readonly RuntimeIssue[],
  ambiguities: readonly AmbiguityChoice[] = [],
  unconfirmedNewParticipants: readonly string[] = []
): GenerateSequenceDiagramFailure {
  return Object.freeze({
    status: "failed",
    stage,
    issues: Object.freeze([...issues]),
    ambiguities: Object.freeze([...ambiguities]),
    unconfirmedNewParticipants: Object.freeze([...unconfirmedNewParticipants])
  });
}

/** A bare file or directory name usable as a logical name in issue locations and the report. */
function logicalName(candidate: string | undefined, fallback: string): string {
  if (candidate === undefined || candidate.length > knowledgePackLimits.maxRelativePathChars) {
    return fallback;
  }

  const trimmed = candidate.trim();
  return trimmed !== "" && !trimmed.includes("/") && validateRelativePath(trimmed).ok && !containsControlCharacter(trimmed) ? trimmed : fallback;
}

/** Derives a filename-safe diagram identifier from a flow name; never throws. */
export function deriveDiagramName(flowName: string): string {
  const slug = flowName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxDiagramIdChars)
    .replace(/-+$/g, "");

  return isFilenameSafeDiagramId(slug) ? slug : "flow";
}

function invalidField(value: string): boolean {
  return (
    value.trim() === "" ||
    containsControlCharacter(value) ||
    value.includes(LF) ||
    countUnicodeCharacters(value) > knowledgePackLimits.maxFrontMatterValueChars
  );
}

function composeFlowDocument(source: Extract<FlowSource, { kind: "description" }>): FlowResolution {
  const author = source.author ?? defaultAuthor;
  const diagramName = source.diagramName ?? deriveDiagramName(source.flowName);
  const language = source.language ?? "en";
  const issues: RuntimeIssue[] = [];

  if (invalidField(source.flowName)) {
    issues.push(issue("flow-name-invalid", "The flow name is empty, too long or contains a control character.", { file: defaultFlowFileName }));
  }

  if (invalidField(author)) {
    issues.push(issue("flow-author-invalid", "The author is empty, too long or contains a control character.", { file: defaultFlowFileName }));
  }

  if (!isFilenameSafeDiagramId(diagramName)) {
    issues.push(issue("diagram-name-invalid", "The diagram name is not a filename-safe identifier.", { file: defaultFlowFileName }));
  }

  if (source.description.trim() === "" || containsControlCharacter(source.description.split(LF).join(" "))) {
    issues.push(issue("flow-description-invalid", "The flow description is empty or contains a control character.", { file: defaultFlowFileName }));
  }

  if (issues.length > 0) {
    return Object.freeze({ ok: false, issues });
  }

  const text = [
    "---",
    `diagram_name: ${diagramName}`,
    `flow_name: ${source.flowName.trim()}`,
    `author: ${author.trim()}`,
    `language: ${language}`,
    "---",
    source.description.trim(),
    ""
  ].join(LF);

  return parsedFlow(text, defaultFlowFileName);
}

function parsedFlow(text: string, flowFile: string): FlowResolution {
  const parsed = parseFlowDocument(text, { file: flowFile });

  if (!parsed.ok) {
    return Object.freeze({ ok: false, issues: parsed.issues.map(fromValidationIssue) });
  }

  return Object.freeze({ ok: true, flow: parsed.flow, flowFile });
}

async function readFlowFile(absolutePath: string): Promise<FlowResolution> {
  const fileName = logicalName(path.basename(absolutePath), "");

  if (!path.isAbsolute(absolutePath) || fileName === "") {
    return Object.freeze({ ok: false, issues: [issue("invalid-path", "The flow file must be named by an absolute path.")] });
  }

  try {
    const root = await canonicalDirectory(path.dirname(absolutePath));
    const file = await readBoundedTextFile(root, fileName, { maxBytes: maxFlowFileBytes });
    return parsedFlow(file.text, fileName);
  } catch (error) {
    const code = error instanceof BoundedReadError || error instanceof LocalPathError ? error.code : "read-failed";
    return Object.freeze({ ok: false, issues: [issue(code, "The flow file could not be read.", { file: fileName })] });
  }
}

async function resolveFlow(source: FlowSource): Promise<FlowResolution> {
  switch (source.kind) {
    case "document":
      return parsedFlow(source.text, logicalName(source.fileName, defaultFlowFileName));
    case "file":
      return readFlowFile(source.path);
    case "description":
      return composeFlowDocument(source);
  }
}

type PackResolution =
  | { readonly ok: true; readonly knowledgePack: Parameters<typeof generateSequenceDiagram>[0]["knowledgePack"]; readonly directoryName: string }
  | { readonly ok: false; readonly issues: readonly RuntimeIssue[] };

async function resolveKnowledgePack(config: KnowledgePackSourceConfig, signal: CancellationSignal | undefined): Promise<PackResolution> {
  const directoryName = path.basename(config.path);

  if (!path.isAbsolute(config.path) || directoryName === "" || !validateRelativePath(directoryName).ok) {
    return Object.freeze({
      ok: false,
      issues: [issue("invalid-path", "The Knowledge Pack must be named by the absolute path of its directory.")]
    });
  }

  let source: NodeKnowledgePackSource;

  try {
    source = await NodeKnowledgePackSource.open(path.dirname(config.path), directoryName);
  } catch (error) {
    return Object.freeze({
      ok: false,
      issues: [error instanceof KnowledgePackError ? fromKnowledgePackError(error) : issue("invalid-path", "The Knowledge Pack directory could not be opened.")]
    });
  }

  let loaded;

  try {
    loaded = await loadKnowledgePack(source, signal === undefined ? {} : { signal });
  } catch (error) {
    return Object.freeze({
      ok: false,
      issues: [error instanceof KnowledgePackError ? fromKnowledgePackError(error) : issue("read-failed", "A pack file could not be read.")]
    });
  }

  if (!loaded.ok) {
    return Object.freeze({ ok: false, issues: loaded.issues.map(fromLoadIssue) });
  }

  return Object.freeze({
    ok: true,
    knowledgePack: { pack: loaded.pack, indexes: loaded.indexes },
    directoryName: logicalName(directoryName, defaultPackDirectoryName)
  });
}

type GeneratorResolution =
  | { readonly ok: true; readonly generator: SequenceModelGenerator }
  | { readonly ok: false; readonly issues: readonly RuntimeIssue[] };

const endpointMessage = "The local model base URL was rejected; only literal loopback URLs such as http://127.0.0.1:1234/v1 are accepted.";

function resolveGenerator(
  config: GeneratorConfig,
  factory: GeneratorFactory,
  registry: ProviderRegistry,
  defaultBaseUrl: (profileId: string) => string | undefined,
  remoteTransport: RemoteJsonTransport | undefined
): GeneratorResolution {
  if (config.kind === "remote-provider") {
    let profile;
    try {
      profile = registry.resolve(config.profileId);
    } catch (error) {
      const code = error instanceof ProviderRegistryError ? error.code : "unknown-provider-profile";
      return Object.freeze({ ok: false, issues: [issue(code, "The provider profile is not registered.")] });
    }
    if (!profile.capabilities.structuredChat) {
      return Object.freeze({ ok: false, issues: [issue("provider-capability-unavailable", "The provider profile does not support structured chat.")] });
    }
    if (profile.credentialRequirement !== "api-key" || config.credential?.type !== "api-key") {
      return Object.freeze({ ok: false, issues: [issue("credential-required", "An API key is required for the selected provider profile.")] });
    }
    if (!isSafeModelId(config.modelId)) {
      return Object.freeze({ ok: false, issues: [issue("unsafe-model-id", "The model identifier is empty or not a safe model identifier.")] });
    }
    try {
      const common = {
        modelId: config.modelId,
        apiKey: config.credential.value,
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
        ...(remoteTransport === undefined ? {} : { transport: remoteTransport })
      };
      const client =
        profile.providerKind === "anthropic-remote"
          ? new AnthropicRemoteChatClient(common)
          : profile.providerKind === "openai-remote"
            ? new OpenAiCompatibleRemoteChatClient({ ...common, provider: "openai" })
            : profile.providerKind === "openrouter-remote"
              ? new OpenAiCompatibleRemoteChatClient({ ...common, provider: "openrouter" })
              : undefined;
      if (client === undefined) {
        return Object.freeze({ ok: false, issues: [issue("unknown-provider-profile", "The provider profile is not registered.")] });
      }
      return Object.freeze({
        ok: true,
        generator: new StructuredChatSequenceModelGenerator(client, structuredChatLimits.maxMaxTokens)
      });
    } catch (error) {
      const code = error instanceof RemoteProviderError ? error.code : "generator-unavailable";
      return Object.freeze({ ok: false, issues: [issue(code, "The generator could not be created from the configuration.")] });
    }
  }

  if (config.kind !== "openai-compatible-local") {
    return Object.freeze({ ok: false, issues: [issue("unsupported-generator", "The generator kind is not supported.")] });
  }

  let baseUrl: string;

  if ("profileId" in config) {
    let profile;

    try {
      profile = registry.resolve(config.profileId);
    } catch (error) {
      const code = error instanceof ProviderRegistryError ? error.code : "unknown-provider-profile";
      return Object.freeze({ ok: false, issues: [issue(code, "The provider profile is not registered.")] });
    }

    if (!profile.capabilities.structuredChat) {
      return Object.freeze({ ok: false, issues: [issue("provider-capability-unavailable", "The provider profile does not support structured chat.")] });
    }

    const profileDefault = defaultBaseUrl(profile.profileId);

    if (profileDefault === undefined) {
      return Object.freeze({ ok: false, issues: [issue("unknown-provider-profile", "The provider profile is not registered.")] });
    }

    baseUrl = config.baseUrl ?? profileDefault;
  } else {
    baseUrl = config.baseUrl;
  }

  const endpoint = parseLoopbackEndpoint(baseUrl);

  if (!endpoint.ok) {
    return Object.freeze({ ok: false, issues: [issue(endpoint.code, endpointMessage)] });
  }

  if (!isSafeModelId(config.modelId)) {
    return Object.freeze({ ok: false, issues: [issue("unsafe-model-id", "The model identifier is empty or not a safe model identifier.")] });
  }

  try {
    return Object.freeze({ ok: true, generator: factory(config, endpoint.endpoint) });
  } catch (error) {
    const code = error instanceof LocalModelError ? error.code : "generator-unavailable";
    return Object.freeze({ ok: false, issues: [issue(code, "The generator could not be created from the configuration.")] });
  }
}

function defaultGeneratorFactory(config: GeneratorConfig, endpoint: LoopbackEndpoint): SequenceModelGenerator {
  return new OpenAiCompatibleLocalGenerator({
    endpoint,
    modelId: config.modelId,
    ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs })
  });
}

function ambiguityChoices(report: AmbiguityReport): readonly AmbiguityChoice[] {
  return report.entries
    .filter((entry) => entry.selectedId === null)
    .map((entry) =>
      Object.freeze({
        mention: entry.mention,
        candidates: entry.candidates.map((candidate) =>
          Object.freeze({
            id: candidate.id,
            participantType: candidate.participantType,
            elementKind: candidate.elementKind,
            canonicalName: candidate.canonicalName,
            sourceFile: candidate.source.file,
            sourceLine: candidate.source.line
          })
        ),
        lines: Object.freeze([...new Set(entry.locations.map((location) => location.line))])
      })
    );
}

function unconfirmedNames(issues: readonly ValidationIssue[]): readonly string[] {
  const names = new Set<string>();

  for (const entry of issues) {
    const name = entry.code === "new-participant-unconfirmed" ? entry.details?.["newParticipant"] : undefined;

    if (typeof name === "string") {
      names.add(name);
    }
  }

  return [...names].sort();
}

function mapOutcome(outcome: PipelineOutcome): GenerateSequenceDiagramResult {
  switch (outcome.status) {
    case "success":
      return Object.freeze({
        status: "success",
        diagramName: outcome.diagramName,
        generatorType: outcome.generatorType,
        digest: outcome.digest.value,
        plantUml: outcome.diagram.content,
        diagramFileName: outcome.diagram.fileName,
        groundingReport: outcome.report.content,
        reportFileName: outcome.report.fileName,
        summary: outcome.summary,
        warnings: Object.freeze([...outcome.groundingWarnings.map(fromValidationIssue), ...outcome.warnings.map(fromModelIssue)])
      });
    case "grounding-blocked":
      return failure("grounding-blocked", outcome.issues.map(fromValidationIssue), ambiguityChoices(outcome.ambiguityReport), unconfirmedNames(outcome.issues));
    case "invalid-generator-output":
    case "semantic-validation-failed":
    case "render-validation-failed":
      return failure(outcome.status, outcome.issues.map(fromModelIssue));
  }
}

class NodeArchiAgentRuntime implements ArchiAgentRuntime {
  readonly #generatorFactory: GeneratorFactory;
  readonly #providerRegistry: ProviderRegistry;
  readonly #defaultBaseUrlForProfile: (profileId: string) => string | undefined;
  readonly #remoteTransport: RemoteJsonTransport | undefined;
  readonly #diagramClientFactory: (config: GeneratorConfig, endpoint: LoopbackEndpoint) => StructuredChatClient;

  public constructor(options: ArchiAgentRuntimeOptions) {
    this.#generatorFactory = options.generatorFactory ?? defaultGeneratorFactory;
    this.#providerRegistry = options.providerRegistry ?? new ProviderRegistry([...localProviderProfiles, ...remoteProviderProfiles]);
    this.#defaultBaseUrlForProfile = options.defaultBaseUrlForProfile ?? defaultBaseUrlForLocalProfile;
    this.#remoteTransport = options.remoteTransport;
    this.#diagramClientFactory = options.diagramClientFactory ?? ((config, endpoint) => new OpenAiCompatibleLocalChatClient({ endpoint, modelId: config.modelId, ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }) }));
  }

  public async generateDiagram(request: GenerateDiagramRequest): Promise<GenerateSequenceDiagramResult> {
    // This must precede flow-file, Knowledge Pack, credential and provider access.
    if (!isSupportedDiagramType(request.diagramType)) return failure("generator-configuration", [issue("diagram-type-unsupported", "The selected diagram type is not supported in this version.")]);
    const flow = await resolveFlow(request.flow);
    if (!flow.ok) return failure("flow", flow.issues);
    const pack = await resolveKnowledgePack(request.knowledgePack, request.signal);
    if (!pack.ok) return failure("knowledge-pack", pack.issues);
    const resolved = resolveDiagramClient(request.generator, this.#providerRegistry, this.#defaultBaseUrlForProfile, this.#remoteTransport, this.#diagramClientFactory);
    if (!resolved.ok) return failure("generator-configuration", resolved.issues);
    return mapOutcome(await generateDiagram({ diagramType: request.diagramType, flow: flow.flow, knowledgePack: pack.knowledgePack,
      client: resolved.client, artifactBaseName: baseNameFor(flow.flow.metadata.diagramName, 1),
      sources: { flowFile: flow.flowFile, knowledgePackDirectory: pack.directoryName },
      ...(request.selections === undefined ? {} : { selections: request.selections }),
      ...(request.confirmedNewParticipants === undefined ? {} : { confirmedNewParticipants: request.confirmedNewParticipants }),
      ...(request.signal === undefined ? {} : { signal: request.signal }) }));
  }

  public async generateSequenceDiagram(request: GenerateSequenceDiagramRequest): Promise<GenerateSequenceDiagramResult> {
    const flow = await resolveFlow(request.flow);

    if (!flow.ok) {
      return failure("flow", flow.issues);
    }

    const pack = await resolveKnowledgePack(request.knowledgePack, request.signal);

    if (!pack.ok) {
      return failure("knowledge-pack", pack.issues);
    }

    const generator = resolveGenerator(
      request.generator,
      this.#generatorFactory,
      this.#providerRegistry,
      this.#defaultBaseUrlForProfile,
      this.#remoteTransport
    );

    if (!generator.ok) {
      return failure("generator-configuration", generator.issues);
    }

    const outcome = await generateSequenceDiagram({
      flow: flow.flow,
      knowledgePack: pack.knowledgePack,
      generator: generator.generator,
      artifactBaseName: baseNameFor(flow.flow.metadata.diagramName, 1),
      sources: { flowFile: flow.flowFile, knowledgePackDirectory: pack.directoryName },
      ...(request.selections === undefined ? {} : { selections: request.selections }),
      ...(request.confirmedNewParticipants === undefined ? {} : { confirmedNewParticipants: request.confirmedNewParticipants }),
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });

    return mapOutcome(outcome);
  }

  public listProviderProfiles() {
    return this.#providerRegistry.list();
  }

  public async listProviderModels(selection: ProviderModelSelection, options: ListLocalModelsOptions = {}): Promise<ListLocalModelsResult> {
    let profile;

    try {
      profile = this.#providerRegistry.resolve(selection.profileId);
    } catch (error) {
      return Object.freeze({ ok: false, code: error instanceof ProviderRegistryError ? error.code : "unknown-provider-profile" });
    }

    if (!profile.capabilities.modelListing) {
      return Object.freeze({ ok: false, code: "provider-capability-unavailable" });
    }

    if (profile.credentialRequirement === "api-key") {
      if (selection.credential?.type !== "api-key") return Object.freeze({ ok: false, code: "credential-required" });
      try {
        const common = {
          apiKey: selection.credential.value,
          ...(selection.timeoutMs === undefined ? {} : { timeoutMs: selection.timeoutMs }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(this.#remoteTransport === undefined ? {} : { transport: this.#remoteTransport })
        };
        const models =
          profile.providerKind === "anthropic-remote"
            ? await listAnthropicRemoteModels(common)
            : profile.providerKind === "openai-remote"
              ? await listOpenAiCompatibleRemoteModels({ ...common, provider: "openai" })
              : profile.providerKind === "openrouter-remote"
                ? await listOpenAiCompatibleRemoteModels({ ...common, provider: "openrouter" })
                : undefined;
        return models === undefined
          ? Object.freeze({ ok: false, code: "unknown-provider-profile" })
          : Object.freeze({ ok: true, models });
      } catch (error) {
        return Object.freeze({ ok: false, code: error instanceof RemoteProviderError ? error.code : "connection-failed" });
      }
    }

    const baseUrl = selection.baseUrl ?? this.#defaultBaseUrlForProfile(profile.profileId);

    if (baseUrl === undefined) {
      return Object.freeze({ ok: false, code: "unknown-provider-profile" });
    }

    return this.listLocalModels(
      { baseUrl, ...(selection.timeoutMs === undefined ? {} : { timeoutMs: selection.timeoutMs }) },
      options
    );
  }

  public async listLocalModels(endpoint: LocalModelEndpointConfig, options: ListLocalModelsOptions = {}): Promise<ListLocalModelsResult> {
    const parsed = parseLoopbackEndpoint(endpoint.baseUrl);

    if (!parsed.ok) {
      return Object.freeze({ ok: false, code: parsed.code });
    }

    try {
      const models = await listLocalModels(parsed.endpoint, {
        ...(endpoint.timeoutMs === undefined ? {} : { timeoutMs: endpoint.timeoutMs }),
        ...(options.signal === undefined ? {} : { signal: options.signal })
      });
      return Object.freeze({ ok: true, models });
    } catch (error) {
      return Object.freeze({ ok: false, code: error instanceof LocalModelError ? error.code : "connection-failed" });
    }
  }
}

export function createArchiAgentRuntime(options: ArchiAgentRuntimeOptions = {}): ArchiAgentRuntime {
  return new NodeArchiAgentRuntime(options);
}
