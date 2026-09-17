import { describe, expect, it } from "vitest";
import { parseMarkdownTable, type MarkdownTableOptions } from "../../../src/core/knowledge-pack/markdown-table-parser.js";

const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);
const BACKSLASH = String.fromCharCode(92);
const options: MarkdownTableOptions = { file: "systems.md", columns: ["id", "canonical_name", "kind", "description"] };
const header = "| id | canonical_name | kind | description |";
const separator = "| --- | --- | --- | --- |";
const rowA = "| telemetry-gateway | Telemetry Gateway | service | Receives spacecraft telemetry |";
const rowB = "| command-queue | Command Queue | queue | Buffers uplink commands |";

function parse(lines: readonly string[], overrides: Partial<MarkdownTableOptions> = {}, newline = LF) {
  return parseMarkdownTable(lines.join(newline), { ...options, ...overrides });
}

function codes(lines: readonly string[], overrides: Partial<MarkdownTableOptions> = {}): string[] {
  return parse(lines, overrides).issues.map((issue) => issue.code);
}

describe("parseMarkdownTable - valid input", () => {
  it("parses a table with an optional level-1 heading and keeps line numbers", () => {
    const result = parse(["# Systems", "", header, separator, rowA, rowB, ""]);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.table.headerLine).toBe(3);
      expect(result.table.rows.map((row) => row.line)).toEqual([5, 6]);
      expect(result.table.rows[0]?.values).toEqual({
        id: "telemetry-gateway",
        canonical_name: "Telemetry Gateway",
        kind: "service",
        description: "Receives spacecraft telemetry"
      });
      expect(result.table.rows[1]?.cells.map((cell) => [cell.index, cell.column])).toEqual([
        [0, "id"],
        [1, "canonical_name"],
        [2, "kind"],
        [3, "description"]
      ]);
    }
  });

  it("accepts CRLF line endings with identical results", () => {
    const lf = parse([header, separator, rowA, rowB]);
    const crlf = parse([header, separator, rowA, rowB], {}, CRLF);
    expect(crlf).toEqual(lf);
    expect(crlf.ok).toBe(true);
  });

  it("works without a heading and with surrounding blank lines", () => {
    const result = parse(["", "", header, separator, rowA, "", ""]);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.table.rows[0]?.line).toBe(5);
    }
  });

  it("turns an escaped pipe into a literal pipe and an escaped backslash into one backslash", () => {
    const cell = "Input " + BACKSLASH + "| output and " + BACKSLASH + BACKSLASH + " path";
    const result = parse([header, separator, `| flight-plan-store | Flight Plan Store | database | ${cell} |`]);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.table.rows[0]?.values.description).toBe("Input | output and " + BACKSLASH + " path");
    }
  });

  it("preserves Unicode text including Polish letters and characters outside the basic plane", () => {
    const polish = String.fromCodePoint(0x0141, 0x0105, 0x0107, 0x0119, 0x017c);
    const astral = String.fromCodePoint(0x1f680);
    const result = parse([header, separator, `| orbit-planner | Orbit ${polish} Planner | system | Plans ${astral} orbits |`]);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.table.rows[0]?.values.canonical_name).toBe(`Orbit ${polish} Planner`);
      expect(result.table.rows[0]?.values.description).toBe(`Plans ${astral} orbits`);
    }
  });

  it("allows empty cells only in optional columns", () => {
    const optional = parse([header, separator, "| telemetry-gateway | Telemetry Gateway | service |  |"], {
      optionalColumns: ["description"]
    });
    expect(optional.ok).toBe(true);

    if (optional.ok) {
      expect(optional.table.rows[0]?.values.description).toBe("");
    }

    const required = parse([header, separator, "| telemetry-gateway | Telemetry Gateway | service |  |"]);
    expect(required.issues).toEqual([
      expect.objectContaining({ code: "empty-required-value", line: 3, column: "description" })
    ]);
  });

  it("is deterministic", () => {
    const lines = [header, separator, rowA, "| broken", "| a | b |"];
    expect(parse(lines)).toEqual(parse(lines));
  });
});

describe("parseMarkdownTable - document layout", () => {
  it("reports a missing table", () => {
    expect(codes(["# Systems", ""])).toEqual(["missing-table"]);
    expect(codes([""])).toEqual(["missing-table"]);
  });

  it("reports a second table", () => {
    expect(codes([header, separator, rowA, "", header, separator, rowB])).toEqual(["multiple-tables"]);
  });

  it("rejects free text before or after the table and extra headings", () => {
    expect(parse(["Introduction text", header, separator, rowA]).issues[0]).toMatchObject({
      code: "unexpected-content",
      line: 1
    });
    expect(codes([header, separator, rowA, "", "Trailing notes"])).toEqual(["unexpected-content"]);
    expect(codes(["# One", "# Two", header, separator, rowA])).toEqual(["unexpected-content"]);
    expect(codes(["## Systems", header, separator, rowA])).toEqual(["unexpected-content"]);
  });

  it("rejects code fences and HTML lines", () => {
    expect(codes(["```", header, separator, rowA, "```"])).toEqual(["forbidden-markdown", "forbidden-markdown"]);
    expect(codes(["<div>", header, separator, rowA])).toEqual(["forbidden-markdown"]);
  });

  it("requires at least one data row", () => {
    expect(codes([header, separator])).toEqual(["no-data-rows"]);
    expect(codes([header, separator], { allowEmpty: false })).toEqual(["no-data-rows"]);
  });

  it("accepts a table without data rows only when explicitly allowed", () => {
    const result = parse(["# Systems", "", header, separator, ""], { allowEmpty: true });
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.table.rows).toEqual([]);
      expect(result.table.headerLine).toBe(3);
    }

    expect(codes([header], { allowEmpty: true })).toEqual(["malformed-separator"]);
    expect(codes([header, "| --- |"], { allowEmpty: true })).toEqual(["malformed-separator"]);
  });
});

describe("parseMarkdownTable - header and separator", () => {
  it("reports a malformed or missing separator", () => {
    expect(codes([header, "| - | --- | --- | --- |", rowA])).toEqual(["malformed-separator"]);
    expect(codes([header, "| --- | --- | --- |", rowA])).toEqual(["malformed-separator"]);
    expect(codes([header])).toEqual(["malformed-separator"]);
  });

  it("reports missing, unknown, duplicated and reordered columns", () => {
    expect(parse(["| id | canonical_name | kind |", "| --- | --- | --- |", "| a | b | c |"]).issues).toEqual([
      expect.objectContaining({ code: "missing-column", column: "description" })
    ]);
    expect(
      parse(["| id | canonical_name | kind | notes |", separator, "| a | b | c | d |"]).issues.map((issue) => [
        issue.code,
        issue.column
      ])
    ).toEqual([
      ["missing-column", "description"],
      ["unknown-column", "position 4"]
    ]);
    expect(
      parse(["| id | id | kind | description |", separator, "| a | b | c | d |"]).issues.map((issue) => [
        issue.code,
        issue.column
      ])
    ).toEqual([
      ["missing-column", "canonical_name"],
      ["duplicate-column", "id"]
    ]);
    expect(codes(["| canonical_name | id | kind | description |", separator, rowA])).toEqual(["column-order"]);
  });

  it("does not echo unknown column names", () => {
    const result = parse(["| id | canonical_name | kind | secretive_header_marker |", separator, rowA]);
    expect(JSON.stringify(result.issues)).not.toContain("secretive_header_marker");
  });
});

describe("parseMarkdownTable - rows", () => {
  it("reports too few, too many and unterminated rows", () => {
    expect(codes([header, separator, "| a | b | c |"])).toEqual(["cell-count-mismatch"]);
    expect(codes([header, separator, "| a | b | c | d | e |"])).toEqual(["cell-count-mismatch"]);
    expect(codes([header, separator, "| a | b | c | d"])).toEqual(["malformed-row"]);
    expect(codes([header, separator, "| a | b | c | d " + BACKSLASH + "|"])).toEqual(["malformed-row"]);
  });

  it("enforces the row limit", () => {
    const result = parse([header, separator, rowA, rowB, rowA], { maxRows: 2 });
    expect(result.issues).toEqual([expect.objectContaining({ code: "limit-exceeded", line: 5, limit: 2 })]);
  });

  it("accepts exactly the default row limit and rejects one more row", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => `| s${index} | Name | system | Text |`);
    expect(parse([header, separator, ...rows]).ok).toBe(true);
    expect(parse([header, separator, ...rows, rowA]).issues).toEqual([
      expect.objectContaining({ code: "limit-exceeded", limit: 10_000 })
    ]);
  });

  it("enforces the cell length limit in Unicode characters", () => {
    const astral = String.fromCodePoint(0x1f680);
    expect(parse([header, separator, `| a | b | c | ${"x".repeat(2000)} |`]).ok).toBe(true);
    expect(parse([header, separator, `| a | b | c | ${astral.repeat(2000)} |`]).ok).toBe(true);
    expect(parse([header, separator, `| a | b | c | ${"x".repeat(2001)} |`]).issues).toEqual([
      expect.objectContaining({ code: "limit-exceeded", line: 3, column: "description", limit: 2000 })
    ]);
  });

  it("rejects HTML, images, directives, templates and inline fences inside cells", () => {
    for (const value of ["<b>bold</b>", "<https:>", "![logo](logo.png)", "!include other", "@startuml", "{{name}}", "$" + "{name}", "```code```"]) {
      expect(parse([header, separator, `| a | b | c | ${value} |`]).issues).toEqual([
        expect.objectContaining({ code: "forbidden-markdown", column: "description" })
      ]);
    }

    expect(parse([header, separator, "| a | b | c | Load < 5 and ratio > 1 |"]).ok).toBe(true);
  });

  it("rejects control characters including tabs, NUL, a lone CR and bidirectional overrides", () => {
    for (const code of [9, 0, 13, 0x202e, 0x2066]) {
      const value = "left" + String.fromCharCode(code) + "right";
      expect(codes([header, separator, `| a | b | c | ${value} |`])).toEqual(["control-character"]);
    }
  });

  it("rejects text that certainly exceeds the file limit", () => {
    expect(parseMarkdownTable("a".repeat(1024 * 1024 + 1), options).issues).toEqual([
      expect.objectContaining({ code: "limit-exceeded", limit: 1024 * 1024 })
    ]);
  });

  it("caps the number of reported issues", () => {
    const rows = Array.from({ length: 50 }, () => "| a | b | c |");
    const result = parse([header, separator, ...rows], { maxIssues: 5 });
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.truncated).toBe(true);
    }

    expect(result.issues).toHaveLength(6);
    expect(result.issues.at(-1)?.code).toBe("too-many-issues");
  });

  it("never includes cell values in issues", () => {
    const marker = "unique-cell-marker-value";
    const result = parse([header, separator, `| ${marker} | ${marker} | ${marker} |`, `| a | b | c | <i>${marker}</i> |`]);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.issues)).not.toContain(marker);
  });

  it("rejects invalid schema options as a programming error", () => {
    expect(() => parseMarkdownTable(header, { file: "x.md", columns: ["id", "id"] })).toThrow();
    expect(() => parseMarkdownTable(header, { file: "x.md", columns: [] })).toThrow();
    expect(() => parseMarkdownTable(header, { file: "x.md", columns: ["id"], optionalColumns: ["other"] })).toThrow();
  });
});
