import {sourceReferenceSchema}from"../core/knowledge-pack/source-reference.js";
import { z } from "zod";
import { flowInterpretationSchema } from "../core/verification/flow-interpretation.js";
import type { VerifyFlowReport } from "../core/verification/compare-flow.js";
import type { VerifyFlowOutcome } from "./verify-flow.js";
import { documentProvenanceSchema } from "../core/knowledge-pack/document-provenance.js";
import { systemKinds, actorKinds, interfaceTypes } from "../core/knowledge-pack/knowledge-pack.schema.js";
import type { KnowledgeFact } from "../core/knowledge-pack/knowledge-snapshot.js";
import type { GenerateDiagramOutcome } from "./runtime-types.js";
import {capabilityMapReportSchema,enterpriseTransportSchema} from "../core/enterprise/capability-map-report.js";
import {enterpriseCatalogSchema} from "../core/enterprise/enterprise-catalog.js";

const text = z.string().max(2000), id = z.string().min(1).max(256);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(100000);
const table = z.enum(["systems","actors","relationships","aliases","rules"]);
const location = z.strictObject({ file: z.string().min(1).max(256), line: z.number().int().positive() });
const provenance = z.strictObject({ reference:sourceReferenceSchema.optional(),sourceId:id, location:location.optional(), fields:z.array(id).max(32).optional(), externalId:id.optional(),
  originalName:text.optional(), externalKind:id.optional(), parentId:id.optional() });
const architecture = z.strictObject({ kind:z.enum(["person","software-system","container"]), parentId:id.optional(), technology:text.optional() });
const commonElement = { id, canonicalName:text, description:text, architecture:architecture.optional() };
const proof = { id:z.string().regex(/^fact-[a-f0-9]{64}$/), provenance:z.array(provenance).min(1).max(10000) };
export const elementEvidenceSchema = z.discriminatedUnion("table", [
  z.strictObject({ ...proof, table:z.literal("systems"), value:z.strictObject({...commonElement,kind:z.enum(systemKinds)}) }),
  z.strictObject({ ...proof, table:z.literal("actors"), value:z.strictObject({...commonElement,kind:z.enum(actorKinds)}) })
]);
const factEvidenceSchema = z.discriminatedUnion("table", [
  z.strictObject({...proof,table:z.literal("relationships"),value:z.strictObject({fromId:id,toId:id,interfaceType:z.enum(interfaceTypes),interfaceName:text.optional(),mode:z.enum(["synchronous","asynchronous"]),purpose:text})}),
  z.strictObject({...proof,table:z.literal("aliases"),value:z.strictObject({alias:text,targetId:id})}),
  z.strictObject({...proof,table:z.literal("rules"),value:z.strictObject({rule:z.enum(["require","forbid"]),fromId:id,toId:id,reason:text})})
]);
const omission = z.strictObject({kind:id,count});
export const sourceSummarySchema = z.strictObject({reference:sourceReferenceSchema.optional(),id,kind:id,scope:z.strictObject({
  systems:z.enum(["partial","complete"]).optional(),actors:z.enum(["partial","complete"]).optional(),relationships:z.enum(["partial","complete"]).optional(),
  aliases:z.enum(["partial","complete"]).optional(),rules:z.enum(["partial","complete"]).optional()}),
  files:z.array(z.strictObject({file:z.string().max(256),sha256:digestSchema})).max(16).optional(),omissions:z.array(omission).max(32).optional()});
const gap = z.strictObject({code:z.enum(["scope-not-provided","scope-partial","locator-unavailable","missing-reference","required-relationship-missing"]),sourceId:id.optional(),table:table.optional(),factId:id.optional(),targetId:id.optional()});
const conflict = z.strictObject({code:z.enum(["incompatible-records","identifier-collision","conflicting-rules","forbidden-relationship"]),factIds:z.array(id).max(20000)});
const ambiguity = z.strictObject({alias:text,targetIds:z.array(id).max(10000)});
// Reuse the production evidence schema while removing machine-local editor identity.
const documentEvidence = z.strictObject({...documentProvenanceSchema.shape,
  sources:z.array(z.strictObject({...documentProvenanceSchema.shape.sources.element.shape,editorUri:z.never().optional()})).max(8)});
const span = flowInterpretationSchema.shape.participants.element.shape.evidence;
export const nameDecisionSchema = z.strictObject({mentionId:z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),expectedSnapshotDigest:digestSchema,targetElementId:z.string().min(1).max(64),confirmed:z.literal(true)});
const findingBase = { stepId:id.optional(),mentionId:id.optional(),inputSpan:span.optional(),factIds:z.array(id).max(10000) };
const plainFinding = z.strictObject({...findingBase,code:z.enum(["unknown-element","ambiguous-element","insufficient-data","relationship-ambiguous","forbidden-interaction","direction-mismatch","required-interaction-not-shown","syntax-not-covered"]),details:z.strictObject({reason:text}).optional()});
const finding = z.union([plainFinding,
  z.strictObject({...findingBase,code:z.literal("relationship-not-in-model"),details:z.strictObject({scope:z.enum(["loaded-model-only","explicit-interface-not-in-loaded-model"])})}),
  z.strictObject({...findingBase,code:z.literal("interaction-mode-conflict"),details:z.strictObject({observed:z.enum(["synchronous","asynchronous"]),expected:z.array(z.enum(["synchronous","asynchronous"])).max(2)})}),
  z.strictObject({...findingBase,code:z.literal("source-not-covered"),details:z.strictObject({omissions:z.array(z.strictObject({sourceId:id,...omission.shape})).max(2048),scope:z.literal("outside-imported-projection")})})
]);
export const portableVerificationSchema = z.strictObject({schemaVersion:z.literal(1),report:z.strictObject({
  version:z.literal(1),execution:z.enum(["completed","needs-resolution"]),assessment:z.enum(["conformant-within-scope","discrepancies","inconclusive"]),snapshot:z.strictObject({id,digest:digestSchema}),
  input:z.strictObject({format:z.enum(["plantuml-sequence","prose"]),sha256:digestSchema,fileName:z.string().max(160),firstLine:z.number().int().positive()}),
  interpretation:flowInterpretationSchema,interpretationDigest:digestSchema,modelCalls:z.number().int().min(0).max(1),
  resolutions:z.array(z.strictObject({mentionId:id,mention:text,status:z.enum(["resolved","ambiguous","unknown"]),targetId:id.optional(),candidateIds:z.array(id).max(10000),basis:id})).max(64),
  decisions:z.array(nameDecisionSchema).max(64),steps:z.array(z.strictObject({stepId:id,status:z.enum(["conformant","discrepant","unresolved"]),factIds:z.array(id).max(10000)})).max(256),
  findings:z.array(finding).max(100),coverage:z.strictObject({steps:count,conformant:count,discrepant:count,unresolved:count,omitted:count,findingsTruncated:z.boolean()}),limitations:z.array(text).max(32)
}),evidence:z.strictObject({scope:z.literal("selected-verification-evidence"),snapshotId:id,snapshotDigest:digestSchema,sources:z.array(sourceSummarySchema).max(64),
  elements:z.array(elementEvidenceSchema).max(20000),facts:z.array(factEvidenceSchema).max(50000),gaps:z.array(gap).max(100000),conflicts:z.array(conflict).max(50000),ambiguities:z.array(ambiguity).max(10000),documentProvenance:z.array(documentEvidence).max(5)})});
export type PortableVerificationV1 = z.infer<typeof portableVerificationSchema>;
export class HostResultError extends Error { constructor(readonly code:"result-contract-invalid"|"result-too-large"){super(code);} }

/** Projection only: preserves the original assessment and all explicitly referenced evidence. */
export function serializeFlowVerificationForHost(report:VerifyFlowReport):PortableVerificationV1 {
  const {sourceProvenance:snapshot,...assessment}=report;
  const selected = new Set(report.resolutions.flatMap(r=>[...(r.targetId?[r.targetId]:[]),...r.candidateIds]));
  const required = new Set([...report.steps,...report.findings].flatMap(s=>s.factIds));
  const relevant = (f:KnowledgeFact) => f.table==="systems"||f.table==="actors" ? selected.has(f.value.id) : f.table==="aliases" ? selected.has(f.value.targetId) : selected.has(f.value.fromId)&&selected.has(f.value.toId);
  let facts = snapshot.facts.filter(f=>required.has(f.id)||relevant(f));
  for(const c of snapshot.conflicts) if(c.factIds.some(id=>facts.some(f=>f.id===id))) c.factIds.forEach(id=>required.add(id));
  for(const f of snapshot.facts.filter(f=>required.has(f.id))) {
    if(f.table==="relationships"||f.table==="rules"){selected.add(f.value.fromId);selected.add(f.value.toId);}
    if(f.table==="aliases")selected.add(f.value.targetId);
  }
  facts=snapshot.facts.filter(f=>required.has(f.id)||relevant(f));
  const factIds=new Set(facts.map(f=>f.id));
  if([...required].some(id=>!factIds.has(id)))throw new HostResultError("result-contract-invalid");
  const documents=(snapshot.documentProvenance??[]).map(m=>{
    const entries=m.entries.filter(e=>e.candidate.table==="systems"||e.candidate.table==="actors"?selected.has(e.candidate.row.id):e.candidate.table==="aliases"?selected.has(e.candidate.row.target_id):selected.has(e.candidate.row.from_id)&&selected.has(e.candidate.row.to_id));
    return {...m,entries,sources:m.sources.filter(s=>entries.some(e=>e.evidence.some(v=>v.sourceId===s.sourceId))).map(({editorUri:_uri,...s})=>s)};
  }).filter(m=>m.entries.length);
  const result={schemaVersion:1,report:assessment,evidence:{scope:"selected-verification-evidence",snapshotId:snapshot.id,snapshotDigest:snapshot.digest,sources:snapshot.sources,
    elements:facts.filter(f=>f.table==="systems"||f.table==="actors"),facts:facts.filter(f=>f.table!=="systems"&&f.table!=="actors"),
    gaps:snapshot.gaps.filter(g=>g.factId?factIds.has(g.factId):g.targetId?selected.has(g.targetId):true),
    conflicts:snapshot.conflicts.filter(c=>c.factIds.some(id=>factIds.has(id))),ambiguities:snapshot.ambiguities.filter(a=>a.targetIds.some(id=>selected.has(id))),documentProvenance:documents}};
  const parsed=portableVerificationSchema.safeParse(result);
  if(!parsed.success)throw new HostResultError("result-contract-invalid");
  return parsed.data;
}

const code=z.string().regex(/^[a-z][a-z0-9-]{0,95}$/);
const syntaxIssue=z.strictObject({code,span:span.optional()});
export const portableVerificationOutcomeSchema=z.union([
  z.strictObject({status:z.literal("completed"),report:portableVerificationSchema}),z.strictObject({status:z.literal("needs-resolution"),report:portableVerificationSchema}),
  z.strictObject({status:z.enum(["unsupported","invalid-input","stale-source","failed","cancelled"]),code,issues:z.array(syntaxIssue).max(100).optional()})
]);
export function portableVerificationOutcome(outcome:VerifyFlowOutcome) {
  return "report" in outcome?{status:outcome.status,report:serializeFlowVerificationForHost(outcome.report)}:{status:outcome.status,code:outcome.code,...(outcome.issues?{issues:outcome.issues}:{})};
}
const detailValue=z.union([text,z.number().finite(),z.boolean(),z.array(text).max(100)]);
const issue=z.strictObject({severity:z.enum(["error","warning"]),code,message:text,file:text.optional(),line:count.optional(),column:z.union([count,text]).optional(),path:text.optional(),
  details:z.strictObject(Object.fromEntries(["order","fromId","toId","expected","actual","elementId","expectedKind","limit","problem","problems","mention","newParticipant","rule","line","stepIndex","count","candidateIds","participantIds","interfaceType","interfaceName","expectedType"].map(k=>[k,detailValue.optional()]))).optional()});
const summary=z.strictObject(Object.fromEntries(["participantCount","knownParticipantCount","newParticipantCount","messageCount","synchronousCount","asynchronousCount","responseCount","selfMessageCount","warningCount"].map(k=>[k,count])));
const enterpriseFailure=z.strictObject({status:z.enum(["failed","unsupported"]),diagramType:z.literal("capability-map"),code,
  issues:z.array(z.strictObject({code:z.string().max(128),path:z.array(z.union([z.string().max(256),z.number().int().nonnegative()])).max(64),location:location.optional()})).max(100),count:count.optional()});
export const portableDiagramOutcomeSchema=z.union([
  z.strictObject({status:z.literal("success"),diagramType:z.literal("capability-map"),plantUml:z.string().max(256*1024),report:capabilityMapReportSchema}),enterpriseFailure,
  z.strictObject({status:z.literal("success"),diagramName:text,generatorType:text,digest:digestSchema,plantUml:z.string().max(1024*1024),diagramFileName:text,groundingReport:z.string().max(4*1024*1024),reportFileName:text,summary,warnings:z.array(issue).max(100)}),
  z.strictObject({status:z.literal("unverified"),plantUmlCandidate:z.string().max(1024*1024),review:z.union([z.strictObject({status:z.literal("rejected"),violationCodes:z.array(code).max(100)}),z.strictObject({status:z.literal("failed"),problemCode:code})])}),
  z.strictObject({status:z.literal("failed"),stage:z.enum(["flow","knowledge-pack","generator-configuration","grounding-blocked","invalid-generator-output","semantic-validation-failed","render-validation-failed"]),issues:z.array(issue).max(100),
    ambiguities:z.array(z.strictObject({mention:text,candidates:z.array(z.strictObject({id,participantType:z.enum(["actor","system"]),elementKind:text,canonicalName:text,sourceFile:text.optional(),sourceLine:count.optional(),sourceProvenance:z.array(provenance).max(10000).optional()})).max(10000),lines:z.array(count).max(2000)})).max(64),unconfirmedNewParticipants:z.array(text).max(64)})
]);
export function portableDiagramOutcome(outcome:GenerateDiagramOutcome){
  if(outcome.status!=="success")return outcome;
  const {artifact:_artifact,...portable}=outcome;return portable;
}
export const inspectionOutcomeSchema=z.union([
  z.strictObject({status:z.literal("success"),diagramType:z.literal("capability-map"),source:enterpriseCatalogSchema.shape.source,
    snapshot:z.strictObject({id:z.string().regex(/^enterprise-[0-9a-f]{64}$/),catalogDigest:digestSchema}),
    sourceEvidence:z.union([z.strictObject({kind:z.literal("enterprise-json"),file:z.string().max(256),sourceBytesSha256:digestSchema}),enterpriseTransportSchema]),
    counts:z.strictObject({capabilities:z.number().int().min(0).max(1000),scales:z.number().int().min(0).max(8)}),
    roots:z.array(z.strictObject({id:z.string().max(64),name:z.string().max(320)})).max(1000),scales:z.array(z.strictObject({id:z.string().max(64),name:z.string().max(320)})).max(8)}),enterpriseFailure,
  z.strictObject({status:z.literal("success"),snapshot:z.strictObject({id,digest:digestSchema}),sourceFingerprint:digestSchema,sourceVersion:digestSchema,
    counts:z.strictObject({systems:count,actors:count,relationships:count,aliases:count,rules:count}),sources:z.array(sourceSummarySchema).max(64),elements:z.array(elementEvidenceSchema).max(64),
    page:z.strictObject({total:count,offset:count,limit:count,hasMore:z.boolean()}),c4Available:z.boolean()}),
  z.strictObject({status:z.enum(["failed","stale-source","cancelled"]),code})
]);
const meta=z.strictObject({adapter:z.enum(["vscode","cli","mcp"]),runId:z.string().uuid(),startedAt:z.string().datetime(),elapsedMs:z.number().nonnegative()});
export const hostResultSchema=z.discriminatedUnion("operation",[
  z.strictObject({schemaVersion:z.literal(1),operation:z.literal("knowledge.inspect"),outcome:inspectionOutcomeSchema,meta}),
  z.strictObject({schemaVersion:z.literal(1),operation:z.literal("flow.verify"),outcome:portableVerificationOutcomeSchema,meta}),
  z.strictObject({schemaVersion:z.literal(1),operation:z.literal("diagram.generate"),outcome:portableDiagramOutcomeSchema,meta})
]);
export type HostResultV1=z.infer<typeof hostResultSchema>;
export function validateHostResult(result:unknown):HostResultV1 {
  const parsed=hostResultSchema.safeParse(result);if(!parsed.success)throw new HostResultError("result-contract-invalid");
  if(Buffer.byteLength(JSON.stringify(result),"utf8")>4*1024*1024)throw new HostResultError("result-too-large");
  return result as HostResultV1;
}
