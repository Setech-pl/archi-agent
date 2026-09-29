import mammoth from "mammoth";
import TurndownService from "turndown";
import { tables } from "@truto/turndown-plugin-gfm";
import { boundedMarkdown } from "../../core/document-conversion/markdown.js";
import { ConversionFailure, type ConvertOutcome } from "../../core/document-conversion/contract.js";

export async function convertDocx(bytes: Buffer): Promise<Extract<ConvertOutcome, { status: "success" }>> {
  try {
    const result = await mammoth.convertToHtml(
      { buffer: bytes },
      {
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" }))
      }
    );
    if (result.value.length > 32 * 1024 * 1024) throw new ConversionFailure("output-too-large");
    const service = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
    service.use(tables);
    service.addRule("archi-no-links", { filter: "a", replacement: (content) => content });
    service.addRule("archi-no-images", { filter: "img", replacement: () => "" });
    const markdown = boundedMarkdown(service.turndown(result.value).replace(/<(?=\/?[A-Za-z])/g, "&lt;").trim());
    return { status: "success", format: "docx", markdown, counts: {} };
  } catch (error) {
    if (error instanceof ConversionFailure) throw error;
    throw new ConversionFailure("corrupt-document");
  }
}
