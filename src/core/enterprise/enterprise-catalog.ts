import { z } from "zod";
import { displayTextProblem } from "../render/plantuml-escape.js";
import { sourceReferenceSchema } from "../knowledge-pack/source-reference.js";
import { canonicalSerialize, stableDigest, type CanonicalValue } from "../util/stable-digest.js";
import { stableCompare } from "../util/ordering.js";
import type { SourceLocation } from "../knowledge-pack/knowledge-pack.schema.js";

export const enterpriseLimits = Object.freeze({ bytes: 1024 * 1024, records: 1000, depth: 3,
  visible: 120, roots: 12, plantUmlBytes: 256 * 1024, reportBytes: 1024 * 1024 });
const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const text = (max: number) => z.string().min(1).refine(s => [...s].length <= max, "text-limit")
  .refine(s => s === s.trim() && s === s.normalize("NFC") && !/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(s), "text-invalid");
const label = text(160).refine(s => displayTextProblem(s, { maxChars: 160 }) === undefined, "unsafe-label");
const provenance = z.array(z.strictObject({ sourceId: id, recordId: text(128),
  fields: z.array(z.string().max(128)).min(1).max(32), reference: sourceReferenceSchema.optional() })).min(1).max(16);
const capability = z.strictObject({ id, name: label, description: text(2000), parentId: id.optional(),
  ratings: z.record(id, z.number().int().min(0).max(100)).refine(r => Object.keys(r).length <= 8).optional(), provenance });
const scale = z.strictObject({ id, name: label, levels: z.array(z.strictObject({ value: z.number().int().min(0).max(100), label })).min(2).max(7), provenance });
export const enterpriseCatalogSchema = z.strictObject({ schemaVersion: z.literal(1), format: z.literal("archi-agent-enterprise/1"),
  source: z.strictObject({ id, name: label, scope: z.strictObject({ id, description: label,
    coverage: z.enum(["partial", "complete", "not-provided"]) }) }),
  scales: z.array(scale).max(8), capabilities: z.array(capability).max(enterpriseLimits.records) });
export const applicationSchema = z.strictObject({id, name:label, description:text(2000).optional(), provenance});
export const supportSchema = z.strictObject({applicationId:id, capabilityId:id, provenance});
const coverage = z.enum(["partial", "complete", "not-provided"]);
export const enterpriseCatalogV2Schema = enterpriseCatalogSchema.extend({schemaVersion:z.literal(2),format:z.literal("archi-agent-enterprise/2"),
  applications:z.array(applicationSchema).max(1000), supports:z.array(supportSchema).max(4000),
  supportScope:z.strictObject({description:label,applications:coverage,relationships:coverage})});
export const enterpriseCatalogReadSchema = z.discriminatedUnion("schemaVersion",[enterpriseCatalogSchema,enterpriseCatalogV2Schema]);
export type EnterpriseCatalogV1 = z.infer<typeof enterpriseCatalogSchema>;
export type EnterpriseCatalogV2 = z.infer<typeof enterpriseCatalogV2Schema>;
export type EnterpriseCatalog = EnterpriseCatalogV1 | EnterpriseCatalogV2;
export type Capability = EnterpriseCatalog["capabilities"][number];
export interface EnterpriseIssue { readonly code: string; readonly path: readonly (string | number)[]; readonly location?: SourceLocation }
export class EnterpriseError extends Error {
  constructor(readonly code: string, readonly issues: readonly EnterpriseIssue[] = [], readonly count?: number) { super(code); }
}
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
/** Validation never repairs names, parents, ratings or provenance. */
export function validateEnterpriseCatalog(raw: unknown): EnterpriseCatalog {
  const parsed = enterpriseCatalogReadSchema.safeParse(raw);
  if (!parsed.success) throw new EnterpriseError("invalid-source", parsed.error.issues.slice(0, 100).map(i => ({
    code: i.message === "unsafe-label" ? "unsafe-label" : i.code, path: i.path.map(p => typeof p === "number" ? p : String(p))
  })), parsed.error.issues.length);
  const catalog = parsed.data, issues: EnterpriseIssue[] = [];
  const problem = (code: string, path: (string | number)[]) => { issues.push({ code, path }); };
  const records = new Map<string, Capability>(), scales = new Map<string, EnterpriseCatalog["scales"][number]>();
  function checkProvenance(record: {provenance: Capability["provenance"]}, fields: string[], base: (string | number)[]) {
    const covered = new Set<string>();
    record.provenance.forEach((p, i) => {
      if (p.sourceId !== catalog.source.id || new Set(p.fields).size !== p.fields.length || p.fields.some(f => !fields.includes(f)))
        problem("provenance-invalid", [...base, "provenance", i]);
      p.fields.forEach(f => covered.add(f));
    });
    if (fields.some(f => !covered.has(f))) problem("provenance-incomplete", [...base, "provenance"]);
  }
  catalog.scales.forEach((s, i) => {
    if (scales.has(s.id)) problem("duplicate-scale-id", ["scales", i, "id"]);
    scales.set(s.id, s);
    if (s.levels.some((v, n) => n > 0 && v.value <= s.levels[n - 1]!.value)) problem("scale-levels-invalid", ["scales", i, "levels"]);
    checkProvenance(s, ["/name", "/levels"], ["scales", i]);
  });
  catalog.capabilities.forEach((c, i) => {
    if (records.has(c.id)) problem("duplicate-capability-id", ["capabilities", i, "id"]);
    records.set(c.id, c);
    for (const [key, value] of Object.entries(c.ratings ?? {}))
      if (!scales.get(key)?.levels.some(l => l.value === value)) problem("rating-invalid", ["capabilities", i, "ratings", key]);
    checkProvenance(c, ["/name", "/description", ...(c.parentId ? ["/parentId"] : []),
      ...Object.keys(c.ratings ?? {}).map(s => `/ratings/${s}`)], ["capabilities", i]);
  });
  catalog.capabilities.forEach((c, i) => {
    let current: Capability | undefined = c, depth = 0;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current.id)) { problem(current.id === c.id && c.parentId === c.id ? "self-parent" : "hierarchy-cycle", ["capabilities", i, "parentId"]); break; }
      visited.add(current.id); depth++;
      if (depth > enterpriseLimits.depth) { problem("hierarchy-too-deep", ["capabilities", i, "parentId"]); break; }
      if (!current.parentId) break;
      const parent = records.get(current.parentId);
      if (!parent) { problem("parent-missing", ["capabilities", i, "parentId"]); break; }
      current = parent;
    }
  });
  if (catalog.source.scope.coverage === "not-provided" && catalog.capabilities.length) problem("coverage-invalid", ["source", "scope", "coverage"]);
  if(catalog.schemaVersion===2){
    const apps=new Set<string>(),pairs=new Set<string>();
    catalog.applications.forEach((a,i)=>{
      if(apps.has(a.id))problem("duplicate-application-id",["applications",i,"id"]);
      apps.add(a.id);checkProvenance(a,["/name",...(a.description!==undefined?["/description"]:[])],["applications",i]);
    });
    catalog.supports.forEach((r,i)=>{
      const key=JSON.stringify([r.applicationId,r.capabilityId]);
      if(pairs.has(key))problem("duplicate-support",["supports",i]);pairs.add(key);
      if(!apps.has(r.applicationId))problem("application-missing",["supports",i,"applicationId"]);
      if(!records.has(r.capabilityId))problem("capability-missing",["supports",i,"capabilityId"]);
      checkProvenance(r,["/applicationId","/capabilityId"],["supports",i]);
    });
    if(catalog.supportScope.applications==="not-provided"&&catalog.applications.length)problem("coverage-invalid",["supportScope","applications"]);
    if(catalog.supportScope.relationships==="not-provided"&&catalog.supports.length)problem("coverage-invalid",["supportScope","relationships"]);
  }
  if (issues.length) throw new EnterpriseError("invalid-source", issues.slice(0, 100), issues.length);
  return catalog;
}

export interface LocalEnterpriseEvidence {
  readonly file: string;
  readonly sourceBytesSha256: string;
  readonly capabilities: Readonly<Record<string, { readonly pointer: string; readonly fields: Readonly<Record<string, SourceLocation>> }>>;
  readonly scales: Readonly<Record<string, { readonly pointer: string; readonly location: SourceLocation }>>;
  readonly applications?: Readonly<Record<string,{readonly pointer:string;readonly location:SourceLocation}>>;
  readonly supports?: Readonly<Record<string,{readonly pointer:string;readonly location:SourceLocation}>>;
}
export interface McpEnterpriseEvidence {
  readonly kind: "mcp";
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly responseFingerprint: string;
  readonly tool: "get_enterprise_snapshot" | "get_enterprise_snapshot_v2";
  readonly contractVersion: 1 | 2;
  readonly capabilities: Readonly<Record<string, { readonly pointer: string; readonly fields: Readonly<Record<string, {readonly pointer:string}>> }>>;
  readonly scales: Readonly<Record<string, {readonly pointer:string}>>;
  readonly applications?: Readonly<Record<string,{readonly pointer:string}>>;
  readonly supports?: Readonly<Record<string,{readonly pointer:string}>>;
}
export type EnterpriseEvidence = LocalEnterpriseEvidence | McpEnterpriseEvidence;
export interface EnterpriseSnapshot<E extends EnterpriseEvidence = EnterpriseEvidence> {
  readonly catalog: EnterpriseCatalog;
  readonly catalogDigest: string;
  readonly evidence: E;
  readonly hierarchy: readonly { readonly id: string; readonly parentId: string | null; readonly level: number; readonly rootId: string }[];
  readonly duplicateNames: readonly string[];
}
export function createEnterpriseSnapshot<E extends EnterpriseEvidence>(catalog: EnterpriseCatalog, evidence: E): EnterpriseSnapshot<E> {
  // Own all data before freezing. Adapter positions are excluded from semantic identity.
  const owned = validateEnterpriseCatalog(catalog);
  const normalize = (p: Capability["provenance"]) => p.map(v => ({ ...v, fields: [...v.fields].sort(stableCompare) }))
    .sort((a, b) => stableCompare(canonicalSerialize(a), canonicalSerialize(b)));
  owned.capabilities = owned.capabilities.map(c => ({ ...c, provenance: normalize(c.provenance) })).sort((a,b) => stableCompare(a.id,b.id));
  owned.scales = owned.scales.map(s => ({ ...s, provenance: normalize(s.provenance) })).sort((a,b) => stableCompare(a.id,b.id));
  if(owned.schemaVersion===2){
    owned.applications=owned.applications.map(a=>({...a,provenance:normalize(a.provenance)})).sort((a,b)=>stableCompare(a.id,b.id));
    owned.supports=owned.supports.map(r=>({...r,provenance:normalize(r.provenance)})).sort((a,b)=>stableCompare(a.applicationId,b.applicationId)||stableCompare(a.capabilityId,b.capabilityId));
  }
  const records = new Map(owned.capabilities.map(c => [c.id, c]));
  const hierarchy = owned.capabilities.map(c => {
    let root = c, level = 1;
    while (root.parentId) { root = records.get(root.parentId)!; level++; }
    return { id: c.id, parentId: c.parentId ?? null, level, rootId: root.id };
  });
  const names = new Map<string, number>();
  owned.capabilities.forEach(c => names.set(c.name, (names.get(c.name) ?? 0) + 1));
  return deepFreeze({ catalog: owned, catalogDigest: stableDigest({ domain: `archi-agent-enterprise-snapshot/${owned.schemaVersion}`, catalog: owned as CanonicalValue }),
    evidence: structuredClone(evidence), hierarchy, duplicateNames: [...names].filter(([,n]) => n > 1).map(([name]) => name).sort(stableCompare) });
}
