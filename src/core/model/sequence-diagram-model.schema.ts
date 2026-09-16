import { z } from "zod";
import { newParticipantLimits } from "../grounding/grounded-context.js";
import { isSafeNewParticipantName, normalizeReferenceText } from "../grounding/participant-resolver.js";
import { isKnowledgePackIdentifier } from "../knowledge-pack/knowledge-pack.schema.js";
import { containsControlCharacter, countUnicodeCharacters, knowledgePackLimits } from "../knowledge-pack/source-limits.js";
import { displayTextProblem, messageLabelTextOptions, plantUmlTextLimits, type DisplayTextOptions } from "../render/plantuml-escape.js";
import { stableCompare } from "../util/ordering.js";
import {
  allowedInterfaceTypes,
  newParticipantPrefix,
  participantKinds,
  type KnowledgePackParticipant,
  type NewParticipant,
  type ParticipantRef,
  type SequenceDiagramModel,
  type SequenceMessage,
  type SequenceParticipant
} from "./types.js";

/**
 * Strict schema for the untrusted output of a sequence-model generator.
 *
 * A generator supplies participants and messages of the existing SequenceDiagramModel type and,
 * optionally, combined fragments. Metadata and warnings are never taken from a generator: they come
 * from the validated flow and the grounded context. Unknown keys are rejected, enums are closed,
 * nothing is coerced, every text passes the PlantUML text policy, and there is no raw-syntax
 * construct, so a PlantUML statement cannot be expressed at all.
 *
 * Every generated message states async and isResponse explicitly. The shared domain type keeps them
 * optional, but a generator must never leave interaction semantics to an absent field, and a
 * missing value is rejected rather than inferred.
 *
 * Fragments are the only addition to the shared domain types, which stay unchanged. A fragment
 * covers a contiguous range of messages named by their order numbers; only alt has else branches.
 * Fragments nest strictly: two fragments are disjoint or one contains the other, a fragment inside
 * an alt stays inside one branch, and nesting is bounded.
 */

export const fragmentKinds = ["alt", "opt", "loop", "group"] as const;

export type FragmentKind = (typeof fragmentKinds)[number];

export interface SequenceFragmentBranch {
  readonly condition: string;
  /** Order number of the first message of the branch. */
  readonly firstOrder: number;
}

export interface SequenceFragment {
  readonly kind: FragmentKind;
  readonly condition: string;
  readonly firstOrder: number;
  readonly lastOrder: number;
  /** Else branches of an alt, in message order; always empty for other kinds. */
  readonly elseBranches: readonly SequenceFragmentBranch[];
}

export type GeneratedSequenceModel = Pick<SequenceDiagramModel, "participants" | "messages"> & {
  readonly fragments: readonly SequenceFragment[];
};

export const sequenceModelLimits = Object.freeze({
  maxParticipants: 64,
  maxMessages: 256,
  maxOrder: 1_000_000,
  maxFragments: 32,
  maxElseBranches: 8,
  maxFragmentDepth: 4,
  maxNewNameChars: newParticipantLimits.maxNameChars,
  maxCanonicalNameChars: knowledgePackLimits.maxCanonicalNameChars,
  maxInterfaceNameChars: knowledgePackLimits.maxCanonicalNameChars,
  maxLabelChars: plantUmlTextLimits.maxLabelChars,
  maxBusinessDescriptionChars: plantUmlTextLimits.maxBusinessDescriptionChars,
  maxReportedProblems: 50
});

export interface SchemaProblem {
  /** Dotted schema path such as messages.2.to; never a value from the input. */
  readonly path: string;
  readonly code: string;
}

export type GeneratedModelParseResult =
  | { readonly ok: true; readonly model: GeneratedSequenceModel }
  | { readonly ok: false; readonly problems: readonly SchemaProblem[]; readonly truncated: boolean };

/** Stable key of a participant reference; known and new participants can never share a key. */
export function participantRefKey(ref: ParticipantRef): string {
  return ref.elementId !== undefined ? `kp:${ref.elementId}` : `new:${ref.newName ?? ""}`;
}

export function participantKey(participant: SequenceParticipant): string {
  return participant.origin === "knowledge-pack" ? `kp:${participant.elementId}` : `new:${participant.newName}`;
}

function safeText(options: DisplayTextOptions) {
  return z.string().superRefine((value, context) => {
    const problem = displayTextProblem(value, options);

    if (problem !== undefined) {
      context.addIssue({ code: "custom", message: `text-${problem}` });
    }
  });
}

/** Optional text: an empty string is accepted here and normalized to an absent value later. */
function optionalText(options: DisplayTextOptions) {
  return z
    .string()
    .superRefine((value, context) => {
      const problem = value === "" ? undefined : displayTextProblem(value, options);

      if (problem !== undefined) {
        context.addIssue({ code: "custom", message: `text-${problem}` });
      }
    })
    .optional();
}

const identifierSchema = z.string().refine(isKnowledgePackIdentifier, "invalid-identifier");

/** A new-participant reference is the normalized grounding key of a confirmed [NEW: Name] participant. */
const newNameSchema = z
  .string()
  .refine(
    (value) =>
      value.length > 0 &&
      countUnicodeCharacters(value) <= sequenceModelLimits.maxNewNameChars &&
      !containsControlCharacter(value) &&
      value === normalizeReferenceText(value),
    "invalid-new-participant-reference"
  );

const displayNamePrefix = `${newParticipantPrefix} `;

const newDisplayNameSchema = z
  .string()
  .refine(
    (value) => value.startsWith(displayNamePrefix) && isSafeNewParticipantName(value.slice(displayNamePrefix.length)),
    "invalid-new-participant-display-name"
  );

const knownParticipantSchema = z.strictObject({
  origin: z.literal("knowledge-pack"),
  elementId: identifierSchema,
  canonicalName: safeText({ maxChars: sequenceModelLimits.maxCanonicalNameChars }),
  kind: z.enum(participantKinds)
});

const newParticipantSchema = z.strictObject({
  origin: z.literal("new"),
  newName: newNameSchema,
  displayName: newDisplayNameSchema,
  kind: z.enum(participantKinds),
  confirmedByUser: z.literal(true)
});

const participantSchema = z.discriminatedUnion("origin", [knownParticipantSchema, newParticipantSchema]);

const participantRefSchema = z.union([
  z.strictObject({ elementId: identifierSchema }),
  z.strictObject({ newName: newNameSchema })
]);

const orderSchema = z.number().int().min(1).max(sequenceModelLimits.maxOrder);

const messageSchema = z.strictObject({
  from: participantRefSchema,
  to: participantRefSchema,
  label: safeText(messageLabelTextOptions),
  interfaceType: z.enum(allowedInterfaceTypes),
  interfaceName: optionalText({ maxChars: sequenceModelLimits.maxInterfaceNameChars }),
  businessDescription: optionalText({
    maxChars: sequenceModelLimits.maxBusinessDescriptionChars,
    rejectStatementKeywords: true
  }),
  async: z.boolean(),
  isResponse: z.boolean(),
  order: orderSchema
});

const fragmentConditionSchema = safeText({ maxChars: sequenceModelLimits.maxLabelChars, rejectStatementKeywords: true });

const fragmentSchema = z.strictObject({
  kind: z.enum(fragmentKinds),
  condition: fragmentConditionSchema,
  firstOrder: orderSchema,
  lastOrder: orderSchema,
  elseBranches: z
    .array(z.strictObject({ condition: fragmentConditionSchema, firstOrder: orderSchema }))
    .max(sequenceModelLimits.maxElseBranches)
    .optional()
});

type ParsedModel = z.infer<typeof generatedModelBaseSchema>;

const generatedModelBaseSchema = z.strictObject({
  participants: z.array(participantSchema).min(1).max(sequenceModelLimits.maxParticipants),
  messages: z.array(messageSchema).min(1).max(sequenceModelLimits.maxMessages),
  fragments: z.array(fragmentSchema).max(sequenceModelLimits.maxFragments).optional()
});

/** Structural input of the fragment check; shared by the schema and the model validator. */
export interface FragmentStructureInput {
  readonly messages: readonly { readonly order: number }[];
  readonly fragments: readonly {
    readonly kind: FragmentKind;
    readonly firstOrder: number;
    readonly lastOrder: number;
    readonly elseBranches?: readonly { readonly firstOrder: number }[] | undefined;
  }[];
}

/**
 * Range, branch and nesting problems of the fragments. Every order number must name a message;
 * ranges must not be reversed; else branches belong to alt only, start strictly after the previous
 * section and inside the range; two fragments are disjoint or strictly nested (identical ranges are
 * rejected, so the nesting is never ambiguous); a nested fragment stays inside one alt branch; and
 * the nesting depth is bounded.
 */
export function fragmentProblems(input: FragmentStructureInput): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  const orders = new Set(input.messages.map((message) => message.order));
  const valid: number[] = [];

  input.fragments.forEach((fragment, index) => {
    const path = `fragments.${index}`;
    const branches = fragment.elseBranches ?? [];

    if (![fragment.firstOrder, fragment.lastOrder, ...branches.map((branch) => branch.firstOrder)].every((order) => orders.has(order))) {
      problems.push({ path, code: "unknown-fragment-order" });
      return;
    }

    if (fragment.firstOrder > fragment.lastOrder) {
      problems.push({ path, code: "invalid-fragment-range" });
      return;
    }

    if (fragment.kind !== "alt" && branches.length > 0) {
      problems.push({ path, code: "else-outside-alt" });
      return;
    }

    let previous = fragment.firstOrder;

    for (const branch of branches) {
      if (branch.firstOrder <= previous || branch.firstOrder > fragment.lastOrder) {
        problems.push({ path, code: "invalid-else-branch" });
        return;
      }

      previous = branch.firstOrder;
    }

    valid.push(index);
  });

  const at = (index: number) => input.fragments[index] as FragmentStructureInput["fragments"][number];
  const contains = (outer: number, inner: number): boolean =>
    at(outer).firstOrder <= at(inner).firstOrder &&
    at(inner).lastOrder <= at(outer).lastOrder &&
    !(at(outer).firstOrder === at(inner).firstOrder && at(outer).lastOrder === at(inner).lastOrder);
  const crossesBranch = (outer: number, inner: number): boolean =>
    (at(outer).elseBranches ?? []).some(
      (branch) => at(inner).firstOrder < branch.firstOrder && branch.firstOrder <= at(inner).lastOrder
    );

  for (let left = 0; left < valid.length; left += 1) {
    for (let right = left + 1; right < valid.length; right += 1) {
      const a = valid[left] as number;
      const b = valid[right] as number;

      if (at(a).lastOrder < at(b).firstOrder || at(b).lastOrder < at(a).firstOrder) {
        continue;
      }

      if (contains(a, b)) {
        if (crossesBranch(a, b)) {
          problems.push({ path: `fragments.${b}`, code: "fragment-crosses-branch" });
        }
      } else if (contains(b, a)) {
        if (crossesBranch(b, a)) {
          problems.push({ path: `fragments.${a}`, code: "fragment-crosses-branch" });
        }
      } else {
        problems.push({ path: `fragments.${b}`, code: "overlapping-fragments" });
      }
    }
  }

  for (const index of valid) {
    const depth = 1 + valid.filter((other) => other !== index && contains(other, index)).length;

    if (depth > sequenceModelLimits.maxFragmentDepth) {
      problems.push({ path: `fragments.${index}`, code: "fragment-too-deep" });
    }
  }

  return problems;
}

function consistencyProblems(model: ParsedModel): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  const declared = new Set<string>();

  model.participants.forEach((participant, index) => {
    const key = participant.origin === "knowledge-pack" ? `kp:${participant.elementId}` : `new:${participant.newName}`;

    if (declared.has(key)) {
      problems.push({ path: `participants.${index}`, code: "duplicate-participant" });
    }

    declared.add(key);
  });

  const orders = new Set<number>();

  model.messages.forEach((message, index) => {
    if (orders.has(message.order)) {
      problems.push({ path: `messages.${index}.order`, code: "duplicate-order" });
    }

    orders.add(message.order);

    for (const end of ["from", "to"] as const) {
      if (!declared.has(participantRefKey(message[end]))) {
        problems.push({ path: `messages.${index}.${end}`, code: "undeclared-endpoint" });
      }
    }
  });

  problems.push(...fragmentProblems({ messages: model.messages, fragments: model.fragments ?? [] }));
  return problems;
}

export const generatedSequenceModelSchema = generatedModelBaseSchema.superRefine((model, context) => {
  for (const problem of consistencyProblems(model)) {
    context.addIssue({ code: "custom", message: problem.code, path: problem.path.split(".").map(pathPart) });
  }
});

function pathPart(part: string): string | number {
  return /^\d+$/.test(part) ? Number(part) : part;
}

function comparePaths(left: string, right: string): number {
  const leftParts = left.split(".");
  const rightParts = right.split(".");

  for (let index = 0; index < Math.min(leftParts.length, rightParts.length); index += 1) {
    const a = leftParts[index] ?? "";
    const b = rightParts[index] ?? "";

    if (a === b) {
      continue;
    }

    return /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : stableCompare(a, b);
  }

  return leftParts.length - rightParts.length;
}

export function compareSchemaProblems(left: SchemaProblem, right: SchemaProblem): number {
  return comparePaths(left.path, right.path) || stableCompare(left.code, right.code);
}

/** Rejects oversized collections before the schema walks them, so hostile input stays bounded. */
function preflight(value: unknown): SchemaProblem | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { path: "(root)", code: "invalid_type" };
  }

  const record = value as Record<string, unknown>;

  for (const [key, limit] of [
    ["participants", sequenceModelLimits.maxParticipants],
    ["messages", sequenceModelLimits.maxMessages],
    ["fragments", sequenceModelLimits.maxFragments]
  ] as const) {
    const items = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

    if (Array.isArray(items) && items.length > limit) {
      return { path: key, code: "too_big" };
    }
  }

  return undefined;
}

function toParticipant(participant: ParsedModel["participants"][number]): SequenceParticipant {
  if (participant.origin === "knowledge-pack") {
    const known: KnowledgePackParticipant = {
      origin: "knowledge-pack",
      elementId: participant.elementId,
      canonicalName: participant.canonicalName,
      kind: participant.kind
    };
    return Object.freeze(known);
  }

  const created: NewParticipant = {
    origin: "new",
    newName: participant.newName,
    displayName: participant.displayName as NewParticipant["displayName"],
    kind: participant.kind,
    confirmedByUser: true
  };
  return Object.freeze(created);
}

function toRef(ref: { elementId?: string; newName?: string }): ParticipantRef {
  return ref.elementId !== undefined
    ? Object.freeze({ elementId: ref.elementId })
    : Object.freeze({ newName: ref.newName ?? "" });
}

function toMessage(message: ParsedModel["messages"][number]): SequenceMessage {
  const result: SequenceMessage = {
    from: toRef(message.from),
    to: toRef(message.to),
    label: message.label,
    interfaceType: message.interfaceType,
    async: message.async,
    isResponse: message.isResponse,
    order: message.order
  };

  if (message.interfaceName !== undefined) {
    result.interfaceName = message.interfaceName;
  }

  if (message.businessDescription !== undefined) {
    result.businessDescription = message.businessDescription;
  }

  return Object.freeze(result);
}

function toFragment(fragment: NonNullable<ParsedModel["fragments"]>[number]): SequenceFragment {
  return Object.freeze({
    kind: fragment.kind,
    condition: fragment.condition,
    firstOrder: fragment.firstOrder,
    lastOrder: fragment.lastOrder,
    elseBranches: Object.freeze(
      (fragment.elseBranches ?? []).map((branch) => Object.freeze({ condition: branch.condition, firstOrder: branch.firstOrder }))
    )
  });
}

/**
 * Validates untrusted generator output. Problems carry schema paths and codes only, never input
 * values, and are sorted and capped. An absent fragment list is an empty list.
 */
export function parseGeneratedSequenceModel(value: unknown): GeneratedModelParseResult {
  const early = preflight(value);

  if (early !== undefined) {
    return Object.freeze({ ok: false, problems: Object.freeze([Object.freeze(early)]), truncated: false });
  }

  const parsed = generatedSequenceModelSchema.safeParse(value);

  if (!parsed.success) {
    const unique = new Map<string, SchemaProblem>();

    for (const issue of parsed.error.issues) {
      const path = issue.path.length === 0 ? "(root)" : issue.path.map((part) => String(part)).join(".");
      const code = issue.code === "custom" ? issue.message : issue.code;
      unique.set(`${path} ${code}`, Object.freeze({ path, code }));
    }

    const sorted = [...unique.values()].sort(compareSchemaProblems);
    const limit = sequenceModelLimits.maxReportedProblems;
    return Object.freeze({
      ok: false,
      problems: Object.freeze(sorted.slice(0, limit)),
      truncated: sorted.length > limit
    });
  }

  return Object.freeze({
    ok: true,
    model: Object.freeze({
      participants: parsed.data.participants.map(toParticipant),
      messages: parsed.data.messages.map(toMessage),
      fragments: Object.freeze((parsed.data.fragments ?? []).map(toFragment))
    })
  });
}
