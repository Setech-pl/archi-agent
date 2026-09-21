import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SequenceModelGenerator } from "../../src/core/pipeline/sequence-model-generator.js";
import { validatePlantUmlSubset } from "../../src/core/validation/plantuml-validator.js";
import { LocalModelError } from "../../src/node/llm/openai-compatible-local-generator.js";
import { createArchiAgentRuntime, deriveDiagramName, ProviderRegistry, runtimeLimits } from "../../src/runtime/index.js";
import type {
  ArchiAgentRuntime,
  GenerateSequenceDiagramFailure,
  GenerateSequenceDiagramRequest,
  GenerateSequenceDiagramResult,
  GenerateSequenceDiagramSuccess
} from "../../src/runtime/index.js";
import { ContextEchoGenerator } from "../doubles/context-echo-generator.js";
import { buildPackFiles, basePackRows } from "../doubles/knowledge-pack-fixture.js";
import { OpenAiCompatibleServerDouble } from "../doubles/openai-compatible-server-double.js";
import { RemoteJsonTransportDouble } from "../doubles/remote-json-transport-double.js";

const LF = String.fromCharCode(10);
const workspaces: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  workspaces.push(directory);
  return directory;
}

/** Writes a synthetic observatory pack (optionally with an ambiguous alias) into a fresh directory. */
function writePack(options: { ambiguousAlias?: boolean; omit?: string } = {}): string {
  const root = temporaryDirectory("archi-agent-pack-");
  const packDirectory = path.join(root, "architecture");
  const aliases = options.ambiguousAlias
    ? [...basePackRows.aliases, ["Controller", "dome-controller"], ["Controller", "telescope-scheduler"]]
    : basePackRows.aliases;
  const files = buildPackFiles({ aliases });

  mkdirSync(packDirectory);

  for (const [name, content] of Object.entries(files)) {
    if (name !== options.omit) {
      writeFileSync(path.join(packDirectory, name), content, "utf8");
    }
  }

  return packDirectory;
}

function flowDocument(lines: readonly string[], diagramName = "observation-run"): string {
  return ["---", `diagram_name: ${diagramName}`, "flow_name: Observation run", "author: Test Suite", "language: en", "---", ...lines, ""].join(LF);
}

const groundedLines = [
  "The Night Observer asks the Scheduler for observation slots.",
  "The Telescope Scheduler signals the Dome Controller and registers frames in the Archive."
];

const generatorConfig = { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "test-model" } as const;

function runtimeWith(generator: SequenceModelGenerator = new ContextEchoGenerator()): ArchiAgentRuntime {
  return createArchiAgentRuntime({ generatorFactory: () => generator });
}

function request(packDirectory: string, overrides: Partial<GenerateSequenceDiagramRequest> = {}): GenerateSequenceDiagramRequest {
  return {
    flow: { kind: "document", text: flowDocument(groundedLines), fileName: "observation-run.md" },
    knowledgePack: { kind: "local-directory", path: packDirectory },
    generator: generatorConfig,
    ...overrides
  };
}

function expectSuccess(result: GenerateSequenceDiagramResult): GenerateSequenceDiagramSuccess {
  if (result.status !== "success") {
    throw new Error(`Expected success, got ${JSON.stringify(result)}.`);
  }

  return result;
}

function expectFailure(result: GenerateSequenceDiagramResult, stage: GenerateSequenceDiagramFailure["stage"]): GenerateSequenceDiagramFailure {
  if (result.status !== "failed" || result.stage !== stage) {
    throw new Error(`Expected failure at ${stage}, got ${JSON.stringify(result)}.`);
  }

  return result;
}

let packDirectory: string;
const originalCwd = process.cwd();

beforeAll(() => {
  packDirectory = writePack();
});

afterEach(() => {
  process.chdir(originalCwd);
});

afterAll(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("runtime: successful generation with a fake generator", () => {
  it("returns validated PlantUML and a grounding report from an external Knowledge Pack", async () => {
    const generator = new ContextEchoGenerator();
    const result = expectSuccess(await runtimeWith(generator).generateSequenceDiagram(request(packDirectory)));

    expect(result.diagramName).toBe("observation-run");
    expect(result.generatorType).toBe("context-echo");
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.plantUml.startsWith("@startuml")).toBe(true);
    expect(validatePlantUmlSubset(result.plantUml).ok).toBe(true);
    expect(result.diagramFileName).toBe("observation-run.puml");
    expect(result.reportFileName).toBe("observation-run.grounding.json");
    expect(result.summary).toMatchObject({ participantCount: 4, knownParticipantCount: 4, newParticipantCount: 0, messageCount: 3 });
    expect(generator.requests).toHaveLength(1);

    const report = JSON.parse(result.groundingReport) as { reportSchemaVersion: number; sources: { flow: string; knowledgePack: string }; groundingDigest: { value: string } };
    expect(report.reportSchemaVersion).toBe(1);
    expect(report.sources).toEqual({ flow: "observation-run.md", knowledgePack: "architecture" });
    expect(report.groundingDigest.value).toBe(result.digest);
  });

  it("never puts a machine path into the artifacts or the issues", async () => {
    const result = expectSuccess(await runtimeWith().generateSequenceDiagram(request(packDirectory)));
    const marker = path.dirname(packDirectory);

    expect(result.plantUml.includes(marker)).toBe(false);
    expect(result.groundingReport.includes(marker)).toBe(false);
    expect(result.groundingReport.includes(marker.split(path.sep).join("/"))).toBe(false);
  });

  it("does not depend on the working directory", async () => {
    const elsewhere = temporaryDirectory("archi-agent-cwd-");
    process.chdir(elsewhere);

    const fromElsewhere = expectSuccess(await runtimeWith().generateSequenceDiagram(request(packDirectory)));
    process.chdir(originalCwd);
    const fromRepository = expectSuccess(await runtimeWith().generateSequenceDiagram(request(packDirectory)));

    expect(fromElsewhere.plantUml).toBe(fromRepository.plantUml);
    expect(fromElsewhere.digest).toBe(fromRepository.digest);
  });

  it("rejects a Knowledge Pack path that is not absolute instead of resolving it against the working directory", async () => {
    process.chdir(path.dirname(packDirectory));
    const result = expectFailure(await runtimeWith().generateSequenceDiagram(request("architecture")), "knowledge-pack");

    expect(result.issues.map((issue) => issue.code)).toEqual(["invalid-path"]);
  });

  it("reads a flow document from an absolute file path with the bounded reader", async () => {
    const flowDirectory = temporaryDirectory("archi-agent-flow-");
    const flowPath = path.join(flowDirectory, "observation-run.md");
    writeFileSync(flowPath, flowDocument(groundedLines), "utf8");

    const result = expectSuccess(await runtimeWith().generateSequenceDiagram(request(packDirectory, { flow: { kind: "file", path: flowPath } })));
    const report = JSON.parse(result.groundingReport) as { sources: { flow: string } };

    expect(report.sources.flow).toBe("observation-run.md");
    expect(result.summary.messageCount).toBe(3);

    const relative = expectFailure(await runtimeWith().generateSequenceDiagram(request(packDirectory, { flow: { kind: "file", path: "observation-run.md" } })), "flow");
    expect(relative.issues[0]?.code).toBe("invalid-path");

    const missing = expectFailure(
      await runtimeWith().generateSequenceDiagram(request(packDirectory, { flow: { kind: "file", path: path.join(flowDirectory, "missing.md") } })),
      "flow"
    );
    expect(missing.issues[0]?.code).toBe("not-found");
  });

  it("composes the front matter for a plain description", async () => {
    const result = expectSuccess(
      await runtimeWith().generateSequenceDiagram(
        request(packDirectory, {
          flow: { kind: "description", flowName: "Nightly Observation Run", description: groundedLines.join(" "), author: "Observer" }
        })
      )
    );

    expect(result.diagramName).toBe("nightly-observation-run");
    expect(result.plantUml).toContain("nightly-observation-run");
    expect(result.summary.messageCount).toBe(3);
    expect(deriveDiagramName("  Caf\u00e9 R\u00e9serv\u00e9 ??? Slots ")).toBe("cafe-reserve-slots");
    expect(deriveDiagramName("***")).toBe("flow");
  });

  it("rejects a description with control characters or an empty name before composing anything", async () => {
    const generator = new ContextEchoGenerator();
    const result = expectFailure(
      await runtimeWith(generator).generateSequenceDiagram(
        request(packDirectory, { flow: { kind: "description", flowName: `Bad${String.fromCharCode(7)}name`, description: "" } })
      ),
      "flow"
    );

    expect(result.issues.map((issue) => issue.code).sort()).toEqual(["flow-description-invalid", "flow-name-invalid"]);
    expect(generator.requests).toHaveLength(0);
  });

  it("maps pipeline warnings into the result", async () => {
    const result = expectSuccess(
      await runtimeWith().generateSequenceDiagram(request(packDirectory, { flow: { kind: "document", text: flowDocument([groundedLines[0] ?? ""]) } }))
    );

    expect(result.summary.messageCount).toBe(1);
    expect(result.warnings.every((issue) => issue.severity === "warning")).toBe(true);
  });
});

describe("runtime: controlled failures", () => {
  it("reports an invalid flow document at the flow stage", async () => {
    const generator = new ContextEchoGenerator();
    const result = expectFailure(await runtimeWith(generator).generateSequenceDiagram(request(packDirectory, { flow: { kind: "document", text: "No front matter." } })), "flow");

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => issue.severity === "error")).toBe(true);
    expect(generator.requests).toHaveLength(0);
  });

  it("reports a Knowledge Pack with a missing file at the knowledge-pack stage", async () => {
    const generator = new ContextEchoGenerator();
    const incomplete = writePack({ omit: "rules.md" });
    const result = expectFailure(await runtimeWith(generator).generateSequenceDiagram(request(incomplete)), "knowledge-pack");

    expect(result.issues.map((issue) => issue.code)).toContain("missing-file");
    expect(result.issues.some((issue) => issue.file === "rules.md")).toBe(true);
    expect(generator.requests).toHaveLength(0);
  });

  it("reports a Knowledge Pack directory that does not exist", async () => {
    const result = expectFailure(
      await runtimeWith().generateSequenceDiagram(request(path.join(path.dirname(packDirectory), "absent-pack"))),
      "knowledge-pack"
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(["missing-file"]);
  });

  it("reports a malformed pack table with its file and line", async () => {
    const broken = writePack();
    writeFileSync(path.join(broken, "systems.md"), "| id | canonical_name |" + LF + "| --- | --- |" + LF + "| x | Broken |" + LF, "utf8");
    const result = expectFailure(await runtimeWith().generateSequenceDiagram(request(broken)), "knowledge-pack");

    expect(result.issues.some((issue) => issue.file === "systems.md")).toBe(true);
  });

  it("rejects a non-loopback base URL and an empty model identifier before any request", async () => {
    const generator = new ContextEchoGenerator();
    const remote = expectFailure(
      await runtimeWith(generator).generateSequenceDiagram(request(packDirectory, { generator: { ...generatorConfig, baseUrl: "http://example.test:1234/v1" } })),
      "generator-configuration"
    );
    expect(remote.issues.map((issue) => issue.code)).toEqual(["non-loopback-host"]);

    const noModel = expectFailure(
      await runtimeWith(generator).generateSequenceDiagram(request(packDirectory, { generator: { ...generatorConfig, modelId: "" } })),
      "generator-configuration"
    );
    expect(noModel.issues.map((issue) => issue.code)).toEqual(["unsafe-model-id"]);
    expect(generator.requests).toHaveLength(0);
  });

  it("reports a failed model request with its stable code and no diagram", async () => {
    const generator = new ContextEchoGenerator({ failWith: new LocalModelError("connection-failed") });
    const result = expectFailure(await runtimeWith(generator).generateSequenceDiagram(request(packDirectory)), "invalid-generator-output");

    expect(result.issues).toEqual([expect.objectContaining({ code: "generator-failed", details: { problem: "connection-failed" } })]);
  });

  it("reports a schema-violating answer and a semantically invalid answer as separate stages", async () => {
    const schema = new ContextEchoGenerator({ produce: () => ({ participants: [], messages: [], notes: "free text" }) });
    expectFailure(await runtimeWith(schema).generateSequenceDiagram(request(packDirectory)), "invalid-generator-output");

    const semantic = new ContextEchoGenerator({
      produce: () => ({
        participants: [
          { origin: "knowledge-pack", elementId: "night-observer", canonicalName: "Night Observer", kind: "actor" },
          { origin: "knowledge-pack", elementId: "dome-controller", canonicalName: "Dome Controller", kind: "system" }
        ],
        messages: [{ from: { elementId: "night-observer" }, to: { elementId: "dome-controller" }, label: "Open the dome", interfaceType: "EVENT", async: false, isResponse: false, order: 1 }]
      })
    });
    const result = expectFailure(await runtimeWith(semantic).generateSequenceDiagram(request(packDirectory)), "semantic-validation-failed");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => typeof issue.code === "string" && issue.message.length > 0)).toBe(true);
  });

  it("uses the default local generator when no factory is injected, without contacting anything for a bad model id", async () => {
    const result = expectFailure(
      await createArchiAgentRuntime().generateSequenceDiagram(request(packDirectory, { generator: { ...generatorConfig, modelId: "../escape" } })),
      "generator-configuration"
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(["unsafe-model-id"]);
  });
});

describe("runtime: ambiguity and new participants stay explicit", () => {
  const ambiguousLines = ["The Night Observer asks the Scheduler for observation slots.", "The Controller opens the dome."];

  it("blocks on an ambiguous mention and lists every candidate", async () => {
    const ambiguousPack = writePack({ ambiguousAlias: true });
    const generator = new ContextEchoGenerator();
    const result = expectFailure(
      await runtimeWith(generator).generateSequenceDiagram(request(ambiguousPack, { flow: { kind: "document", text: flowDocument(ambiguousLines) } })),
      "grounding-blocked"
    );

    expect(generator.requests).toHaveLength(0);
    expect(result.issues.map((issue) => issue.code)).toContain("ambiguous-reference");
    expect(result.ambiguities).toEqual([
      {
        mention: "controller",
        lines: [8],
        candidates: [
          expect.objectContaining({ id: "dome-controller", participantType: "system", canonicalName: "Dome Controller", sourceFile: "systems.md" }),
          expect.objectContaining({ id: "telescope-scheduler", participantType: "system", canonicalName: "Telescope Scheduler", sourceFile: "systems.md" })
        ]
      }
    ]);
    expect(result.unconfirmedNewParticipants).toEqual([]);
  });

  it("generates after an explicit valid selection and rejects a selection outside the candidates", async () => {
    const ambiguousPack = writePack({ ambiguousAlias: true });
    const flow = { kind: "document", text: flowDocument(ambiguousLines) } as const;
    const selected = expectSuccess(
      await runtimeWith().generateSequenceDiagram(request(ambiguousPack, { flow, selections: { Controller: "dome-controller" } }))
    );
    expect(selected.summary.knownParticipantCount).toBe(3);

    const invalid = expectFailure(
      await runtimeWith().generateSequenceDiagram(request(ambiguousPack, { flow, selections: { Controller: "image-archive" } })),
      "grounding-blocked"
    );
    expect(invalid.issues.map((issue) => issue.code)).toContain("invalid-ambiguity-selection");
    expect(invalid.ambiguities.map((choice) => choice.mention)).toEqual(["controller"]);
  });

  it("blocks on an unconfirmed [NEW: Name] marker and generates once it is confirmed", async () => {
    const flow = { kind: "document", text: flowDocument([...groundedLines, "The Telescope Scheduler notifies the [NEW: Weather Station]."]) } as const;
    const blocked = expectFailure(await runtimeWith().generateSequenceDiagram(request(packDirectory, { flow })), "grounding-blocked");

    expect(blocked.issues.map((issue) => issue.code)).toContain("new-participant-unconfirmed");
    expect(blocked.unconfirmedNewParticipants).toEqual(["weather station"]);
    expect(blocked.ambiguities).toEqual([]);

    const confirmed = expectSuccess(
      await runtimeWith().generateSequenceDiagram(request(packDirectory, { flow, confirmedNewParticipants: ["Weather Station"] }))
    );
    expect(confirmed.summary.newParticipantCount).toBe(1);
    expect(confirmed.plantUml).toContain("[NEW] Weather Station");
  });

  it("never turns unknown text into a participant", async () => {
    const result = expectFailure(
      await runtimeWith().generateSequenceDiagram(request(packDirectory, { flow: { kind: "document", text: flowDocument(["A Weather Station reports wind."]) } })),
      "grounding-blocked"
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(["no-participants"]);
    expect(result.ambiguities).toEqual([]);
    expect(result.unconfirmedNewParticipants).toEqual([]);
  });
});

describe("runtime: local model listing", () => {
  it("lists immutable local and cloud profiles without network I/O", () => {
    const profiles = createArchiAgentRuntime().listProviderProfiles();

    expect(profiles.map((profile) => [profile.profileId, profile.displayName, profile.providerKind])).toEqual([
      ["cloud-anthropic", "Anthropic", "anthropic-remote"],
      ["cloud-openai", "OpenAI", "openai-remote"],
      ["cloud-openrouter", "OpenRouter", "openrouter-remote"],
      ["local-lm-studio", "LM Studio", "openai-compatible-local"],
      ["local-ollama", "Ollama", "openai-compatible-local"]
    ]);
    expect(profiles.every((profile) => profile.capabilities.modelListing && profile.capabilities.structuredChat)).toBe(true);
    expect(Object.isFrozen(profiles)).toBe(true);
  });

  it("uses the same OpenAI-compatible GET transport for both local profiles", async () => {
    const double = await OpenAiCompatibleServerDouble.start({ models: ["qwen3:8b", "llama3.2"] });

    try {
      const runtime = createArchiAgentRuntime();
      expect(await runtime.listProviderModels({ profileId: "local-lm-studio", baseUrl: double.baseUrl })).toEqual({
        ok: true,
        models: ["llama3.2", "qwen3:8b"]
      });
      expect(await runtime.listProviderModels({ profileId: "local-ollama", baseUrl: double.baseUrl })).toEqual({
        ok: true,
        models: ["llama3.2", "qwen3:8b"]
      });
      expect(double.requests.map((entry) => [entry.method, entry.path])).toEqual([
        ["GET", "/v1/models"],
        ["GET", "/v1/models"]
      ]);
    } finally {
      await double.close();
    }
  });

  it("runs a profile generation through exactly one shared chat-completions POST", async () => {
    const echo = new ContextEchoGenerator();
    expectSuccess(await runtimeWith(echo).generateSequenceDiagram(request(packDirectory)));
    const groundedRequest = echo.requests[0];

    if (groundedRequest === undefined) {
      throw new Error("The echo generator must capture the grounded request.");
    }

    const completionContent = JSON.stringify(await echo.generate(groundedRequest));
    const double = await OpenAiCompatibleServerDouble.start({ completionContent });

    try {
      const result = expectSuccess(
        await createArchiAgentRuntime().generateSequenceDiagram(
          request(packDirectory, {
            generator: {
              kind: "openai-compatible-local",
              profileId: "local-ollama",
              modelId: "qwen3:8b",
              baseUrl: double.baseUrl
            }
          })
        )
      );

      expect(result.generatorType).toBe("openai-compatible-local");
      expect(double.requests.map((entry) => [entry.method, entry.path])).toEqual([["POST", "/v1/chat/completions"]]);
      expect((double.requests[0]?.body as { model?: string }).model).toBe("qwen3:8b");
    } finally {
      await double.close();
    }
  });

  it("runs every cloud profile through exactly one explicit generation request with truthful report metadata", async () => {
    const echo = new ContextEchoGenerator();
    expectSuccess(await runtimeWith(echo).generateSequenceDiagram(request(packDirectory)));
    const groundedRequest = echo.requests[0];
    if (groundedRequest === undefined) throw new Error("The echo generator must capture the grounded request.");
    const content = JSON.stringify(await echo.generate(groundedRequest));
    const cases = [
      {
        profileId: "cloud-anthropic",
        modelId: "claude-test",
        generatorType: "anthropic-remote",
        endpoint: "anthropic-messages",
        response: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: content }] })
      },
      {
        profileId: "cloud-openai",
        modelId: "gpt-test",
        generatorType: "openai-remote",
        endpoint: "openai-chat-completions",
        response: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })
      },
      {
        profileId: "cloud-openrouter",
        modelId: "vendor/model-test",
        generatorType: "openrouter-remote",
        endpoint: "openrouter-chat-completions",
        response: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })
      }
    ] as const;

    for (const entry of cases) {
      const transport = new RemoteJsonTransportDouble(entry.response);
      const result = expectSuccess(
        await createArchiAgentRuntime({ remoteTransport: transport }).generateSequenceDiagram(
          request(packDirectory, {
            generator: {
              kind: "remote-provider",
              profileId: entry.profileId,
              modelId: entry.modelId,
              credential: { type: "api-key", value: "synthetic-secret" }
            }
          })
        )
      );
      const report = JSON.parse(result.groundingReport) as { generatorType: string; modelGeneration: unknown };
      expect(result.generatorType).toBe(entry.generatorType);
      expect(report).toMatchObject({
        generatorType: entry.generatorType,
        modelGeneration: { modelId: entry.modelId, temperature: null, seed: null, attemptCount: 1, structuredOutput: true }
      });
      expect(transport.requests.map((sent) => sent.endpoint)).toEqual([entry.endpoint]);
      expect(result.groundingReport).not.toContain("synthetic-secret");
    }
  });

  it("blocks missing or invalid cloud credentials before generation transport I/O", async () => {
    for (const credential of [undefined, { type: "api-key" as const, value: "x".repeat(1025) }]) {
      const transport = new RemoteJsonTransportDouble();
      const result = expectFailure(
        await createArchiAgentRuntime({ remoteTransport: transport }).generateSequenceDiagram(
          request(packDirectory, {
            generator: {
              kind: "remote-provider",
              profileId: "cloud-openai",
              modelId: "gpt-test",
              ...(credential === undefined ? {} : { credential })
            }
          })
        ),
        "generator-configuration"
      );
      expect(result.issues.map((entry) => entry.code)).toEqual([credential === undefined ? "credential-required" : "invalid-credential"]);
      expect(transport.requests).toEqual([]);
    }
  });

  it("rejects an unknown profile before any request", async () => {
    const double = await OpenAiCompatibleServerDouble.start({ models: ["must-not-be-read"] });

    try {
      const runtime = createArchiAgentRuntime();
      expect(await runtime.listProviderModels({ profileId: "unknown-profile", baseUrl: double.baseUrl })).toEqual({
        ok: false,
        code: "unknown-provider-profile"
      });
      expect(double.requests).toEqual([]);

      const result = expectFailure(
        await runtimeWith().generateSequenceDiagram(
          request(packDirectory, {
            generator: { kind: "openai-compatible-local", profileId: "unknown-profile", modelId: "model", baseUrl: double.baseUrl }
          })
        ),
        "generator-configuration"
      );
      expect(result.issues.map((entry) => entry.code)).toEqual(["unknown-provider-profile"]);
      expect(double.requests).toEqual([]);
    } finally {
      await double.close();
    }
  });

  it("returns provider-capability-unavailable without I/O when listing is disabled", async () => {
    const registry = new ProviderRegistry([
      {
        profileId: "local-disabled",
        providerKind: "openai-compatible-local",
        displayName: "Disabled test profile",
        credentialRequirement: "none",
        capabilities: { modelListing: false, structuredChat: false }
      }
    ]);
    const runtime = createArchiAgentRuntime({
      providerRegistry: registry,
      defaultBaseUrlForProfile: () => {
        throw new Error("must not resolve an endpoint");
      }
    });

    expect(await runtime.listProviderModels({ profileId: "local-disabled" })).toEqual({
      ok: false,
      code: "provider-capability-unavailable"
    });

    const generated = expectFailure(
      await runtime.generateSequenceDiagram(
        request(packDirectory, {
          generator: { kind: "openai-compatible-local", profileId: "local-disabled", modelId: "model" }
        })
      ),
      "generator-configuration"
    );
    expect(generated.issues.map((entry) => entry.code)).toEqual(["provider-capability-unavailable"]);
  });

  it("lists the models of a loopback server double and rejects a non-loopback URL", async () => {
    const double = await OpenAiCompatibleServerDouble.start({ models: ["model-b", "model-a"] });

    try {
      const listed = await createArchiAgentRuntime().listLocalModels({ baseUrl: double.baseUrl });
      expect(listed).toEqual({ ok: true, models: ["model-a", "model-b"] });
    } finally {
      await double.close();
    }

    const rejected = await createArchiAgentRuntime().listLocalModels({ baseUrl: "http://localhost:1234/v1" });
    expect(rejected).toEqual({ ok: false, code: "non-loopback-host" });
  });

  it("exposes the transport limits hosts need for their settings", () => {
    expect(runtimeLimits.defaultTimeoutMs).toBe(120_000);
    expect(runtimeLimits.maxTimeoutMs).toBe(600_000);
    expect(runtimeLimits.maxFlowFileBytes).toBeGreaterThan(0);
  });
});
