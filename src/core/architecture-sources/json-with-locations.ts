import { createScanner, visit } from "jsonc-parser";
import { utf8Encode } from "../util/stable-digest.js";
import type { SourceLocation } from "../knowledge-pack/knowledge-pack.schema.js";

export class ArchitectureSourceError extends Error {
  constructor(readonly code: string, readonly location?: SourceLocation) { super(code); }
}
export const sourceError = (code: string, location?: SourceLocation): never => { throw new ArchitectureSourceError(code, location); };
// jsonc-parser declares ambient const enums, incompatible with isolatedModules. Scanner token values from its public API.
const SyntaxKind = { EOF: 17, OpenBraceToken: 1, OpenBracketToken: 3, CloseBraceToken: 2, CloseBracketToken: 4 };
const key = (path: readonly (string | number)[]) => JSON.stringify(path);
/** Strict JSON syntax comes from JSON.parse; the proven visitor supplies actual lines and duplicate detection. */
export function parseLocatedJson(text: string, file: string): { value: unknown; at(path: readonly (string | number)[]): SourceLocation } {
  if (utf8Encode(text).length > 1024 * 1024) sourceError("source-limit-exceeded", { file, line: 1 });
  const scanner = createScanner(text), locations = new Map<string, number>();
  let depth = 0, tokens = 0;
  for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
    if (++tokens > 100_000) sourceError("source-limit-exceeded", { file, line: scanner.getTokenStartLine() + 1 });
    if (token === SyntaxKind.OpenBraceToken || token === SyntaxKind.OpenBracketToken) depth++;
    if (depth > 64) sourceError("source-limit-exceeded", { file, line: scanner.getTokenStartLine() + 1 });
    if (token === SyntaxKind.CloseBraceToken || token === SyntaxKind.CloseBracketToken) depth--;
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { return sourceError("structurizr-json-invalid", { file, line: 1 }); }
  const objects: Set<string>[] = [];
  visit(text, {
    onObjectBegin(_o, _l, line, _c, path) { objects.push(new Set()); locations.set(key(path()), line + 1); },
    onObjectProperty(property, _o, _l, line, _c, path) {
      const seen = objects.at(-1)!;
      if (seen.has(property)) sourceError("source-key-duplicate", { file, line: line + 1 });
      seen.add(property); locations.set(key([...path(), property]), line + 1);
    },
    onObjectEnd() { objects.pop(); },
    onLiteralValue(_v, _o, _l, line, _c, path) { locations.set(key(path()), line + 1); },
    onError() { sourceError("structurizr-json-invalid", { file, line: 1 }); }
  }, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  return { value, at(path) { return { file, line: locations.get(key(path)) ?? 1 }; } };
}
