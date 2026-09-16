import type { GroundedActor, GroundedContext, GroundedSystem } from "../../src/core/grounding/grounded-context.js";
import type { InterfaceType as ModelInterfaceType } from "../../src/core/model/types.js";
import type {
  SequenceModelGenerationRequest,
  SequenceModelGenerator,
  UntrustedGeneratorOutput
} from "../../src/core/pipeline/sequence-model-generator.js";
import { participantKindOf } from "../../src/core/validation/grounding-validator.js";

/**
 * Test generator that echoes the grounded context: one message per grounded relationship between
 * two referenced participants, plus one ungrounded EVENT message to every confirmed new participant.
 * It never contacts anything and never invents identifiers, so its output passes the pipeline for
 * any consistent context. Tests can replace the produced value to exercise rejections.
 */

const modelInterfaceTypes: Readonly<Record<string, ModelInterfaceType>> = Object.freeze({
  REST_API: "REST API",
  SOAP: "SOAP",
  EVENT: "EVENT",
  FILE: "FILE",
  DB: "DB",
  INTERNAL: "INTERNAL"
});

export function echoModelFor(context: GroundedContext): Record<string, unknown> {
  const known = new Map<string, GroundedActor | GroundedSystem>([...context.actors, ...context.systems].map((element) => [element.id, element]));
  const used = new Set<string>();
  const messages: Record<string, unknown>[] = [];

  for (const relationship of context.relationships) {
    if (!known.has(relationship.fromId) || !known.has(relationship.toId)) {
      continue;
    }

    used.add(relationship.fromId);
    used.add(relationship.toId);
    messages.push({
      from: { elementId: relationship.fromId },
      to: { elementId: relationship.toId },
      label: relationship.purpose,
      interfaceType: modelInterfaceTypes[relationship.interfaceType] ?? "EVENT",
      ...(relationship.interfaceName === null ? {} : { interfaceName: relationship.interfaceName }),
      async: relationship.mode === "asynchronous",
      isResponse: false,
      order: messages.length + 1
    });
  }

  const [firstKnown] = [...known.keys()].sort();

  for (const participant of context.newParticipants) {
    if (firstKnown === undefined) {
      break;
    }

    used.add(firstKnown);
    messages.push({
      from: { elementId: firstKnown },
      to: { newName: participant.key },
      label: "Interact with the new participant",
      interfaceType: "EVENT",
      async: true,
      isResponse: false,
      order: messages.length + 1
    });
  }

  const participants: Record<string, unknown>[] = [...used]
    .sort()
    .map((id) => known.get(id))
    .filter((element): element is GroundedActor | GroundedSystem => element !== undefined)
    .map((element) => ({ origin: "knowledge-pack", elementId: element.id, canonicalName: element.canonicalName, kind: participantKindOf(element) }));

  for (const participant of context.newParticipants) {
    if (firstKnown !== undefined) {
      participants.push({ origin: "new", newName: participant.key, displayName: `[NEW] ${participant.displayName}`, kind: "system", confirmedByUser: true });
    }
  }

  return { participants, messages };
}

export interface EchoGeneratorOptions {
  readonly generatorType?: string;
  /** Replaces the echoed model, for rejection scenarios. */
  readonly produce?: (request: SequenceModelGenerationRequest) => unknown;
  /** Thrown instead of returning; used for transport-failure scenarios. */
  readonly failWith?: unknown;
}

export class ContextEchoGenerator implements SequenceModelGenerator {
  public readonly generatorType: string;
  public readonly requests: SequenceModelGenerationRequest[] = [];
  readonly #options: EchoGeneratorOptions;

  public constructor(options: EchoGeneratorOptions = {}) {
    this.#options = options;
    this.generatorType = options.generatorType ?? "context-echo";
  }

  public async generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput> {
    this.requests.push(request);

    if (this.#options.failWith !== undefined) {
      throw this.#options.failWith;
    }

    return this.#options.produce === undefined ? echoModelFor(request.context) : this.#options.produce(request);
  }
}
