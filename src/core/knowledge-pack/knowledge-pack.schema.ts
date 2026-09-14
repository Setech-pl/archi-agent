import { z } from "zod";
import { parseMarkdownTable, type ParsedTable } from "./markdown-table-parser.js";
import {
  IssueCollector,
  knowledgePackErrorCodes,
  type KnowledgePackErrorCode,
  type KnowledgePackIssue
} from "./source-errors.js";
import { countUnicodeCharacters, knowledgePackLimits } from "./source-limits.js";

/**
 * Record schemas for the five knowledge-pack tables. They validate single records and duplicates
 * detectable inside one file. Checks that need several files (referenced identifiers, identifier
 * clashes between systems and actors, alias targets, conflicting rules) belong to the loader.
 *
 * These types are intentionally independent of src/core/model/types.ts. A later mapping step will
 * translate them explicitly, for example REST_API to the model interface type and system or actor
 * kinds to participant kinds; no implicit conversion happens here.
 */

export const systemKinds = ["system", "service", "database", "queue", "external"] as const;
export const actorKinds = ["person", "role", "external"] as const;
export const interfaceTypes = ["REST_API", "SOAP", "EVENT", "FILE", "DB", "INTERNAL"] as const;
export const interactionModes = ["synchronous", "asynchronous"] as const;
export const ruleTypes = ["forbid", "require"] as const;

export type SystemKind = (typeof systemKinds)[number];
export type ActorKind = (typeof actorKinds)[number];
export type InterfaceType = (typeof interfaceTypes)[number];
export type InteractionMode = (typeof interactionModes)[number];
export type RuleType = (typeof ruleTypes)[number];

const identifierPattern = /^[a-z][a-z0-9-]*$/;

export function isKnowledgePackIdentifier(value: string): boolean {
  return value.length <= knowledgePackLimits.maxIdentifierChars && identifierPattern.test(value);
}

const codePrefix = "kp:";
type Check = readonly [(value: string) => boolean, KnowledgePackErrorCode];

function checkedText(checks: readonly Check[]) {
  return z.string().superRefine((value, context) => {
    for (const [passes, code] of checks) {
      if (!passes(value)) {
        context.addIssue({ code: "custom", message: codePrefix + code });
        return;
      }
    }
  });
}

const required: Check = [(value) => value.length > 0, "empty-required-value"];
const within = (limit: number): Check => [(value) => countUnicodeCharacters(value) <= limit, "limit-exceeded"];

const identifierField = checkedText([
  required,
  within(knowledgePackLimits.maxIdentifierChars),
  [(value) => identifierPattern.test(value), "invalid-identifier"]
]);
const canonicalNameField = checkedText([required, within(knowledgePackLimits.maxCanonicalNameChars)]);
const textField = checkedText([required, within(knowledgePackLimits.maxCellChars)]);
const optionalNameField = checkedText([within(knowledgePackLimits.maxCanonicalNameChars)]).transform((value) =>
  value === "" ? undefined : value
);
const enumMessage = codePrefix + "invalid-enum-value";

export const systemRowSchema = z.strictObject({
  id: identifierField,
  canonical_name: canonicalNameField,
  kind: checkedText([required]).pipe(z.enum(systemKinds, enumMessage)),
  description: textField
});

export const actorRowSchema = z.strictObject({
  id: identifierField,
  canonical_name: canonicalNameField,
  kind: checkedText([required]).pipe(z.enum(actorKinds, enumMessage)),
  description: textField
});

export const relationshipRowSchema = z.strictObject({
  from_id: identifierField,
  to_id: identifierField,
  interface_type: checkedText([required]).pipe(z.enum(interfaceTypes, enumMessage)),
  interface_name: optionalNameField,
  mode: checkedText([required]).pipe(z.enum(interactionModes, enumMessage)),
  purpose: textField
});

export const aliasRowSchema = z.strictObject({
  alias: canonicalNameField,
  target_id: identifierField
});

export const ruleRowSchema = z.strictObject({
  rule: checkedText([required]).pipe(z.enum(ruleTypes, enumMessage)),
  from_id: identifierField,
  to_id: identifierField,
  reason: textField
});

/** Names used in the implementation plan. */
export const systemsSchema = systemRowSchema;
export const actorsSchema = actorRowSchema;
export const relationshipsSchema = relationshipRowSchema;
export const aliasesSchema = aliasRowSchema;
export const rulesSchema = ruleRowSchema;

export type SystemRowInput = z.input<typeof systemRowSchema>;
export type ActorRowInput = z.input<typeof actorRowSchema>;
export type RelationshipRowInput = z.input<typeof relationshipRowSchema>;
export type AliasRowInput = z.input<typeof aliasRowSchema>;
export type RuleRowInput = z.input<typeof ruleRowSchema>;

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
}

export interface SystemRecord {
  readonly id: string;
  readonly canonicalName: string;
  readonly kind: SystemKind;
  readonly description: string;
  readonly location: SourceLocation;
}

export interface ActorRecord {
  readonly id: string;
  readonly canonicalName: string;
  readonly kind: ActorKind;
  readonly description: string;
  readonly location: SourceLocation;
}

export interface RelationshipRecord {
  readonly fromId: string;
  readonly toId: string;
  readonly interfaceType: InterfaceType;
  readonly interfaceName: string | undefined;
  readonly mode: InteractionMode;
  readonly purpose: string;
  readonly location: SourceLocation;
}

export interface AliasRecord {
  readonly alias: string;
  readonly targetId: string;
  readonly location: SourceLocation;
}

export interface RuleRecord {
  readonly rule: RuleType;
  readonly fromId: string;
  readonly toId: string;
  readonly reason: string;
  readonly location: SourceLocation;
}

/** Validated content of one pack, assembled by the loader in a later phase. */
export interface KnowledgePack {
  readonly systems: readonly SystemRecord[];
  readonly actors: readonly ActorRecord[];
  readonly relationships: readonly RelationshipRecord[];
  readonly aliases: readonly AliasRecord[];
  readonly rules: readonly RuleRecord[];
}

export const knowledgePackTables = Object.freeze({
  systems: Object.freeze({
    file: "systems.md",
    columns: Object.freeze(["id", "canonical_name", "kind", "description"] as const),
    optionalColumns: Object.freeze([] as const)
  }),
  actors: Object.freeze({
    file: "actors.md",
    columns: Object.freeze(["id", "canonical_name", "kind", "description"] as const),
    optionalColumns: Object.freeze([] as const)
  }),
  relationships: Object.freeze({
    file: "relationships.md",
    columns: Object.freeze(["from_id", "to_id", "interface_type", "interface_name", "mode", "purpose"] as const),
    optionalColumns: Object.freeze(["interface_name"] as const)
  }),
  aliases: Object.freeze({
    file: "aliases.md",
    columns: Object.freeze(["alias", "target_id"] as const),
    optionalColumns: Object.freeze([] as const)
  }),
  rules: Object.freeze({
    file: "rules.md",
    columns: Object.freeze(["rule", "from_id", "to_id", "reason"] as const),
    optionalColumns: Object.freeze([] as const)
  })
});

export type KnowledgePackTableKind = keyof typeof knowledgePackTables;

export interface RecordByTable {
  readonly systems: SystemRecord;
  readonly actors: ActorRecord;
  readonly relationships: RelationshipRecord;
  readonly aliases: AliasRecord;
  readonly rules: RuleRecord;
}

export interface TableValidationResult<TRecord> {
  readonly ok: boolean;
  readonly records: readonly TRecord[];
  readonly issues: readonly KnowledgePackIssue[];
  readonly truncated: boolean;
}

export interface ValidationOptions {
  readonly maxIssues?: number;
}

const fieldLimits: Readonly<Record<string, number>> = Object.freeze({
  id: knowledgePackLimits.maxIdentifierChars,
  from_id: knowledgePackLimits.maxIdentifierChars,
  to_id: knowledgePackLimits.maxIdentifierChars,
  target_id: knowledgePackLimits.maxIdentifierChars,
  canonical_name: knowledgePackLimits.maxCanonicalNameChars,
  alias: knowledgePackLimits.maxCanonicalNameChars,
  interface_name: knowledgePackLimits.maxCanonicalNameChars,
  description: knowledgePackLimits.maxCellChars,
  purpose: knowledgePackLimits.maxCellChars,
  reason: knowledgePackLimits.maxCellChars
});

interface SchemaIssueLike {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

function toErrorCode(issue: SchemaIssueLike): KnowledgePackErrorCode {
  if (issue.message.startsWith(codePrefix)) {
    const code = issue.message.slice(codePrefix.length);

    if ((knowledgePackErrorCodes as readonly string[]).includes(code)) {
      return code as KnowledgePackErrorCode;
    }
  }

  return issue.code === "unrecognized_keys" ? "unknown-field" : "invalid-value";
}

function validateRows<TData, TRecord>(
  table: ParsedTable,
  kind: KnowledgePackTableKind,
  schema: z.ZodType<TData>,
  toRecord: (data: TData, location: SourceLocation) => TRecord,
  duplicateKey: (record: TRecord) => string,
  duplicateColumn: string,
  options: ValidationOptions
): TableValidationResult<TRecord> {
  const definition = knowledgePackTables[kind];

  if (
    table.file !== definition.file ||
    table.columns.length !== definition.columns.length ||
    table.columns.some((column, index) => column !== definition.columns[index])
  ) {
    throw new Error("Parsed table does not match the requested schema.");
  }

  const issues = new IssueCollector(options.maxIssues ?? knowledgePackLimits.maxReportedIssues, table.file);
  const columns: readonly string[] = definition.columns;
  const records: TRecord[] = [];
  const seen = new Set<string>();

  for (const row of table.rows) {
    const parsed = schema.safeParse(row.values);

    if (!parsed.success) {
      const rowIssues = parsed.error.issues.map((issue) => {
        const field = typeof issue.path[0] === "string" && columns.includes(issue.path[0]) ? issue.path[0] : undefined;
        const code = toErrorCode(issue);
        return { code, field, order: field === undefined ? -1 : columns.indexOf(field) };
      });

      rowIssues.sort((left, right) => left.order - right.order || (left.code < right.code ? -1 : left.code > right.code ? 1 : 0));

      for (const item of rowIssues) {
        issues.add(item.code, {
          line: row.line,
          ...(item.field === undefined ? {} : { column: item.field }),
          ...(item.code === "limit-exceeded" && item.field !== undefined ? { limit: fieldLimits[item.field] } : {})
        });
      }

      continue;
    }

    const record = toRecord(parsed.data, Object.freeze({ file: table.file, line: row.line }));
    const key = duplicateKey(record);

    if (seen.has(key)) {
      issues.add("duplicate-record", { line: row.line, column: duplicateColumn });
      continue;
    }

    seen.add(key);
    records.push(Object.freeze(record));
  }

  const sorted = issues.sorted();
  return { ok: sorted.length === 0, records: Object.freeze(records), issues: sorted, truncated: issues.truncated };
}

export function validateSystemsTable(table: ParsedTable, options: ValidationOptions = {}) {
  return validateRows(
    table,
    "systems",
    systemRowSchema,
    (data, location): SystemRecord => ({
      id: data.id,
      canonicalName: data.canonical_name,
      kind: data.kind,
      description: data.description,
      location
    }),
    (record) => record.id,
    "id",
    options
  );
}

export function validateActorsTable(table: ParsedTable, options: ValidationOptions = {}) {
  return validateRows(
    table,
    "actors",
    actorRowSchema,
    (data, location): ActorRecord => ({
      id: data.id,
      canonicalName: data.canonical_name,
      kind: data.kind,
      description: data.description,
      location
    }),
    (record) => record.id,
    "id",
    options
  );
}

export function validateRelationshipsTable(table: ParsedTable, options: ValidationOptions = {}) {
  return validateRows(
    table,
    "relationships",
    relationshipRowSchema,
    (data, location): RelationshipRecord => ({
      fromId: data.from_id,
      toId: data.to_id,
      interfaceType: data.interface_type,
      interfaceName: data.interface_name,
      mode: data.mode,
      purpose: data.purpose,
      location
    }),
    (record) =>
      JSON.stringify([record.fromId, record.toId, record.interfaceType, record.interfaceName ?? "", record.mode]),
    "from_id",
    options
  );
}

/**
 * Several aliases may point to one target, and one alias may point to several targets; the latter is
 * kept as declared ambiguity and never resolved here. Only an exact alias and target repetition is
 * a duplicate.
 */
export function validateAliasesTable(table: ParsedTable, options: ValidationOptions = {}) {
  return validateRows(
    table,
    "aliases",
    aliasRowSchema,
    (data, location): AliasRecord => ({ alias: data.alias, targetId: data.target_id, location }),
    (record) => JSON.stringify([record.alias, record.targetId]),
    "alias",
    options
  );
}

export function validateRulesTable(table: ParsedTable, options: ValidationOptions = {}) {
  return validateRows(
    table,
    "rules",
    ruleRowSchema,
    (data, location): RuleRecord => ({
      rule: data.rule,
      fromId: data.from_id,
      toId: data.to_id,
      reason: data.reason,
      location
    }),
    (record) => JSON.stringify([record.rule, record.fromId, record.toId]),
    "rule",
    options
  );
}

/** Parses one table file and validates its records in a single deterministic step. */
export function parseKnowledgePackTable<TKind extends KnowledgePackTableKind>(
  kind: TKind,
  text: string,
  options: ValidationOptions = {}
): TableValidationResult<RecordByTable[TKind]> {
  const definition = knowledgePackTables[kind];
  const parsed = parseMarkdownTable(text, {
    file: definition.file,
    columns: definition.columns,
    optionalColumns: definition.optionalColumns,
    ...(options.maxIssues === undefined ? {} : { maxIssues: options.maxIssues })
  });

  if (!parsed.ok) {
    return { ok: false, records: Object.freeze([]), issues: parsed.issues, truncated: parsed.truncated };
  }

  const validators: { readonly [K in KnowledgePackTableKind]: (table: ParsedTable) => TableValidationResult<RecordByTable[K]> } = {
    systems: (table) => validateSystemsTable(table, options),
    actors: (table) => validateActorsTable(table, options),
    relationships: (table) => validateRelationshipsTable(table, options),
    aliases: (table) => validateAliasesTable(table, options),
    rules: (table) => validateRulesTable(table, options)
  };

  return validators[kind](parsed.table);
}
