import { describe, expect, it } from "vitest";
import { validatePlantUmlDocument } from "../../../src/core/validation/plantuml-document-validator.js";

const valid = "@startuml\nA -> B : message\n@enduml\n";
const rules = (text: unknown) => validatePlantUmlDocument(text).map((issue) => issue.rule);

describe("shared PlantUML document boundary", () => {
  it("accepts a bounded document regardless of diagram profile", () => expect(rules(valid)).toEqual([]));
  it.each([
    ["non-string", 1, "too-large"],
    ["missing start", valid.replace("@startuml", "start"), "start-marker"],
    ["duplicate end", valid.replace("@enduml", "@enduml\n@enduml"), "end-marker"],
    ["trailing content", `${valid}late\n`, "content-after-end"],
    ["missing newline", valid.slice(0, -1), "missing-final-newline"],
    ["carriage return", valid.replace("message", "message\r"), "carriage-return"],
    ["control", valid.replace("message", "message\t"), "control-character"],
    ["directive", valid.replace("@enduml", "!include secret\n@enduml"), "forbidden-directive"],
    ["remote URL", valid.replace("message", "https://invalid.example"), "remote-url"],
    ["oversized", "x".repeat(256 * 1024 + 1), "too-large"],
    ["too many lines", `@startuml\n${"x\n".repeat(2001)}@enduml\n`, "too-many-lines"]
  ])("rejects %s with a safe rule", (_name, input, rule) => expect(rules(input)).toContain(rule));
});
