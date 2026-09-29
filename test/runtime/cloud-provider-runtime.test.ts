import { describe, expect, it } from "vitest";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import { RemoteJsonTransportDouble } from "../doubles/remote-json-transport-double.js";

describe("runtime cloud provider selection", () => {
  it("lists five profiles with distinct credential requirements and no I/O", () => {
    const transport = new RemoteJsonTransportDouble();
    const profiles = createArchiAgentRuntime({ remoteTransport: transport }).listProviderProfiles();
    expect(profiles.map((profile) => [profile.profileId, profile.credentialRequirement])).toEqual([
      ["cloud-anthropic", "api-key"],
      ["cloud-openai", "api-key"],
      ["cloud-openrouter", "api-key"],
      ["local-lm-studio", "none"],
      ["local-ollama", "none"]
    ]);
    expect(transport.requests).toEqual([]);
  });

  it("blocks remote model listing before I/O when the credential is absent", async () => {
    const transport = new RemoteJsonTransportDouble();
    const runtime = createArchiAgentRuntime({ remoteTransport: transport });
    await expect(runtime.listProviderModels({ profileId: "cloud-openai" })).resolves.toEqual({ ok: false, code: "credential-required" });
    expect(transport.requests).toEqual([]);
  });

  it("routes each explicit listing to exactly one fixed endpoint", async () => {
    const transport = new RemoteJsonTransportDouble(
      JSON.stringify({ data: [{ id: "claude-a", capabilities: { structured_outputs: { supported: true } } }], has_more: false }),
      JSON.stringify({ data: [{ id: "gpt-a" }] }),
      JSON.stringify({ data: [{ id: "vendor/model-a", supported_parameters: ["response_format"] }], total_count: 1 })
    );
    const runtime = createArchiAgentRuntime({ remoteTransport: transport });
    const credential = { type: "api-key" as const, value: "synthetic-secret" };
    await expect(runtime.listProviderModels({ profileId: "cloud-anthropic", credential })).resolves.toEqual({ ok: true, models: ["claude-a"] });
    await expect(runtime.listProviderModels({ profileId: "cloud-openai", credential })).resolves.toEqual({ ok: true, models: ["gpt-a"] });
    await expect(runtime.listProviderModels({ profileId: "cloud-openrouter", credential })).resolves.toEqual({ ok: true, models: ["vendor/model-a"] });
    expect(transport.requests.map((request) => request.endpoint)).toEqual(["anthropic-models", "openai-models", "openrouter-models"]);
  });
});
