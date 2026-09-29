import { getDocumentProxy } from "unpdf";
import { MarkdownBuilder, escapeMarkdown } from "../../core/document-conversion/markdown.js";
import { ConversionFailure, conversionLimits, type ConvertOutcome } from "../../core/document-conversion/contract.js";

export async function convertPdf(bytes: Buffer): Promise<Extract<ConvertOutcome, { status: "success" }>> {
  let document;
  try {
    document = await getDocumentProxy(new Uint8Array(bytes), {
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true,
      useSystemFonts: false,
      disableFontFace: true,
      maxImageSize: 1,
      verbosity: 0
    });
    if (document.numPages > conversionLimits.pages) throw new ConversionFailure("too-many-pages");
    let foundText = false;
    const markdown = new MarkdownBuilder();
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      try {
        const content = await page.getTextContent();
        const lines: string[] = [];
        let line = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const text = item.str;
          if (text.trim()) foundText = true;
          line += text;
          if (item.hasEOL) {
            lines.push(line);
            line = "";
          } else if (text && !text.endsWith(" ")) {
            line += " ";
          }
        }
        if (line.trim()) lines.push(line);
        const pageText = lines.map((value) => escapeMarkdown(value.trim())).join("\n");
        markdown.append(`${number === 1 ? "" : "\n\n"}## Page ${number}\n\n${pageText}`);
      } finally {
        page.cleanup();
      }
    }
    if (!foundText) throw new ConversionFailure("no-text-layer");
    return { status: "success", format: "pdf", markdown: markdown.finish(), counts: { pages: document.numPages } };
  } catch (error) {
    if (error instanceof ConversionFailure) throw error;
    if (error instanceof Error && error.name === "PasswordException") throw new ConversionFailure("encrypted-document");
    throw new ConversionFailure("corrupt-document");
  } finally {
    await document?.destroy();
  }
}
