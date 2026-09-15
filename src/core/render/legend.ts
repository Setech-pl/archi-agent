import type { FlowLanguage } from "../knowledge-pack/front-matter.js";

/**
 * Locally generated diagram legend. The texts are fixed constants; no model or generator supplies
 * them. English is the default; Polish is used when the flow front matter declares language pl.
 *
 * Source files stay ASCII-only: Polish letters are written as \u escapes, so the runtime strings
 * contain the correct Polish characters while the file bytes remain ASCII.
 */

const legendTexts: Readonly<Record<FlowLanguage, readonly string[]>> = Object.freeze({
  en: Object.freeze([
    "Legend",
    "Actor symbol: grounded actor from the Knowledge Pack",
    "Box, database or queue symbol: grounded system from the Knowledge Pack",
    "[NEW] prefix: confirmed new participant, not part of the Knowledge Pack",
    "Solid arrow with filled head: synchronous interaction",
    "Arrow with open head: asynchronous interaction",
    "Dashed arrow: response to a synchronous request"
  ]),
  pl: Object.freeze([
    "Legenda",
    "Symbol aktora: aktor ugruntowany w Knowledge Pack",
    "Prostok\u0105t, baza danych lub kolejka: system ugruntowany w Knowledge Pack",
    "Prefiks [NEW]: potwierdzony nowy uczestnik spoza Knowledge Pack",
    "Strza\u0142ka ci\u0105g\u0142a z pe\u0142nym grotem: interakcja synchroniczna",
    "Strza\u0142ka z otwartym grotem: interakcja asynchroniczna",
    "Strza\u0142ka przerywana: odpowied\u017a na \u017c\u0105danie synchroniczne"
  ])
});

export const legendOpening = "legend right";
export const legendClosing = "endlegend";

/** The complete legend block, one PlantUML line per entry. */
export function legendLines(language: FlowLanguage): readonly string[] {
  return Object.freeze([legendOpening, ...legendTexts[language], legendClosing]);
}

/** Every legend block the renderer can emit, used by the structural validator. */
export function knownLegendBlocks(): readonly (readonly string[])[] {
  return Object.freeze([legendLines("en"), legendLines("pl")]);
}
