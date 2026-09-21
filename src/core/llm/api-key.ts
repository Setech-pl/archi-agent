/** Provider-neutral validation shared by secure storage, runtime and HTTPS adapters. */
export const apiKeyLimits = Object.freeze({ minChars: 1, maxChars: 1024 });

export type ApiKeyValidationCode = "credential-required" | "invalid-credential";

export type ApiKeyValidationResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly code: ApiKeyValidationCode };

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127 || (code >= 128 && code <= 159)) return true;
  }
  return false;
}

/** Validates without normalizing or including the candidate in an error. */
export function validateApiKey(value: unknown): ApiKeyValidationResult {
  if (typeof value !== "string" || value.length === 0 || value.trim() === "") {
    return Object.freeze({ ok: false, code: "credential-required" });
  }

  let characters = 0;
  for (const _character of value) characters += 1;

  if (characters > apiKeyLimits.maxChars || value.trim() !== value || hasControlCharacter(value)) {
    return Object.freeze({ ok: false, code: "invalid-credential" });
  }

  return Object.freeze({ ok: true, value });
}
