import { describe, expect, it } from "vitest";
import {
  assertSafeDisplayText,
  commentText,
  displayTextProblem,
  isSafeDisplayText,
  messageLabelTextOptions,
  messageText,
  plantUmlTextLimits,
  quotedName,
  UnsafePlantUmlTextError
} from "../../../src/core/render/plantuml-escape.js";

const char = (...codes: number[]): string => String.fromCharCode(...codes);
const remote = (scheme: string): string => [`${scheme}:`, "", "diagrams.invalid", "style"].join("/");
const polishWord = `Zg${char(0x142)}oszenie ${char(0x17c)}${char(0x105)}dania`;

describe("displayTextProblem - accepted text", () => {
  it("accepts ordinary labels, names and correct Unicode runtime input", () => {
    for (const value of ["Mission Control", "Send command request", "Validate (step 2), then store: done", "Command API v2", polishWord, `Caf${char(0xe9)}`]) {
      expect(displayTextProblem(value)).toBeUndefined();
      expect(isSafeDisplayText(value)).toBe(true);
    }
  });

  it("returns names and message text unchanged, because nothing needs escaping", () => {
    expect(quotedName("Mission Control")).toBe('"Mission Control"');
    expect(messageText("Send command request")).toBe("Send command request");
    expect(commentText("diagram: telemetry-command-flow")).toBe("diagram: telemetry-command-flow");
  });
});

describe("displayTextProblem - rejected text", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["", "empty"],
    ["   ", "empty"],
    [`one${char(10)}two`, "line-break"],
    [`one${char(13)}two`, "line-break"],
    [`one${char(0x2028)}two`, "line-break"],
    [`one${char(0x2029)}two`, "line-break"],
    [`tab${char(9)}here`, "control-character"],
    [`nul${char(0)}here`, "control-character"],
    [`bidi${char(0x202e)}here`, "control-character"],
    [`delete${char(127)}here`, "control-character"],
    ["@startuml", "directive-like"],
    ["@enduml", "directive-like"],
    ["!include local.puml", "directive-like"],
    ["!includeurl styles", "directive-like"],
    ["!define NAME value", "directive-like"],
    ["!pragma teoz true", "directive-like"],
    ["!function evil()", "directive-like"],
    ["!procedure evil()", "directive-like"],
    ["!theme dark", "directive-like"],
    [remote("https"), "remote-url"],
    [remote("ftp"), "remote-url"],
    ["www.diagrams.invalid", "remote-url"],
    ["'comment", "comment-delimiter"],
    ["text /' block", "comment-delimiter"],
    ["**bold**", "creole-markup"],
    ["--strike--", "creole-markup"],
    ["[[link]]", "creole-markup"],
    ["<b>bold</b>", "creole-markup"],
    ['Say "hello"', "forbidden-character"],
    ["back\\slash", "forbidden-character"],
    ["A -> B", "forbidden-character"],
    ["A ->> B", "forbidden-character"],
    ["participant \"Evil\" as E", "forbidden-character"],
    ["cost = 5", "forbidden-character"],
    ["hash # tag", "forbidden-character"],
    ["pipe | here", "forbidden-character"],
    ["brace { here", "forbidden-character"],
    ["bracket [ here", "forbidden-character"],
    ["percent %", "forbidden-character"]
  ];

  it.each(cases)("rejects %j as %s", (value, problem) => {
    expect(displayTextProblem(value)).toBe(problem);
    expect(isSafeDisplayText(value)).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(displayTextProblem(undefined)).toBe("empty");
    expect(displayTextProblem(42)).toBe("empty");
  });

  it("enforces the length limit", () => {
    expect(displayTextProblem("a".repeat(plantUmlTextLimits.maxDisplayTextChars))).toBeUndefined();
    expect(displayTextProblem("a".repeat(plantUmlTextLimits.maxDisplayTextChars + 1))).toBe("too-long");
    expect(displayTextProblem("abcdef", { maxChars: 5 })).toBe("too-long");
  });

  it("rejects injected fragment and statement keywords at the start of generator text on request", () => {
    for (const value of ["alt accepted", "else rejected", "opt retry", "loop each frame", "group uplink", "end", "note over A", "skinparam x", "title Evil", "hide footbox"]) {
      expect(displayTextProblem(value, { rejectStatementKeywords: true })).toBe("statement-keyword");
    }

    expect(displayTextProblem("Alternative route", { rejectStatementKeywords: true })).toBeUndefined();
    expect(displayTextProblem("Endpoint check", { rejectStatementKeywords: true })).toBeUndefined();
    expect(displayTextProblem("alt accepted")).toBeUndefined();
  });
});

describe("displayTextProblem - message-label context", () => {
  const LF = char(10);
  const CR = char(13);
  const statementKeywords = [
    "end", "else", "alt", "opt", "loop", "group", "par", "break", "critical", "skinparam", "legend", "endlegend", "newpage",
    "autonumber", "activate", "deactivate", "return", "note", "hnote", "rnote", "title", "hide", "show", "create", "destroy"
  ];

  it("accepts natural labels that begin with a statement keyword, in any letter case", () => {
    for (const label of [
      "Return validation result",
      "return telemetry frames",
      "ReTuRn mixed case frames",
      "Create payment instruction",
      "Activate subscription",
      "Deactivate temporary route",
      "Destroy expired session",
      "Alt processing route selected",
      "Else use fallback channel",
      "Loop over available records",
      "Group matching results",
      "End customer session",
      "Note validation outcome"
    ]) {
      expect(displayTextProblem(label, messageLabelTextOptions)).toBeUndefined();
      expect(isSafeDisplayText(label, messageLabelTextOptions)).toBe(true);
      expect(assertSafeDisplayText(label, messageLabelTextOptions)).toBe(label);
    }
  });

  it("accepts every statement keyword at the start of a label, followed by a word or by punctuation", () => {
    for (const keyword of statementKeywords) {
      expect(displayTextProblem(`${keyword} handled as label text`, messageLabelTextOptions)).toBeUndefined();
      expect(displayTextProblem(`${keyword.toUpperCase()}: handled as label text`, messageLabelTextOptions)).toBeUndefined();
      expect(displayTextProblem(keyword, messageLabelTextOptions)).toBeUndefined();
    }

    for (const label of ["Return: validation result", "Return, then close the session", "End (customer session)", "Note; outcome recorded", "Loop - each record"]) {
      expect(displayTextProblem(label, messageLabelTextOptions)).toBeUndefined();
    }
  });

  it("accepts a keyword later in the sentence, as before", () => {
    for (const label of ["Send return receipt", "Session end reached", "Wait for the loop to finish", "Alternative route", "Endpoint check"]) {
      expect(displayTextProblem(label, messageLabelTextOptions)).toBeUndefined();
    }
  });

  it("keeps the standalone statement-keyword rule for text that can start a line", () => {
    for (const label of ["Return validation result", "return telemetry frames", "end of story", "alt accepted"]) {
      expect(displayTextProblem(label, { rejectStatementKeywords: true })).toBe("statement-keyword");
      expect(displayTextProblem(label, { ...messageLabelTextOptions, rejectStatementKeywords: true })).toBe("statement-keyword");
    }
  });

  it("still rejects every construct that could leave the arrow line, with a leading keyword or not", () => {
    const rejected: ReadonlyArray<readonly [string, string]> = [
      [`Return validation result${LF}@enduml`, "line-break"],
      [`Return${CR}validation result`, "line-break"],
      [`Return${char(0x2028)}validation result`, "line-break"],
      [`Return${char(0x2029)}validation result`, "line-break"],
      [`Return${char(9)}validation result`, "control-character"],
      [`Return${char(0x85)}validation result`, "control-character"],
      ["@startuml", "directive-like"],
      ["@enduml", "directive-like"],
      ["Return @enduml", "directive-like"],
      ["!include local.puml", "directive-like"],
      ["!includeurl remote.puml", "directive-like"],
      ["Return !pragma teoz true", "directive-like"],
      [`Return ${remote("https")}logo.png`, "remote-url"],
      ["Return www.diagrams.invalid", "remote-url"],
      ["Return <img:logo.png>", "creole-markup"],
      ["<b>Return validation result</b>", "creole-markup"],
      ["**Return** validation result", "creole-markup"],
      ["[[Return]] validation result", "creole-markup"],
      ["Return //validation// result", "creole-markup"],
      ["Return {{template}} result", "forbidden-character"],
      ["Return %date() result", "forbidden-character"],
      ["Return $variable result", "forbidden-character"],
      ["Return\\nvalidation result", "forbidden-character"],
      ["Return -> B", "forbidden-character"],
      ['Return "quoted" result', "forbidden-character"],
      [`Return ${"a".repeat(plantUmlTextLimits.maxLabelChars)}`, "too-long"]
    ];

    for (const [label, problem] of rejected) {
      expect(displayTextProblem(label, messageLabelTextOptions)).toBe(problem);
      expect(isSafeDisplayText(label, messageLabelTextOptions)).toBe(false);

      try {
        assertSafeDisplayText(label, messageLabelTextOptions);
        throw new Error("Expected a rejection.");
      } catch (error) {
        expect(error).toBeInstanceOf(UnsafePlantUmlTextError);
        expect((error as UnsafePlantUmlTextError).problem).toBe(problem);
        expect((error as Error).message).not.toContain("Return");
        expect((error as Error).message).not.toContain("validation");
      }
    }
  });

  it("carries only the label length limit and no keyword flag", () => {
    expect(messageLabelTextOptions).toEqual({ maxChars: plantUmlTextLimits.maxLabelChars });
    expect(Object.isFrozen(messageLabelTextOptions)).toBe(true);
  });
});

describe("assertSafeDisplayText", () => {
  it("throws a typed error that names only the problem", () => {
    expect(assertSafeDisplayText("Mission Control")).toBe("Mission Control");

    try {
      quotedName('Evil" as X');
      throw new Error("Expected a rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafePlantUmlTextError);
      expect((error as UnsafePlantUmlTextError).problem).toBe("forbidden-character");
      expect((error as Error).message).not.toContain("Evil");
    }

    expect(() => messageText("@startuml")).toThrow(UnsafePlantUmlTextError);
    expect(() => commentText(`a${char(10)}@enduml`)).toThrow(UnsafePlantUmlTextError);
  });
});
