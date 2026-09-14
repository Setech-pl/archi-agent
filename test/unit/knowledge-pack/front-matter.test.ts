import { describe, expect, it } from "vitest";
import { defaultFlowLanguage, parseFrontMatter } from "../../../src/core/knowledge-pack/front-matter.js";

const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);
const doc = (...lines: string[]): string => lines.join(LF);
const validHead = ["---", "diagram_name: orbit-transfer", "flow_name: Orbit transfer", "author: Flight Team"];

function codesFor(text: string): string[] {
  return parseFrontMatter(text).issues.map((issue) => issue.code);
}

function withAuthor(value: string): string {
  return doc("---", "diagram_name: orbit-transfer", "flow_name: Orbit transfer", `author: ${value}`, "---", "Body");
}

describe("parseFrontMatter - valid input", () => {
  it("reads all four keys and returns the body with its start line", () => {
    const result = parseFrontMatter(doc(...validHead, "language: pl", "---", "Operator sends a command.", "Gateway replies."));
    expect(result.ok).toBe(true);
    expect(result.metadata).toEqual({
      diagramName: "orbit-transfer",
      flowName: "Orbit transfer",
      author: "Flight Team",
      language: "pl"
    });
    expect(result.body).toBe(doc("Operator sends a command.", "Gateway replies."));
    expect(result.bodyStartLine).toBe(7);
    expect(result.issues).toEqual([]);
  });

  it("defaults the language to en", () => {
    const result = parseFrontMatter(doc(...validHead, "---", "Body"));
    expect(defaultFlowLanguage).toBe("en");
    expect(result.metadata?.language).toBe("en");
    expect(result.bodyStartLine).toBe(6);
  });

  it("accepts CRLF line endings and a leading byte order mark", () => {
    const crlf = parseFrontMatter([...validHead, "language: en", "---", "Body"].join(CRLF));
    expect(crlf.ok).toBe(true);
    expect(crlf.metadata?.author).toBe("Flight Team");
    expect(crlf.body).toBe("Body");
    expect(crlf.bodyStartLine).toBe(7);
    const bom = parseFrontMatter(String.fromCharCode(0xfeff) + doc(...validHead, "---", "Body"));
    expect(bom.ok).toBe(true);
  });

  it("ignores blank lines inside the block and allows an empty body", () => {
    const result = parseFrontMatter(doc("---", "diagram_name: a", "", "flow_name: B", "author: C", "---"));
    expect(result.ok).toBe(true);
    expect(result.body).toBe("");
  });
});

describe("parseFrontMatter - structure", () => {
  it("reports a missing opening delimiter and keeps the whole text as body", () => {
    const text = doc("diagram_name: orbit-transfer", "Body");
    const result = parseFrontMatter(text);
    expect(result.ok).toBe(false);
    expect(result.metadata).toBeUndefined();
    expect(result.issues).toEqual([expect.objectContaining({ code: "invalid-front-matter", line: 1 })]);
    expect(result.body).toBe(text);
    expect(result.bodyStartLine).toBe(1);
  });

  it("reports a missing closing delimiter", () => {
    expect(codesFor(doc(...validHead, "Body"))).toEqual(["invalid-front-matter"]);
  });

  it("reports unknown, duplicate and missing keys", () => {
    expect(parseFrontMatter(doc(...validHead, "owner: someone", "---")).issues).toEqual([
      expect.objectContaining({ code: "unknown-front-matter-key", line: 5 })
    ]);
    expect(parseFrontMatter(doc(...validHead, "author: Other", "---")).issues).toEqual([
      expect.objectContaining({ code: "duplicate-front-matter-key", line: 5, column: "author" })
    ]);
    expect(parseFrontMatter(doc("---", "diagram_name: a", "flow_name: B", "---")).issues).toEqual([
      expect.objectContaining({ code: "missing-front-matter-key", column: "author" })
    ]);
  });

  it("rejects an unsupported language", () => {
    expect(parseFrontMatter(doc(...validHead, "language: de", "---")).issues).toEqual([
      expect.objectContaining({ code: "invalid-enum-value", line: 5, column: "language" })
    ]);
  });

  it("rejects a diagram name that is not filename safe", () => {
    for (const name of ["Orbit-Transfer", "orbit transfer", "orbit_transfer", "orbit.transfer", "-orbit", "con"]) {
      const result = parseFrontMatter(doc("---", `diagram_name: ${name}`, "flow_name: B", "author: C", "---"));
      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.column)).toContain("diagram_name");
    }
  });

  it("rejects empty values and entries without a space after the colon", () => {
    expect(codesFor(withAuthor(""))).toEqual(["empty-required-value"]);
    expect(codesFor(doc("---", "diagram_name:a", "flow_name: B", "author: C", "---"))).toContain("invalid-front-matter");
  });
});

describe("parseFrontMatter - rejected YAML features", () => {
  it("rejects arrays, objects, anchors, aliases, tags, quoting and block scalars", () => {
    for (const value of ["[a, b]", "{name: x}", "&anchor Team", "*anchor", "!!str Team", "'Team'", '"Team"', "|", ">", "%TAG", "@Team"]) {
      expect(codesFor(withAuthor(value))).toEqual(["invalid-front-matter"]);
    }
  });

  it("rejects block lists, nested mappings, comments and templates", () => {
    const blockList = doc("---", "diagram_name: a", "flow_name: B", "author:", "  - first", "---");
    expect(codesFor(blockList)).toEqual(["empty-required-value", "invalid-front-matter"]);
    expect(codesFor(withAuthor("name: Team"))).toEqual(["invalid-front-matter"]);
    expect(codesFor(withAuthor("Team # note"))).toEqual(["invalid-front-matter"]);
    expect(codesFor(withAuthor("Team {{name}}"))).toEqual(["invalid-front-matter"]);
    expect(codesFor(withAuthor("Team $" + "{name}"))).toEqual(["invalid-front-matter"]);
    expect(codesFor(doc(...validHead, "# comment", "---"))).toEqual(["invalid-front-matter"]);
  });

  it("rejects control characters", () => {
    for (const code of [9, 0, 0x202e]) {
      const result = parseFrontMatter(withAuthor("Flight" + String.fromCharCode(code) + "Team"));
      expect(result.ok).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ code: "control-character", line: 4 }));
    }
  });
});

describe("parseFrontMatter - limits and safety", () => {
  it("enforces the value length limit", () => {
    expect(parseFrontMatter(withAuthor("a".repeat(256))).ok).toBe(true);
    expect(parseFrontMatter(withAuthor("a".repeat(257))).issues).toEqual([
      expect.objectContaining({ code: "limit-exceeded", column: "author", limit: 256 })
    ]);
  });

  it("enforces the flow source limit", () => {
    const result = parseFrontMatter(doc(...validHead, "---", "x".repeat(50_000)));
    expect(result.issues).toEqual([expect.objectContaining({ code: "limit-exceeded", limit: 50_000 })]);
    expect(result.body).toBe("");
  });

  it("never echoes input values or unknown keys in issues", () => {
    const marker = "unique-front-matter-marker";
    const text = doc("---", `diagram_name: ${marker} x`, `${marker.replaceAll("-", "_")}: v`, `author: [${marker}]`, "language: " + marker, "---");
    const result = parseFrontMatter(text);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.issues)).not.toContain("marker");
  });

  it("is deterministic and caps the number of issues", () => {
    const text = doc("---", ...Array.from({ length: 20 }, (_, index) => `key_${index}: v`), "---");
    expect(parseFrontMatter(text)).toEqual(parseFrontMatter(text));
    const capped = parseFrontMatter(text, { maxIssues: 5 });
    expect(capped.truncated).toBe(true);
    expect(capped.issues).toHaveLength(6);
    expect(capped.issues.at(-1)?.code).toBe("too-many-issues");
  });
});
