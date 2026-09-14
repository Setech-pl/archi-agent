import {
  knowledgePackTables,
  parseKnowledgePackTable,
  type ActorRecord,
  type AliasRecord,
  type KnowledgePack,
  type KnowledgePackTableKind,
  type RelationshipRecord,
  type RuleRecord,
  type SystemRecord
} from "../../src/core/knowledge-pack/knowledge-pack.schema.js";

/**
 * Builders for a small, neutral, fully synthetic pack describing an observatory. Tests replace
 * single sections to create the case they need.
 */

export type TableRows = readonly (readonly string[])[];
export type PackRows = { readonly [K in KnowledgePackTableKind]: TableRows };
export type PackTexts = Readonly<Record<string, string>>;

const LF = String.fromCharCode(10);

export const basePackRows: PackRows = Object.freeze({
  systems: [
    ["telescope-scheduler", "Telescope Scheduler", "service", "Plans observation slots"],
    ["dome-controller", "Dome Controller", "system", "Rotates and opens the dome"],
    ["image-archive", "Image Archive", "database", "Stores captured frames"]
  ],
  actors: [["night-observer", "Night Observer", "role", "Runs the observation plan"]],
  relationships: [
    ["night-observer", "telescope-scheduler", "INTERNAL", "Scheduler Console", "synchronous", "Requests observation slots"],
    ["telescope-scheduler", "dome-controller", "EVENT", "", "asynchronous", "Signals the next pointing"],
    ["telescope-scheduler", "image-archive", "DB", "Archive Writer", "synchronous", "Registers captured frames"]
  ],
  aliases: [
    ["Scheduler", "telescope-scheduler"],
    ["Archive", "image-archive"]
  ],
  rules: [
    ["forbid", "night-observer", "dome-controller", "The dome moves only through the scheduler"],
    ["require", "telescope-scheduler", "image-archive", "Every frame is archived"]
  ]
});

/** Renders one pack table as strict Markdown. */
export function tableText(kind: KnowledgePackTableKind, rows: TableRows): string {
  const columns: readonly string[] = knowledgePackTables[kind].columns;
  const line = (cells: readonly string[]): string => "| " + cells.join(" | ") + " |";
  return [line(columns), line(columns.map(() => "---")), ...rows.map(line), ""].join(LF);
}

/** File contents of a valid pack; sections given in overrides replace the base rows. */
export function buildPackFiles(overrides: Partial<PackRows> = {}): PackTexts {
  const rows: PackRows = { ...basePackRows, ...overrides };
  const files: Record<string, string> = {};

  for (const kind of Object.keys(knowledgePackTables) as KnowledgePackTableKind[]) {
    files[knowledgePackTables[kind].file] = tableText(kind, rows[kind]);
  }

  return Object.freeze(files);
}

/** Parsed, validated records of the fixture pack. Throws if an override makes a table invalid. */
export function buildPackFixture(overrides: Partial<PackRows> = {}): KnowledgePack {
  const files = buildPackFiles(overrides);
  const parse = <K extends KnowledgePackTableKind>(kind: K) => {
    const result = parseKnowledgePackTable(kind, files[knowledgePackTables[kind].file] ?? "");

    if (!result.ok) {
      throw new Error(`Fixture table ${kind} is invalid.`);
    }

    return result.records;
  };

  return Object.freeze({
    systems: parse("systems"),
    actors: parse("actors"),
    relationships: parse("relationships"),
    aliases: parse("aliases"),
    rules: parse("rules")
  });
}

export function systemRecord(id: string, canonicalName: string, line = 3): SystemRecord {
  return { id, canonicalName, kind: "system", description: "Synthetic system", location: { file: "systems.md", line } };
}

export function actorRecord(id: string, canonicalName: string, line = 3): ActorRecord {
  return { id, canonicalName, kind: "role", description: "Synthetic actor", location: { file: "actors.md", line } };
}

export function aliasRecord(alias: string, targetId: string, line = 3): AliasRecord {
  return { alias, targetId, location: { file: "aliases.md", line } };
}

export function relationshipRecord(
  fromId: string,
  toId: string,
  details: Partial<Pick<RelationshipRecord, "interfaceType" | "interfaceName" | "mode" | "purpose">> = {},
  line = 3
): RelationshipRecord {
  return {
    fromId,
    toId,
    interfaceType: details.interfaceType ?? "EVENT",
    interfaceName: details.interfaceName,
    mode: details.mode ?? "asynchronous",
    purpose: details.purpose ?? "Synthetic purpose",
    location: { file: "relationships.md", line }
  };
}

export function ruleRecord(rule: RuleRecord["rule"], fromId: string, toId: string, reason = "Synthetic reason", line = 3): RuleRecord {
  return { rule, fromId, toId, reason, location: { file: "rules.md", line } };
}
