import { describe, expect, it } from "vitest";
import type {
  AmbiguityChoice,
  ArchiAgentRuntime,
  GenerateSequenceDiagramFailure,
  GenerateSequenceDiagramRequest,
  GenerateSequenceDiagramResult,
  GenerateSequenceDiagramSuccess
} from "../../src/runtime/index.js";
import {
  buildGenerationRequest,
  isResolvable,
  runSequenceGenerationSession,
  sessionLimits,
  type ResolutionPrompts
} from "../../vscode-extension/src/commands/sequence-generation-session.js";
import type { ArchiAgentSettings } from "../../vscode-extension/src/settings.js";

const settings: ArchiAgentSettings = {
  knowledgePackPath: "/packs/observatory",
  localModel: { baseUrl: "http://127.0.0.1:1234/v1", modelId: "model-a", timeoutMs: 45_000 },
  defaultAuthor: "Archi Agent"
};

const flow = { kind: "document", text: "---\ndiagram_name: x\nflow_name: X\nauthor: A\n---\nBody\n" } as const;

const success: GenerateSequenceDiagramSuccess = {
  status: "success",
  diagramName: "x",
  generatorType: "double",
  digest: "0".repeat(64),
  plantUml: "@startuml\n@enduml\n",
  diagramFileName: "x.puml",
  groundingReport: "{}",
  reportFileName: "x.grounding.json",
  summary: {
    participantCount: 2,
    knownParticipantCount: 2,
    newParticipantCount: 0,
    messageCount: 1,
    synchronousCount: 1,
    asynchronousCount: 0,
    responseCount: 0,
    selfMessageCount: 0,
    warningCount: 0
  },
  warnings: []
};

const controllerChoice: AmbiguityChoice = {
  mention: "controller",
  lines: [7],
  candidates: [
    { id: "dome-controller", participantType: "system", elementKind: "system", canonicalName: "Dome Controller", sourceFile: "systems.md", sourceLine: 4 },
    { id: "telescope-scheduler", participantType: "system", elementKind: "service", canonicalName: "Telescope Scheduler", sourceFile: "systems.md", sourceLine: 3 }
  ]
};

function blocked(overrides: Partial<GenerateSequenceDiagramFailure> = {}): GenerateSequenceDiagramFailure {
  return {
    status: "failed",
    stage: "grounding-blocked",
    issues: [{ severity: "error", code: "ambiguous-reference", message: "A reference matches several knowledge-pack elements and needs an explicit selection." }],
    ambiguities: [],
    unconfirmedNewParticipants: [],
    ...overrides
  };
}

/** Runtime double that answers from a script and records every request. */
function scriptedRuntime(results: readonly GenerateSequenceDiagramResult[]): ArchiAgentRuntime & { requests: GenerateSequenceDiagramRequest[] } {
  const queue = [...results];
  const requests: GenerateSequenceDiagramRequest[] = [];

  return {
    requests,
    async generateSequenceDiagram(request) {
      requests.push(request);
      const next = queue.shift();

      if (next === undefined) {
        throw new Error("The runtime double ran out of scripted results.");
      }

      return next;
    },
    async listLocalModels() {
      return { ok: true, models: [] };
    }
  };
}

function prompts(script: { select?: (choice: AmbiguityChoice) => string | undefined; confirm?: (names: readonly string[]) => readonly string[] | undefined }): ResolutionPrompts & {
  selections: AmbiguityChoice[];
  confirmations: (readonly string[])[];
} {
  const selections: AmbiguityChoice[] = [];
  const confirmations: (readonly string[])[] = [];

  return {
    selections,
    confirmations,
    async selectAmbiguityCandidate(choice) {
      selections.push(choice);
      return script.select?.(choice);
    },
    async confirmNewParticipants(names) {
      confirmations.push(names);
      return script.confirm?.(names);
    }
  };
}

describe("buildGenerationRequest", () => {
  it("maps the settings and the flow to a runtime request without extra fields", () => {
    const signal = { aborted: false };
    const request = buildGenerationRequest(settings, flow, "model-b", signal);

    expect(request).toEqual({
      flow,
      knowledgePack: { kind: "local-directory", path: "/packs/observatory" },
      generator: { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "model-b", timeoutMs: 45_000 },
      signal
    });
    expect("selections" in request).toBe(false);
    expect("confirmedNewParticipants" in request).toBe(false);
  });
});

describe("resolution session", () => {
  it("returns a success without prompting", async () => {
    const runtime = scriptedRuntime([success]);
    const ui = prompts({});
    const outcome = await runSequenceGenerationSession({ runtime, request: buildGenerationRequest(settings, flow, "model-a"), prompts: ui });

    expect(outcome).toEqual({ status: "completed", result: success, rounds: 0 });
    expect(ui.selections).toEqual([]);
    expect(ui.confirmations).toEqual([]);
  });

  it("asks for each ambiguity, re-runs with the explicit selections and never guesses", async () => {
    const runtime = scriptedRuntime([blocked({ ambiguities: [controllerChoice] }), success]);
    const ui = prompts({ select: () => "telescope-scheduler" });
    const outcome = await runSequenceGenerationSession({ runtime, request: buildGenerationRequest(settings, flow, "model-a"), prompts: ui });

    expect(outcome).toEqual({ status: "completed", result: success, rounds: 1 });
    expect(ui.selections).toEqual([controllerChoice]);
    expect(runtime.requests[0]?.selections).toBeUndefined();
    expect(runtime.requests[1]?.selections).toEqual({ controller: "telescope-scheduler" });
  });

  it("cancels when the user dismisses the candidate prompt", async () => {
    const runtime = scriptedRuntime([blocked({ ambiguities: [controllerChoice] })]);
    const outcome = await runSequenceGenerationSession({ runtime, request: buildGenerationRequest(settings, flow, "model-a"), prompts: prompts({}) });

    expect(outcome).toEqual({ status: "cancelled" });
    expect(runtime.requests).toHaveLength(1);
  });

  it("treats an identifier outside the candidates as a cancellation instead of forwarding it", async () => {
    const runtime = scriptedRuntime([blocked({ ambiguities: [controllerChoice] })]);
    const outcome = await runSequenceGenerationSession({
      runtime,
      request: buildGenerationRequest(settings, flow, "model-a"),
      prompts: prompts({ select: () => "image-archive" })
    });

    expect(outcome).toEqual({ status: "cancelled" });
    expect(runtime.requests).toHaveLength(1);
  });

  it("confirms new participants only when the user selects them all", async () => {
    const runtime = scriptedRuntime([blocked({ issues: [], unconfirmedNewParticipants: ["weather station", "wind sensor"] }), success]);
    const ui = prompts({ confirm: (names) => names });
    const outcome = await runSequenceGenerationSession({ runtime, request: buildGenerationRequest(settings, flow, "model-a"), prompts: ui });

    expect(outcome).toEqual({ status: "completed", result: success, rounds: 1 });
    expect(ui.confirmations).toEqual([["weather station", "wind sensor"]]);
    expect(runtime.requests[1]?.confirmedNewParticipants).toEqual(["weather station", "wind sensor"]);
  });

  it("reports the block when the user declines one of the new participants", async () => {
    const failure = blocked({ issues: [], unconfirmedNewParticipants: ["weather station", "wind sensor"] });
    const runtime = scriptedRuntime([failure]);
    const outcome = await runSequenceGenerationSession({
      runtime,
      request: buildGenerationRequest(settings, flow, "model-a"),
      prompts: prompts({ confirm: () => ["weather station"] })
    });

    expect(outcome).toEqual({ status: "completed", result: failure, rounds: 0 });
    expect(runtime.requests).toHaveLength(1);
  });

  it("ignores confirmed names that were not reported", async () => {
    const runtime = scriptedRuntime([blocked({ issues: [], unconfirmedNewParticipants: ["weather station"] }), success]);
    await runSequenceGenerationSession({
      runtime,
      request: buildGenerationRequest(settings, flow, "model-a"),
      prompts: prompts({ confirm: () => ["weather station", "ground station"] })
    });

    expect(runtime.requests[1]?.confirmedNewParticipants).toEqual(["weather station"]);
  });

  it("resolves an ambiguity and a new participant in one round while keeping earlier decisions", async () => {
    const runtime = scriptedRuntime([
      blocked({ ambiguities: [controllerChoice], unconfirmedNewParticipants: ["weather station"] }),
      blocked({ ambiguities: [{ ...controllerChoice, mention: "archive" }] }),
      success
    ]);
    const ui = prompts({ select: (choice) => (choice.mention === "controller" ? "dome-controller" : "telescope-scheduler"), confirm: (names) => names });
    const outcome = await runSequenceGenerationSession({ runtime, request: buildGenerationRequest(settings, flow, "model-a"), prompts: ui });

    expect(outcome).toEqual({ status: "completed", result: success, rounds: 2 });
    expect(runtime.requests[2]?.selections).toEqual({ controller: "dome-controller", archive: "telescope-scheduler" });
    expect(runtime.requests[2]?.confirmedNewParticipants).toEqual(["weather station"]);
  });

  it("stops after the bounded number of rounds and reports the last block", async () => {
    const failure = blocked({ ambiguities: [controllerChoice] });
    const runtime = scriptedRuntime(Array.from({ length: sessionLimits.maxResolutionRounds + 1 }, () => failure));
    const outcome = await runSequenceGenerationSession({
      runtime,
      request: buildGenerationRequest(settings, flow, "model-a"),
      prompts: prompts({ select: () => "dome-controller" })
    });

    expect(outcome).toEqual({ status: "completed", result: failure, rounds: sessionLimits.maxResolutionRounds });
    expect(runtime.requests).toHaveLength(sessionLimits.maxResolutionRounds + 1);
  });

  it("returns non-resolvable failures unchanged without prompting", async () => {
    const failure: GenerateSequenceDiagramFailure = {
      status: "failed",
      stage: "knowledge-pack",
      issues: [{ severity: "error", code: "missing-file", message: "A required pack file is missing.", file: "rules.md" }],
      ambiguities: [],
      unconfirmedNewParticipants: []
    };
    const ui = prompts({ select: () => "dome-controller" });
    const outcome = await runSequenceGenerationSession({ runtime: scriptedRuntime([failure]), request: buildGenerationRequest(settings, flow, "model-a"), prompts: ui });

    expect(outcome).toEqual({ status: "completed", result: failure, rounds: 0 });
    expect(isResolvable(failure)).toBe(false);
    expect(isResolvable(blocked())).toBe(false);
    expect(isResolvable(blocked({ ambiguities: [controllerChoice] }))).toBe(true);
    expect(ui.selections).toEqual([]);
  });

  it("cancels before calling the runtime when the signal is already aborted", async () => {
    const runtime = scriptedRuntime([success]);
    const outcome = await runSequenceGenerationSession({
      runtime,
      request: buildGenerationRequest(settings, flow, "model-a", { aborted: true }),
      prompts: prompts({})
    });

    expect(outcome).toEqual({ status: "cancelled" });
    expect(runtime.requests).toHaveLength(0);
  });
});
