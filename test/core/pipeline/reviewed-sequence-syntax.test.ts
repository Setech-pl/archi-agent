import { describe, expect, it } from "vitest";
import { parseSequenceFacts, type ArchitectureSnapshot } from "../../../src/core/pipeline/reviewed-sequence.js";

const snapshot = { elements: [
  { id: "actor-a", alias: "kp_actor_a", canonicalName: "Actor A", kind: "actor" },
  { id: "system-b", alias: "kp_system_b", canonicalName: "System B", kind: "system" },
  { id: "database-c", alias: "kp_database_c", canonicalName: "Database C", kind: "database" },
  { id: "queue-d", alias: "kp_queue_d", canonicalName: "Queue D", kind: "queue" }
] } as unknown as ArchitectureSnapshot;

const declarations = [
  ['actor "Actor A" as kp_actor_a', 'actor kp_actor_a as "Actor A"'],
  ['participant "System B" as kp_system_b', 'participant kp_system_b as "System B"'],
  ['database "Database C" as kp_database_c', 'database kp_database_c as "Database C"'],
  ['queue "Queue D" as kp_queue_d', 'queue kp_queue_d as "Queue D"']
] as const;

function document(first: string, second = 'participant "System B" as kp_system_b',
  message = "kp_actor_a -> kp_system_b : Submit Job (REST API)"): string {
  return `@startuml\n${first}\n${second}\n\n${message}\n@enduml\n`;
}

describe("D1.1 closed sequence syntax", () => {
  it.each(declarations.flatMap((pair) => pair))("accepts both declaration orders for %s", (line) => {
    const actor = line.startsWith("actor ");
    const alias = /kp_[a-z_]+/.exec(line)?.[0];
    const text = actor ? document(line) : document('actor "Actor A" as kp_actor_a', line,
      `kp_actor_a -> ${alias} : Submit Job (REST API)`);
    const result = parseSequenceFacts(text, snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.facts.elements.map((fact) => fact.lineNumber)).toEqual([2, 3]);
  });

  it.each([
    'actor "Wrong" as kp_actor_a',
    'actor "Actor A" as kp_wrong',
    'participant "Actor A" as kp_actor_a',
    'actor kp_actor_a',
    'actor Actor A as kp_actor_a',
    'actor kp_actor_a as "Actor A" #red',
    'actor "Actor A" as kp_actor_a <<tag>>'
  ])("rejects unsafe declaration %s at its physical line", (line) => {
    expect(parseSequenceFacts(document(line), snapshot)).toMatchObject({ ok: false, issue: { code: "plantuml-structure", details: { line: 2 } } });
  });

  it.each([
    ["->", "kp_actor_a -> kp_system_b : Submit Job (REST API)"],
    ["->>", 'kp_actor_a ->> kp_system_b: "Submit Job" (REST API)'],
    ["-->", 'kp_actor_a --> kp_system_b  :  "Submit Job" (REST API)']
  ])("parses %s with the approved colon and label variants", (_arrow, message) => {
    const text = document('actor "Actor A" as kp_actor_a', undefined, message);
    const result = parseSequenceFacts(text, snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts.relationships[0]).toMatchObject({ lineNumber: 5, label: "Submit Job", arrow: _arrow });
    expect(result.facts.model.messages[0]?.label).toBe("Submit Job");
    expect(text).toContain(message);
  });

  it.each([
    'kp_actor_a -> kp_system_b: "Submit "Job"" (REST API)',
    'kp_actor_a -> kp_system_b: "Submit \\Job" (REST API)',
    'kp_actor_a -> kp_system_b: "Submit Job" (REST API) #red',
    'kp_actor_a -> kp_system_b: "!include secret" (REST API)',
    'kp_actor_a -> kp_system_b: "https://example.test" (REST API)'
  ])("rejects an unsafe message at its physical line", (message) => {
    expect(parseSequenceFacts(document('actor "Actor A" as kp_actor_a', undefined, message), snapshot))
      .toMatchObject({ ok: false, issue: { code: "plantuml-structure", details: { line: 5 } } });
  });
});
