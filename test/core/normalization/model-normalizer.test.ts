import { describe, expect, it } from "vitest";
import {
  parseGeneratedSequenceModel,
  participantKey,
  type GeneratedSequenceModel
} from "../../../src/core/model/sequence-diagram-model.schema.js";
import { normalizeGeneratedModel } from "../../../src/core/normalization/model-normalizer.js";

type Raw = Record<string, unknown>;

const decomposedE = String.fromCharCode(0x65, 0x301);
const composedE = String.fromCharCode(0xe9);

function participant(id: string, canonicalName: string, kind = "system"): Raw {
  return { origin: "knowledge-pack", elementId: id, canonicalName, kind };
}

function message(order: number, from: string, to: string, extra: Raw = {}): Raw {
  return { from: { elementId: from }, to: { elementId: to }, label: `Step ${order}`, interfaceType: "EVENT", order, async: true, isResponse: false, ...extra };
}

function parsed(raw: Raw): GeneratedSequenceModel {
  const result = parseGeneratedSequenceModel(raw);

  if (!result.ok) {
    throw new Error(`Expected an accepted model: ${JSON.stringify(result.problems)}`);
  }

  return result.model;
}

const participants = [
  participant("telemetry-store", "Telemetry Store", "database"),
  participant("command-service", "Command Service"),
  participant("mission-control", "Mission Control"),
  participant("command-queue", "Command Queue", "queue")
];

const messages = [
  message(30, "command-service", "command-queue"),
  message(10, "mission-control", "command-service", { interfaceType: "REST API", async: false }),
  message(20, "command-service", "mission-control", { interfaceType: "REST API", isResponse: true })
];

describe("normalizeGeneratedModel", () => {
  it("orders messages by order number and participants by first appearance, source before target", () => {
    const model = normalizeGeneratedModel(parsed({ participants, messages }));

    expect(model.messages.map((entry) => entry.order)).toEqual([10, 20, 30]);
    expect(model.participants.map(participantKey)).toEqual([
      "kp:mission-control",
      "kp:command-service",
      "kp:command-queue",
      "kp:telemetry-store"
    ]);
  });

  it("is independent of the input order of participants and messages", () => {
    const forward = normalizeGeneratedModel(parsed({ participants, messages }));
    const reversed = normalizeGeneratedModel(parsed({ participants: [...participants].reverse(), messages: [...messages].reverse() }));

    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    expect(JSON.stringify(normalizeGeneratedModel(forward))).toBe(JSON.stringify(forward));
  });

  it("trims display text and applies Unicode NFC", () => {
    const model = normalizeGeneratedModel(
      parsed({
        participants: [participant("mission-control", `  Caf${decomposedE} Control `), participant("command-service", "Command Service")],
        messages: [message(1, "mission-control", "command-service", { label: `  Send caf${decomposedE} order `, businessDescription: " Daily plan " })]
      })
    );

    expect(model.participants[0]?.origin === "knowledge-pack" && model.participants[0].canonicalName).toBe(`Caf${composedE} Control`);
    expect(model.messages[0]?.label).toBe(`Send caf${composedE} order`);
    expect(model.messages[0]?.businessDescription).toBe("Daily plan");
  });

  it("turns empty optional values into absent values", () => {
    const model = normalizeGeneratedModel(
      parsed({
        participants: participants.slice(1, 3),
        messages: [message(1, "mission-control", "command-service", { interfaceName: "", businessDescription: "" })]
      })
    );
    const first = model.messages[0] as object;

    expect("interfaceName" in first).toBe(false);
    expect("businessDescription" in first).toBe(false);
  });

  it("never guesses: identifiers, names, modes and flags are kept exactly", () => {
    const input = parsed({
      participants: [participant("unknown-system", "MCC"), participant("command-service", "Command Service", "queue")],
      messages: [
        message(2, "unknown-system", "command-service", { interfaceType: "FILE", async: true, interfaceName: "Guessable Name" }),
        message(1, "command-service", "unknown-system", { interfaceType: "DB", async: false, isResponse: true })
      ]
    });
    const model = normalizeGeneratedModel(input);

    expect(model.participants).toHaveLength(input.participants.length);
    expect(model.messages).toHaveLength(input.messages.length);
    expect(model.participants.map((entry) => (entry.origin === "knowledge-pack" ? [entry.elementId, entry.canonicalName, entry.kind] : []))).toEqual([
      ["command-service", "Command Service", "queue"],
      ["unknown-system", "MCC", "system"]
    ]);
    expect(model.messages.map((entry) => [entry.order, entry.interfaceType, entry.async, entry.isResponse, entry.interfaceName])).toEqual([
      [1, "DB", false, true, undefined],
      [2, "FILE", true, false, "Guessable Name"]
    ]);
    expect(model.participants.some((entry) => entry.origin === "new")).toBe(false);
  });

  it("keeps a participant that takes part in no message, after the used ones, for validation to reject", () => {
    const model = normalizeGeneratedModel(
      parsed({ participants: [participant("orbital-relay", "Orbital Relay"), ...participants.slice(1, 3)], messages: [messages[1] as Raw] })
    );

    expect(model.participants.map(participantKey)).toEqual(["kp:mission-control", "kp:command-service", "kp:orbital-relay"]);
  });

  it("orders fragments by range, outer before inner, and trims their conditions", () => {
    const model = normalizeGeneratedModel(
      parsed({
        participants: participants.slice(1, 3),
        messages: [1, 2, 3, 4, 5, 6].map((order) => message(order, "mission-control", "command-service")),
        fragments: [
          { kind: "opt", condition: " Retry allowed ", firstOrder: 2, lastOrder: 3 },
          { kind: "alt", condition: "Accepted", firstOrder: 5, lastOrder: 6, elseBranches: [{ condition: " Rejected ", firstOrder: 6 }] },
          { kind: "loop", condition: "Each command", firstOrder: 1, lastOrder: 4 }
        ]
      })
    );

    expect(model.fragments.map((fragment) => [fragment.kind, fragment.condition, fragment.firstOrder, fragment.lastOrder])).toEqual([
      ["loop", "Each command", 1, 4],
      ["opt", "Retry allowed", 2, 3],
      ["alt", "Accepted", 5, 6]
    ]);
    expect(model.fragments[2]?.elseBranches).toEqual([{ condition: "Rejected", firstOrder: 6 }]);
  });

  it("returns frozen data and leaves its input unchanged", () => {
    const input = parsed({ participants, messages });
    const before = JSON.stringify(input);
    const model = normalizeGeneratedModel(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.messages[0])).toBe(true);
    expect(Object.isFrozen(model.fragments)).toBe(true);
  });
});
