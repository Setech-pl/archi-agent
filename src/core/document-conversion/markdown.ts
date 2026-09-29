import { ConversionFailure, conversionLimits } from "./contract.js";

/** Only document text reaches this function. No source text is used in exceptions or diagnostics. */
export function cleanText(value: string): string {
  return value.normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ");
}

export function escapeMarkdown(value: string): string {
  return cleanText(value)
    .replace(/\\/g, "\\\\")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_{}\[\]()#+.!|~>-])/g, "\\$1");
}

export function escapeTableCell(value: string): string {
  return escapeMarkdown(value).replace(/\r?\n/g, " ");
}

export function boundedMarkdown(value: string): string {
  const cleaned = cleanText(value);
  if (new TextEncoder().encode(cleaned).length > conversionLimits.outputBytes) {
    throw new ConversionFailure("output-too-large");
  }
  return cleaned;
}

/** Bound output as chunks arrive, without repeatedly copying the complete document. */
export class MarkdownBuilder {
  private readonly chunks: string[] = [];
  private bytes = 0;

  append(value: string): void {
    const cleaned = cleanText(value);
    this.bytes += new TextEncoder().encode(cleaned).length;
    if (this.bytes > conversionLimits.outputBytes) throw new ConversionFailure("output-too-large");
    this.chunks.push(cleaned);
  }

  finish(): string {
    return this.chunks.join("").trimEnd();
  }
}
