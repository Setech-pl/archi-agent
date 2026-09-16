import type { GroundedActor, GroundedContext, GroundedSystem } from "../core/grounding/grounded-context.js";
import type { InterfaceType as ModelInterfaceType } from "../core/model/types.js";
import type {
  SequenceModelGenerationRequest,
  SequenceModelGenerator,
  UntrustedGeneratorOutput
} from "../core/pipeline/sequence-model-generator.js";
import { participantKindOf } from "../core/validation/grounding-validator.js";
import { packInterfaceType } from "../core/validation/relationship-validator.js";

/**
 * SCRIPTED DEMO GENERATOR - not a language model.
 *
 * A deterministic, hard-coded script for the synthetic Space Mission telemetry command flow, used
 * only by the offline demo and tests. It sends no request anywhere and uses no randomness, clock or
 * machine path. Every participant is taken from the grounded context and referenced by its
 * Knowledge Pack element identifier with the canonical name and kind from that context; every
 * interaction between two participants must match a relationship of the context with the same
 * direction, interface type and mode, and interface names are copied from that relationship. When
 * the expected synthetic context is missing, the generator fails instead of inventing anything.
 * Its output still passes through the complete validation pipeline like any other generator output.
 */

export const scriptedDemoGeneratorType = "scripted-demo";

export class ScriptedGeneratorError extends Error {
  public constructor() {
    super("The expected synthetic Space Mission context is missing; the scripted demo generator stopped.");
    this.name = "ScriptedGeneratorError";
  }
}

interface ScriptStep {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly interfaceType: ModelInterfaceType;
  readonly mode: "synchronous" | "asynchronous";
  /** A response travels against a synchronous relationship declared from its target to its source. */
  readonly response?: true;
}

/**
 * The script. Every step names Knowledge Pack element identifiers only. The first step uses the
 * explicit INTERNAL relationship from the flight controller to mission control (an interaction
 * between two different participants); the command-service step is a self-message.
 */
export const spaceMissionScript: readonly ScriptStep[] = Object.freeze([
  { from: "flight-controller", to: "mission-control", label: "Submit prepared command", interfaceType: "INTERNAL", mode: "synchronous" },
  { from: "mission-control", to: "command-service", label: "Send command request", interfaceType: "REST API", mode: "synchronous" },
  { from: "command-service", to: "command-service", label: "Validate command", interfaceType: "INTERNAL", mode: "synchronous" },
  {
    from: "command-service",
    to: "mission-control",
    label: "Command validation result",
    interfaceType: "REST API",
    mode: "synchronous",
    response: true
  },
  { from: "command-service", to: "command-queue", label: "Publish accepted command", interfaceType: "EVENT", mode: "asynchronous" },
  { from: "command-queue", to: "orbital-relay", label: "Forward queued command", interfaceType: "EVENT", mode: "asynchronous" },
  { from: "orbital-relay", to: "telemetry-service", label: "Deliver telemetry frames", interfaceType: "EVENT", mode: "asynchronous" },
  { from: "telemetry-service", to: "telemetry-store", label: "Store decoded telemetry", interfaceType: "DB", mode: "synchronous" }
]);

function buildScriptedModel(context: GroundedContext): UntrustedGeneratorOutput {
  const elements = new Map<string, GroundedActor | GroundedSystem>(
    [...context.actors, ...context.systems].map((element) => [element.id, element])
  );
  const element = (id: string): GroundedActor | GroundedSystem => {
    const found = elements.get(id);

    if (found === undefined) {
      throw new ScriptedGeneratorError();
    }

    return found;
  };

  const participantIds: string[] = [];
  const messages = spaceMissionScript.map((step, index) => {
    for (const id of [step.from, step.to]) {
      element(id);

      if (!participantIds.includes(id)) {
        participantIds.push(id);
      }
    }

    const message: Record<string, unknown> = {
      from: { elementId: step.from },
      to: { elementId: step.to },
      label: step.label,
      interfaceType: step.interfaceType,
      async: step.mode === "asynchronous",
      isResponse: step.response === true,
      order: index + 1
    };

    if (step.from !== step.to) {
      const [sourceId, targetId] = step.response === true ? [step.to, step.from] : [step.from, step.to];
      const relationship = context.relationships.find(
        (candidate) =>
          candidate.fromId === sourceId &&
          candidate.toId === targetId &&
          candidate.interfaceType === packInterfaceType(step.interfaceType) &&
          candidate.mode === step.mode
      );

      if (relationship === undefined) {
        throw new ScriptedGeneratorError();
      }

      if (relationship.interfaceName !== null) {
        message["interfaceName"] = relationship.interfaceName;
      }
    }

    return message;
  });

  return {
    participants: participantIds.map((id) => {
      const grounded = element(id);
      return { origin: "knowledge-pack", elementId: grounded.id, canonicalName: grounded.canonicalName, kind: participantKindOf(grounded) };
    }),
    messages
  };
}

export class ScriptedSpaceMissionGenerator implements SequenceModelGenerator {
  public readonly generatorType = scriptedDemoGeneratorType;

  public async generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput> {
    if (request.signal?.aborted === true) {
      throw new ScriptedGeneratorError();
    }

    return buildScriptedModel(request.context);
  }
}
