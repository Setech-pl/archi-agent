import type { CancellationSignal } from "../core/knowledge-pack/knowledge-pack-source.js";
import type { GenerationSummary } from "../core/pipeline/generation-outcome.js";
import type { ProviderProfile } from "../core/llm/provider-profile.js";

/**
 * Public contract of the Archi Agent application runtime.
 *
 * The runtime is the boundary between an editor, a command line or another host and the core
 * pipeline. Requests describe *where* the inputs come from (a flow document, a Knowledge Pack
 * source, a generator configuration) and results carry the validated artifacts or safe issues.
 * Nothing here refers to an editor API, an HTTP client or a file-system implementation, so the
 * contract can later grow to other diagram profiles, other knowledge sources and other model
 * providers without changing the hosts that already use it.
 */

export type { CancellationSignal, GenerationSummary };

export type FlowLanguage = "en" | "pl";

/** Where the flow description comes from. */
export type FlowSource =
  /** A complete flow document (front matter and body) already held in memory, for example an editor buffer. */
  | {
      readonly kind: "document";
      readonly text: string;
      /** Logical file name used in issue locations and the grounding report; never a machine path. */
      readonly fileName?: string;
    }
  /** A complete flow document on the local file system, named by an absolute path. */
  | { readonly kind: "file"; readonly path: string }
  /** A plain description; the runtime composes the restricted front matter around it. */
  | {
      readonly kind: "description";
      readonly flowName: string;
      readonly description: string;
      /** Filename-safe diagram identifier; derived from the flow name when absent. */
      readonly diagramName?: string;
      readonly author?: string;
      readonly language?: FlowLanguage;
    };

/** Where the architecture knowledge comes from. Only a local Markdown Knowledge Pack directory exists today. */
export type KnowledgePackSourceConfig = {
  readonly kind: "local-directory";
  /** Absolute path of the directory that holds the five pack files. */
  readonly path: string;
};

/** Endpoint of a local OpenAI-compatible server such as LM Studio; loopback only. */
export interface LocalModelEndpointConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}

/** Legacy local generator configuration retained for backward compatibility. */
export type LegacyLocalGeneratorConfig = LocalModelEndpointConfig & {
  readonly kind: "openai-compatible-local";
  /** Chosen explicitly by the caller; the runtime never selects a model. */
  readonly modelId: string;
};

/** Profile-based local generator configuration. The optional URL is a local profile override. */
export type ProviderGeneratorConfig = {
  readonly kind: "openai-compatible-local";
  readonly profileId: string;
  readonly modelId: string;
  readonly timeoutMs?: number;
  readonly baseUrl?: string;
};

export interface ProviderCredential {
  readonly type: "api-key";
  readonly value: string;
}

/** Profile-based remote generation. Hosts obtain the credential from secure storage per action. */
export type RemoteProviderGeneratorConfig = {
  readonly kind: "remote-provider";
  readonly profileId: string;
  readonly modelId: string;
  readonly credential?: ProviderCredential;
  readonly timeoutMs?: number;
};

/** The legacy endpoint variant remains public for backward compatibility. */
export type GeneratorConfig = LegacyLocalGeneratorConfig | ProviderGeneratorConfig | RemoteProviderGeneratorConfig;

export interface ProviderModelSelection {
  readonly profileId: string;
  readonly timeoutMs?: number;
  readonly baseUrl?: string;
  readonly credential?: ProviderCredential;
}

export interface GenerateSequenceDiagramRequest {
  readonly flow: FlowSource;
  readonly knowledgePack: KnowledgePackSourceConfig;
  readonly generator: GeneratorConfig;
  /** Explicit selections for ambiguous mentions: mention text to candidate identifier. */
  readonly selections?: Readonly<Record<string, string>>;
  /** Names of [NEW: Name] participants the caller confirmed. */
  readonly confirmedNewParticipants?: readonly string[];
  readonly signal?: CancellationSignal;
}

export type RuntimeIssueSeverity = "error" | "warning";

export type RuntimeIssueDetailValue = string | number | boolean | readonly string[];

/**
 * One safe diagnostic. It carries a stable code, a fixed message, positions, identifiers and
 * counts only; it never carries flow text, pack content, prompts, model answers or machine paths.
 */
export interface RuntimeIssue {
  readonly severity: RuntimeIssueSeverity;
  readonly code: string;
  readonly message: string;
  /** Logical file name such as flow.md or systems.md. */
  readonly file?: string;
  readonly line?: number;
  /** One-based column for flow positions, or a column label for pack tables. */
  readonly column?: number | string;
  /** Schema path of a rejected model field, such as messages.2.to. */
  readonly path?: string;
  readonly details?: Readonly<Record<string, RuntimeIssueDetailValue>>;
}

export interface AmbiguityChoiceCandidate {
  readonly id: string;
  readonly participantType: "actor" | "system";
  readonly elementKind: string;
  readonly canonicalName: string;
  readonly sourceFile: string;
  readonly sourceLine: number;
}

/** An ambiguous mention that still needs an explicit selection, with every candidate. */
export interface AmbiguityChoice {
  /** Normalized mention text; it always equals a pack term. */
  readonly mention: string;
  readonly candidates: readonly AmbiguityChoiceCandidate[];
  /** Flow lines where the mention occurs. */
  readonly lines: readonly number[];
}

export type RuntimeFailureStage =
  | "flow"
  | "knowledge-pack"
  | "generator-configuration"
  | "grounding-blocked"
  | "invalid-generator-output"
  | "semantic-validation-failed"
  | "render-validation-failed";

export interface GenerateSequenceDiagramSuccess {
  readonly status: "success";
  readonly diagramName: string;
  readonly generatorType: string;
  /** Lower-case hexadecimal SHA-256 of the grounded context. */
  readonly digest: string;
  readonly plantUml: string;
  readonly diagramFileName: string;
  /** Serialized grounding report (JSON). */
  readonly groundingReport: string;
  readonly reportFileName: string;
  readonly summary: GenerationSummary;
  readonly warnings: readonly RuntimeIssue[];
}

export interface GenerateSequenceDiagramFailure {
  readonly status: "failed";
  readonly stage: RuntimeFailureStage;
  readonly issues: readonly RuntimeIssue[];
  /** Ambiguous mentions without a valid selection; non-empty only for grounding-blocked. */
  readonly ambiguities: readonly AmbiguityChoice[];
  /** Normalized names of [NEW: Name] markers that still need confirmation; non-empty only for grounding-blocked. */
  readonly unconfirmedNewParticipants: readonly string[];
}

export type GenerateSequenceDiagramResult = GenerateSequenceDiagramSuccess | GenerateSequenceDiagramFailure;

export type ListLocalModelsResult =
  | { readonly ok: true; readonly models: readonly string[] }
  | { readonly ok: false; readonly code: string };

export interface ListLocalModelsOptions {
  readonly signal?: CancellationSignal;
}

/**
 * The application runtime a host talks to. A later multi-diagram pipeline adds a generic
 * generateDiagram(profile, ...) next to the sequence entry point; hosts written against this
 * interface do not change.
 */
export interface ArchiAgentRuntime {
  generateSequenceDiagram(request: GenerateSequenceDiagramRequest): Promise<GenerateSequenceDiagramResult>;
  /** Immutable profiles sorted by profileId; this method performs no I/O. */
  listProviderProfiles(): readonly ProviderProfile[];
  /** Models reported by the selected profile through its registered transport. */
  listProviderModels(selection: ProviderModelSelection, options?: ListLocalModelsOptions): Promise<ListLocalModelsResult>;
  /** Model identifiers reported by the local server, sorted; nothing is selected. */
  listLocalModels(endpoint: LocalModelEndpointConfig, options?: ListLocalModelsOptions): Promise<ListLocalModelsResult>;
}
