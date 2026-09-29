import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../../../src/core/llm/provider-registry.js";
import { localProviderProfiles } from "../../../src/node/llm/local-provider-profiles.js";
import {
  anthropicRemoteProfileId,
  openAiRemoteProfileId,
  openRouterRemoteProfileId,
  remoteProviderProfiles
} from "../../../src/node/llm/remote-provider-profiles.js";

describe("remote provider profiles", () => {
  it("uses stable identities, distinct generator kinds and API-key requirements", () => {
    expect(remoteProviderProfiles.map((profile) => [profile.profileId, profile.providerKind, profile.credentialRequirement])).toEqual([
      [anthropicRemoteProfileId, "anthropic-remote", "api-key"],
      [openAiRemoteProfileId, "openai-remote", "api-key"],
      [openRouterRemoteProfileId, "openrouter-remote", "api-key"]
    ]);
    expect(new ProviderRegistry([...localProviderProfiles, ...remoteProviderProfiles]).list()).toHaveLength(5);
    expect(localProviderProfiles.every((profile) => profile.credentialRequirement === "none")).toBe(true);
  });
});
