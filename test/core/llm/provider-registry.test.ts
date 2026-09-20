import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "../../../src/core/llm/provider-profile.js";
import { ProviderRegistry, ProviderRegistryError } from "../../../src/core/llm/provider-registry.js";

function profile(profileId: string, displayName = profileId): ProviderProfile {
  return {
    profileId,
    providerKind: "synthetic-provider",
    displayName,
    capabilities: { modelListing: true, structuredChat: false }
  };
}

describe("ProviderRegistry", () => {
  it("copies, freezes and lists valid profiles deterministically by profileId", () => {
    const source = [profile("z-profile", "Z"), profile("a-profile", "A")];
    const registry = new ProviderRegistry(source);
    source.reverse();

    expect(registry.list().map((entry) => entry.profileId)).toEqual(["a-profile", "z-profile"]);
    expect(registry.resolve("z-profile").displayName).toBe("Z");
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.list()[0])).toBe(true);
    expect(Object.isFrozen(registry.list()[0]?.capabilities)).toBe(true);
  });

  it("rejects duplicate identifiers with the stable duplicate-profile-id code", () => {
    expect(() => new ProviderRegistry([profile("same"), profile("same")])).toThrowError(
      expect.objectContaining<Partial<ProviderRegistryError>>({ code: "duplicate-profile-id" })
    );
  });

  it("returns a controlled unknown-provider-profile error for an exact lookup miss", () => {
    const registry = new ProviderRegistry([profile("known")]);
    expect(() => registry.resolve("KNOWN")).toThrowError(expect.objectContaining<Partial<ProviderRegistryError>>({ code: "unknown-provider-profile" }));
  });

  it("rejects invalid identity, display and capability data", () => {
    expect(() => new ProviderRegistry([profile("Bad Id")])).toThrowError(
      expect.objectContaining<Partial<ProviderRegistryError>>({ code: "invalid-provider-profile" })
    );
    expect(() => new ProviderRegistry([{ ...profile("valid"), displayName: "" }])).toThrowError(ProviderRegistryError);
    expect(() => new ProviderRegistry([{ ...profile("valid"), capabilities: { modelListing: true } as never }])).toThrowError(ProviderRegistryError);
  });

  it("keeps core free of concrete providers, endpoints, HTTP, Node and VS Code", () => {
    const source = ["provider-profile.ts", "provider-registry.ts"]
      .map((name) => readFileSync(new URL(`../../../src/core/llm/${name}`, import.meta.url), "utf8"))
      .join("\n");

    for (const forbidden of ["LM Studio", "Ollama", "127.0.0.1", "http", "loopback", "node:", "vscode", "SecretStorage"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
