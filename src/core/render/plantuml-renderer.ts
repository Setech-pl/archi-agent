import type { ContextDigest, GroundedContext } from "../grounding/grounded-context.js";
import {
  fragmentProblems,
  participantKey,
  sequenceModelLimits,
  type GeneratedSequenceModel,
  type SequenceFragment
} from "../model/sequence-diagram-model.schema.js";
import { newParticipantPrefix, type ParticipantKind, type SequenceMessage } from "../model/types.js";
import { createModelIssue, type ModelIssue } from "../validation/model-validator.js";
import { allocateAliases } from "./alias-allocator.js";
import { legendLines } from "./legend.js";
import { metadataHeaderLines } from "./metadata-header.js";
import { assertSafeDisplayText, messageLabelTextOptions, messageText, quotedName, UnsafePlantUmlTextError } from "./plantuml-escape.js";

/**
 * Renders PlantUML from a validated, cleaned model only.
 *
 * Every line is built from fixed keywords, allocated aliases and text that passed the text policy.
 * Display names of known participants come from the grounded context, never from the generator. No
 * generator or flow text is passed through as PlantUML, and no include, theme, skin parameter or
 * other directive is emitted. Output: one @startuml, metadata comments, participant declarations,
 * messages in order with alt/else/opt/loop/group fragments opened and closed around them, the local
 * legend and one @enduml, joined with LF and ending with a final newline. A model whose fragments are
 * not strictly nested is not rendered.
 */

export interface RenderRequest {
  readonly context: GroundedContext;
  readonly model: GeneratedSequenceModel;
  readonly digest: ContextDigest;
  readonly generatorType: string;
}

export type RenderResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly issues: readonly ModelIssue[] };

const declarationKeywords: Readonly<Record<ParticipantKind, string>> = Object.freeze({
  actor: "actor",
  system: "participant",
  database: "database",
  queue: "queue"
});

export const arrows = Object.freeze({ synchronous: "->", asynchronous: "->>", response: "-->" });

export function arrowFor(message: SequenceMessage): string {
  if (message.isResponse === true) {
    return arrows.response;
  }

  return message.async === true ? arrows.asynchronous : arrows.synchronous;
}

function messageLabel(message: SequenceMessage): string {
  const label = assertSafeDisplayText(message.label, messageLabelTextOptions);
  const interfaceName =
    message.interfaceName === undefined
      ? undefined
      : assertSafeDisplayText(message.interfaceName, { maxChars: sequenceModelLimits.maxInterfaceNameChars });
  return interfaceName === undefined
    ? `${label} (${message.interfaceType})`
    : `${label} (${message.interfaceType}: ${interfaceName})`;
}

function fragmentCondition(value: string): string {
  return assertSafeDisplayText(value, { maxChars: sequenceModelLimits.maxLabelChars, rejectStatementKeywords: true });
}

class RenderFailure extends Error {}

export function renderPlantUml(request: RenderRequest): RenderResult {
  const { context, model } = request;

  try {
    const known = new Map([...context.actors, ...context.systems].map((element) => [element.id, element]));
    const confirmed = new Map(context.newParticipants.map((participant) => [participant.key, participant]));
    const aliases = allocateAliases(
      model.participants.map((participant) =>
        participant.origin === "knowledge-pack" ? { elementId: participant.elementId } : { newName: participant.newName }
      )
    );
    const aliasOf = (key: string): string => {
      const alias = aliases.get(key);

      if (alias === undefined) {
        throw new RenderFailure("undeclared participant");
      }

      return alias;
    };

    const declarations = model.participants.map((participant) => {
      let label: string;

      if (participant.origin === "knowledge-pack") {
        const element = known.get(participant.elementId);

        if (element === undefined) {
          throw new RenderFailure("participant outside the grounded context");
        }

        label = quotedName(element.canonicalName);
      } else {
        const grounded = confirmed.get(participant.newName);

        if (grounded === undefined) {
          throw new RenderFailure("unconfirmed new participant");
        }

        label = `"${newParticipantPrefix} ${assertSafeDisplayText(grounded.displayName)}"`;
      }

      return `${declarationKeywords[participant.kind]} ${label} as ${aliasOf(participantKey(participant))}`;
    });

    const messageLine = (message: SequenceMessage): string => {
      const from = aliasOf(message.from.elementId !== undefined ? `kp:${message.from.elementId}` : `new:${message.from.newName ?? ""}`);
      const to = aliasOf(message.to.elementId !== undefined ? `kp:${message.to.elementId}` : `new:${message.to.newName ?? ""}`);
      return `${from} ${arrowFor(message)} ${to} : ${messageText(messageLabel(message))}`;
    };

    if (fragmentProblems(model).length > 0) {
      throw new RenderFailure("fragments are not strictly nested");
    }

    const fragments = [...model.fragments].sort((left, right) => left.firstOrder - right.firstOrder || right.lastOrder - left.lastOrder);
    const ordered = [...model.messages].sort((left, right) => left.order - right.order);
    const open: SequenceFragment[] = [];
    const messages: string[] = [];
    let nextFragment = 0;

    for (const message of ordered) {
      while ((open.at(-1)?.lastOrder ?? Number.MAX_SAFE_INTEGER) < message.order) {
        open.pop();
        messages.push("end");
      }

      const branch = open.at(-1)?.elseBranches.find((candidate) => candidate.firstOrder === message.order);

      if (branch !== undefined) {
        messages.push(`else ${fragmentCondition(branch.condition)}`);
      }

      for (let fragment = fragments[nextFragment]; fragment?.firstOrder === message.order; fragment = fragments[nextFragment]) {
        messages.push(`${fragment.kind} ${fragmentCondition(fragment.condition)}`);
        open.push(fragment);
        nextFragment += 1;
      }

      messages.push(messageLine(message));
    }

    while (open.pop() !== undefined) {
      messages.push("end");
    }

    if (nextFragment !== fragments.length) {
      throw new RenderFailure("fragment outside the message sequence");
    }

    if (declarations.length === 0 || ordered.length === 0) {
      throw new RenderFailure("empty diagram");
    }

    const lines = [
      "@startuml",
      ...metadataHeaderLines({
        diagramName: context.metadata.diagramName,
        flowName: context.metadata.flowName,
        author: context.metadata.author,
        language: context.metadata.language,
        digest: request.digest,
        generatorType: request.generatorType
      }),
      "",
      ...declarations,
      "",
      ...messages,
      "",
      ...legendLines(context.metadata.language),
      "@enduml"
    ];

    return Object.freeze({ ok: true, text: `${lines.join("\n")}\n` });
  } catch (error) {
    const problem = error instanceof UnsafePlantUmlTextError ? error.problem : "unrenderable-model";
    return Object.freeze({ ok: false, issues: Object.freeze([createModelIssue("render-failed", { details: { problem } })]) });
  }
}
