import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { knownLegendBlocks, legendClosing, legendLines, legendOpening } from "../../../src/core/render/legend.js";

const char = (code: number): string => String.fromCharCode(code);
const backslash = char(92);

describe("legendLines", () => {
  it("produces the English legend by default", () => {
    const lines = legendLines("en");

    expect(lines[0]).toBe(legendOpening);
    expect(lines.at(-1)).toBe(legendClosing);
    expect(lines).toEqual([
      "legend right",
      "Legend",
      "Actor symbol: grounded actor from the Knowledge Pack",
      "Box, database or queue symbol: grounded system from the Knowledge Pack",
      "[NEW] prefix: confirmed new participant, not part of the Knowledge Pack",
      "Solid arrow with filled head: synchronous interaction",
      "Arrow with open head: asynchronous interaction",
      "Dashed arrow: response to a synchronous request",
      "endlegend"
    ]);
  });

  it("explains grounded actors and systems, confirmed new participants and both interaction modes", () => {
    for (const language of ["en", "pl"] as const) {
      expect(legendLines(language)).toHaveLength(9);
    }

    const english = legendLines("en").join(" ");
    for (const phrase of ["grounded actor", "grounded system", "[NEW]", "synchronous interaction", "asynchronous interaction"]) {
      expect(english).toContain(phrase);
    }
  });

  it("produces correct Polish characters at run time", () => {
    const lines = legendLines("pl");
    const arrow = `Strza${char(0x142)}ka`;

    expect(lines[1]).toBe("Legenda");
    expect(lines[3]).toBe(`Prostok${char(0x105)}t, baza danych lub kolejka: system ugruntowany w Knowledge Pack`);
    expect(lines[4]).toBe("Prefiks [NEW]: potwierdzony nowy uczestnik spoza Knowledge Pack");
    expect(lines[5]).toBe(`${arrow} ci${char(0x105)}g${char(0x142)}a z pe${char(0x142)}nym grotem: interakcja synchroniczna`);
    expect(lines[6]).toBe(`${arrow} z otwartym grotem: interakcja asynchroniczna`);
    expect(lines[7]).toBe(`${arrow} przerywana: odpowied${char(0x17a)} na ${char(0x17c)}${char(0x105)}danie synchroniczne`);
    expect(lines.join("").includes(backslash)).toBe(false);
  });

  it("returns frozen blocks and exposes every block the renderer can emit", () => {
    expect(Object.isFrozen(legendLines("en"))).toBe(true);
    expect(knownLegendBlocks()).toEqual([legendLines("en"), legendLines("pl")]);
  });

  it("keeps its source file ASCII-only by writing Polish letters as escapes", () => {
    const bytes = readFileSync(new URL("../../../src/core/render/legend.ts", import.meta.url));
    const text = bytes.toString("latin1");

    expect([...bytes].every((byte) => byte < 128)).toBe(true);
    for (const escape of ["u0105", "u0142", "u017a", "u017c"]) {
      expect(text).toContain(`${backslash}${escape}`);
    }
  });
});
