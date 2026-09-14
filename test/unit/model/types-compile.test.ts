import { describe, expect, expectTypeOf, it } from "vitest";
import {
  allowedInterfaceTypes,
  diagramLanguages,
  newParticipantPrefix,
  participantKinds,
  type DiagramMetadata,
  type KnowledgePackParticipant,
  type NewParticipant,
  type ParticipantRef,
  type SequenceDiagramModel,
  type SequenceParticipant
} from "../../../src/core/model/types.js";

const groundedParticipant: KnowledgePackParticipant = {
  origin: "knowledge-pack",
  elementId: "telemetry-gateway",
  canonicalName: "Telemetry Gateway",
  kind: "system"
};

const confirmedNewParticipant: NewParticipant = {
  origin: "new",
  newName: "Orbit Dynamics Engine",
  displayName: "[NEW] Orbit Dynamics Engine",
  kind: "system",
  confirmedByUser: true
};

describe("core model type contract", () => {
  it("exposes the explicit new-participant prefix", () => {
    expect(newParticipantPrefix).toBe("[NEW]");
    expect(confirmedNewParticipant.displayName.startsWith(`${newParticipantPrefix} `)).toBe(true);
  });

  it("lists the neutral interface types, languages and participant kinds", () => {
    expect([...allowedInterfaceTypes]).toEqual(["REST API", "SOAP", "EVENT", "FILE", "DB", "INTERNAL"]);
    expect([...diagramLanguages]).toEqual(["en", "pl"]);
    expect([...participantKinds]).toEqual(["actor", "system", "database", "queue"]);
  });

  it("identifies knowledge-pack participants by elementId", () => {
    expectTypeOf(groundedParticipant.elementId).toEqualTypeOf<string>();
    expectTypeOf<SequenceParticipant>().toEqualTypeOf<KnowledgePackParticipant | NewParticipant>();
    expect(groundedParticipant.elementId).toBe("telemetry-gateway");
  });

  it("rejects a new participant without the prefix or without confirmation at compile time", () => {
    // @ts-expect-error the display name must carry the [NEW] prefix
    const unprefixed: NewParticipant = { ...confirmedNewParticipant, displayName: "Orbit Dynamics Engine" };
    // @ts-expect-error a new participant must be confirmed by the user
    const unconfirmed: NewParticipant = { ...confirmedNewParticipant, confirmedByUser: false };
    expect([unprefixed.origin, unconfirmed.origin]).toEqual(["new", "new"]);
  });

  it("references message endpoints by elementId or newName, never by display name", () => {
    const byElement: ParticipantRef = { elementId: "mission-planning-api" };
    const byNewName: ParticipantRef = { newName: "Orbit Dynamics Engine" };
    // @ts-expect-error canonical names are not a participant reference
    const byCanonicalName: ParticipantRef = { canonicalName: "Mission Planning API" };
    // @ts-expect-error a reference cannot name an element and a new participant at once
    const doubleReference: ParticipantRef = { elementId: "mission-planning-api", newName: "Orbit Dynamics Engine" };
    expect([byElement, byNewName, byCanonicalName, doubleReference]).toHaveLength(4);
  });

  it("keeps diagram metadata free of legacy project fields", () => {
    const metadata: DiagramMetadata = { diagramId: "telemetry-command-flow", diagramName: "Telemetry Command Flow", language: "en", created: "2026-01-02" };
    // @ts-expect-error project identifiers are not part of the metadata contract
    const legacy: DiagramMetadata = { diagramId: "telemetry-command-flow", diagramName: "Telemetry Command Flow", language: "en", created: "2026-01-02", projectId: "legacy" };
    const model: SequenceDiagramModel = {
      metadata,
      participants: [groundedParticipant, confirmedNewParticipant],
      messages: [],
      warnings: []
    };
    expect(model.participants).toHaveLength(2);
    expect(legacy.diagramId).toBe("telemetry-command-flow");
  });
});
