import { describe, expect, it } from "vitest";
import {
  assertSafeDisplayText,
  commentText,
  displayTextProblem,
  isSafeDisplayText,
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
