import { describe, expect, it } from "vitest";
import {
  fragmentProblems,
  parseGeneratedSequenceModel,
  participantKey,
  participantRefKey,
  sequenceModelLimits,
  type GeneratedModelParseResult,
  type GeneratedSequenceModel
} from "../../../src/core/model/sequence-diagram-model.schema.js";

type Raw = Record<string, unknown>;

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const remoteUrl = ["https:", "", "diagrams.invalid", "theme"].join("/");

function participant(id: string, canonicalName: string, kind = "system"): Raw {
  return { origin: "knowledge-pack", elementId: id, canonicalName, kind };
}

function message(order: number, extra: Raw = {}): Raw {
  return {
    from: { elementId: "mission-control" },
    to: { elementId: "command-service" },
    label: `Step ${order}`,
    interfaceType: "REST API",
    async: false,
    isResponse: false,
    order,
    ...extra
  };
}

function validModel(extra: Raw = {}, messageCount = 3): Raw {
  return {
    participants: [participant("mission-control", "Mission Control"), participant("command-service", "Command Service")],
    messages: Array.from({ length: messageCount }, (_, index) => message(index + 1)),
    ...extra
  };
}

function accepted(raw: unknown): GeneratedSequenceModel {
  const result = parseGeneratedSequenceModel(raw);

  if (!result.ok) {
    throw new Error(`Expected an accepted model: ${JSON.stringify(result.problems)}`);
  }

  return result.model;
}

function problemsOf(result: GeneratedModelParseResult): string[] {
  if (result.ok) {
    throw new Error("Expected a rejected model.");
  }

  return result.problems.map((problem) => `${problem.path} ${problem.code}`);
}

function problemsFor(raw: unknown): string[] {
  return problemsOf(parseGeneratedSequenceModel(raw));
}

describe("generated sequence-model schema - accepted input", () => {
  it("accepts a valid model and returns a frozen copy with an empty fragment list", () => {
    const model = accepted(validModel());

    expect(model.participants.map(participantKey)).toEqual(["kp:mission-control", "kp:command-service"]);
    expect(model.messages.map((entry) => entry.order)).toEqual([1, 2, 3]);
    expect(model.fragments).toEqual([]);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.messages[0])).toBe(true);
    expect(Object.isFrozen(model.participants[0])).toBe(true);
  });

  it("references known participants only by Knowledge Pack element identifier", () => {
    const model = accepted(validModel());
    const first = model.messages[0];

    expect(first?.from).toEqual({ elementId: "mission-control" });
    expect(participantRefKey({ elementId: "mission-control" })).toBe("kp:mission-control");
    expect(problemsFor(validModel({ participants: [{ origin: "knowledge-pack", canonicalName: "Mission Control", kind: "system" }] }))).toContain(
      "participants.0.elementId invalid_type"
    );
    expect(problemsFor(validModel({ participants: [participant("Mission Control", "Mission Control")] }))).toContain(
      "participants.0.elementId invalid-identifier"
    );

    const byName = validModel();
    (byName["messages"] as Raw[])[0] = message(1, { from: { name: "Mission Control" } });
    expect(problemsFor(byName).some((problem) => problem.startsWith("messages.0.from "))).toBe(true);
  });

  it("accepts a confirmed new participant with its normalized key and [NEW] display name", () => {
    const raw = validModel({
      participants: [
        participant("mission-control", "Mission Control"),
        participant("command-service", "Command Service"),
        { origin: "new", newName: "ground station", displayName: "[NEW] Ground Station", kind: "system", confirmedByUser: true }
      ]
    });
    const model = accepted(raw);

    expect(model.participants.map(participantKey)).toContain("new:ground station");
    expect(participantRefKey({ newName: "ground station" })).toBe("new:ground station");

    const withNew = (override: Raw): string[] =>
      problemsFor(
        validModel({
          participants: [
            participant("mission-control", "Mission Control"),
            participant("command-service", "Command Service"),
            { origin: "new", newName: "ground station", displayName: "[NEW] Ground Station", kind: "system", confirmedByUser: true, ...override }
          ]
        })
      );

    expect(withNew({ newName: "Ground Station" })).toContain("participants.2.newName invalid-new-participant-reference");
    expect(withNew({ displayName: "Ground Station" })).toContain("participants.2.displayName invalid-new-participant-display-name");
    expect(withNew({ confirmedByUser: false })).toContain("participants.2.confirmedByUser invalid_value");
  });
});

describe("generated sequence-model schema - strictness", () => {
  it("rejects unknown keys at every level", () => {
    expect(problemsFor(validModel({ notes: "free text" }))).toContain("(root) unrecognized_keys");

    const participantExtra = validModel();
    (participantExtra["participants"] as Raw[])[0] = { ...participant("mission-control", "Mission Control"), alias: "MCC" };
    expect(problemsFor(participantExtra)).toContain("participants.0 unrecognized_keys");

    const messageExtra = validModel();
    (messageExtra["messages"] as Raw[])[1] = message(2, { rawPlantUml: "A -> B" });
    expect(problemsFor(messageExtra)).toContain("messages.1 unrecognized_keys");

    const fragmentExtra = validModel({ fragments: [{ kind: "opt", condition: "Retry", firstOrder: 1, lastOrder: 2, style: "bold" }] });
    expect(problemsFor(fragmentExtra)).toContain("fragments.0 unrecognized_keys");

    const metadataExtra = validModel({ metadata: { diagramName: "other" } });
    expect(problemsFor(metadataExtra)).toContain("(root) unrecognized_keys");
  });

  it("uses closed enums and never coerces values", () => {
    const withMessage = (extra: Raw): string[] => {
      const raw = validModel();
      (raw["messages"] as Raw[])[0] = message(1, extra);
      return problemsFor(raw);
    };

    expect(problemsFor(validModel({ participants: [participant("mission-control", "Mission Control", "service")] }))).toContain(
      "participants.0.kind invalid_value"
    );
    expect(withMessage({ interfaceType: "GRPC" })).toContain("messages.0.interfaceType invalid_value");
    expect(withMessage({ order: "1" })).toContain("messages.0.order invalid_type");
    expect(withMessage({ order: 1.5 })).toContain("messages.0.order invalid_type");
    expect(withMessage({ order: 0 })).toContain("messages.0.order too_small");
    expect(withMessage({ async: "true" })).toContain("messages.0.async invalid_type");
    expect(withMessage({ isResponse: 1 })).toContain("messages.0.isResponse invalid_type");
    expect(problemsFor(validModel({ participants: [{ ...participant("mission-control", "Mission Control"), origin: "model" }] })).length).toBeGreaterThan(0);
    expect(problemsFor("participants")).toEqual(["(root) invalid_type"]);
    expect(problemsFor([validModel()])).toEqual(["(root) invalid_type"]);
    expect(problemsFor(null)).toEqual(["(root) invalid_type"]);
  });

  it("rejects duplicate participants, duplicate order numbers and undeclared endpoints", () => {
    const duplicates = validModel({
      participants: [
        participant("mission-control", "Mission Control"),
        participant("command-service", "Command Service"),
        participant("mission-control", "Mission Control")
      ],
      messages: [message(1), message(1), message(2, { to: { elementId: "telemetry-store" } })]
    });
    const problems = problemsFor(duplicates);

    expect(problems).toContain("participants.2 duplicate-participant");
    expect(problems).toContain("messages.1.order duplicate-order");
    expect(problems).toContain("messages.2.to undeclared-endpoint");

    const missingEndpoint = validModel();
    (missingEndpoint["messages"] as Raw[])[0] = { label: "Step 1", interfaceType: "REST API", order: 1, to: { elementId: "command-service" } };
    expect(problemsFor(missingEndpoint)).toContain("messages.0.from invalid_union");

    const bothKinds = validModel();
    (bothKinds["messages"] as Raw[])[0] = message(1, { to: { elementId: "command-service", newName: "ground station" } });
    expect(problemsFor(bothKinds).some((problem) => problem.startsWith("messages.0.to "))).toBe(true);
  });

  it("rejects empty diagrams", () => {
    expect(problemsFor(validModel({ messages: [] }))).toContain("messages too_small");
    expect(problemsFor(validModel({ participants: [] }))).toContain("participants too_small");
    expect(problemsFor({ participants: [participant("mission-control", "Mission Control")] })).toContain("messages invalid_type");
  });

  it("rejects PlantUML statements, directives and unsafe text in every display field", () => {
    const hostile = [
      ["@startuml", "text-directive-like"],
      ["!include local.puml", "text-directive-like"],
      [`Line one${LF}@enduml`, "text-line-break"],
      ['Say "hello"', "text-forbidden-character"],
      ["A -> B", "text-forbidden-character"],
      [`Return validation result${LF}@enduml`, "text-line-break"],
      [`Return${CR}telemetry frames`, "text-line-break"],
      [`Return${String.fromCharCode(0x2028)}telemetry frames`, "text-line-break"],
      ["Return @enduml", "text-directive-like"],
      ["Return !includeurl remote.puml", "text-directive-like"],
      ["Return <img:logo.png>", "text-creole-markup"],
      ["Return {{template}}", "text-forbidden-character"],
      [remoteUrl, "text-remote-url"],
      ["'comment", "text-comment-delimiter"],
      ["**bold**", "text-creole-markup"],
      [`Tab${String.fromCharCode(9)}here`, "text-control-character"]
    ] as const;

    for (const [label, code] of hostile) {
      const raw = validModel();
      (raw["messages"] as Raw[])[0] = message(1, { label });
      const result = parseGeneratedSequenceModel(raw);

      expect(problemsOf(result)).toContain(`messages.0.label ${code}`);
      expect(JSON.stringify(result)).not.toContain(label);
    }

    const canonical = validModel({ participants: [participant("mission-control", 'Mission "Control"'), participant("command-service", "Command Service")] });
    expect(problemsFor(canonical)).toContain("participants.0.canonicalName text-forbidden-character");

    const interfaceName = validModel();
    (interfaceName["messages"] as Raw[])[0] = message(1, { interfaceName: "<b>Command API</b>" });
    expect(problemsFor(interfaceName)).toContain("messages.0.interfaceName text-creole-markup");

    const description = validModel();
    (description["messages"] as Raw[])[0] = message(1, { businessDescription: "!pragma teoz true" });
    expect(problemsFor(description)).toContain("messages.0.businessDescription text-directive-like");

    for (const text of ["end of story", "alt accepted", "skinparam monochrome true"]) {
      const standalone = validModel();
      (standalone["messages"] as Raw[])[0] = message(1, { businessDescription: text });
      expect(problemsFor(standalone)).toContain("messages.0.businessDescription text-statement-keyword");
    }
  });

  it("accepts message labels that begin with a statement keyword, because a label never starts a line", () => {
    const labels = [
      "Return validation result",
      "return telemetry frames",
      "ReTuRn mixed case frames",
      "Create payment instruction",
      "Activate subscription",
      "Deactivate temporary route",
      "Destroy expired session",
      "Alt processing route selected",
      "Else use fallback channel",
      "Opt retry once",
      "Loop over available records",
      "Group matching results",
      "End customer session",
      "Note validation outcome",
      "Title lookup",
      "Skinparam lookup",
      "Return: validation result",
      "end"
    ];

    for (const label of labels) {
      const raw = validModel();
      (raw["messages"] as Raw[])[0] = message(1, { label });
      expect(accepted(raw).messages[0]?.label).toBe(label);
    }

    const response = validModel();
    (response["messages"] as Raw[])[1] = message(2, { from: { elementId: "command-service" }, to: { elementId: "mission-control" }, label: "Return validation result", isResponse: true });
    const model = accepted(response);
    expect(model.messages[1]).toMatchObject({ label: "Return validation result", isResponse: true, order: 2 });

    const oversized = validModel();
    (oversized["messages"] as Raw[])[0] = message(1, { label: `Return ${"a".repeat(sequenceModelLimits.maxLabelChars)}` });
    expect(problemsFor(oversized)).toEqual(["messages.0.label text-too-long"]);
  });

  it("enforces collection and text limits before trusting the input", () => {
    const tooMany = validModel({}, sequenceModelLimits.maxMessages + 1);
    expect(problemsFor(tooMany)).toEqual(["messages too_big"]);

    const tooManyFragments = validModel({
      fragments: Array.from({ length: sequenceModelLimits.maxFragments + 1 }, () => ({ kind: "opt", condition: "Retry", firstOrder: 1, lastOrder: 1 }))
    });
    expect(problemsFor(tooManyFragments)).toEqual(["fragments too_big"]);

    const longLabel = validModel();
    (longLabel["messages"] as Raw[])[0] = message(1, { label: "a".repeat(sequenceModelLimits.maxLabelChars + 1) });
    expect(problemsFor(longLabel)).toContain("messages.0.label text-too-long");
  });

  it("reports schema paths and codes only, sorted and capped", () => {
    const secretLike = "private-looking-value-123";
    const raw = validModel({
      participants: Array.from({ length: 60 }, (_, index) => participant(`system-${index}`, secretLike, "unknown-kind"))
    });
    const result = parseGeneratedSequenceModel(raw);

    if (result.ok) {
      throw new Error("Expected a rejected model.");
    }

    expect(result.truncated).toBe(true);
    expect(result.problems).toHaveLength(sequenceModelLimits.maxReportedProblems);
    expect(JSON.stringify(result.problems)).not.toContain(secretLike);
    expect(result.problems.map((problem) => problem.path).slice(0, 3)).toEqual(["participants.0.kind", "participants.1.kind", "participants.2.kind"]);
  });
});

describe("generated sequence-model schema - fragments", () => {
  const fragmentModel = (fragments: readonly Raw[]): Raw => validModel({ fragments }, 6);

  it("accepts strictly nested alt, else, opt, loop and group fragments", () => {
    const model = accepted(
      fragmentModel([
        { kind: "alt", condition: "Command accepted", firstOrder: 1, lastOrder: 4, elseBranches: [{ condition: "Command rejected", firstOrder: 3 }] },
        { kind: "opt", condition: "Retry allowed", firstOrder: 1, lastOrder: 2 },
        { kind: "group", condition: "Uplink window", firstOrder: 5, lastOrder: 6 },
        { kind: "loop", condition: "Each frame", firstOrder: 6, lastOrder: 6 }
      ])
    );

    expect(model.fragments.map((fragment) => fragment.kind)).toEqual(["alt", "opt", "group", "loop"]);
    expect(model.fragments[0]?.elseBranches).toEqual([{ condition: "Command rejected", firstOrder: 3 }]);
    expect(model.fragments[1]?.elseBranches).toEqual([]);
  });

  it("rejects malformed fragments", () => {
    expect(problemsFor(fragmentModel([{ kind: "par", condition: "Both", firstOrder: 1, lastOrder: 2 }]))).toContain("fragments.0.kind invalid_value");
    expect(problemsFor(fragmentModel([{ kind: "opt", firstOrder: 1, lastOrder: 2 }]))).toContain("fragments.0.condition invalid_type");
    expect(problemsFor(fragmentModel([{ kind: "opt", condition: "Retry", firstOrder: 1, lastOrder: "2" }]))).toContain("fragments.0.lastOrder invalid_type");
    expect(problemsFor(fragmentModel([{ kind: "opt", condition: "end", firstOrder: 1, lastOrder: 2 }]))).toContain(
      "fragments.0.condition text-statement-keyword"
    );
    expect(problemsFor(fragmentModel([{ kind: "opt", condition: "Retry", firstOrder: 1, lastOrder: 99 }]))).toContain("fragments.0 unknown-fragment-order");
    expect(problemsFor(fragmentModel([{ kind: "opt", condition: "Retry", firstOrder: 4, lastOrder: 2 }]))).toContain("fragments.0 invalid-fragment-range");
    expect(
      problemsFor(fragmentModel([{ kind: "opt", condition: "Retry", firstOrder: 1, lastOrder: 4, elseBranches: [{ condition: "Other", firstOrder: 3 }] }]))
    ).toContain("fragments.0 else-outside-alt");
    expect(
      problemsFor(fragmentModel([{ kind: "alt", condition: "Accepted", firstOrder: 1, lastOrder: 4, elseBranches: [{ condition: "Other", firstOrder: 1 }] }]))
    ).toContain("fragments.0 invalid-else-branch");
    expect(
      problemsFor(
        fragmentModel([
          {
            kind: "alt",
            condition: "Accepted",
            firstOrder: 1,
            lastOrder: 4,
            elseBranches: [
              { condition: "Later", firstOrder: 3 },
              { condition: "Earlier", firstOrder: 2 }
            ]
          }
        ])
      )
    ).toContain("fragments.0 invalid-else-branch");
  });

  it("rejects invalid fragment nesting", () => {
    expect(
      problemsFor(
        fragmentModel([
          { kind: "opt", condition: "First", firstOrder: 1, lastOrder: 3 },
          { kind: "loop", condition: "Second", firstOrder: 2, lastOrder: 4 }
        ])
      )
    ).toContain("fragments.1 overlapping-fragments");
    expect(
      problemsFor(
        fragmentModel([
          { kind: "opt", condition: "First", firstOrder: 1, lastOrder: 2 },
          { kind: "loop", condition: "Same range", firstOrder: 1, lastOrder: 2 }
        ])
      )
    ).toContain("fragments.1 overlapping-fragments");
    expect(
      problemsFor(
        fragmentModel([
          { kind: "alt", condition: "Accepted", firstOrder: 1, lastOrder: 4, elseBranches: [{ condition: "Rejected", firstOrder: 3 }] },
          { kind: "opt", condition: "Across the branch", firstOrder: 2, lastOrder: 3 }
        ])
      )
    ).toContain("fragments.1 fragment-crosses-branch");

    const deep = [6, 5, 4, 3, 2].map((lastOrder) => ({ kind: "group", condition: `Level ${lastOrder}`, firstOrder: 1, lastOrder }));
    expect(problemsFor(fragmentModel(deep))).toEqual(["fragments.4 fragment-too-deep"]);
    expect(accepted(fragmentModel(deep.slice(0, sequenceModelLimits.maxFragmentDepth))).fragments).toHaveLength(sequenceModelLimits.maxFragmentDepth);
  });

  it("exposes the structural fragment check for the later validation stages", () => {
    const messages = [1, 2, 3, 4].map((order) => ({ order }));

    expect(
      fragmentProblems({
        messages,
        fragments: [
          { kind: "opt", firstOrder: 1, lastOrder: 2 },
          { kind: "loop", firstOrder: 3, lastOrder: 4 }
        ]
      })
    ).toEqual([]);
    expect(
      fragmentProblems({
        messages,
        fragments: [
          { kind: "opt", firstOrder: 1, lastOrder: 3 },
          { kind: "loop", firstOrder: 2, lastOrder: 4 }
        ]
      })
    ).toEqual([{ path: "fragments.1", code: "overlapping-fragments" }]);
  });
});

describe("parseGeneratedSequenceModel - explicit interaction semantics", () => {
  const queueParticipants = [participant("command-service", "Command Service"), participant("command-queue", "Command Queue", "queue")];
  // Shape of a message observed from a local model: asynchronous in wording and interface type, without the flags.
  const observed: Raw = {
    from: { elementId: "command-service" },
    to: { elementId: "command-queue" },
    label: "publishes command asynchronously",
    interfaceType: "EVENT",
    interfaceName: "Command Accepted Event",
    order: 4
  };

  it("rejects a message without async", () => {
    const { async: _async, ...withoutAsync } = message(1);
    expect(problemsFor(validModel({ messages: [withoutAsync] }))).toEqual(["messages.0.async invalid_type"]);
  });

  it("rejects a message without isResponse", () => {
    const { isResponse: _isResponse, ...withoutResponse } = message(1);
    expect(problemsFor(validModel({ messages: [withoutResponse] }))).toEqual(["messages.0.isResponse invalid_type"]);
  });

  it("rejects the observed answer that omits both flags instead of treating it as synchronous", () => {
    expect(problemsFor({ participants: queueParticipants, messages: [observed] })).toEqual([
      "messages.0.async invalid_type",
      "messages.0.isResponse invalid_type"
    ]);
  });

  it("accepts the corrected answer and keeps both flags exactly", () => {
    const result = parseGeneratedSequenceModel({ participants: queueParticipants, messages: [{ ...observed, async: true, isResponse: false }] });

    if (!result.ok) {
      throw new Error("The corrected answer must pass the schema.");
    }

    expect(result.model.messages[0]).toMatchObject({ async: true, isResponse: false, order: 4 });
  });

  it("keeps explicit false values instead of dropping them", () => {
    const result = parseGeneratedSequenceModel(validModel({}, 1));

    if (!result.ok) {
      throw new Error("The model must pass the schema.");
    }

    expect(result.model.messages[0]).toMatchObject({ async: false, isResponse: false });
  });
});
