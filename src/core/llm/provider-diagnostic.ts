/** Safe, provider-neutral observations. No response body, credential, URL or model identifier is retained. */
export type DiagnosticFinding = "positive" | "negative" | "unchecked" | "indeterminate" | "not-applicable";
export type DiagnosticExecution = "not-attempted" | "attempted" | "cancelled";
export type DiagnosticOperation = "listing" | "generation" | "review";

export interface ProviderDiagnostic {
  readonly profileId: "local-lm-studio" | "local-ollama" | "cloud-anthropic" | "cloud-openai" | "cloud-openrouter" | "unknown";
  readonly operation: DiagnosticOperation;
  readonly execution: DiagnosticExecution;
  readonly configuration: DiagnosticFinding;
  readonly credential: DiagnosticFinding;
  readonly connection: DiagnosticFinding;
  readonly listing: DiagnosticFinding;
  readonly selectedModel: DiagnosticFinding;
  readonly generation: DiagnosticFinding;
  readonly review: DiagnosticFinding;
  readonly billing: DiagnosticFinding;
  readonly quota: DiagnosticFinding;
  /** Closed public code; never an untrusted error message. */
  readonly code: string;
  readonly nextAction: "none" | "settings" | "api-key" | "server" | "retry-later" | "provider-account" | "select-model" | "inspect-output" | "inspect-candidate";
}

const profiles = new Set(["local-lm-studio", "local-ollama", "cloud-anthropic", "cloud-openai", "cloud-openrouter"]);
const localValidation = new Set([
  "invalid-url", "unsupported-scheme", "credentials-not-allowed", "query-not-allowed", "fragment-not-allowed",
  "non-loopback-host", "invalid-port", "unexpected-path", "invalid-timeout", "invalid-credential",
  "credential-required", "unknown-provider-profile", "provider-capability-unavailable", "unsafe-model-id",
  "secret-storage-read-failed", "local-model-base-url-invalid", "local-model-id-invalid", "local-model-timeout-invalid",
  "unsupported-generator", "generator-unavailable", "diagram-type-unsupported", "request-too-large",
  "invalid-max-tokens", "invalid-message-sequence", "unsupported-json-schema"
]);
const knownCodes = new Set([
  ...localValidation, "cancelled", "generation-cancelled", "connection-failed", "timeout", "http-status",
  "redirect-rejected", "authentication-failed", "rate-limited", "model-unavailable", "request-rejected",
  "provider-unavailable", "unexpected-content-type", "response-too-large", "response-truncated",
  "invalid-encoding", "invalid-model-list", "model-list-truncated", "too-many-models", "duplicate-model-id",
  "unsafe-listed-model-id", "no-models", "generator-failed", "reviewer-failed", "truncated-output",
  "response-refused", "unexpected-content-block", "unexpected-finish-reason", "invalid-envelope",
  "review-rejected", "invalid-verdict", "request-failed", "envelope-too-large", "missing-choices",
  "multiple-choices", "missing-content", "content-too-large", "empty-content", "control-character",
  "not-a-json-object", "malformed-json", "empty-object"
]);

/** Maps an untrusted error property to a closed, safe public code. */
export function providerDiagnosticCode(code: unknown): string {
  return typeof code === "string" && knownCodes.has(code) ? code : "provider-failed";
}

export function classifyProviderDiagnostic(input: {
  readonly profileId: string;
  readonly operation: DiagnosticOperation;
  readonly credentialRequired: boolean;
  readonly outcome: "success" | "failure" | "cancelled";
  readonly code?: string;
  /** Whether a selected model appeared in the returned, possibly filtered model list. */
  readonly selectedModelListed?: boolean;
  readonly modelSelected?: boolean;
}): ProviderDiagnostic {
  const profileId = profiles.has(input.profileId) ? input.profileId as ProviderDiagnostic["profileId"] : "unknown";
  const code = input.outcome === "success" ? "ok" : input.outcome === "cancelled" ? "cancelled" : providerDiagnosticCode(input.code);
  const localBlock = input.outcome === "failure" && localValidation.has(code);
  const execution: DiagnosticExecution = input.outcome === "cancelled" ? "cancelled" : localBlock ? "not-attempted" : "attempted";
  let nextAction: ProviderDiagnostic["nextAction"] = "none";
  if (input.outcome === "failure") {
    if (code === "credential-required" || code === "invalid-credential" || code === "secret-storage-read-failed") nextAction = "api-key";
    else if (localBlock) nextAction = "settings";
    else if (code === "connection-failed" && profileId.startsWith("local-")) nextAction = "server";
    else if (code === "rate-limited" || code === "timeout" || code === "provider-unavailable") nextAction = "retry-later";
    else if (code === "authentication-failed" || code === "request-rejected" || code === "model-unavailable") nextAction = "provider-account";
    else if (code === "review-rejected") nextAction = "inspect-candidate";
    else nextAction = "inspect-output";
  } else if (input.outcome === "success" && input.operation === "listing" && input.modelSelected && !input.selectedModelListed) {
    nextAction = "select-model";
  }

  return Object.freeze({
    profileId, operation: input.operation, execution,
    configuration: localBlock ? "negative" : "positive",
    credential: !input.credentialRequired ? "not-applicable" : code === "credential-required" || code === "invalid-credential" ? "negative" :
      code === "authentication-failed" ? "indeterminate" : "unchecked",
    connection: input.outcome === "success" ? "positive" : code === "connection-failed" ? "negative" :
      execution === "attempted" ? "indeterminate" : "unchecked",
    listing: input.operation !== "listing" ? "not-applicable" : input.outcome === "success" ? "positive" :
      execution === "attempted" ? "indeterminate" : "unchecked",
    selectedModel: input.operation !== "listing" || !input.modelSelected ? "unchecked" :
      input.outcome === "success" && input.selectedModelListed ? "positive" :
      input.outcome === "success" ? "indeterminate" : "unchecked",
    generation: input.operation === "listing" ? "unchecked" : input.operation === "review" ? "positive" :
      input.outcome === "success" ? "positive" : execution === "attempted" ? "indeterminate" : "unchecked",
    review: input.operation !== "review" ? "unchecked" : input.outcome === "success" ? "positive" :
      code === "review-rejected" ? "negative" : execution === "attempted" ? "indeterminate" : "unchecked",
    billing: "unchecked", quota: "unchecked", code, nextAction
  });
}
