import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { ConversionFailure } from "../../core/document-conversion/contract.js";

const spreadsheetNamespaces = new Set([
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "http://purl.oclc.org/ooxml/spreadsheetml/main"
]);

/** Missing cached formula results become empty cells in a copy held only in memory. */
export function normalizeMissingFormulaCaches(entries: ReadonlyMap<string, Buffer>, sheetPaths: readonly string[]): Map<string, Buffer> {
  const normalized = new Map(entries);
  for (const name of sheetPaths) {
    const bytes = entries.get(name);
    if (!bytes) throw new ConversionFailure("corrupt-document");
    const xml = bytes.toString("utf8");
    if (!/<(?:[A-Za-z_][\w.-]*:)?f(?:\s|>)/.test(xml)) continue;
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ConversionFailure("corrupt-document");
    let invalid = false;
    const document = new DOMParser({ errorHandler: { warning: () => undefined, error: () => { invalid = true; }, fatalError: () => { invalid = true; } } }).parseFromString(xml, "application/xml");
    if (invalid) throw new ConversionFailure("corrupt-document");
    const root = document.documentElement;
    if (root.localName !== "worksheet" || !spreadsheetNamespaces.has(root.namespaceURI ?? "")) continue;
    let changed = false;
    const cells = document.getElementsByTagNameNS(root.namespaceURI, "c");
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells.item(index);
      if (!cell) continue;
      let formula: Node | undefined;
      let cached = false;
      for (let child = cell.firstChild; child; child = child.nextSibling) {
        if (child.nodeType !== 1) continue;
        const element = child as Element;
        if (element.localName === "f" && element.namespaceURI === root.namespaceURI) formula = child;
        if (element.localName === "v" && element.namespaceURI === root.namespaceURI) cached = true;
      }
      if (formula && !cached) {
        cell.removeChild(formula);
        cell.removeAttribute("t");
        changed = true;
      }
    }
    if (changed) normalized.set(name, Buffer.from(new XMLSerializer().serializeToString(document), "utf8"));
  }
  return normalized;
}
