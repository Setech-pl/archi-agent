import type {
  AmbiguityChoice,
  ArchiAgentRuntime,
  CancellationSignal,
  FlowSource,
  GenerateSequenceDiagramFailure,
  GenerateSequenceDiagramRequest,
  GenerateSequenceDiagramResult
} from "../../../src/runtime/index.js";
import { localLmStudioProfileId } from "../../../src/runtime/index.js";
import type { ArchiAgentSettings } from "../settings.js";

/**
 * Editor-independent logic of the generate command: building the runtime request from the
 * settings and the chosen flow, and the bounded resolution loop that turns a grounding block into
 * explicit user decisions.
 *
 * Ambiguity is never resolved by the code: each ambiguous mention is put to the prompts and only an
 * identifier that is one of the reported candidates is passed on. A [NEW: Name] marker is added
 * only when the user confirms it. When the user cancels a prompt the session stops without a result.
 */

export interface ResolutionPrompts {
  /** Returns the identifier of the chosen candidate, or undefined when the user cancelled. */
  selectAmbiguityCandidate(choice: AmbiguityChoice): Promise<string | undefined>;
  /** Returns the subset of names the user confirmed, or undefined when the user cancelled. */
  confirmNewParticipants(names: readonly string[]): Promise<readonly string[] | undefined>;
}

export interface SequenceGenerationSessionOptions {
  readonly runtime: ArchiAgentRuntime;
  readonly request: GenerateSequenceDiagramRequest;
  readonly prompts: ResolutionPrompts;
  /** Upper bound of resolution rounds; defaults to sessionLimits.maxResolutionRounds. */
  readonly maxRounds?: number;
}

export type SequenceGenerationSessionOutcome =
  | { readonly status: "completed"; readonly result: GenerateSequenceDiagramResult; readonly rounds: number }
  | { readonly status: "cancelled" };

export const sessionLimits = Object.freeze({ maxResolutionRounds: 3 });

export function buildGenerationRequest(
  settings: ArchiAgentSettings,
  flow: FlowSource,
  modelId: string,
  signal?: CancellationSignal
): GenerateSequenceDiagramRequest {
  const generator =
    settings.localModel.selectionMode === "legacy"
      ? Object.freeze({
          kind: "openai-compatible-local" as const,
          baseUrl: settings.localModel.baseUrl,
          modelId,
          timeoutMs: settings.localModel.timeoutMs
        })
      : Object.freeze({
          kind: "openai-compatible-local" as const,
          profileId: settings.localModel.profileId,
          modelId,
          timeoutMs: settings.localModel.timeoutMs,
          ...(settings.localModel.profileId === localLmStudioProfileId ? { baseUrl: settings.localModel.baseUrl } : {})
        });

  return Object.freeze({
    flow,
    knowledgePack: Object.freeze({ kind: "local-directory", path: settings.knowledgePackPath }),
    generator,
    ...(signal === undefined ? {} : { signal })
  });
}

/** A grounding block the user can act on: at least one ambiguity or unconfirmed new participant. */
export function isResolvable(failure: GenerateSequenceDiagramFailure): boolean {
  return failure.stage === "grounding-blocked" && (failure.ambiguities.length > 0 || failure.unconfirmedNewParticipants.length > 0);
}

export async function runSequenceGenerationSession(options: SequenceGenerationSessionOptions): Promise<SequenceGenerationSessionOutcome> {
  const maxRounds = options.maxRounds ?? sessionLimits.maxResolutionRounds;
  let request = options.request;
  let rounds = 0;

  for (;;) {
    if (request.signal?.aborted === true) {
      return Object.freeze({ status: "cancelled" });
    }

    const result = await options.runtime.generateSequenceDiagram(request);

    if (result.status !== "failed" || !isResolvable(result) || rounds >= maxRounds) {
      return Object.freeze({ status: "completed", result, rounds });
    }

    const selections: Record<string, string> = { ...(request.selections ?? {}) };

    for (const choice of result.ambiguities) {
      const selected = await options.prompts.selectAmbiguityCandidate(choice);

      if (selected === undefined || !choice.candidates.some((candidate) => candidate.id === selected)) {
        return Object.freeze({ status: "cancelled" });
      }

      selections[choice.mention] = selected;
    }

    const confirmed = new Set(request.confirmedNewParticipants ?? []);

    if (result.unconfirmedNewParticipants.length > 0) {
      const picked = await options.prompts.confirmNewParticipants(result.unconfirmedNewParticipants);

      if (picked === undefined) {
        return Object.freeze({ status: "cancelled" });
      }

      const accepted = picked.filter((name) => result.unconfirmedNewParticipants.includes(name));

      if (accepted.length < result.unconfirmedNewParticipants.length) {
        // The user declined at least one marker; the flow stays blocked and the block is reported as it is.
        return Object.freeze({ status: "completed", result, rounds });
      }

      for (const name of accepted) {
        confirmed.add(name);
      }
    }

    rounds += 1;
    request = Object.freeze({
      ...request,
      selections: Object.freeze(selections),
      confirmedNewParticipants: Object.freeze([...confirmed])
    });
  }
}
