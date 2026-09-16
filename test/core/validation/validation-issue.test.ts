import { describe, expect, it } from "vitest";
import { createIssue } from "../../../src/core/knowledge-pack/source-errors.js";
import type { ValidationIssue as ModelValidationIssue } from "../../../src/core/model/types.js";
import {
  compareValidationIssues,
  createValidationIssue,
  fromExternalIssue,
  hasErrors,
  messageOf,
  severityOf,
  sortValidationIssues,
  validationIssueCodes,
  validationIssueLimits
} from "../../../src/core/validation/validation-issue.js";

describe("validation issue contract", () => {
  it("defines unique codes with a fixed severity and message", () => {
    expect(new Set(validationIssueCodes).size).toBe(validationIssueCodes.length);

    for (const code of validationIssueCodes) {
      expect(["error", "warning"]).toContain(severityOf(code));
      expect(messageOf(code).length).toBeGreaterThan(10);
    }

    expect(severityOf("ambiguous-reference")).toBe("error");
    expect(severityOf("new-participant-unconfirmed")).toBe("error");
    expect(severityOf("overlapping-reference")).toBe("warning");
    expect(severityOf("too-many-issues")).toBe("warning");
  });

  it("creates frozen issues with fixed messages and sorted details", () => {
    const issue = createValidationIssue("ambiguous-reference", {
      location: { file: "flows/demo.md", line: 8, column: 5, length: 7 },
      details: { mention: "control", candidates: ["flight-controller", "mission-control"] }
    });

    expect(issue).toEqual({
      severity: "error",
      code: "ambiguous-reference",
      message: messageOf("ambiguous-reference"),
      location: { file: "flows/demo.md", line: 8, column: 5, length: 7 },
      details: { candidates: ["flight-controller", "mission-control"], mention: "control" }
    });
    expect(Object.keys(issue.details ?? {})).toEqual(["candidates", "mention"]);
    expect(Object.isFrozen(issue)).toBe(true);
    expect(Object.isFrozen(issue.location)).toBe(true);
    expect(Object.isFrozen(issue.details?.candidates)).toBe(true);
    expect(Object.keys(createValidationIssue("no-participants", { location: {} }))).toEqual(["severity", "code", "message"]);
  });

  it("keeps the message fixed whatever the details are", () => {
    const first = createValidationIssue("new-participant-unconfirmed", { details: { newParticipant: "ground station" } });
    const second = createValidationIssue("new-participant-unconfirmed", { details: { newParticipant: "relay hut" } });
    expect(first.message).toBe(second.message);
    expect(first.message).not.toContain("ground station");
  });

  it("rejects unsafe locations and details as programming errors", () => {
    const create = (options: Parameters<typeof createValidationIssue>[1]) => () => createValidationIssue("no-participants", options);

    expect(create({ location: { file: "/abs/flow.md" } })).toThrow();
    expect(create({ location: { file: "C:/work/flow.md" } })).toThrow();
    expect(create({ location: { file: "../flow.md" } })).toThrow();
    expect(create({ location: { line: 0 } })).toThrow();
    expect(create({ location: { column: 1.5 } })).toThrow();
    expect(create({ location: { field: "Bad Field!" } })).toThrow();
    expect(create({ details: { mention: "a" + String.fromCharCode(0) } })).toThrow();
    expect(create({ details: { mention: "x".repeat(257) } })).toThrow();
    expect(create({ details: { "bad-key": 1 } })).toThrow();
    expect(create({ details: { list: Array.from({ length: 51 }, () => "a") } })).toThrow();
    expect(create({ details: { count: Number.NaN } })).toThrow();
    expect(create({ details: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`key${index}`, index])) })).toThrow();
    expect(create({ details: { mention: "x".repeat(256), count: 3, flag: true } })).not.toThrow();
  });

  it("maps knowledge-pack and front-matter issues without changing their own codes", () => {
    const upstream = createIssue("limit-exceeded", { file: "systems.md", line: 4, column: "canonical_name", limit: 256 });
    expect(fromExternalIssue("knowledge-pack", upstream)).toEqual({
      severity: "error",
      code: "knowledge-pack:limit-exceeded",
      message: upstream.message,
      location: { file: "systems.md", line: 4, field: "canonical_name" },
      details: { limit: 256 }
    });

    const warning = fromExternalIssue("knowledge-pack", {
      severity: "warning",
      code: "ignored-file",
      message: "A file that is not Markdown was ignored and not read.",
      file: "diagram.png"
    });
    expect(warning.severity).toBe("warning");
    expect(warning.location).toEqual({ file: "diagram.png" });

    const unsafe = fromExternalIssue("front-matter", {
      code: "invalid-front-matter",
      message: "bad" + String.fromCharCode(10) + "text",
      file: "/abs/flow.md",
      column: "Not Allowed!"
    });
    expect(unsafe.code).toBe("front-matter:invalid-front-matter");
    expect(unsafe.message).not.toContain("bad");
    expect(unsafe.location).toBeUndefined();
    expect(fromExternalIssue("front-matter", { code: "invalid-value", message: "x", line: 3, column: 7 }).location).toEqual({
      line: 3,
      column: 7
    });
    expect(() => fromExternalIssue("front-matter", { code: "Bad Code", message: "x" })).toThrow();
  });

  it("orders issues deterministically by file, line, column and code", () => {
    const issues = [
      createValidationIssue("no-participants"),
      createValidationIssue("overlapping-reference", { location: { file: "b.md", line: 1, column: 1, length: 2 } }),
      createValidationIssue("ambiguous-reference", { location: { file: "a.md", line: 9, column: 3, length: 4 } }),
      createValidationIssue("new-participant-empty", { location: { file: "a.md", line: 9, column: 1, length: 8 } }),
      createValidationIssue("new-participant-unsafe", { location: { file: "a.md", line: 2, column: 1, length: 8 } })
    ];
    const expected = [
      "new-participant-unsafe",
      "new-participant-empty",
      "ambiguous-reference",
      "overlapping-reference",
      "no-participants"
    ];

    expect([...issues].sort(compareValidationIssues).map((issue) => issue.code)).toEqual(expected);
    expect([...issues].reverse().sort(compareValidationIssues).map((issue) => issue.code)).toEqual(expected);
  });

  it("caps sorted issues with one warning marker", () => {
    const issues = Array.from({ length: 5 }, (_, index) =>
      createValidationIssue("new-participant-empty", { location: { line: index + 1 } })
    );
    const capped = sortValidationIssues(issues, 3);

    expect(capped.truncated).toBe(true);
    expect(capped.issues).toHaveLength(4);
    expect(capped.issues.slice(0, 3).map((issue) => issue.location?.line)).toEqual([1, 2, 3]);
    expect(capped.issues.at(-1)).toEqual(createValidationIssue("too-many-issues", { details: { limit: 3 } }));
    expect(sortValidationIssues(issues).truncated).toBe(false);
    expect(validationIssueLimits.defaultMaxIssues).toBe(100);
    expect(() => sortValidationIssues(issues, 0)).toThrow();
    expect(hasErrors(capped.issues)).toBe(true);
    expect(hasErrors([createValidationIssue("overlapping-reference")])).toBe(false);
  });

  it("is assignable to the model issue shape used by later stages", () => {
    const issue = createValidationIssue("overlapping-reference");
    const model: ModelValidationIssue = issue;
    expect(model.severity).toBe("warning");
    expect(model.code).toBe("overlapping-reference");
  });
});
