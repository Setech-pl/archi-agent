import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { settingKeys } from "../../vscode-extension/src/contributions.js";
import { readArchiAgentSettings, settingsLimits, type SettingsReader } from "../../vscode-extension/src/settings.js";

const absolutePack = path.resolve(path.sep, "architecture", "pack");

function reader(
  values: Readonly<Record<string, unknown>>,
  inspected: Readonly<
    Record<string, { defaultValue?: unknown; globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown }>
  > = {}
): SettingsReader {
  return {
    get: (section) => values[section],
    inspect: (section) => inspected[section] ?? { globalValue: values[section] }
  };
}

function expectProblems(values: Readonly<Record<string, unknown>>): readonly string[] {
  const result = readArchiAgentSettings(reader(values));

  if (result.ok) {
    throw new Error("Expected settings problems.");
  }

  return result.problems.map((problem) => problem.code);
}

describe("settings parsing", () => {
  it("declares profile, selectedModel and its binding as machine-scoped while leaving legacy scopes unchanged", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../vscode-extension/package.json", import.meta.url), "utf8")) as {
      capabilities: { untrustedWorkspaces: { restrictedConfigurations: string[] } };
      contributes: { configuration: { properties: Record<string, { scope?: string }> } };
    };
    const properties = manifest.contributes.configuration.properties;

    expect(properties["archiAgent.localModel.profile"]?.scope).toBe("machine");
    expect(properties["archiAgent.localModel.selectedModel"]?.scope).toBe("machine");
    expect(properties["archiAgent.localModel.selectedModelProfile"]?.scope).toBe("machine");
    expect(properties["archiAgent.localModel.baseUrl"]?.scope).toBeUndefined();
    expect(properties["archiAgent.localModel.model"]?.scope).toBeUndefined();
    expect(properties["archiAgent.localModel.timeoutSeconds"]?.scope).toBeUndefined();
    expect(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations).toEqual(
      expect.arrayContaining([
        "archiAgent.localModel.profile",
        "archiAgent.localModel.selectedModel",
        "archiAgent.localModel.selectedModelProfile"
      ])
    );
  });

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
        localModel: {
          selectionMode: "legacy",
          profileId: "local-lm-studio",
          baseUrl: "http://127.0.0.1:1234/v1",
          modelId: "qwen2.5-7b-instruct",
          timeoutMs: 30_000
        },
        defaultAuthor: "Platform Team"
      }
    });
  });

  it("applies the loopback default, the default timeout and the default author when settings are absent", () => {
    const result = readArchiAgentSettings(reader({ [settingKeys.knowledgePackPath]: absolutePack }));

    expect(result.ok).toBe(true);
    expect(result.ok && result.settings.localModel).toEqual({
      selectionMode: "legacy",
      profileId: "local-lm-studio",
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

  it("keeps legacy LM Studio precedence when no profile has an explicit global value", () => {
    for (const [workspaceValue, workspaceFolderValue, expected] of [
      ["workspace-model", undefined, "workspace-model"],
      ["workspace-model", "folder-model", "folder-model"]
    ] as const) {
      const result = readArchiAgentSettings(
        reader(
          {
            [settingKeys.knowledgePackPath]: absolutePack,
            [settingKeys.localModelBaseUrl]: "http://127.0.0.1:4321/v1",
            [settingKeys.localModelId]: expected
          },
          {
            [settingKeys.localModelProfile]: { defaultValue: "local-lm-studio" },
            [settingKeys.localModelId]: { globalValue: "global-model", workspaceValue, workspaceFolderValue }
          }
        )
      );

      expect(result.ok && result.settings.localModel).toMatchObject({
        selectionMode: "legacy",
        profileId: "local-lm-studio",
        baseUrl: "http://127.0.0.1:4321/v1",
        modelId: expected
      });
    }
  });

  it("fails closed for every present but unknown explicit profile without using legacy values", () => {
    for (const explicitValue of ["unknown-profile", "", "Bad Profile", 42, null]) {
      const result = readArchiAgentSettings(
        reader(
          {
            [settingKeys.knowledgePackPath]: absolutePack,
            [settingKeys.localModelBaseUrl]: "http://127.0.0.1:4321/v1",
            [settingKeys.localModelId]: "legacy-model"
          },
          { [settingKeys.localModelProfile]: { defaultValue: "local-lm-studio", globalValue: explicitValue } }
        )
      );

      expect(result.ok).toBe(false);
      expect(!result.ok && result.problems).toEqual([
        expect.objectContaining({ code: "unknown-provider-profile", setting: "archiAgent.localModel.profile" })
      ]);
    }
  });

  it("uses only global selectedModel for an explicit profile and Ollama ignores every legacy LM Studio value", () => {
    const result = readArchiAgentSettings(
      reader(
        {
          [settingKeys.knowledgePackPath]: absolutePack,
          [settingKeys.localModelBaseUrl]: "http://127.0.0.1:9999/v1",
          [settingKeys.localModelId]: "workspace-lm-studio-model",
          [settingKeys.localModelSelectedModel]: "folder-ollama-model"
        },
        {
          [settingKeys.localModelProfile]: { globalValue: "local-ollama", workspaceValue: "local-lm-studio" },
          [settingKeys.localModelSelectedModel]: {
            globalValue: "qwen3:8b",
            workspaceValue: "workspace-selected",
            workspaceFolderValue: "folder-ollama-model"
          },
          [settingKeys.localModelSelectedModelProfile]: {
            globalValue: "local-ollama",
            workspaceValue: "local-lm-studio",
            workspaceFolderValue: "local-lm-studio"
          }
        }
      )
    );

    expect(result.ok && result.settings.localModel).toEqual({
      selectionMode: "profile",
      profileId: "local-ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      modelId: "qwen3:8b",
      timeoutMs: settingsLimits.defaultTimeoutSeconds * 1000
    });
  });

  it("does not use a workspace selectedModel when the explicit profile has no global model", () => {
    const result = readArchiAgentSettings(
      reader(
        { [settingKeys.knowledgePackPath]: absolutePack, [settingKeys.localModelSelectedModel]: "workspace-model" },
        {
          [settingKeys.localModelProfile]: { globalValue: "local-ollama" },
          [settingKeys.localModelSelectedModel]: { workspaceValue: "workspace-model", workspaceFolderValue: "folder-model" },
          [settingKeys.localModelSelectedModelProfile]: {
            workspaceValue: "local-ollama",
            workspaceFolderValue: "local-ollama"
          }
        }
      )
    );

    expect(result.ok && result.settings.localModel.modelId).toBeUndefined();
  });

  it("ignores a selected model without a matching global profile binding", () => {
    for (const binding of [undefined, "local-lm-studio", "unknown-profile", "Bad Profile", 42]) {
      const result = readArchiAgentSettings(
        reader(
          { [settingKeys.knowledgePackPath]: absolutePack },
          {
            [settingKeys.localModelProfile]: { globalValue: "local-ollama" },
            [settingKeys.localModelSelectedModel]: { globalValue: "stale-lm-studio-model" },
            [settingKeys.localModelSelectedModelProfile]: { globalValue: binding }
          }
        )
      );

      expect(result.ok).toBe(true);
      expect(result.ok && result.settings.localModel).toMatchObject({ profileId: "local-ollama", modelId: undefined });
    }
  });

  it("keeps simulated Windows and Mac installations independent", () => {
    const windows = readArchiAgentSettings(
      reader(
        { [settingKeys.knowledgePackPath]: absolutePack },
        {
          [settingKeys.localModelProfile]: { globalValue: "local-lm-studio" },
          [settingKeys.localModelSelectedModel]: { globalValue: "windows-model" },
          [settingKeys.localModelSelectedModelProfile]: { globalValue: "local-lm-studio" }
        }
      )
    );
    const mac = readArchiAgentSettings(
      reader(
        { [settingKeys.knowledgePackPath]: absolutePack },
        {
          [settingKeys.localModelProfile]: { globalValue: "local-ollama" },
          [settingKeys.localModelSelectedModel]: { globalValue: "mac-model:latest" },
          [settingKeys.localModelSelectedModelProfile]: { globalValue: "local-ollama" }
        }
      )
    );

    expect(windows.ok && windows.settings.localModel).toMatchObject({ profileId: "local-lm-studio", modelId: "windows-model" });
    expect(mac.ok && mac.settings.localModel).toMatchObject({ profileId: "local-ollama", modelId: "mac-model:latest" });
    expect(windows.ok && windows.settings.localModel.modelId).not.toBe(mac.ok && mac.settings.localModel.modelId);
  });

  it("restores the explicit profile and model from global machine values after a simulated restart", () => {
    const persisted = {
      [settingKeys.localModelProfile]: { globalValue: "local-ollama" },
      [settingKeys.localModelSelectedModel]: { globalValue: "gpt-oss:20b" },
      [settingKeys.localModelSelectedModelProfile]: { globalValue: "local-ollama" }
    };
    const first = readArchiAgentSettings(reader({ [settingKeys.knowledgePackPath]: absolutePack }, persisted));
    const restarted = readArchiAgentSettings(reader({ [settingKeys.knowledgePackPath]: absolutePack }, persisted));

    expect(first).toEqual(restarted);
    expect(restarted.ok && restarted.settings.localModel).toMatchObject({ profileId: "local-ollama", modelId: "gpt-oss:20b" });
  });

  it("fails closed for an unknown explicit profile after a simulated restart", () => {
    const values = {
      [settingKeys.knowledgePackPath]: absolutePack,
      [settingKeys.localModelBaseUrl]: "http://127.0.0.1:4321/v1",
      [settingKeys.localModelId]: "legacy-model"
    };
    const persisted = {
      [settingKeys.localModelProfile]: { globalValue: "unknown-profile" },
      [settingKeys.localModelSelectedModel]: { globalValue: "stale-model" },
      [settingKeys.localModelSelectedModelProfile]: { globalValue: "unknown-profile" }
    };

    const first = readArchiAgentSettings(reader(values, persisted));
    const restarted = readArchiAgentSettings(reader(values, persisted));

    expect(first).toEqual(restarted);
    expect(restarted).toEqual({
      ok: false,
      problems: [expect.objectContaining({ code: "unknown-provider-profile", setting: "archiAgent.localModel.profile" })]
    });
  });

  it("uses only the legacy LM Studio model after the global profile is manually removed and ignores the leftover profile pair after restart", () => {
    const beforeRemoval = readArchiAgentSettings(
      reader(
        { [settingKeys.knowledgePackPath]: absolutePack },
        {
          [settingKeys.localModelProfile]: { globalValue: "local-ollama" },
          [settingKeys.localModelSelectedModel]: { globalValue: "leftover-ollama-model" },
          [settingKeys.localModelSelectedModelProfile]: { globalValue: "local-ollama" }
        }
      )
    );
    const persistedAfterRemoval = {
      [settingKeys.localModelProfile]: { defaultValue: "local-lm-studio" },
      [settingKeys.localModelSelectedModel]: { globalValue: "leftover-ollama-model" },
      [settingKeys.localModelSelectedModelProfile]: { globalValue: "local-ollama" }
    };
    const withLegacyModel = readArchiAgentSettings(
      reader(
        {
          [settingKeys.knowledgePackPath]: absolutePack,
          [settingKeys.localModelBaseUrl]: "http://127.0.0.1:4321/v1",
          [settingKeys.localModelId]: "effective-legacy-model"
        },
        persistedAfterRemoval
      )
    );
    const withoutLegacyModel = readArchiAgentSettings(reader({ [settingKeys.knowledgePackPath]: absolutePack }, persistedAfterRemoval));

    expect(beforeRemoval.ok && beforeRemoval.settings.localModel).toMatchObject({
      selectionMode: "profile",
      profileId: "local-ollama",
      modelId: "leftover-ollama-model"
    });
    expect(withLegacyModel.ok && withLegacyModel.settings.localModel).toMatchObject({
      selectionMode: "legacy",
      profileId: "local-lm-studio",
      baseUrl: "http://127.0.0.1:4321/v1",
      modelId: "effective-legacy-model"
    });
    expect(withoutLegacyModel.ok && withoutLegacyModel.settings.localModel).toMatchObject({
      selectionMode: "legacy",
      profileId: "local-lm-studio",
      modelId: undefined
    });
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
