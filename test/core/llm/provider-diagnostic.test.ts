import { describe, expect, it } from "vitest";
import { classifyProviderDiagnostic } from "../../../src/core/llm/provider-diagnostic.js";
import { describeProviderDiagnostic } from "../../../vscode-extension/src/user-messages.js";

const profiles = ["local-lm-studio", "local-ollama", "cloud-anthropic", "cloud-openai", "cloud-openrouter"] as const;

describe("safe provider diagnostics", () => {
  it.each(profiles)("does not equate a successful %s model list with generation, billing or quota", (profileId) => {
    const result = classifyProviderDiagnostic({ profileId, operation: "listing", credentialRequired: profileId.startsWith("cloud-"),
      outcome: "success", modelSelected: true, selectedModelListed: false });
    expect(result).toMatchObject({ execution: "attempted", listing: "positive", selectedModel: "indeterminate",
      generation: "unchecked", billing: "unchecked", quota: "unchecked" });
    expect(result.credential).toBe(profileId.startsWith("cloud-") ? "unchecked" : "not-applicable");
    expect(describeProviderDiagnostic(result).text).toContain("Select Model");
  });

  it.each(["authentication-failed", "http-status", "request-rejected", "model-list-truncated", "invalid-model-list", "rate-limited"])(
    "does not claim a unique cause for ambiguous %s", (code) => {
      const result = classifyProviderDiagnostic({ profileId: "cloud-openrouter", operation: "listing", credentialRequired: true,
        outcome: "failure", code, modelSelected: true });
      expect(result.execution).toBe("attempted");
      expect(result.listing).toBe("indeterminate");
      expect(result.selectedModel).toBe("unchecked");
      expect(result.billing).toBe("unchecked");
      expect(result.quota).toBe("unchecked");
      expect(result.credential).not.toBe("negative");
    }
  );

  it("separates local blocking from cancellation and a remote failure", () => {
    expect(classifyProviderDiagnostic({ profileId: "local-lm-studio", operation: "listing", credentialRequired: false,
      outcome: "failure", code: "non-loopback-host" })).toMatchObject({ execution: "not-attempted", configuration: "negative", listing: "unchecked" });
    expect(classifyProviderDiagnostic({ profileId: "cloud-openai", operation: "listing", credentialRequired: true,
      outcome: "cancelled" })).toMatchObject({ execution: "cancelled", listing: "unchecked", code: "cancelled" });
    expect(classifyProviderDiagnostic({ profileId: "local-ollama", operation: "generation", credentialRequired: false,
      outcome: "failure", code: "connection-failed" })).toMatchObject({ execution: "attempted", connection: "negative", generation: "indeterminate" });
  });

  it("allows a successful generation and review to be stated only for their own operations", () => {
    expect(classifyProviderDiagnostic({ profileId: "cloud-anthropic", operation: "generation", credentialRequired: true,
      outcome: "success" })).toMatchObject({ generation: "positive", review: "unchecked", billing: "unchecked" });
    expect(classifyProviderDiagnostic({ profileId: "cloud-anthropic", operation: "review", credentialRequired: true,
      outcome: "failure", code: "reviewer-failed" })).toMatchObject({ generation: "positive", review: "indeterminate" });
    expect(classifyProviderDiagnostic({ profileId: "cloud-anthropic", operation: "review", credentialRequired: true,
      outcome: "failure", code: "review-rejected" })).toMatchObject({ generation: "positive", review: "negative" });
  });

  it("never echoes an unknown code, profile, model or credential", () => {
    const secret = "SENTINEL_SECRET_/private/tmp/key";
    const result = classifyProviderDiagnostic({ profileId: secret, operation: "listing", credentialRequired: true,
      outcome: "failure", code: secret, modelSelected: true });
    expect(JSON.stringify(result) + JSON.stringify(describeProviderDiagnostic(result))).not.toContain(secret);
    expect(result).toMatchObject({ profileId: "unknown", code: "provider-failed", selectedModel: "unchecked" });
  });
});
