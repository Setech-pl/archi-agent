import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AnthropicRemoteChatClient } from "../../../src/node/llm/anthropic-remote-chat-client.js";
import { parseLoopbackEndpoint } from "../../../src/node/llm/loopback-endpoint.js";
import { OpenAiCompatibleLocalChatClient } from "../../../src/node/llm/openai-compatible-local-chat-client.js";
import { OpenAiCompatibleRemoteChatClient } from "../../../src/node/llm/openai-compatible-remote-chat-client.js";
import { RemoteJsonTransportDouble } from "../../doubles/remote-json-transport-double.js";

describe("provider metadata golden", () => {
  it("keeps local metadata unchanged and reports each actual cloud provider distinctly", () => {
    const endpoint = parseLoopbackEndpoint("http://127.0.0.1:1234/v1");
    if (!endpoint.ok) throw new Error("test endpoint invalid");
    const local = new OpenAiCompatibleLocalChatClient({ endpoint: endpoint.endpoint, modelId: "local-test" });
    const transport = new RemoteJsonTransportDouble();
    const clients = [
      { profileId: "cloud-anthropic", client: new AnthropicRemoteChatClient({ modelId: "claude-test", apiKey: "secret", transport }) },
      { profileId: "cloud-openai", client: new OpenAiCompatibleRemoteChatClient({ provider: "openai", modelId: "gpt-test", apiKey: "secret", transport }) },
      {
        profileId: "cloud-openrouter",
        client: new OpenAiCompatibleRemoteChatClient({ provider: "openrouter", modelId: "vendor/model-test", apiKey: "secret", transport })
      },
      { profileId: "local-lm-studio", client: local },
      { profileId: "local-ollama", client: local }
    ];
    const actual = clients.map(({ profileId, client }) => ({
      profileId,
      generatorType: client.clientType,
      modelGeneration: client.generationMetadata
    }));
    const expected = JSON.parse(readFileSync(new URL("../../fixtures/llm/provider-metadata.golden.json", import.meta.url), "utf8"));
    expect(actual).toEqual(expected);
  });
});
