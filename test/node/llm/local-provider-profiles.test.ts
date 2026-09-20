import { describe, expect, it } from "vitest";
import { parseLoopbackEndpoint } from "../../../src/node/llm/loopback-endpoint.js";
import {
  defaultBaseUrlForLocalProfile,
  localLmStudioProfileId,
  localOllamaProfileId,
  localProviderProfiles,
  localProviderRegistry
} from "../../../src/node/llm/local-provider-profiles.js";

describe("local provider profiles", () => {
  it("declares immutable LM Studio and Ollama profiles in deterministic order", () => {
    expect(localProviderRegistry.list()).toEqual(localProviderProfiles);
    expect(localProviderProfiles).toEqual([
      {
        profileId: "local-lm-studio",
        providerKind: "openai-compatible-local",
        displayName: "LM Studio",
        capabilities: { modelListing: true, structuredChat: true }
      },
      {
        profileId: "local-ollama",
        providerKind: "openai-compatible-local",
        displayName: "Ollama",
        capabilities: { modelListing: true, structuredChat: true }
      }
    ]);
    expect(Object.isFrozen(localProviderProfiles)).toBe(true);
  });

  it("keeps adapter-owned default endpoints loopback-only and parseable by the shared policy", () => {
    expect(defaultBaseUrlForLocalProfile(localLmStudioProfileId)).toBe("http://127.0.0.1:1234/v1");
    expect(defaultBaseUrlForLocalProfile(localOllamaProfileId)).toBe("http://127.0.0.1:11434/v1");
    expect(parseLoopbackEndpoint(defaultBaseUrlForLocalProfile(localLmStudioProfileId)).ok).toBe(true);
    expect(parseLoopbackEndpoint(defaultBaseUrlForLocalProfile(localOllamaProfileId)).ok).toBe(true);
    expect(defaultBaseUrlForLocalProfile("absent")).toBeUndefined();
  });
});
