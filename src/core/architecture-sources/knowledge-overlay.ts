import { parseMarkdownTable } from "../knowledge-pack/markdown-table-parser.js";
import type { SourceLocation } from "../knowledge-pack/knowledge-pack.schema.js";
import { sourceError } from "./json-with-locations.js";
export const overlayFiles = ["aliases.md", "rules.md", "relationships.md"] as const;
export type OverlayTexts = Readonly<Record<typeof overlayFiles[number], string>>;
export interface OverlayRow { readonly values: Readonly<Record<string, string>>; readonly location: SourceLocation }
export function parseKnowledgeOverlay(texts: OverlayTexts, sourceId: string) {
  const definitions = {
    "aliases.md": ["alias", "source_id", "target_id"],
    "rules.md": ["rule", "source_id", "from_id", "to_id", "reason"],
    "relationships.md": ["source_id", "relationship_id", "from_id", "to_id", "interface_type", "interface_name", "mode"]
  };
  const parse = (file: typeof overlayFiles[number]): readonly OverlayRow[] => {
    const logical = `sources/${sourceId}-overlay/${file}`;
    const result = parseMarkdownTable(texts[file], { file: logical, columns: definitions[file], allowEmpty: true,
      optionalColumns: file === "relationships.md" ? ["interface_name", "mode"] : [] });
    if (!result.ok) return sourceError(result.issues[0]?.code ?? "overlay-invalid", { file: logical, line: result.issues[0]?.line ?? 1 });
    const seen = new Set<string>();
    return result.table.rows.map(row => {
      const location = { file: logical, line: row.line };
      if (row.values["source_id"] !== sourceId) sourceError("overlay-source-mismatch", location);
      const id = file === "aliases.md" ? JSON.stringify([row.values["alias"],row.values["target_id"]]) : file === "rules.md" ? JSON.stringify([row.values["rule"],row.values["from_id"],row.values["to_id"]]) : row.values["relationship_id"]!;
      if (seen.has(id)) sourceError("overlay-record-duplicate", location);
      seen.add(id);
      return { values: row.values, location };
    });
  };
  return { aliases: parse("aliases.md"), rules: parse("rules.md"), relationships: parse("relationships.md") };
}
