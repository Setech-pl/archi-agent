import { z } from "zod";
import { stableDigest, sha256Hex } from "../util/stable-digest.js";
import { containsControlCharacter } from "../knowledge-pack/source-limits.js";
import { systemRowSchema, actorRowSchema, relationshipRowSchema, aliasRowSchema, ruleRowSchema,
  type KnowledgePack, type RecordProvenance, type SourceLocation, type RelationshipRecord } from "../knowledge-pack/knowledge-pack.schema.js";
import { createKnowledgeSnapshot, type KnowledgeContribution, type KnowledgeSource } from "../knowledge-pack/knowledge-snapshot.js";
import { buildKnowledgePackIndexes, crossFileIssues } from "../knowledge-pack/knowledge-pack-loader.js";
import { parseLocatedJson, sourceError } from "./json-with-locations.js";
import { parseKnowledgeOverlay, type OverlayTexts, type OverlayRow, overlayFiles } from "./knowledge-overlay.js";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : sourceError("structurizr-shape-invalid");
const array = (v: unknown): unknown[] => v === undefined ? [] : Array.isArray(v) ? v : sourceError("structurizr-shape-invalid");
const text = (v: unknown, at: SourceLocation): string => typeof v === "string" && v.length > 0 && v.length <= 256 && !containsControlCharacter(v) ? v : sourceError("source-identifier-invalid", at);
const validate = <T>(schema: z.ZodType<T>, v: unknown, at: SourceLocation): T => { const r = schema.safeParse(v); return r.success ? r.data : sourceError("source-record-invalid", at); };
const freeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
export const structurizrElementId = (sourceId: string, id: string): string => "sz-" + stableDigest(["structurizr-json", sourceId, "element", id]).slice(0, 60);
interface Element { id: string; kind: string; value: Record<string, unknown>; path: (string | number)[]; parent?: Element }
interface Relation { id: string; value: Record<string, unknown>; path: (string | number)[]; owner: string }

/** Pure, bounded import; original source IDs, not names, bind every overlay row. */
export function composeStructurizrKnowledge(modelText: string, texts: OverlayTexts, sourceId: string) {
  if (!/^[a-z][a-z0-9-]{0,55}$/.test(sourceId)) sourceError("source-id-invalid");
  const modelFile = `sources/${sourceId}/workspace.json`, overlayId = sourceId + "-overlay";
  const json = parseLocatedJson(modelText, modelFile), root = object(json.value), model = object(root["model"]);
  const elements = new Map<string, Element>(), relations: Relation[] = [], relationshipIds = new Set<string>();
  const walk = (value: unknown, kind: string, path: (string | number)[], parent?: Element) => {
    const e = object(value), at = json.at([...path, "id"]), id = text(e["id"], at);
    if (elements.has(id)) sourceError("source-identifier-duplicate", at);
    const entry: Element = { id, kind, value: e, path, ...(parent ? { parent } : {}) }; elements.set(id, entry);
    if (elements.size > 10_000) sourceError("source-limit-exceeded", at);
    array(e["relationships"]).forEach((v, i) => {
      const r = object(v), pathR = [...path, "relationships", i], idR = text(r["id"], json.at([...pathR, "id"]));
      if (relationshipIds.has(idR)) sourceError("source-identifier-duplicate", json.at(pathR));
      relationshipIds.add(idR); relations.push({ id: idR, value: r, path: pathR, owner: id });
      if (relations.length > 10_000) sourceError("source-limit-exceeded", json.at(pathR));
    });
    for (const [field, childKind] of [["containers", "container"], ["components", "component"]] as const)
      array(e[field]).forEach((v, i) => walk(v, childKind, [...path, field, i], entry));
  };
  array(model["people"]).forEach((v, i) => walk(v, "person", ["model", "people", i]));
  array(model["softwareSystems"]).forEach((v, i) => walk(v, "software-system", ["model", "softwareSystems", i]));
  const overlay = parseKnowledgeOverlay(texts, sourceId), imported = [...elements.values()].filter(e => e.kind !== "component");
  const ids = new Map(imported.map(e => [e.id, structurizrElementId(sourceId, e.id)]));
  if (new Set(ids.values()).size !== ids.size) sourceError("source-identifier-collision");
  const target = (id: string | undefined, at: SourceLocation) => ids.get(id ?? "") ?? sourceError("overlay-reference-missing", at);
  const provenance = (e: Element, fields: readonly string[], field: string): RecordProvenance => ({ sourceId,
    externalId: e.id, externalKind: e.kind, originalName: text(e.value["name"], json.at([...e.path, "name"])),
    ...(e.parent ? { parentId: e.parent.id } : {}), fields, location: json.at([...e.path, field]) });
  const toElement = (e: Element) => {
    const ownName = text(e.value["name"], json.at([...e.path, "name"]));
    const name = e.kind === "container" ? text(e.parent!.value["name"], json.at([...e.parent!.path, "name"])) + " / " + ownName : ownName;
    const data = validate(z.union([actorRowSchema, systemRowSchema]),
      { id: ids.get(e.id), canonical_name: name, kind: e.kind === "person" ? "person" : "system", description: e.value["description"] }, json.at(e.path));
    return { id: data.id, canonicalName: data.canonical_name, kind: data.kind, description: data.description, location: json.at(e.path),
      provenance: [provenance(e, ["id", "kind"], "id"), provenance(e, ["canonicalName"], "name"), provenance(e, ["description"], "description"),
        ...(e.kind === "container" ? [{ sourceId, fields: ["canonicalName"], externalId: e.parent!.id,
          originalName: text(e.parent!.value["name"], json.at([...e.parent!.path,"name"])), externalKind: "software-system", location: json.at([...e.parent!.path,"name"]) }] : [])] };
  };
  const converted = imported.map(toElement);
  const metadata = new Map<string, OverlayRow>();
  for (const row of overlay.relationships) {
    const id = row.values["relationship_id"]!;
    if (metadata.has(id)) sourceError("overlay-relationship-duplicate", row.location);
    metadata.set(id, row);
  }
  let skippedRelationships = 0;
  const relationships: RelationshipRecord[] = [];
  for (const r of relations) {
    const from = text(r.value["sourceId"], json.at([...r.path,"sourceId"])), to = text(r.value["destinationId"], json.at([...r.path,"destinationId"]));
    if (from !== r.owner) sourceError("relationship-owner-mismatch", json.at(r.path));
    if (!elements.has(from) || !elements.has(to)) sourceError("relationship-endpoint-missing", json.at(r.path));
    if (!ids.has(from) || !ids.has(to)) { skippedRelationships++; continue; }
    const row = metadata.get(r.id);
    if (!row) sourceError("relationship-metadata-missing", json.at(r.path));
    const v = row!.values;
    if (v["from_id"] !== from || v["to_id"] !== to) sourceError("overlay-relationship-endpoints-mismatch", row!.location);
    const style = r.value["interactionStyle"];
    if (style !== undefined && style !== "Synchronous" && style !== "Asynchronous") sourceError("relationship-mode-invalid", json.at([...r.path,"interactionStyle"]));
    const modelMode = style === "Synchronous" ? "synchronous" : style === "Asynchronous" ? "asynchronous" : undefined;
    const overlayMode = v["mode"] || undefined;
    if (modelMode && overlayMode && modelMode !== overlayMode) sourceError("relationship-mode-conflict", row!.location);
    const mode = modelMode ?? overlayMode;
    if (!mode) sourceError("relationship-mode-missing", row!.location);
    const data = validate(relationshipRowSchema, { from_id: ids.get(from), to_id: ids.get(to), interface_type: v["interface_type"], interface_name: v["interface_name"], mode, purpose: r.value["description"] }, row!.location);
    const proof = (fields: readonly string[], field: string): RecordProvenance => ({ sourceId, externalId: r.id, fields, location: json.at([...r.path,field]) });
    relationships.push({ fromId: data.from_id, toId: data.to_id, interfaceType: data.interface_type, interfaceName: data.interface_name,
      mode: data.mode, purpose: data.purpose, location: json.at(r.path), provenance: [proof(["fromId"],"sourceId"), proof(["toId"],"destinationId"), proof(["purpose"],"description"),
        { sourceId: overlayId, externalId: r.id, fields: ["interfaceType", ...(data.interface_name ? ["interfaceName"] : []), ...(overlayMode ? ["mode"] : [])], location: row!.location },
        ...(modelMode ? [proof(["mode"], "interactionStyle")] : [])] });
    metadata.delete(r.id);
  }
  if (metadata.size) sourceError("overlay-reference-missing", metadata.values().next().value!.location);
  const aliases = overlay.aliases.map(row => {
    const d = validate(aliasRowSchema, { alias: row.values["alias"], target_id: target(row.values["target_id"], row.location) }, row.location);
    return { alias: d.alias, targetId: d.target_id, location: row.location, provenance: [{ sourceId: overlayId, externalId: row.values["target_id"]!, fields: ["alias", "targetId"], location: row.location }] };
  });
  const rules = overlay.rules.map(row => {
    const d = validate(ruleRowSchema, { rule: row.values["rule"], from_id: target(row.values["from_id"], row.location), to_id: target(row.values["to_id"], row.location), reason: row.values["reason"] }, row.location);
    return { rule: d.rule, fromId: d.from_id, toId: d.to_id, reason: d.reason, location: row.location, provenance: [{ sourceId: overlayId, fields: ["rule", "fromId", "toId", "reason"], location: row.location }] };
  });
  const pack: KnowledgePack = { actors: converted.filter(e => e.kind === "person") as KnowledgePack["actors"],
    systems: converted.filter(e => e.kind !== "person") as KnowledgePack["systems"], relationships, aliases, rules };
  const issues = crossFileIssues(pack);
  if (issues.some(i => i.severity === "error")) sourceError(issues.find(i => i.severity === "error")!.code);
  const modelSource: KnowledgeSource = { id: sourceId, kind: "structurizr-json", scope: { systems: "partial", actors: "complete", relationships: "partial" },
    files: [{ file: modelFile, sha256: sha256Hex(modelText) }], omissions: [
      { kind: "components", count: elements.size - imported.length }, { kind: "component-relationships", count: skippedRelationships },
      { kind: "deployment-roots", count: array(model["deploymentNodes"]).length }, { kind: "views", count: root["views"] ? 1 : 0 }] };
  const overlaySource: KnowledgeSource = { id: overlayId, kind: "knowledge-overlay", scope: { aliases: "complete", rules: "complete", relationships: "partial" },
    files: overlayFiles.map(file => ({ file: `sources/${overlayId}/${file}`, sha256: sha256Hex(texts[file]) })) };
  const contributions: KnowledgeContribution[] = [{ source: modelSource, records: { systems: pack.systems, actors: pack.actors, relationships: pack.relationships } },
    { source: overlaySource, records: { aliases, rules } }];
  const knowledge = createKnowledgeSnapshot(contributions);
  if (knowledge.conflicts.length) sourceError("knowledge-conflicts-unresolved");
  return freeze({ pack, indexes: buildKnowledgePackIndexes(pack), knowledge, warnings: issues.filter(i => i.severity === "warning") });
}
