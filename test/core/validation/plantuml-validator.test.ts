import { describe, expect, it } from "vitest";
import { legendLines } from "../../../src/core/render/legend.js";
import { plantUmlSubsetLimits, validatePlantUmlSubset } from "../../../src/core/validation/plantuml-validator.js";

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const remoteUrl = ["https:", "", "diagrams.invalid", "theme"].join("/");

const declarations = ['participant "Mission Control" as kp_mission_control', 'participant "Command Service" as kp_command_service'];
const request = "kp_mission_control -> kp_command_service : Send command (REST API: Command API)";
const response = "kp_command_service --> kp_mission_control : Result (REST API)";
const asyncMessage = "kp_command_service ->> kp_mission_control : Status (EVENT)";

function document(body: readonly string[], options: { readonly head?: readonly string[]; readonly legend?: readonly string[] } = {}): string {
  return [
    "@startuml",
    "' ArchGround sequence diagram",
    ...(options.head ?? []),
    "",
    ...declarations,
    "",
    ...body,
    "",
    ...(options.legend ?? legendLines("en")),
    "@enduml",
    ""
  ].join(LF);
}

function rules(text: string): string[] {
  return validatePlantUmlSubset(text).issues.map((issue) => `${issue.rule}@${issue.line ?? "-"}`);
}

function ruleNames(text: string): string[] {
  return validatePlantUmlSubset(text).issues.map((issue) => issue.rule);
}

describe("validatePlantUmlSubset - accepted documents", () => {
  it("accepts the emitted subset with every arrow type and either legend", () => {
    expect(validatePlantUmlSubset(document([request, response, asyncMessage]))).toEqual({ ok: true, issues: [], truncated: false });
    expect(validatePlantUmlSubset(document([request], { legend: legendLines("pl") })).ok).toBe(true);
  });

  it("accepts message text that begins with a statement keyword after the controlled colon", () => {
    for (const label of ["Return validation result", "return telemetry frames", "Create payment instruction", "alt accepted", "end of story", "note over A", "activate now", "title lookup", "hide balance", "return"]) {
      expect(rules(document([`kp_command_service --> kp_mission_control : ${label} (REST API)`]))).toEqual([]);
      expect(rules(document([`kp_mission_control -> kp_command_service : ${label} (REST API: Command API)`]))).toEqual([]);
    }
  });

  it("rejects the same words as standalone statements", () => {
    expect(ruleNames(document([request, "return Result"]))).toContain("unknown-statement");
    expect(ruleNames(document([request, "note over kp_mission_control"]))).toContain("unknown-statement");
    expect(ruleNames(document([request, "activate kp_mission_control"]))).toContain("unknown-statement");
    expect(ruleNames(document([request, "alt Accepted"]))).toContain("unbalanced-block");
  });

  it("accepts balanced fragments that each contain a message", () => {
    const text = document(["alt Accepted", "opt Retry", request, "end", "else Rejected", response, "loop Each frame", asyncMessage, "end", "end", "group Uplink", request, "end"]);

    expect(rules(text)).toEqual([]);
  });
});

describe("validatePlantUmlSubset - markers and bytes", () => {
  it("requires exactly one start marker on the first line", () => {
    expect(ruleNames(document([request]).replace("@startuml", "' no start"))).toContain("start-marker");
    expect(ruleNames(document(["@startuml", request]))).toContain("start-marker");
    expect(ruleNames(`${LF}${document([request])}`)).toContain("start-marker");
  });

  it("requires exactly one end marker as the last line, after the start marker", () => {
    expect(ruleNames(document([request]).replace("@enduml", "' no end"))).toContain("end-marker");
    expect(ruleNames(document([request, "@enduml"]))).toContain("end-marker");
    expect(ruleNames(`${document([request])}kp_mission_control -> kp_command_service : Late (REST API)${LF}`)).toContain("content-after-end");
    expect(ruleNames(`@enduml${LF}@startuml${LF}`)).toEqual(expect.arrayContaining(["marker-order"]));
  });

  it("requires LF line endings, a final newline and no control characters", () => {
    expect(ruleNames(document([request]).slice(0, -1))).toContain("missing-final-newline");
    expect(ruleNames(document([`${request}${CR}`]))).toContain("carriage-return");
    expect(ruleNames(document([`kp_mission_control -> kp_command_service : Tab${String.fromCharCode(9)}here (EVENT)`]))).toContain("control-character");
    expect(ruleNames(document([`kp_mission_control -> kp_command_service : Bidi${String.fromCharCode(0x202e)} (EVENT)`]))).toContain("control-character");
  });

  it("bounds the size, the line count and the line length", () => {
    expect(ruleNames(document([`kp_mission_control -> kp_command_service : ${"a".repeat(plantUmlSubsetLimits.maxLineChars)}`]))).toContain("line-too-long");
    expect(ruleNames(document(Array.from({ length: plantUmlSubsetLimits.maxLines }, () => request)))).toEqual(["too-many-lines"]);
    expect(ruleNames("a".repeat(plantUmlSubsetLimits.maxChars + 1))).toEqual(["too-large"]);
    expect(ruleNames(42 as unknown as string)).toEqual(["too-large"]);
  });
});

describe("validatePlantUmlSubset - forbidden content", () => {
  it.each([
    "!include shared.puml",
    "!includeurl styles",
    "!define NAME value",
    "!pragma teoz true",
    "!function evil()",
    "!theme dark",
    "skinparam monochrome true",
    "hide footbox",
    "show footbox",
    "<style>",
    "' comment with !include hidden.puml"
  ])("rejects the directive %j", (line) => {
    expect(ruleNames(document([request, line]))).toContain("forbidden-directive");
  });

  it("rejects remote URLs anywhere", () => {
    expect(ruleNames(document([request], { head: [`' see ${remoteUrl}`] }))).toContain("remote-url");
    expect(ruleNames(document([`kp_mission_control -> kp_command_service : ${remoteUrl}`]))).toContain("remote-url");
  });

  it("rejects unknown statements and raw PlantUML constructs", () => {
    for (const line of ["title Evil", "note left: text", "kp_mission_control -> kp_command_service", "autonumber", "activate kp_mission_control", "== Section =="]) {
      expect(ruleNames(document([request, line]))).toContain("unknown-statement");
    }
  });

  it("rejects unsafe text inside declarations, messages and comments", () => {
    expect(ruleNames(document([request], { head: ["' author: Team <b>bold</b>"] }))).toContain("unsafe-text");
    expect(ruleNames(document(["kp_mission_control -> kp_command_service : **bold** (EVENT)"]))).toContain("unsafe-text");

    const hostileDeclaration = document([request]).replace('"Mission Control"', '"Mission [[Control]]"');
    expect(ruleNames(hostileDeclaration)).toContain("unsafe-text");
  });
});

describe("validatePlantUmlSubset - participants and messages", () => {
  it("requires unique aliases, compared without letter case", () => {
    const text = document([request]).replace(
      'participant "Command Service" as kp_command_service',
      `participant "Command Service" as kp_command_service${LF}participant "Other" as KP_COMMAND_SERVICE`
    );

    expect(ruleNames(text)).toContain("duplicate-alias");
    expect(ruleNames(document([request]).replace("as kp_command_service", `as kp_${"x".repeat(60)}`))).toContain("invalid-alias");
  });

  it("requires declared endpoints and declarations before the first message", () => {
    expect(rules(document(["kp_mission_control -> kp_telemetry_store : Store (DB)"]))).toContain("undeclared-endpoint@7");
    expect(ruleNames(document([request, 'participant "Late" as kp_late']))).toContain("declaration-after-message");
    expect(ruleNames(document(["opt Retry", 'participant "Late" as kp_late', request, "end"]))).toContain("declaration-after-message");
  });

  it("rejects a diagram without messages", () => {
    expect(ruleNames(document([]))).toEqual(["empty-diagram"]);
  });
});

describe("validatePlantUmlSubset - fragments and legend", () => {
  it("rejects unsupported fragment kinds and malformed fragment lines", () => {
    for (const body of [["par Both", request, "end"], ["critical Section", request, "end"], ["break Stop", request, "end"], ["alt", request, "end"], ["  opt Indented", request, "end"]]) {
      expect(ruleNames(document(body))).toContain("unsupported-fragment");
    }

    expect(ruleNames(document(["opt Retry", request, "else Other", response, "end"]))).toContain("unsupported-fragment");
    expect(ruleNames(document([request, "else Orphan"]))).toContain("unsupported-fragment");
  });

  it("requires balanced fragments", () => {
    expect(ruleNames(document(["opt Retry", request]))).toContain("unbalanced-block");
    expect(ruleNames(document([request, "end"]))).toContain("unbalanced-block");
    expect(ruleNames(document(["opt Retry", request, "end", "end"]))).toContain("unbalanced-block");
  });

  it("rejects empty fragments and empty alt branches", () => {
    expect(ruleNames(document(["opt Retry", "end", request]))).toContain("empty-fragment");
    expect(ruleNames(document(["alt Accepted", "else Rejected", request, "end"]))).toContain("empty-fragment");
    expect(ruleNames(document(["alt Accepted", request, "else Rejected", "end"]))).toContain("empty-fragment");
  });

  it("bounds fragment nesting and rejects injected condition text", () => {
    const depth = plantUmlSubsetLimits.maxFragmentDepth + 1;
    const nested = [...Array.from({ length: depth }, (_, index) => `group Level ${index + 1}`), request, ...Array.from({ length: depth }, () => "end")];

    expect(ruleNames(document(nested))).toContain("fragment-too-deep");
    expect(ruleNames(document(nested.slice(1, -1)))).toEqual([]);
    expect(ruleNames(document(["opt end of story", request, "end"]))).toContain("unsafe-text");
    expect(ruleNames(document(["alt Accepted", request, "else [[link]]", response, "end"]))).toContain("unsafe-text");
  });

  it("accepts only a known local legend, once, outside fragments", () => {
    const tampered = [...legendLines("en")];
    tampered[2] = "Actor symbol: anything the model said";

    expect(ruleNames(document([request], { legend: tampered }))).toContain("unknown-legend");
    expect(ruleNames(document([request], { legend: [...legendLines("en"), ...legendLines("en")] }))).toContain("unbalanced-block");
    expect(ruleNames(document([request], { legend: legendLines("en").slice(0, -1) }))).toContain("unbalanced-block");
    expect(ruleNames(document(["opt Retry", request, ...legendLines("en"), "end"], { legend: [] }))).toContain("unbalanced-block");
  });
});

describe("validatePlantUmlSubset - reporting", () => {
  it("reports issues sorted by line and caps the list", () => {
    const text = document(Array.from({ length: 150 }, (_, index) => `title Number ${index}`).concat([request]));
    const result = validatePlantUmlSubset(text);

    expect(result.ok).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.issues).toHaveLength(plantUmlSubsetLimits.maxReportedIssues);
    expect(result.issues.map((issue) => issue.line ?? 0)).toEqual([...result.issues.map((issue) => issue.line ?? 0)].sort((left, right) => left - right));
    expect(JSON.stringify(result)).not.toContain("Number");
  });
});
