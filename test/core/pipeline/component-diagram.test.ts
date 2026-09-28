import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import { loadKnowledgePack } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { buildComponentSnapshot } from "../../../src/core/pipeline/component-snapshot.js";
import { renderComponentPlan, validateComponentPlan, validateComponentReview } from "../../../src/core/pipeline/component-diagram-plan.js";
import { validateComponentSubset } from "../../../src/core/validation/component-plantuml-validator.js";
import { buildPackFiles } from "../../doubles/knowledge-pack-fixture.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

const loaded = await loadKnowledgePack(new KnowledgePackSourceDouble(buildPackFiles()));
if (!loaded.ok) throw new Error("Synthetic pack must load");
const pack = { pack: loaded.pack, indexes: loaded.indexes };
const parsed = parseFlowDocument("---\ndiagram_name: observation\nflow_name: Observation\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler sends events to Dome Controller and stores frames in Image Archive.\n", { file: "flows/observation.md" });
if (!parsed.ok) throw new Error("Synthetic flow must parse");
const grounded = buildGroundedContext({ flow: parsed.flow, knowledgePack: pack });
if (grounded.status !== "grounded") throw new Error("Synthetic flow must ground");

describe("D2 component contract", () => {
  it("builds a bounded separate digest covering selected evidence", () => {
    const snapshot = buildComponentSnapshot(grounded.context, parsed.flow);
    expect(snapshot.elements.map((item) => item.id)).toEqual(["dome-controller", "image-archive", "telescope-scheduler"]);
    expect(snapshot.relationships).toHaveLength(2);
    expect(snapshot.digest).toHaveLength(64);
    expect(buildComponentSnapshot(grounded.context, { ...parsed.flow, body: parsed.flow.body.replace("sends", "publishes") }).digest).not.toBe(snapshot.digest);
  });

  it("carries resolved alias spellings and positions into the D2 digest", () => {
    const aliasFlow = parseFlowDocument("---\ndiagram_name: alias-test\nflow_name: Alias test\nauthor: Test\nlanguage: en\n---\nScheduler stores frames in Archive.\n", { file: "flows/aliases.md" });
    if (!aliasFlow.ok) throw new Error("Alias flow must parse");
    const aliasGrounding = buildGroundedContext({ flow: aliasFlow.flow, knowledgePack: pack });
    if (aliasGrounding.status !== "grounded") throw new Error("Aliases must ground");
    const snapshot = buildComponentSnapshot(aliasGrounding.context, aliasFlow.flow);
    expect(snapshot.elements.find((item) => item.id === "telescope-scheduler")?.mentions).toEqual([{ line: 7, column: 1, length: 9, spelling: "Scheduler" }]);
    expect(snapshot.elements.find((item) => item.id === "image-archive")?.mentions[0]?.spelling).toBe("Archive");
    expect(snapshot.elements.find((item) => item.id === "image-archive")?.mentions[0]?.column).toBeGreaterThan(9);
    expect(buildComponentSnapshot({ ...aliasGrounding.context,
      systems: aliasGrounding.context.systems.map((item) => item.id === "image-archive" ? {
        ...item, mentions: item.mentions.map((mention) => ({ ...mention, column: mention.column - 1 })) } : item) }, aliasFlow.flow).digest).not.toBe(snapshot.digest);
  });

  it("resolves grounded dependencies and renders traceable component edges", () => {
    const snapshot = buildComponentSnapshot(grounded.context, parsed.flow);
    const plan = validateComponentPlan({ version: 1, elementIds: snapshot.elements.map((item) => item.id), groundedDependencies: ["dep-0001"], userStatedDependencies: [] }, snapshot);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const rendered = renderComponentPlan(plan.value, snapshot);
    expect(rendered.plantUml).toContain('component "Dome Controller"');
    expect(rendered.plantUml).toContain(snapshot.relationships[0]!.interfaceType);
    expect(rendered.lines.get("fact-0001")).toBeGreaterThan(1);
    expect(validateComponentSubset(rendered.plantUml, plan.value, snapshot, rendered.lines)).toEqual([]);
    expect(validateComponentReview({ accepted: true, confirmedUserStatedFactIds: [], violations: [] }, plan.value).ok).toBe(true);
  });

  it("keeps user-stated dependencies pending and rejects source reversal or invalid verdict references", () => {
    const snapshot = buildComponentSnapshot(grounded.context, parsed.flow);
    const base = { version: 1, elementIds: snapshot.elements.map((item) => item.id), groundedDependencies: [],
      userStatedDependencies: [{ fromId: "dome-controller", toId: "image-archive", interfaceType: "EVENT", interfaceName: null,
        mode: "asynchronous", flowEvidenceId: snapshot.flowEvidence[0]!.flowEvidenceId }] };
    const valid = validateComponentPlan(base, snapshot);
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.value.facts[0]).toMatchObject({ evidenceClass: "user-stated", source: { file: "flows/observation.md" } });
    expect(validateComponentReview({ accepted: true, confirmedUserStatedFactIds: [], violations: [] }, valid.value)).toMatchObject({ ok: false });
    expect(validateComponentReview({ accepted: true, confirmedUserStatedFactIds: ["fact-0001"], violations: [] }, valid.value).ok).toBe(true);
    expect(validateComponentPlan({ ...base, userStatedDependencies: [{ ...base.userStatedDependencies[0],
      fromId: "dome-controller", toId: "telescope-scheduler", interfaceType: "EVENT" }] }, snapshot)).toMatchObject({ ok: false, code: "dependency-direction-mismatch" });
  });

  it("creates one shared API node for two distinct consumers and maps each consumer edge", () => {
    const context = { ...grounded.context, relationships: [
      { fromId: "dome-controller", toId: "image-archive", interfaceType: "REST_API" as const, interfaceName: "Image API", mode: "synchronous" as const,
        purpose: "Reads images", source: { file: "relationships.md" as const, line: 8 } },
      { fromId: "telescope-scheduler", toId: "image-archive", interfaceType: "REST_API" as const, interfaceName: "Image API", mode: "asynchronous" as const,
        purpose: "Sends images", source: { file: "relationships.md" as const, line: 9 } }
    ] };
    const snapshot = buildComponentSnapshot(context, parsed.flow);
    const plan = validateComponentPlan({ version: 1, elementIds: snapshot.elements.map((item) => item.id),
      groundedDependencies: ["dep-0001", "dep-0002"], userStatedDependencies: [] }, snapshot);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const rendered = renderComponentPlan(plan.value, snapshot);
    expect(rendered.plantUml.match(/interface "Image API"/g)).toHaveLength(1);
    expect(rendered.plantUml.match(/--> api_0001 : REST_API - Image API/g)).toHaveLength(2);
    expect(rendered.plantUml.match(/api_0001 --> kp_image_archive/g)).toHaveLength(1);
    expect(new Set(rendered.lines.values()).size).toBe(2);
    expect(validateComponentSubset(rendered.plantUml.replace("@enduml", "!include remote"), plan.value, snapshot, rendered.lines)).not.toEqual([]);
  });

  it("keeps confirmed NEW elements visibly new and user-stated", () => {
    const newFlow = parseFlowDocument("---\ndiagram_name: new-component\nflow_name: New component\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler sends events to [NEW: Field Gateway].\n", { file: "flows/new.md" });
    if (!newFlow.ok) throw new Error("NEW flow must parse");
    const outcome = buildGroundedContext({ flow: newFlow.flow, knowledgePack: pack, confirmedNewParticipants: ["Field Gateway"] });
    if (outcome.status !== "grounded") throw new Error("NEW component must ground");
    const snapshot = buildComponentSnapshot(outcome.context, newFlow.flow);
    const newId = snapshot.elements.find((item) => item.kind === "new")?.id;
    expect(newId).toBeDefined();
    const plan = validateComponentPlan({ version: 1, elementIds: snapshot.elements.map((item) => item.id), groundedDependencies: [],
      userStatedDependencies: [{ fromId: "telescope-scheduler", toId: newId, interfaceType: "EVENT", interfaceName: null,
        mode: "asynchronous", flowEvidenceId: snapshot.flowEvidence[0]!.flowEvidenceId }] }, snapshot);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.facts[0]?.evidenceClass).toBe("user-stated");
    expect(renderComponentPlan(plan.value, snapshot).plantUml).toContain('component "[NEW] Field Gateway"');
  });

  it("enforces forbid, unknown types and projection limits locally", () => {
    const forbiddenFlow = parseFlowDocument("---\ndiagram_name: forbidden\nflow_name: Forbidden\nauthor: Test\nlanguage: en\n---\nNight Observer directs Dome Controller.\n", { file: "flows/forbidden.md" });
    if (!forbiddenFlow.ok) throw new Error("Forbidden flow must parse");
    const outcome = buildGroundedContext({ flow: forbiddenFlow.flow, knowledgePack: pack });
    if (outcome.status !== "grounded") throw new Error("Forbidden flow must ground");
    const snapshot = buildComponentSnapshot(outcome.context, forbiddenFlow.flow);
    expect(validateComponentPlan({ version: 1, elementIds: snapshot.elements.map((item) => item.id), groundedDependencies: [],
      userStatedDependencies: [{ fromId: "night-observer", toId: "dome-controller", interfaceType: "INTERNAL", interfaceName: null,
        mode: "synchronous", flowEvidenceId: snapshot.flowEvidence[0]!.flowEvidenceId }] }, snapshot)).toMatchObject({ ok: false, code: "forbidden-dependency" });
    const basic = buildComponentSnapshot(grounded.context, parsed.flow);
    expect(validateComponentPlan({ version: 1, elementIds: basic.elements.map((item) => item.id), groundedDependencies: ["dep-0001"],
      userStatedDependencies: [{ fromId: "dome-controller", toId: "image-archive", interfaceType: "UNKNOWN", interfaceName: null,
        mode: "asynchronous", flowEvidenceId: basic.flowEvidence[0]!.flowEvidenceId }] }, basic)).toMatchObject({ ok: false, code: "schema-violation" });
    expect(() => buildComponentSnapshot(grounded.context, { ...parsed.flow, body: `${parsed.flow.body}${"x".repeat(70_000)}` })).toThrow();
  });

  it("maps every supported element kind and interface type without inferring nodes", async () => {
    const files = buildPackFiles({
      systems: [["core", "Core Engine", "system", "Runs operations"], ["worker", "Worker Service", "service", "Processes jobs"],
        ["store", "Data Store", "database", "Stores jobs"], ["queue", "Event Queue", "queue", "Buffers jobs"],
        ["partner-system", "Partner System", "external", "Offers data"]],
      actors: [["analyst", "Analyst", "person", "Studies data"], ["operator", "Operator Role", "role", "Runs jobs"],
        ["guest", "Guest", "external", "Visits system"]],
      relationships: [["analyst", "core", "REST_API", "Core API", "synchronous", "Reads data"],
        ["operator", "worker", "SOAP", "Worker API", "synchronous", "Runs job"],
        ["worker", "queue", "EVENT", "Job Event", "asynchronous", "Publishes job"],
        ["worker", "store", "DB", "Store API", "synchronous", "Persists job"],
        ["core", "partner-system", "FILE", "Export File", "asynchronous", "Sends export"],
        ["guest", "core", "INTERNAL", "Guest Portal", "synchronous", "Views data"]], aliases: [], rules: []
    });
    const loadedKinds = await loadKnowledgePack(new KnowledgePackSourceDouble(files));
    if (!loadedKinds.ok) throw new Error("Kinds pack must load");
    const flowKinds = parseFlowDocument("---\ndiagram_name: kinds\nflow_name: Kinds\nauthor: Test\nlanguage: en\n---\nAnalyst, Operator Role and Guest use Core Engine, Worker Service, Data Store, Event Queue and Partner System.\n", { file: "flows/kinds.md" });
    if (!flowKinds.ok) throw new Error("Kinds flow must parse");
    const groundedKinds = buildGroundedContext({ flow: flowKinds.flow, knowledgePack: { pack: loadedKinds.pack, indexes: loadedKinds.indexes } });
    if (groundedKinds.status !== "grounded") throw new Error("Kinds flow must ground");
    const snapshot = buildComponentSnapshot(groundedKinds.context, flowKinds.flow);
    const plan = validateComponentPlan({ version: 1, elementIds: snapshot.elements.map((item) => item.id),
      groundedDependencies: snapshot.relationships.map((_, index) => `dep-${String(index + 1).padStart(4, "0")}`), userStatedDependencies: [] }, snapshot);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const text = renderComponentPlan(plan.value, snapshot).plantUml;
    for (const statement of ['component "Core Engine"', 'component "Worker Service"', 'database "Data Store"',
      'queue "Event Queue"', 'component "Partner System"', 'actor "Analyst"', 'actor "Operator Role"', 'actor "Guest"'])
      expect(text).toContain(statement);
    for (const interfaceType of ["REST_API", "SOAP", "EVENT", "FILE", "DB", "INTERNAL"]) expect(text).toContain(interfaceType);
    expect(text).not.toContain('interface "Core API"');
  });
});
