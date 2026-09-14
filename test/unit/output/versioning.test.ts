import { describe, expect, it } from "vitest";
import { nextVersionedFileName } from "../../../src/core/output/versioning.js";

describe("versioning", () => {
  it("returns the base file name when it is unique", () => {
    expect(nextVersionedFileName("Diagram", [])).toBe("Diagram.puml");
  });

  it("returns the next versioned file name when the base exists", () => {
    expect(nextVersionedFileName("Diagram", ["Diagram.puml", "Diagram_v2.puml"])).toBe(
      "Diagram_v3.puml"
    );
  });

  it("matches an existing base name case-insensitively", () => {
    // A case-insensitive filesystem would otherwise let the planned name
    // silently replace the existing file.
    expect(nextVersionedFileName("Diagram", ["diagram.puml"])).toBe("Diagram_v2.puml");
    expect(nextVersionedFileName("diagram", ["DIAGRAM.puml"])).toBe("diagram_v2.puml");
  });

  it("skips existing versions regardless of their case", () => {
    expect(nextVersionedFileName("Diagram", [
      "DIAGRAM.puml",
      "diagram_V2.puml",
      "Diagram_v3.PUML"
    ])).toBe("Diagram_v4.puml");
  });

  it("does not treat an unrelated name as a collision", () => {
    expect(nextVersionedFileName("Diagram", ["Other.puml"])).toBe("Diagram.puml");
  });
});
