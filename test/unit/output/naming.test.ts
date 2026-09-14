import { describe, expect, it } from "vitest";
import {
  assertDiagramId,
  buildDiagramRelativePath,
  defaultOutputDirectory,
  ensurePumlExtension,
  isFilenameSafeDiagramId,
  isSafeDiagramFileName,
  normalizeDiagramName,
  normalizeOutputDirectory
} from "../../../src/core/output/naming.js";

describe("normalizeDiagramName", () => {
  it("replaces whitespace runs with single underscores and trims the result", () => {
    expect(normalizeDiagramName("  Telemetry   Command Flow  ")).toBe("Telemetry_Command_Flow");
  });

  it("replaces every reserved filename character", () => {
    expect(normalizeDiagramName('a<b>c:d"e|f?g*h')).toBe("a_b_c_d_e_f_g_h");
  });

  it("neutralizes separators and parent-directory sequences", () => {
    expect(normalizeDiagramName("../../flows/plan")).toBe("flows_plan");
    expect(normalizeDiagramName("..\\1..\\2")).toBe("1_2");
  });

  it("removes control characters and leading or trailing dots", () => {
    expect(normalizeDiagramName("\u0000.hidden\u001f.")).toBe("hidden");
  });

  it("preserves letter case and single dots", () => {
    expect(normalizeDiagramName("Flow.v1")).toBe("Flow.v1");
  });

  it("renames reserved device names", () => {
    expect(normalizeDiagramName("con")).toBe("con_diagram");
    expect(normalizeDiagramName("NUL.txt")).toBe("NUL_diagram.txt");
  });

  it("returns an empty string when nothing safe remains", () => {
    expect(normalizeDiagramName(" /// ")).toBe("");
  });
});

describe("ensurePumlExtension", () => {
  it("appends the extension exactly once", () => {
    expect(ensurePumlExtension("Flow")).toBe("Flow.puml");
    expect(ensurePumlExtension("Flow.puml")).toBe("Flow.puml");
    expect(ensurePumlExtension("Flow.PUML")).toBe("Flow.PUML");
  });
});

describe("isFilenameSafeDiagramId", () => {
  it("accepts lower-case identifiers with digits and hyphens", () => {
    for (const value of ["telemetry-command-flow", "a", "flow-2", "x".repeat(64)]) {
      expect(isFilenameSafeDiagramId(value)).toBe(true);
    }
  });

  it("rejects unsafe or malformed identifiers", () => {
    for (const value of ["", "-lead", "trail-", "Upper", "has space", "../x", "a/b", "a\\_b", "a.b", "con", "x".repeat(65)]) {
      expect(isFilenameSafeDiagramId(value)).toBe(false);
    }
  });

  it("returns valid identifiers and throws for invalid ones", () => {
    expect(assertDiagramId("telemetry-command-flow")).toBe("telemetry-command-flow");
    expect(() => assertDiagramId("Not Safe")).toThrow(/lower-case letters/);
  });
});

describe("normalizeOutputDirectory", () => {
  it("accepts relative forward-slash directories", () => {
    expect(normalizeOutputDirectory(defaultOutputDirectory)).toBe("architecture-diagrams");
    expect(normalizeOutputDirectory("docs/diagrams/")).toBe("docs/diagrams");
  });

  it("rejects absolute, traversing or malformed directories", () => {
    for (const value of ["", "   ", "/srv/out", "C:/out", "a\\_b", "../out", "a/../b", "./out", "a//b", "a<b", "a /b"]) {
      expect(() => normalizeOutputDirectory(value)).toThrow();
    }
  });
});

describe("buildDiagramRelativePath", () => {
  it("builds the default layout from the diagram identifier", () => {
    expect(buildDiagramRelativePath("telemetry-command-flow", "Telemetry_Command_Flow.puml"))
      .toBe("architecture-diagrams/telemetry-command-flow/Telemetry_Command_Flow.puml");
  });

  it("uses forward slashes for a custom relative directory", () => {
    const result = buildDiagramRelativePath("flow-2", "Flow_v2.puml", "docs/diagrams");
    expect(result).toBe("docs/diagrams/flow-2/Flow_v2.puml");
    expect(result).not.toContain("\\");
  });

  it("rejects unsafe identifiers and file names", () => {
    expect(() => buildDiagramRelativePath("Bad Id", "Flow.puml")).toThrow();

    for (const fileName of ["../Flow.puml", "a/Flow.puml", "Flow.txt", ".puml", " Flow.puml", "con.puml"]) {
      expect(isSafeDiagramFileName(fileName)).toBe(false);
      expect(() => buildDiagramRelativePath("flow-2", fileName)).toThrow();
    }
  });
});
