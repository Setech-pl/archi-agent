import { afterEach, describe, expect, it, vi } from "vitest";
import { createArchiAgentRuntime, type ArchiAgentRuntime } from "../../src/runtime/index.js";
import { OpenAiCompatibleServerDouble } from "../doubles/openai-compatible-server-double.js";
import { checkProviderConfiguration } from "../../vscode-extension/src/commands/check-provider-configuration.js";
import { secretIdForProfile } from "../../vscode-extension/src/api-key-storage.js";
import { settingKeys, settingsSection } from "../../vscode-extension/src/contributions.js";
import { createExtensionContext, resetDouble, state, window } from "../doubles/vscode-module-double.js";

const runtime = createArchiAgentRuntime();
const output = () => window.createOutputChannel("Archi Agent");
const secrets = () => createExtensionContext().secrets as never;
function stubList(list: ArchiAgentRuntime["listProviderModels"]): ArchiAgentRuntime {
  return { listProviderProfiles: () => runtime.listProviderProfiles(), listProviderModels: list,
    listLocalModels: (endpoint, options) => runtime.listLocalModels(endpoint, options),
    generateSequenceDiagram: (request) => runtime.generateSequenceDiagram(request) };
}
function set(key: string, value: unknown): void { state.configuration.set(`${settingsSection}.${key}`, value); }
function profile(id: string, model?: string): void {
  state.configurationInspect.set(`${settingsSection}.${settingKeys.localModelProfile}`, { globalValue: id });
  if (model !== undefined) {
    state.configurationInspect.set(`${settingsSection}.${settingKeys.localModelSelectedModel}`, { globalValue: model });
    state.configurationInspect.set(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, { globalValue: id });
  }
}
afterEach(resetDouble);

describe("Check Provider Configuration command", () => {
  it("blocks invalid local settings and missing cloud credentials with zero listing calls", async () => {
    let calls = 0;
    const stub = stubList(async () => { calls++; return { ok: true, models: [] }; });
    set(settingKeys.localModelBaseUrl, "https://example.com/v1");
    await checkProviderConfiguration(stub, output(), secrets());
    expect(calls).toBe(0);
    resetDouble();
    profile("cloud-openai");
    await checkProviderConfiguration(stub, output(), secrets());
    expect(calls).toBe(0);
    expect(state.outputLines.join("\n")).toContain("not-attempted");
  });

  it("uses one list request and does not change settings or claim a missing model is unauthorized", async () => {
    profile("cloud-openrouter", "chosen-model");
    state.secrets.set(secretIdForProfile("cloud-openrouter")!, "synthetic-key");
    let calls = 0;
    const stub = stubList(async () => { calls++; return { ok: true, models: ["other-model"] }; });
    await checkProviderConfiguration(stub, output(), secrets());
    expect(calls).toBe(1);
    expect(state.configurationUpdates).toEqual([]);
    expect(state.outputLines.join("\n")).toContain("selected model on returned list: indeterminate");
    expect(state.outputLines.join("\n")).not.toContain("synthetic-key");
    expect(state.outputLines.join("\n")).not.toContain("chosen-model");
    expect(state.outputLines.join("\n")).not.toContain("other-model");
  });

  it("keeps cancellation cancelled with one listing call and no failure notification", async () => {
    profile("cloud-anthropic");
    state.secrets.set(secretIdForProfile("cloud-anthropic")!, "synthetic-key");
    let calls = 0;
    const stub = stubList(async () => { calls++; return { ok: false, code: "cancelled" }; });
    await checkProviderConfiguration(stub, output(), secrets());
    expect(calls).toBe(1);
    expect(state.messages).toEqual([]);
    expect(state.outputLines.join("\n")).toContain("cancelled");
  });

  it("sends one actual GET per run, including timeout and in-flight cancellation", async () => {
    const server = await OpenAiCompatibleServerDouble.start({ models: ["synthetic-model"] });
    try {
      profile("local-lm-studio");
      set(settingKeys.localModelBaseUrl, server.baseUrl);
      await checkProviderConfiguration(runtime, output(), secrets());
      expect(server.requests.map(({ method, path }) => [method, path])).toEqual([["GET", "/v1/models"]]);
      expect(state.outputLines.join("\n")).toContain("credential: not-applicable");

      resetDouble();
      profile("local-lm-studio");
      set(settingKeys.localModelBaseUrl, server.baseUrl);
      server.scenario = "timeout";
      set(settingKeys.localModelTimeoutSeconds, 1);
      await checkProviderConfiguration(runtime, output(), secrets());
      expect(server.requests.map(({ method, path }) => [method, path])).toEqual([
        ["GET", "/v1/models"], ["GET", "/v1/models"]]);
      expect(state.outputLines.join("\n")).toContain("code: timeout");

      resetDouble();
      profile("local-lm-studio");
      set(settingKeys.localModelBaseUrl, server.baseUrl);
      const pending = checkProviderConfiguration(runtime, output(), secrets());
      await vi.waitFor(() => expect(server.requests).toHaveLength(3));
      state.cancelProgress?.();
      await pending;
      expect(state.outputLines.join("\n")).toContain("Execution: cancelled");
      expect(state.messages).toEqual([]);
      expect(server.requests.map(({ method, path }) => [method, path])).toEqual([
        ["GET", "/v1/models"], ["GET", "/v1/models"], ["GET", "/v1/models"]]);

      resetDouble();
      profile("local-lm-studio");
      set(settingKeys.localModelBaseUrl, server.baseUrl);
      server.scenario = "completion";
      await checkProviderConfiguration(runtime, output(), secrets());
      expect(server.requests.map(({ method, path }) => [method, path])).toEqual([
        ["GET", "/v1/models"], ["GET", "/v1/models"], ["GET", "/v1/models"], ["GET", "/v1/models"]]);
      expect(state.outputLines.join("\n")).toContain("code: ok");
    } finally {
      await server.close();
    }
  });
});
