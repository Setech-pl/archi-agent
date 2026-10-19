import { z } from "zod";
import { stableCompare } from "../util/ordering.js";
import { stableDigest, utf8Encode, type CanonicalValue } from "../util/stable-digest.js";
import { assertSafeDisplayText } from "../render/plantuml-escape.js";
import { deepFreeze, EnterpriseError, enterpriseLimits, type EnterpriseSnapshot } from "./enterprise-catalog.js";

export const capabilityMapSelectionSchema = z.strictObject({ rootIds: z.array(z.string()).max(1000), maxLevel: z.union([z.literal(1),z.literal(2),z.literal(3)]),
  colorBy: z.discriminatedUnion("kind", [z.strictObject({kind:z.literal("none")}),z.strictObject({kind:z.literal("rating"),scaleId:z.string()})]),
  language: z.enum(["pl","en"]), expectedCatalogDigest: z.string().regex(/^[0-9a-f]{64}$/) });
export type CapabilityMapSelection = z.infer<typeof capabilityMapSelectionSchema>;
export interface CapabilityMapProjection {
  readonly snapshot: EnterpriseSnapshot;
  readonly selection: CapabilityMapSelection;
  readonly visible: EnterpriseSnapshot["hierarchy"];
  readonly excluded: readonly { readonly id:string; readonly reason:"outside-selected-scope"|"below-detail-level" }[];
  readonly projectionDigest: string;
}
export function projectCapabilityMap(snapshot: EnterpriseSnapshot, raw: CapabilityMapSelection): CapabilityMapProjection {
  const parsed = capabilityMapSelectionSchema.safeParse(raw);
  if (!parsed.success) throw new EnterpriseError("invalid-selection");
  const selection = parsed.data, catalog = snapshot.catalog;
  if (selection.expectedCatalogDigest !== snapshot.catalogDigest) throw new EnterpriseError("stale-source");
  if (catalog.source.scope.coverage === "not-provided") throw new EnterpriseError("enterprise-data-unavailable");
  if (!catalog.capabilities.length) throw new EnterpriseError("empty-scope");
  if (new Set(selection.rootIds).size !== selection.rootIds.length || selection.rootIds.some(id => !snapshot.hierarchy.some(h => h.id === id && h.level === 1)) ||
    selection.colorBy.kind === "rating" && !catalog.scales.some(s => s.id === (selection.colorBy as {scaleId:string}).scaleId)) throw new EnterpriseError("invalid-selection");
  selection.rootIds.sort(stableCompare);
  const roots = selection.rootIds.length ? selection.rootIds : snapshot.hierarchy.filter(h => h.level === 1).map(h => h.id);
  const visible = snapshot.hierarchy.filter(h => roots.includes(h.rootId) && h.level <= selection.maxLevel);
  if (visible.length > enterpriseLimits.visible || roots.length > enterpriseLimits.roots) throw new EnterpriseError("map-too-large", [], visible.length);
  const excluded = snapshot.hierarchy.filter(h => !visible.includes(h)).map(h => ({id:h.id,
    reason: roots.includes(h.rootId) ? "below-detail-level" as const : "outside-selected-scope" as const}));
  const {expectedCatalogDigest: _expected, ...settings} = selection;
  return deepFreeze({snapshot, selection, visible, excluded, projectionDigest: stableDigest({ domain:"archi-agent-capability-map/1",
    catalogDigest:snapshot.catalogDigest, selection:settings, visibleRecords:visible as CanonicalValue, excludedIdsWithReasons:excluded, rendererVersion:1 })});
}

const palette = ["#E8D6E8", "#E5DFB7", "#CEE0EA", "#B8DAD5", "#C3D6B1", "#C7CCE5", "#D9C9BA"];
/** Break at word boundaries, never drop or abbreviate source text. Only renderer adds newlines. */
function wrap(value: string): string {
  assertSafeDisplayText(value, {maxChars:160});
  const lines: string[] = []; let current = "";
  for (const word of value.split(" ")) {
    if (current && [...current + " " + word].length > 32) { lines.push(current); current = ""; }
    const chars = [...word];
    while (chars.length > 32) { if(current) {lines.push(current);current="";} lines.push(chars.splice(0,32).join("")); }
    if(chars.length) current += (current ? " " : "") + chars.join("");
  }
  if(current) lines.push(current);
  return lines.join("\\n");
}
export function renderCapabilityMap(projection: CapabilityMapProjection): { plantUml: string; lines: Readonly<Record<string,number>> } {
  const {snapshot,selection,visible} = projection, pl = selection.language === "pl";
  const scale = selection.colorBy.kind === "rating" ? snapshot.catalog.scales.find(s => s.id === (selection.colorBy as {scaleId:string}).scaleId)! : undefined;
  const lines = ["@startuml", "!pragma layout smetana", "skinparam shadowing false", "skinparam roundcorner 8", "skinparam defaultTextAlignment center",
    `title ${pl ? "Mapa zdolności biznesowych" : "Capability Map"}`];
  const positions: Record<string,number> = {}, aliases = new Map(visible.map((h,i) => [h.id,`cap_${String(i+1).padStart(4,"0")}`]));
  const render = (parent: string|null, indent: string) => {
    for (const h of visible.filter(v => v.parentId === parent)) {
      const c = snapshot.catalog.capabilities.find(c => c.id === h.id)!;
      const value = scale ? c.ratings?.[scale.id] : undefined, index = scale?.levels.findIndex(l => l.value === value) ?? -1;
      const rating = index >= 0 ? `${value} - ${wrap(scale!.levels[index]!.label)}` : pl ? "Brak danych" : "No data";
      const suffix = scale ? `\\n${rating}` : "";
      positions[c.id] = lines.length + 1;
      const hasChildren = visible.some(v => v.parentId === c.id);
      lines.push(`${indent}rectangle "L${h.level} ${wrap(c.name)}${suffix}" as ${aliases.get(c.id)} ${index >= 0 ? palette[index] : "#EEEEEE"}${hasChildren ? " {" : ""}`);
      if(hasChildren) {render(c.id,indent+"  ");lines.push(`${indent}}`);}
    }
  };
  render(null, "");
  const {source} = snapshot.catalog;
  lines.push("legend", ...wrap(source.name).split("\\n").map(line=>`${pl ? "Źródło" : "Source"}: ${line}`),
    ...wrap(source.scope.description).split("\\n").map(line=>`${pl ? "Zakres źródła" : "Source scope"}: ${line}`), `${pl ? "Pokrycie" : "Coverage"}: ${source.scope.coverage}`,
    `${pl ? "Widok" : "View"}: ${selection.rootIds.length ? (pl ? "wybrane gałęzie L1" : "selected L1 branches") : pl ? "cała mapa" : "whole map"}; L1-L${selection.maxLevel}`,
    `${pl ? "Widoczne / pominięte" : "Visible / omitted"}: ${visible.length} / ${projection.excluded.length}`);
  if(scale) {
    lines.push(`${pl ? "Skala" : "Scale"}: ${scale.name}`);
    scale.levels.forEach((l,i) => lines.push(`|<#${palette[i]!.slice(1)}> ${l.value} | ${l.label} |`));
    lines.push(`|<#EEEEEE> - | ${pl ? "Brak danych" : "No data"} |`);
  } else lines.push(pl ? "Neutralne kolory - bez ocen" : "Neutral colors - ratings not shown");
  lines.push(pl ? "Oceny jawne; bez agregacji. Rozmiar kafla nie oznacza oceny." : "Explicit ratings; no aggregation. Tile size does not indicate rating.",
    pl ? "Projekcja deterministyczna; LLM: 0" : "Deterministic projection; LLM: 0", "endlegend", "@enduml");
  const plantUml = lines.join("\n") + "\n";
  validateCapabilityMapRender(plantUml, visible.length);
  return deepFreeze({plantUml,lines:positions});
}
/** Closed grammar, independent of source text. No user macros, URLs, includes or executable statements. */
export function validateCapabilityMapRender(text:string, count:number): void {
  if(utf8Encode(text).length > enterpriseLimits.plantUmlBytes) throw new EnterpriseError("map-too-large");
  const lines = text.trimEnd().split("\n");
  if(lines[0] !== "@startuml" || lines.at(-1) !== "@enduml" || lines[1] !== "!pragma layout smetana" ||
    lines[2] !== "skinparam shadowing false" || lines[3] !== "skinparam roundcorner 8" || lines[4] !== "skinparam defaultTextAlignment center" ||
    !["title Capability Map","title Mapa zdolności biznesowych"].includes(lines[5]!)) throw new EnterpriseError("render-invalid");
  let nesting = 0, legend = false, ended = false, nodes = 0; const aliases = new Set<string>();
  for(const line of lines.slice(6,-1)) {
    if(line === "legend" && !legend && nesting === 0) {legend=true;continue;}
    if(line === "endlegend" && legend) {legend=false;ended=true;continue;}
    if(ended) throw new EnterpriseError("render-invalid");
    if(legend) {
      const label = line.replace(/\|<#[A-F0-9]{6}>/g, "").replace(/\|/g, "").replace(/\\n/g," ");
      assertSafeDisplayText(label, {maxChars:2048}); continue;
    }
    if(/^\s*}$/.test(line)) {if(--nesting < 0) throw new EnterpriseError("render-invalid");continue;}
    const match = line.match(/^\s*rectangle "([^"\r\n]+)" as (cap_\d{4}) (#[A-F0-9]{6})( \{)?$/);
    if(!match || aliases.has(match[2]!)) throw new EnterpriseError("render-invalid");
    assertSafeDisplayText(match[1]!.replace(/\\n/g," "), {maxChars:512}); aliases.add(match[2]!);nodes++;
    if(match[4]) nesting++;
    if(nesting > 2) throw new EnterpriseError("render-invalid");
  }
  if(nesting || legend || !ended || nodes !== count) throw new EnterpriseError("render-invalid");
}
