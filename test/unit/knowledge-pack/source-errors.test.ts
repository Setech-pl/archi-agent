import { describe, expect, it } from "vitest";
import {
  compareIssues,
  createIssue,
  formatIssue,
  IssueCollector,
  KnowledgePackError,
  knowledgePackErrorCodes,
  safeMessageFor
} from "../../../src/core/knowledge-pack/source-errors.js";

describe("knowledge-pack error model", () => {
  it("defines unique codes with a safe message for each", () => {
    expect(new Set(knowledgePackErrorCodes).size).toBe(knowledgePackErrorCodes.length);

    for (const code of knowledgePackErrorCodes) {
      expect(safeMessageFor(code).length).toBeGreaterThan(0);
    }

    for (const code of [
      "missing-file",
      "invalid-path",
      "limit-exceeded",
      "invalid-header",
      "unknown-column",
      "missing-column",
      "duplicate-column",
      "malformed-separator",
      "cell-count-mismatch",
      "empty-required-value",
      "invalid-identifier",
      "invalid-enum-value",
      "duplicate-record",
      "forbidden-markdown",
      "invalid-front-matter",
      "unknown-front-matter-key"
    ] as const) {
      expect(knowledgePackErrorCodes).toContain(code);
    }
  });

  it("creates frozen issues carrying only code, message and location", () => {
    const issue = createIssue("invalid-identifier", { file: "systems.md", line: 4, column: "id", limit: 64 });
    expect(issue).toEqual({
      code: "invalid-identifier",
      message: safeMessageFor("invalid-identifier"),
      file: "systems.md",
      line: 4,
      column: "id",
      limit: 64
    });
    expect(Object.isFrozen(issue)).toBe(true);
    expect(Object.keys(createIssue("cancelled"))).toEqual(["code", "message"]);
  });

  it("formats issues with location details and no source content", () => {
    const issue = createIssue("limit-exceeded", { file: "actors.md", line: 7, column: "description", limit: 2000 });
    expect(formatIssue(issue)).toBe(
      `limit-exceeded: ${safeMessageFor("limit-exceeded")} (file actors.md, line 7, column description, limit 2000)`
    );
    expect(formatIssue(createIssue("cancelled"))).toBe(`cancelled: ${safeMessageFor("cancelled")}`);
  });

  it("exposes the issue fields on a thrown error", () => {
    const error = new KnowledgePackError(createIssue("missing-file", { file: "rules.md" }));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("KnowledgePackError");
    expect(error.code).toBe("missing-file");
    expect(error.file).toBe("rules.md");
    expect(error.line).toBeUndefined();
    expect(error.message).toContain("missing-file");
  });

  it("orders issues deterministically by line, column and code", () => {
    const issues = [
      createIssue("invalid-identifier", { line: 5, column: "id" }),
      createIssue("empty-required-value", { line: 2, column: "kind" }),
      createIssue("cancelled"),
      createIssue("duplicate-record", { line: 2, column: "id" }),
      createIssue("invalid-enum-value", { line: 2, column: "kind" })
    ];
    const ordered = [...issues].sort(compareIssues).map((issue) => `${issue.line ?? "-"}:${issue.column ?? "-"}:${issue.code}`);
    expect(ordered).toEqual([
      "2:id:duplicate-record",
      "2:kind:empty-required-value",
      "2:kind:invalid-enum-value",
      "5:id:invalid-identifier",
      "-:-:cancelled"
    ]);
  });

  it("caps the number of collected issues with one final marker", () => {
    const collector = new IssueCollector(3, "systems.md");

    for (let line = 1; line <= 10; line += 1) {
      collector.add("invalid-identifier", { line, column: "id" });
    }

    const issues = collector.sorted();
    expect(collector.truncated).toBe(true);
    expect(issues).toHaveLength(4);
    expect(issues.at(-1)).toEqual(createIssue("too-many-issues", { file: "systems.md", limit: 3 }));
    expect(issues.slice(0, 3).map((issue) => issue.line)).toEqual([1, 2, 3]);
  });

  it("does not truncate below the limit", () => {
    const collector = new IssueCollector(3);
    collector.add("missing-table");
    expect(collector.truncated).toBe(false);
    expect(collector.sorted()).toEqual([createIssue("missing-table")]);
  });
});
