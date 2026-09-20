import { stableCompare } from "../../util/ordering.js";
import { knowledgePackFileNames, type KnowledgePackFileName } from "../knowledge-pack-source.js";
import { knowledgePackTables, type KnowledgePackTableKind } from "../knowledge-pack.schema.js";
import { containsForbiddenMarkup } from "../markdown-table-parser.js";
import { containsControlCharacter } from "../source-limits.js";
import { knowledgePackTableKinds, type KnowledgePackRows } from "./knowledge-pack-candidate.js";

/**
 * Deterministic renderer of the five knowledge-pack files. It is the only producer of pack
 * Markdown: the output depends only on the given rows, never on locale, platform or input order,
 * and always uses LF line endings. Each file has a level-1 heading, a blank line, the header, the
 * separator and one line per row; a table without rows keeps its header and separator.
 *
 * The renderer does not validate records. It refuses values it cannot represent safely (non-string
 * values, control characters, forbidden markup) with an error that never contains the value;
 * callers validate drafts first.
 */

export interface KnowledgePackDocument {
  readonly file: KnowledgePackFileName;
  readonly text: string;
}

export interface KnowledgePackTableLayout {
  readonly kind: KnowledgePackTableKind;
  readonly file: KnowledgePackFileName;
  readonly text: string;
  /** Line number of the first data row. */
  readonly firstDataLine: number;
  /** For each rendered row in output order, the index of that row in the input list. */
  readonly rowOrder: readonly number[];
}

const LF = String.fromCharCode(10);
const BACKSLASH = String.fromCharCode(92);
const PIPE = "|";
const firstDataLine = 5;

const headings: Readonly<Record<KnowledgePackTableKind, string>> = Object.freeze({
  systems: "Systems",
  actors: "Actors",
  relationships: "Relationships",
  aliases: "Aliases",
  rules: "Rules"
});

/** Escapes a cell for the pack table parser: a backslash and a pipe are each preceded by a backslash. */
export function escapeKnowledgePackCell(value: string): string {
  let escaped = "";

  for (const character of value) {
    if (character === BACKSLASH || character === PIPE) {
      escaped += BACKSLASH;
    }

    escaped += character;
  }

  return escaped;
}

function rowLine(cells: readonly string[]): string {
  return PIPE + " " + cells.join(" " + PIPE + " ") + " " + PIPE;
}

function cellValues(kind: KnowledgePackTableKind, row: unknown): readonly string[] {
  const columns: readonly string[] = knowledgePackTables[kind].columns;

  if (typeof row !== "object" || row === null || Object.keys(row).length !== columns.length) {
    throw new Error("Knowledge-pack row does not match the table columns.");
  }

  return columns.map((column) => {
    const value: unknown = (row as Record<string, unknown>)[column];

    if (typeof value !== "string") {
      throw new Error("Knowledge-pack row does not match the table columns.");
    }

    if (containsControlCharacter(value) || containsForbiddenMarkup(value)) {
      throw new Error("Knowledge-pack row contains a value that cannot be rendered.");
    }

    return value;
  });
}

function compareCells(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const order = stableCompare(left[index] ?? "", right[index] ?? "");

    if (order !== 0) {
      return order;
    }
  }

  return 0;
}

/** Renders the five tables with rows sorted by their cells in column order. */
export function layoutKnowledgePack(rows: KnowledgePackRows): readonly KnowledgePackTableLayout[] {
  return Object.freeze(
    knowledgePackTableKinds.map((kind, tableIndex) => {
      const definition = knowledgePackTables[kind];
      const file = knowledgePackFileNames[tableIndex]!;

      if (file !== definition.file) {
        throw new Error("Knowledge-pack table order does not match the pack file order.");
      }

      const values = rows[kind].map((row) => cellValues(kind, row));
      const rowOrder = values
        .map((_cells, index) => index)
        .sort((left, right) => compareCells(values[left]!, values[right]!) || left - right);
      const lines = [
        "# " + headings[kind],
        "",
        rowLine(definition.columns),
        rowLine(definition.columns.map(() => "---")),
        ...rowOrder.map((index) => rowLine(values[index]!.map(escapeKnowledgePackCell)))
      ];

      return Object.freeze({
        kind,
        file,
        text: lines.join(LF) + LF,
        firstDataLine,
        rowOrder: Object.freeze(rowOrder)
      });
    })
  );
}

/** Exactly five documents in the fixed pack file order. */
export function renderKnowledgePack(rows: KnowledgePackRows): readonly KnowledgePackDocument[] {
  return Object.freeze(layoutKnowledgePack(rows).map((layout) => Object.freeze({ file: layout.file, text: layout.text })));
}
