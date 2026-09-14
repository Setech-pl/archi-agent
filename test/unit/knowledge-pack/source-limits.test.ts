import { describe, expect, it } from "vitest";
import {
  containsControlCharacter,
  countUnicodeCharacters,
  isForbiddenControlCodePoint,
  knowledgePackLimits,
  textExceedsFileLimit
} from "../../../src/core/knowledge-pack/source-limits.js";

describe("knowledge-pack source limits", () => {
  it("declares the agreed limits", () => {
    expect(knowledgePackLimits.maxFileBytes).toBe(1024 * 1024);
    expect(knowledgePackLimits.maxTableRows).toBe(10_000);
    expect(knowledgePackLimits.maxTableColumns).toBe(16);
    expect(knowledgePackLimits.maxCellChars).toBe(2_000);
    expect(knowledgePackLimits.maxIdentifierChars).toBe(64);
    expect(knowledgePackLimits.maxCanonicalNameChars).toBe(256);
    expect(knowledgePackLimits.maxFlowSourceChars).toBe(50_000);
    expect(knowledgePackLimits.maxFrontMatterValueChars).toBe(256);
  });

  it("is immutable", () => {
    expect(Object.isFrozen(knowledgePackLimits)).toBe(true);
    expect(() => {
      (knowledgePackLimits as { maxCellChars: number }).maxCellChars = 1;
    }).toThrow(TypeError);
    expect(knowledgePackLimits.maxCellChars).toBe(2_000);
  });

  it("counts Unicode code points, not UTF-16 code units", () => {
    const astral = String.fromCodePoint(0x1f680);
    expect(astral.length).toBe(2);
    expect(countUnicodeCharacters(astral)).toBe(1);
    expect(countUnicodeCharacters("")).toBe(0);
    expect(countUnicodeCharacters("abc" + astral)).toBe(4);
  });

  it("applies only the certain lower bound of the file byte limit to decoded text", () => {
    expect(textExceedsFileLimit("a".repeat(knowledgePackLimits.maxFileBytes))).toBe(false);
    expect(textExceedsFileLimit("a".repeat(knowledgePackLimits.maxFileBytes + 1))).toBe(true);
    expect(textExceedsFileLimit("abcd", 3)).toBe(true);
    expect(textExceedsFileLimit("abc", 3)).toBe(false);
  });

  it("classifies control and bidirectional formatting code points", () => {
    for (const codePoint of [0, 9, 13, 27, 127, 0x85, 0x200e, 0x202e, 0x2066, 0x2028, 0xfeff]) {
      expect(isForbiddenControlCodePoint(codePoint)).toBe(true);
    }

    for (const codePoint of [32, 65, 0x0105, 0x1f680]) {
      expect(isForbiddenControlCodePoint(codePoint)).toBe(false);
    }

    expect(containsControlCharacter("plain text")).toBe(false);
    expect(containsControlCharacter("tab" + String.fromCharCode(9) + "inside")).toBe(true);
  });
});
