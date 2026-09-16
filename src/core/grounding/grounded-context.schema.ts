import { z } from "zod";
import { flowLanguages } from "../knowledge-pack/front-matter.js";
import { knowledgePackFileNames } from "../knowledge-pack/knowledge-pack-source.js";
import {
  actorKinds,
  interactionModes,
  interfaceTypes,
  isKnowledgePackIdentifier,
  ruleTypes,
  systemKinds,
  type KnowledgePack
} from "../knowledge-pack/knowledge-pack.schema.js";
import { containsControlCharacter, countUnicodeCharacters, knowledgePackLimits } from "../knowledge-pack/source-limits.js";
import { isFilenameSafeDiagramId } from "../output/naming.js";
import { stableCompare, uniqueSorted } from "../util/ordering.js";
import {
  compareFlowReferences,
  compareGroundedRelationships,
  compareGroundedRules,
  compareMatchKinds,
  groundedContextSchemaVersion,
  groundingMatchKinds,
  participantResolutions,
  type GroundedContext
} from "./grounded-context.js";
import { isSafeNewParticipantName, normalizeReferenceText, ParticipantDictionary } from "./participant-resolver.js";

/**
 * Strict schemas for the grounded context. Unknown keys are rejected, enums are closed, identifiers
 * and lengths follow the knowledge-pack policies, arrays must be in canonical order, and nothing is
 * coerced, defaulted or transformed. parseGroundedContext can additionally check a context against
 * the pack it was built from, so known participants must carry the pack's canonical names.
 */

const identifierSchema = z.string().refine(isKnowledgePackIdentifier, "invalid-identifier");

function safeTextSchema(limit: number) {
  return z
    .string()
    .refine(
      (value) => value.length > 0 && countUnicodeCharacters(value) <= limit && !containsControlCharacter(value),
      "invalid-text"
    );
}

const positiveInteger = z.number().int().min(1);

function strictlyIncreasing<TItem>(items: readonly TItem[], compare: (left: TItem, right: TItem) => number): boolean {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];

    if (previous !== undefined && current !== undefined && compare(previous, current) >= 0) {
      return false;
    }
  }

  return true;
}

export const flowReferenceSchema = z.strictObject({
  line: positiveInteger,
  column: positiveInteger,
  length: positiveInteger
});

export const packSourceReferenceSchema = z.strictObject({
  file: z.enum(knowledgePackFileNames),
  line: positiveInteger
});

const matchKindsSchema = z
  .array(z.enum(groundingMatchKinds))
  .min(1)
  .refine((kinds) => strictlyIncreasing(kinds, compareMatchKinds), "unsorted-match-kinds");

const mentionsSchema = z
  .array(flowReferenceSchema)
  .min(1)
  .refine((mentions) => strictlyIncreasing(mentions, compareFlowReferences), "unsorted-mentions");

const knownParticipantShape = {
  id: identifierSchema,
  canonicalName: safeTextSchema(knowledgePackLimits.maxCanonicalNameChars),
  description: safeTextSchema(knowledgePackLimits.maxCellChars),
  source: packSourceReferenceSchema,
  matchKinds: matchKindsSchema,
  resolution: z.enum(participantResolutions),
  mentions: mentionsSchema
};

export const groundedActorSchema = z.strictObject({
  participantType: z.literal("actor"),
  ...knownParticipantShape,
  actorKind: z.enum(actorKinds)
});

export const groundedSystemSchema = z.strictObject({
  participantType: z.literal("system"),
  ...knownParticipantShape,
  systemKind: z.enum(systemKinds)
});

export const confirmedNewParticipantSchema = z
  .strictObject({
    participantType: z.literal("new"),
    key: z.string().min(1),
    displayName: z.string().refine(isSafeNewParticipantName, "unsafe-new-participant-name"),
    confirmed: z.literal(true),
    mentions: mentionsSchema
  })
  .refine((participant) => participant.key === normalizeReferenceText(participant.displayName), {
    message: "new-participant-key-mismatch",
    path: ["key"]
  });

export const groundedRelationshipSchema = z.strictObject({
  fromId: identifierSchema,
  toId: identifierSchema,
  interfaceType: z.enum(interfaceTypes),
  interfaceName: safeTextSchema(knowledgePackLimits.maxCanonicalNameChars).nullable(),
  mode: z.enum(interactionModes),
  purpose: safeTextSchema(knowledgePackLimits.maxCellChars),
  source: packSourceReferenceSchema
});

export const groundedRuleSchema = z.strictObject({
  rule: z.enum(ruleTypes),
  fromId: identifierSchema,
  toId: identifierSchema,
  reason: safeTextSchema(knowledgePackLimits.maxCellChars),
  source: packSourceReferenceSchema
});

export const groundedFlowMetadataSchema = z.strictObject({
  diagramName: z.string().refine(isFilenameSafeDiagramId, "invalid-diagram-name"),
  flowName: safeTextSchema(knowledgePackLimits.maxFrontMatterValueChars),
  author: safeTextSchema(knowledgePackLimits.maxFrontMatterValueChars),
  language: z.enum(flowLanguages)
});

interface Problem {
  readonly code: string;
  readonly path: readonly (string | number)[];
}

function consistencyProblems(context: GroundedContext): Problem[] {
  const problems: Problem[] = [];
  const known = new Set<string>();
  const knownNames = new Set<string>();

  for (const [group, participants] of [
    ["actors", context.actors],
    ["systems", context.systems]
  ] as const) {
    participants.forEach((participant, index) => {
      if (known.has(participant.id)) {
        problems.push({ code: "duplicate-participant", path: [group, index, "id"] });
      }

      known.add(participant.id);
      knownNames.add(normalizeReferenceText(participant.id));
      knownNames.add(normalizeReferenceText(participant.canonicalName));
    });

    if (!strictlyIncreasing<{ readonly id: string }>(participants, (left, right) => stableCompare(left.id, right.id))) {
      problems.push({ code: "unsorted-participants", path: [group] });
    }
  }

  const newKeys = new Set<string>();

  context.newParticipants.forEach((participant, index) => {
    if (newKeys.has(participant.key)) {
      problems.push({ code: "duplicate-new-participant", path: ["newParticipants", index, "key"] });
    }

    newKeys.add(participant.key);

    if (knownNames.has(participant.key)) {
      problems.push({ code: "new-participant-impersonates-known", path: ["newParticipants", index, "key"] });
    }
  });

  if (!strictlyIncreasing(context.newParticipants, (left, right) => stableCompare(left.key, right.key))) {
    problems.push({ code: "unsorted-new-participants", path: ["newParticipants"] });
  }

  context.relationships.forEach((relationship, index) => {
    if (!known.has(relationship.fromId)) {
      problems.push({ code: "relationship-endpoint-outside-context", path: ["relationships", index, "fromId"] });
    }

    if (!known.has(relationship.toId)) {
      problems.push({ code: "relationship-endpoint-outside-context", path: ["relationships", index, "toId"] });
    }

    const previous = context.relationships[index - 1];

    if (previous !== undefined && compareGroundedRelationships(previous, relationship) === 0) {
      problems.push({ code: "duplicate-relationship", path: ["relationships", index] });
    }
  });

  if (
    !strictlyIncreasing(context.relationships, compareGroundedRelationships) &&
    !problems.some((problem) => problem.code === "duplicate-relationship")
  ) {
    problems.push({ code: "unsorted-relationships", path: ["relationships"] });
  }

  context.rules.forEach((rule, index) => {
    if (!known.has(rule.fromId)) {
      problems.push({ code: "rule-endpoint-outside-context", path: ["rules", index, "fromId"] });
    }

    if (!known.has(rule.toId)) {
      problems.push({ code: "rule-endpoint-outside-context", path: ["rules", index, "toId"] });
    }

    const previous = context.rules[index - 1];

    if (previous !== undefined && compareGroundedRules(previous, rule) === 0) {
      problems.push({ code: "duplicate-rule", path: ["rules", index] });
    }
  });

  if (
    !strictlyIncreasing(context.rules, compareGroundedRules) &&
    !problems.some((problem) => problem.code === "duplicate-rule")
  ) {
    problems.push({ code: "unsorted-rules", path: ["rules"] });
  }

  return problems;
}

export const groundedContextSchema = z
  .strictObject({
    schemaVersion: z.literal(groundedContextSchemaVersion),
    metadata: groundedFlowMetadataSchema,
    actors: z.array(groundedActorSchema),
    systems: z.array(groundedSystemSchema),
    newParticipants: z.array(confirmedNewParticipantSchema),
    relationships: z.array(groundedRelationshipSchema),
    rules: z.array(groundedRuleSchema)
  })
  .superRefine((context, issues) => {
    for (const problem of consistencyProblems(context)) {
      issues.addIssue({ code: "custom", message: problem.code, path: [...problem.path] });
    }
  });

/** Checks that every known element, relationship and rule is exactly as declared in the pack. */
export function knowledgePackProblems(context: GroundedContext, pack: KnowledgePack): string[] {
  const problems: string[] = [];
  const systems = new Map(pack.systems.map((record) => [record.id, record]));
  const actors = new Map(pack.actors.map((record) => [record.id, record]));
  const sameSource = (left: { file: string; line: number }, right: { file: string; line: number }): boolean =>
    left.file === right.file && left.line === right.line;

  context.systems.forEach((system, index) => {
    const record = systems.get(system.id);

    if (record === undefined) {
      problems.push(`systems.${index}.id unknown-element`);
    } else if (record.canonicalName !== system.canonicalName) {
      problems.push(`systems.${index}.canonicalName canonical-name-mismatch`);
    } else if (
      record.kind !== system.systemKind ||
      record.description !== system.description ||
      !sameSource(record.location, system.source)
    ) {
      problems.push(`systems.${index} element-mismatch`);
    }
  });

  context.actors.forEach((actor, index) => {
    const record = actors.get(actor.id);

    if (record === undefined) {
      problems.push(`actors.${index}.id unknown-element`);
    } else if (record.canonicalName !== actor.canonicalName) {
      problems.push(`actors.${index}.canonicalName canonical-name-mismatch`);
    } else if (
      record.kind !== actor.actorKind ||
      record.description !== actor.description ||
      !sameSource(record.location, actor.source)
    ) {
      problems.push(`actors.${index} element-mismatch`);
    }
  });

  context.relationships.forEach((relationship, index) => {
    const declared = pack.relationships.some(
      (record) =>
        record.fromId === relationship.fromId &&
        record.toId === relationship.toId &&
        record.interfaceType === relationship.interfaceType &&
        (record.interfaceName ?? null) === relationship.interfaceName &&
        record.mode === relationship.mode &&
        record.purpose === relationship.purpose &&
        sameSource(record.location, relationship.source)
    );

    if (!declared) {
      problems.push(`relationships.${index} relationship-not-declared`);
    }
  });

  context.rules.forEach((rule, index) => {
    const declared = pack.rules.some(
      (record) =>
        record.rule === rule.rule &&
        record.fromId === rule.fromId &&
        record.toId === rule.toId &&
        record.reason === rule.reason &&
        sameSource(record.location, rule.source)
    );

    if (!declared) {
      problems.push(`rules.${index} rule-not-declared`);
    }
  });

  const dictionary = ParticipantDictionary.fromPack(pack);

  context.newParticipants.forEach((participant, index) => {
    if (dictionary.impersonatesKnown(participant.displayName)) {
      problems.push(`newParticipants.${index}.displayName new-participant-impersonates-known`);
    }
  });

  return problems;
}

export type GroundedContextParseResult =
  | { readonly ok: true; readonly context: GroundedContext }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Strict validation; with a pack, known elements must match the pack exactly. Problems name paths and codes only. */
export function parseGroundedContext(value: unknown, pack?: KnowledgePack): GroundedContextParseResult {
  const parsed = groundedContextSchema.safeParse(value);

  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => {
      const path = issue.path.map((part) => String(part)).join(".");
      return `${path === "" ? "(root)" : path} ${issue.code === "custom" ? issue.message : issue.code}`;
    });
    return Object.freeze({ ok: false, problems: Object.freeze(uniqueSorted(problems)) });
  }

  const context: GroundedContext = parsed.data;

  if (pack !== undefined) {
    const problems = knowledgePackProblems(context, pack);

    if (problems.length > 0) {
      return Object.freeze({ ok: false, problems: Object.freeze(uniqueSorted(problems)) });
    }
  }

  return Object.freeze({ ok: true, context });
}

/** Match kinds in precedence order, re-exported for schema consumers. */
export const groundedMatchKinds = groundingMatchKinds;
