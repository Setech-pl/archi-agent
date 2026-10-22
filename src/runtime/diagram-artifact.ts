import {applicationMapReportSchema,type ApplicationMapReport} from "../core/enterprise/capability-application-report.js";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { canonicalSerialize, type CanonicalValue } from "../core/util/stable-digest.js";
import { isSafeModelId } from "../core/llm/structured-chat-client.js";
import type { KnowledgeSnapshot } from "../core/knowledge-pack/knowledge-snapshot.js";
import { canonicalDirectory, resolveContainedPath } from "../node/local-file-path.js";
import { createExclusiveArtifactFiles, StarterPackCreateError, type StarterPackCreateOptions } from "./knowledge-pack-onboarding.js";
import type { GenerateSequenceDiagramSuccess, GenerateSequenceDiagramRequest } from "./runtime-types.js";
import { capabilityMapReportSchema, type CapabilityMapReport } from "../core/enterprise/capability-map-report.js";

export interface DiagramArtifact {
  readonly resultId: string;
  readonly createdAt: string;
  readonly diagramType: "sequence" | "component" | "c4-context" | "c4-container" | "capability-map" | "capability-application-map";
  readonly plantUml: string;
  readonly report: Readonly<Record<string, CanonicalValue>>;
  readonly metadata: Readonly<Record<string, CanonicalValue>>;
}
const sourceLocations = new WeakMap<DiagramArtifact, { pack: string|null; model?: string; flow: string | null; enterprise?:string|null; enterpriseRemote?:{sourceId:string;tool:"get_enterprise_snapshot"|"get_enterprise_snapshot_v2";contractVersion:1|2} }>();
const completed = new WeakSet<DiagramArtifact>();
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Canonical JSON: UTF-16 sorted object keys, ordered arrays, UTF-8, no whitespace or trailing LF. */
export const serializeArtifactConfiguration = (value: CanonicalValue): string => canonicalSerialize(value);
const safeProviderProfileId = (value: string | undefined): string | null => value !== undefined &&
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value) && !value.includes("//") && !/^[A-Za-z]:/.test(value) && !/^file:/i.test(value) ? value : null;
const safeModelId = (value: unknown): string | null => isSafeModelId(value) ? value : null;
type Projection = "scalar" | "scalars" | { readonly [key: string]: Projection } | readonly [Projection];
const fields = (names: string): Record<string, Projection> => Object.fromEntries(names.split(" ").map((key) => [key, "scalar"]));
const locator = fields("file line column length field");
const modelFields = fields("type providerProfileId modelId temperature seed attemptCount structuredOutput callCount");
const warning = { ...fields("origin code severity message path"), location: locator,
  details: { ...fields("order fromId toId elementId newParticipant mention expectedKind limit problem actual name key"), expected: "scalars", problems: "scalars" } } satisfies Projection;
const reportProjection: Projection = {
  c4: {...fields("systemId scope omittedRelationships"),limitations:"scalars",elements:[{...fields("id name kind parentId description technology"),provenance:[{...fields("sourceId externalId originalName externalKind parentId"),fields:"scalars",location:locator}]}]},
  ...fields("reportSchemaVersion diagramType generationPath attemptCount diagramName flowName author language generatorType"),
  snapshotDigest: fields("algorithm value"), groundingDigest: fields("algorithm value"),
  generator: modelFields, reviewer: modelFields, modelGeneration: modelFields,
  facts: [{ ...fields("factId label kind requestFactId operationId flowEvidenceId evidenceId evidenceClass interfaceType interfaceName mode fromId toId lineNumber"), source: locator }],
  deterministicValidation: fields("verdict"), semanticReview: { verdict: "scalar", violations: [fields("code factId")] },
  sources: { ...fields("flowFile knowledgePackDirectory flow knowledgePack"), evidence: [fields("id file line evidenceClass elementKind ownership origin")] },
  sourceProvenance: { ...fields("version snapshotId digest"), sources: [{...fields("id kind"), scope: fields("systems actors relationships aliases rules"), files: [fields("file sha256")], omissions: [fields("kind count")] }],
    facts: [{...fields("factId recordKey"), provenance: [{...fields("sourceId externalId originalName externalKind parentId"),fields:"scalars",location:locator}]}] },
  outputs: fields("diagram report"),
  knownParticipants: [{ ...fields("elementId participantType elementKind diagramKind canonicalName usedInDiagram resolution"),
    matchKinds: "scalars", source: locator, flowMentions: [locator] }],
  newParticipants: [{ ...fields("key displayName grounded usedInDiagram"), flowMentions: [locator] }],
  relationships: [{ ...fields("fromId toId interfaceType interfaceName mode purpose"), source: locator, supportsMessages: "scalars" }],
  rules: [{ ...fields("rule fromId toId reason"), source: locator }],
  ambiguitySelections: [{ ...fields("mention selectedId"), candidates: "scalars" }],
  messages: [fields("order from to interfaceType interfaceName mode response verification")],
  fragments: [{ ...fields("kind firstOrder lastOrder"), elseBranchFirstOrders: "scalars" }],
  warnings: [warning], validation: fields("schema normalization participantGrounding relationships interfaceNamePolicy plantUmlSubset officialPlantUmlRendering errorCount warningCount")
};
/** Contextual allowlist: never adopt unknown keys or objects into a scalar field. */
function project(value: unknown, shape: Projection): CanonicalValue {
  if (shape === "scalar") {
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error("artifact-report-invalid");
  }
  if (shape === "scalars") return Array.isArray(value) ? value.map((v) => project(v, "scalar")) : project(value, "scalar");
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new Error("artifact-report-invalid");
    return value.map((v) => project(v, shape[0]!));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("artifact-report-invalid");
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(shape).filter(([key]) => Object.hasOwn(record, key)).map(([key, child]) => [key, project(record[key], child)]));
}

/** Called only by runtime success mapping with the already loaded snapshot and actual request. */
export function captureDiagramArtifact(result: GenerateSequenceDiagramSuccess, request: GenerateSequenceDiagramRequest,
  knowledge: KnowledgeSnapshot, diagramType: "sequence" | "component" | "c4-context" | "c4-container", runId: string | null,
  extensionVersion: string | null): DiagramArtifact {
  const report = project(JSON.parse(result.groundingReport), reportProjection) as Record<string, CanonicalValue>;
  for (const key of ["generator", "reviewer", "modelGeneration"]) {
    if (report[key] && typeof report[key] === "object" && !Array.isArray(report[key])) {
      const model = report[key] as Record<string, CanonicalValue>;
      report[key] = { ...model, ...(typeof model.modelId === "string" ? { modelId: safeModelId(model.modelId) } : {}) };
    }
  }
  const configuration = {
    ...("c4Selection" in request && request.c4Selection ? {c4Selection:{systemId:(request.c4Selection as {systemId:string}).systemId,expectedKnowledgeDigest:(request.c4Selection as {expectedKnowledgeDigest:string}).expectedKnowledgeDigest}} : {}),
    ...(request.knowledgePack.kind !== "local-directory" ? { architectureSource: { kind: request.knowledgePack.kind, sourceId: request.knowledgePack.sourceId } } : {}),
    diagramType, generationPath: report.generationPath ?? "compatibility-sequence",
    generatorKind: request.generator.kind,
    providerProfileId: "profileId" in request.generator ? safeProviderProfileId(request.generator.profileId) : "local-lm-studio",
    modelId: safeModelId(request.generator.modelId), timeoutMs: request.generator.timeoutMs ?? 120000,
    endpoint: null, endpointAvailability: "omitted-for-privacy",
    selections: Object.entries(request.selections ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([mention, elementId]) => ({ mention, elementId })),
    confirmedNewParticipants: [...(request.confirmedNewParticipants ?? [])].sort()
  };
  const sources = knowledge.sources.map((s) => ({ id: s.id, kind: s.kind, digest: null,
    scope: Object.fromEntries(["systems", "actors", "relationships", "aliases", "rules"].flatMap((table) => {
      const scope = s.scope[table as keyof typeof s.scope]; return scope === undefined ? [] : [[table, scope]];
    })) }));
  const documents = [...new Map((knowledge.documentProvenance ?? []).flatMap((p) => p.sources)
    .map((s) => [JSON.stringify([s.sourceId, s.originalDigest, s.textDigest, s.type]), { id: s.sourceId, type: s.type, originalDigest: s.originalDigest, textDigest: s.textDigest }])).values()];
  const artifact = freeze({ resultId: randomUUID(), createdAt: new Date().toISOString(), diagramType, plantUml: result.plantUml, report,
    metadata: { runId, versions: { runtime: null, extension: extensionVersion, runtimeContract: null,
      reportContract: report.reportSchemaVersion ?? null, knowledgeContract: knowledge.domain },
      knowledge: { snapshotDigest: knowledge.digest, generationSnapshotDigest: result.digest, sources, documents },
      configuration: { projection: configuration, serialization: "canonical-json-utf8-v1", sha256: hash(serializeArtifactConfiguration(configuration)) },
      // Safe runtime issues; no transport errors are present on a successful result.
      warnings: result.warnings.map((w) => ({ code: w.code, severity: w.severity, message: w.message,
        ...(w.file ? { file: w.file } : {}), ...(w.line ? { line: w.line } : {}) })) }
  });
  sourceLocations.set(artifact, { pack: request.knowledgePack.kind === "local-directory" ? request.knowledgePack.path : request.knowledgePack.kind === "structurizr-json" ? request.knowledgePack.overlayPath : null, ...(request.knowledgePack.kind === "structurizr-json" ? { model: request.knowledgePack.modelPath } : {}), flow: request.flow.kind === "file" ? request.flow.path : null });
  completed.add(artifact);
  return artifact;
}
export function isCompletedDiagramArtifact(value: unknown): value is DiagramArtifact {
  return !!value && typeof value === "object" && completed.has(value as DiagramArtifact);
}
/** A separate strict capture path preserves the older generation report byte contract. */
export function captureCapabilityMapArtifact(plantUml:string, input:CapabilityMapReport, sourcePath?:string|null):DiagramArtifact {
 const report=capabilityMapReportSchema.parse(input),remote="transport"in report.source;
 return captureEnterpriseArtifact(plantUml,report as unknown as Record<string,CanonicalValue>,report.diagramType,report.generationPath,report.selection as unknown as CanonicalValue,
 report.snapshot,report.projectionDigest,report.source.contract,report.formatVersion,"transport"in report.source?report.source.transport:undefined,remote?undefined:report.source as {sourceBytesSha256:string},sourcePath);
}
export function captureApplicationMapArtifact(plantUml:string,input:ApplicationMapReport,sourcePath?:string|null):DiagramArtifact{
 const report=applicationMapReportSchema.parse(input),e=report.source.evidence;
 return captureEnterpriseArtifact(plantUml,report as unknown as Record<string,CanonicalValue>,report.diagramType,report.generationPath,report.selection as unknown as CanonicalValue,
 report.snapshot,report.projectionDigest,report.source.contract,1,"kind"in e?e:undefined,"kind"in e?undefined:e,sourcePath);
}
function captureEnterpriseArtifact(plantUml:string,report:Record<string,CanonicalValue>,diagramType:DiagramArtifact["diagramType"],generationPath:string,selection:CanonicalValue,
 snapshot:{id:string;catalogDigest:string},projectionDigest:string,contract:string,reportVersion:number,
 remote:{sourceId:string;sourceVersion:string;responseFingerprint:string;tool:"get_enterprise_snapshot"|"get_enterprise_snapshot_v2";contractVersion:1|2}|undefined,
 local:{sourceBytesSha256:string}|undefined,sourcePath?:string|null):DiagramArtifact{
 if(!remote&&sourcePath!==null&&!sourcePath||remote&&sourcePath!==undefined)throw new Error("artifact-report-invalid");
 const configuration={diagramType,generationPath,selection};
 const artifact:DiagramArtifact=freeze({resultId:randomUUID(),createdAt:new Date().toISOString(),diagramType,plantUml,report,metadata:{
 versions:{runtime:null,extension:null,runtimeContract:contract.endsWith("/2")?"enterprise/2":"enterprise/1",reportContract:reportVersion,knowledgeContract:contract},
 enterprise:{snapshotId:snapshot.id,catalogDigest:snapshot.catalogDigest,projectionDigest,...(remote?{sourceVersion:remote.sourceVersion,responseFingerprint:remote.responseFingerprint}:{sourceBytesSha256:local!.sourceBytesSha256})},
 configuration:{projection:configuration,serialization:"canonical-json-utf8-v1",sha256:hash(serializeArtifactConfiguration(configuration))},warnings:[]}});
 sourceLocations.set(artifact,{pack:null,flow:null,...(remote?{enterpriseRemote:{sourceId:remote.sourceId,tool:remote.tool,contractVersion:remote.contractVersion}}:{enterprise:sourcePath})});completed.add(artifact);return artifact;
}
export interface DiagramBundlePlan {
  readonly bundleId: string;
  readonly plannedAt: string;
  readonly relativeDirectory: string;
}
const plans = new WeakSet<DiagramBundlePlan>();
/** Safe names depend solely on local UTC time and a UUID. Planning has no filesystem effects. */
export function planDiagramBundle(): DiagramBundlePlan {
  const bundleId = randomUUID(), plannedAt = new Date().toISOString();
  const plan = Object.freeze({ bundleId, plannedAt, relativeDirectory: `archi-agent-results/${plannedAt.replace(/[:.]/g, "-")}-${bundleId}` });
  plans.add(plan); return plan;
}
export async function saveDiagramBundle(project: string, artifact: DiagramArtifact, plan: DiagramBundlePlan,
  options: StarterPackCreateOptions = {}): Promise<{ readonly directory: string }> {
  if (!isCompletedDiagramArtifact(artifact) || !plans.has(plan)) throw new StarterPackCreateError("invalid-location");
  if (!path.isAbsolute(project)) throw new StarterPackCreateError("invalid-location");
  const root = await canonicalDirectory(project);
  const target = await resolveContainedPath(root, plan.relativeDirectory, { allowMissing: true });
  if (target.exists) throw new StarterPackCreateError("location-exists");
  const diagram = Buffer.from(artifact.plantUml, "utf8");
  const references = sourceLocations.get(artifact)!;
  const reference = (file: string | null): CanonicalValue => {
    if (file === null) return { reference: null, availability: "in-memory-input" };
    const relative = path.relative(root, file);
    return { reference: relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative.split(path.sep).join("/") : path.basename(file),
      availability: relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? "project-relative" : "logical-name-only" };
  };
  const report = { sourceReferences: references.enterpriseRemote ? {enterpriseCatalog:{reference:references.enterpriseRemote,availability:"remote-source"}} : references.enterprise!==undefined ? {enterpriseCatalog:reference(references.enterprise)} : { knowledgePack: reference(references.pack), ...(references.model ? { model: reference(references.model) } : {}), flow: reference(references.flow) }, format: "archi-agent-artifact", formatVersion: 1, bundleId: plan.bundleId, resultId: artifact.resultId,
    savedAt: new Date().toISOString(), createdAt: artifact.createdAt, diagramType: artifact.diagramType,
    diagram: { file: "diagram.puml", encoding: "utf8", byteLength: diagram.length, sha256: hash(diagram) },
    generationReport: artifact.report, ...artifact.metadata };
  const serialized = JSON.stringify(report, null, 2) + "\n";
  await createExclusiveArtifactFiles(target.absolutePath, ["diagram.puml", "report.json"], [artifact.plantUml, serialized],
    { ...options, projectRoot: root, requireNewDirectory: true, verify: async () => {
      await options.verify?.();
      const names = (await readdir(target.absolutePath)).sort();
      if (names.length !== 2 || names[0] !== "diagram.puml" || names[1] !== "report.json") throw new StarterPackCreateError("file-changed");
    } });
  // Writer verified exact bytes of both immutable inputs and their ancestry before returning.
  return { directory: target.absolutePath };
}
