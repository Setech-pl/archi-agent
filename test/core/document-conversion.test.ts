import { describe, expect, it } from "vitest";
import { MarkdownBuilder, boundedMarkdown, cleanText, escapeMarkdown, escapeTableCell } from "../../src/core/document-conversion/markdown.js";
import { conversionLimits, formatFromPath } from "../../src/core/document-conversion/contract.js";

describe("document conversion core", () => {
  it("uses a closed extension list", () => {
    expect(["a.PDF", "b.docx", "c.xlsx"].map(formatFromPath)).toEqual(["pdf", "docx", "xlsx"]);
    expect(["a.doc", "a.xls", "a.png", "a.pdf.exe"].map(formatFromPath)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("normalizes Unicode, strips controls and escapes Markdown and HTML", () => {
    expect(cleanText("Zo\u0301\u0000łw")).toBe("Zó łw");
    expect(escapeMarkdown("# <script> [x] | Żółw")).toBe("\\# &lt;script&gt; \\[x\\] \\| Żółw");
    expect(escapeTableCell("a|b\n<script>")).toBe("a\\|b &lt;script&gt;");
  });

  it("bounds the result by UTF-8 bytes, including multibyte text", () => {
    expect(boundedMarkdown("a".repeat(conversionLimits.outputBytes))).toHaveLength(conversionLimits.outputBytes);
    expect(() => boundedMarkdown("🚀".repeat(conversionLimits.outputBytes / 4 + 1))).toThrowError("output-too-large");
    const builder = new MarkdownBuilder();
    builder.append("x".repeat(conversionLimits.outputBytes));
    expect(builder.finish()).toHaveLength(conversionLimits.outputBytes);
    expect(() => builder.append("x")).toThrowError("output-too-large");
  });
});
