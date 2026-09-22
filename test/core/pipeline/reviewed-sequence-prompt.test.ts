import { describe, expect, it } from "vitest";
import type { FlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import { buildGeneratorRequest, parseSequenceFacts, type ArchitectureSnapshot } from "../../../src/core/pipeline/reviewed-sequence.js";

const flow = { metadata: { flowName: "Synthetic flow", language: "en" }, body: "A synthetic flow." } as FlowDocument;
const snapshot = {
  elements: [
    { id: "actor-a", alias: "kp_actor_a", canonicalName: "Actor A", kind: "actor" },
    { id: "system-b", alias: "kp_system_b", canonicalName: "System B", kind: "system" },
    { id: "database-c", alias: "kp_database_c", canonicalName: "Database C", kind: "database" },
    { id: "queue-d", alias: "kp_queue_d", canonicalName: "Queue D", kind: "queue" }
  ],
  relationships: [
    { fromId: "actor-a", toId: "database-c", interfaceType: "DB", interfaceName: "Exact Writer", mode: "synchronous" },
    { fromId: "system-b", toId: "queue-d", interfaceType: "EVENT", interfaceName: null, mode: "asynchronous" },
    { fromId: "actor-a", toId: "system-b", interfaceType: "EVENT", interfaceName: "Exact Event", mode: "synchronous" }
  ]
} as unknown as ArchitectureSnapshot;

describe("D1.1 generator prompt literal projection", () => {
  it("gives one exact declaration for every alias and no alternate kind", () => {
    const input = JSON.parse(buildGeneratorRequest(flow, snapshot));
    expect(input.allowedPlantUml.participantDeclarations).toEqual([
      'actor "Actor A" as kp_actor_a',
      'participant "System B" as kp_system_b',
      'database "Database C" as kp_database_c',
      'queue "Queue D" as kp_queue_d'
    ]);
    for (const element of snapshot.elements) {
      expect(input.allowedPlantUml.participantDeclarations.filter((line: string) => line.endsWith(` as ${element.alias}`))).toHaveLength(1);
    }
    expect(input.allowedPlantUml.participantDeclarations).not.toContain('participant "Database C" as kp_database_c');
    expect(parseSequenceFacts('@startuml\nparticipant "Database C" as kp_database_c\nactor "Actor A" as kp_actor_a\nkp_actor_a -> kp_database_c : Write (DB: Exact Writer)\n@enduml', snapshot))
      .toMatchObject({ ok: false, issue: { code: "plantuml-structure", details: { line: 2 } } });
  });

  it("gives exact named and unnamed signatures with mode-controlled arrows", () => {
    const { allowedPlantUml } = JSON.parse(buildGeneratorRequest(flow, snapshot));
    expect(allowedPlantUml.sourceConfirmedRequestSignatures).toEqual([
      { prefix: "kp_actor_a -> kp_database_c : ", suffix: " (DB: Exact Writer)" },
      { prefix: "kp_system_b ->> kp_queue_d : ", suffix: " (EVENT)" },
      { prefix: "kp_actor_a -> kp_system_b : ", suffix: " (EVENT: Exact Event)" }
    ]);
    expect(allowedPlantUml.sourceConfirmedResponseSignatures).toEqual([
      { prefix: "kp_database_c --> kp_actor_a : ", suffix: " (DB: Exact Writer)" },
      { prefix: "kp_system_b --> kp_actor_a : ", suffix: " (EVENT: Exact Event)" }
    ]);
    const line = (signature: { prefix: string; suffix: string }, label: string) => signature.prefix + label + signature.suffix;
    const text = ['@startuml', ...allowedPlantUml.participantDeclarations,
      line(allowedPlantUml.sourceConfirmedRequestSignatures[0], "Write"),
      line(allowedPlantUml.sourceConfirmedResponseSignatures[0], "Written"),
      line(allowedPlantUml.sourceConfirmedRequestSignatures[1], "Notify"), '@enduml'].join('\n');
    const parsed = parseSequenceFacts(text, snapshot);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.facts.relationships.map((fact) => [fact.arrow, fact.interfaceType, fact.interfaceName])).toEqual([
      ["->", "DB", "Exact Writer"], ["-->", "DB", "Exact Writer"], ["->>", "EVENT", null]
    ]);
  });
});
