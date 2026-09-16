import path from "node:path";
import { describe, expect, it } from "vitest";
import { settingKeys } from "../../vscode-extension/src/contributions.js";
import { readArchiAgentSettings, settingsLimits, type SettingsReader } from "../../vscode-extension/src/settings.js";

const absolutePack = path.resolve(path.sep, "architecture", "pack");

function reader(values: Readonly<Record<string, unknown>>): SettingsReader {
  return { get: (section) => values[section] };
}

function expectProblems(values: Readonly<Record<string, unknown>>): readonly string[] {
  const result = readArchiAgentSettings(reader(values));

  if (result.ok) {
    throw new Error("Expected settings problems.");
  }

  return result.problems.map((problem) => problem.code);
}

describe("settings parsing", () => {
  it("accepts a complete configuration and normalizes the values", () => {
    const result = readArchiAgentSettings(
      reader({
        [settingKeys.knowledgePackPath]: `  ${absolutePack}  `,
        [settingKeys.localModelBaseUrl]: "http://127.0.0.1:1234/v1/",
        [settingKeys.localModelId]: " qwen2.5-7b-instruct ",
        [settingKeys.localModelTimeoutSeconds]: 30,
        [settingKeys.defaultAuthor]: "Platform Team"
      })
    );

    expect(result).toEqual({
      ok: true,
      settings: {
        knowledgePackPath: absolutePack,
        localModel: { baseUrl: "http://127.0.0.1:1234/v1", modelId: "qwen2.5-7b-instruct", timeoutMs: 30_000 },
        defaultAuthor: "Platform Team"
      }
    });
  });

  it("applies the loopback default, the default timeout and the default author when settings are absent", () => {
    const result = readArchiAgentSettings(reader({ [settingKeys.knowledgePackPath]: absolutePack }));

    expect(result.ok).toBe(true);
    expect(result.ok && result.settings.localModel).toEqual({
      baseUrl: "http://127.0.0.1:1234/v1",
      modelId: undefined,
      timeoutMs: settingsLimits.defaultTimeoutSeconds * 1000
    });
    expect(result.ok && result.settings.defaultAuthor).toBe("Archi Agent");
  });

  it("reports a missing Knowledge Pack path", () => {
    expect(expectProblems({})).toEqual(["knowledge-pack-path-missing"]);
    expect(expectProblems({ [settingKeys.knowledgePackPath]: "   " })).toEqual(["knowledge-pack-path-missing"]);
  });

  it("rejects a relative Knowledge Pack path so nothing is resolved against a workspace or working directory", () => {
    expect(expectProblems({ [settingKeys.knowledgePackPath]: "samples/space-mission/architecture" })).toEqual(["knowledge-pack-path-not-absolute"]);
    expect(expectProblems({ [settingKeys.knowledgePackPath]: `${absolutePack}${String.fromCharCode(10)}x` })).toEqual(["knowledge-pack-path-not-absolute"]);
  });

  it("leaves the model undefined when none is configured, so the command asks the server", () => {
    const result = readArchiAgentSettings(reader({ [settingKeys.knowledgePackPath]: absolutePack, [settingKeys.localModelId]: "" }));
    expect(result.ok && result.settings.localModel.modelId).toBeUndefined();
  });

  it("rejects an unsafe model identifier", () => {
    expect(expectProblems({ [settingKeys.knowledgePackPath]: absolutePack, [settingKeys.localModelId]: "../model" })).toEqual(["local-model-id-invalid"]);
    expect(expectProblems({ [settingKeys.knowledgePackPath]: absolutePack, [settingKeys.localModelId]: "model with spaces" })).toEqual(["local-model-id-invalid"]);
  });

  it("rejects every non-loopback or malformed base URL with the endpoint code in the message", () => {
    for (const baseUrl of ["http://localhost:1234/v1", "https://127.0.0.1:1234/v1", "http://192.168.1.10:1234/v1", "http://127.0.0.1:1234/", "not a url"]) {
      const result = readArchiAgentSettings(reader({ [settingKeys.knowledgePackPath]: absolutePack, [settingKeys.localModelBaseUrl]: baseUrl }));

      expect(result.ok).toBe(false);
      expect(!result.ok && result.problems.map((problem) => problem.code)).toEqual(["local-model-base-url-invalid"]);
      expect(!result.ok && result.problems[0]?.message).toMatch(/rejected \([a-z-]+\)\. Use a literal loopback URL/);
    }
  });

  it("rejects an out-of-range or non-numeric timeout", () => {
    for (const timeout of [0, -5, 601, "30", Number.NaN]) {
      expect(expectProblems({ [settingKeys.knowledgePackPath]: absolutePack, [settingKeys.localModelTimeoutSeconds]: timeout })).toEqual([
        "local-model-timeout-invalid"
      ]);
    }
  });

  it("rejects a default author with control characters", () => {
    expect(expectProblems({ [settingKeys.knowledgePackPath]: absolutePack, [settingKeys.defaultAuthor]: `A${String.fromCharCode(9)}B` })).toEqual([
      "default-author-invalid"
    ]);
  });

  it("collects several problems at once and names the full setting identifiers", () => {
    const result = readArchiAgentSettings(reader({ [settingKeys.localModelBaseUrl]: "ftp://127.0.0.1:1/v1", [settingKeys.localModelTimeoutSeconds]: 0 }));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((problem) => problem.setting)).toEqual([
      "archiAgent.knowledgePackPath",
      "archiAgent.localModel.baseUrl",
      "archiAgent.localModel.timeoutSeconds"
    ]);
  });
});
