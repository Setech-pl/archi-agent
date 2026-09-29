import type { ProviderCapabilities, ProviderProfile } from "./provider-profile.js";

export const providerRegistryErrorCodes = ["invalid-provider-profile", "duplicate-profile-id", "unknown-provider-profile"] as const;
export type ProviderRegistryErrorCode = (typeof providerRegistryErrorCodes)[number];

export class ProviderRegistryError extends Error {
  public readonly code: ProviderRegistryErrorCode;

  public constructor(code: ProviderRegistryErrorCode) {
    super(code);
    this.name = "ProviderRegistryError";
    this.code = code;
  }
}

const identifierPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const maxDisplayNameChars = 80;

function validDisplayName(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > maxDisplayNameChars) {
    return false;
  }

  return [...value].every((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 32 && !(code >= 127 && code <= 159);
  });
}

function immutableCapabilities(value: unknown): ProviderCapabilities {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as Partial<ProviderCapabilities>).modelListing !== "boolean" ||
    typeof (value as Partial<ProviderCapabilities>).structuredChat !== "boolean"
  ) {
    throw new ProviderRegistryError("invalid-provider-profile");
  }

  return Object.freeze({
    modelListing: (value as ProviderCapabilities).modelListing,
    structuredChat: (value as ProviderCapabilities).structuredChat
  });
}

function immutableProfile(value: unknown): ProviderProfile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRegistryError("invalid-provider-profile");
  }

  const candidate = value as Partial<ProviderProfile>;

  if (
    typeof candidate.profileId !== "string" ||
    typeof candidate.providerKind !== "string" ||
    !identifierPattern.test(candidate.profileId) ||
    !identifierPattern.test(candidate.providerKind) ||
    (candidate.credentialRequirement !== "none" && candidate.credentialRequirement !== "api-key") ||
    !validDisplayName(candidate.displayName)
  ) {
    throw new ProviderRegistryError("invalid-provider-profile");
  }

  return Object.freeze({
    profileId: candidate.profileId,
    providerKind: candidate.providerKind,
    displayName: candidate.displayName,
    credentialRequirement: candidate.credentialRequirement,
    capabilities: immutableCapabilities(candidate.capabilities)
  });
}

/** Deterministic, immutable registry. Construction and lookup perform no I/O. */
export class ProviderRegistry {
  readonly #profiles: readonly ProviderProfile[];
  readonly #byId: ReadonlyMap<string, ProviderProfile>;

  public constructor(profiles: readonly ProviderProfile[]) {
    const byId = new Map<string, ProviderProfile>();

    for (const candidate of profiles) {
      const profile = immutableProfile(candidate);

      if (byId.has(profile.profileId)) {
        throw new ProviderRegistryError("duplicate-profile-id");
      }

      byId.set(profile.profileId, profile);
    }

    this.#profiles = Object.freeze(
      [...byId.values()].sort((left, right) => (left.profileId < right.profileId ? -1 : left.profileId > right.profileId ? 1 : 0))
    );
    this.#byId = byId;
  }

  public list(): readonly ProviderProfile[] {
    return this.#profiles;
  }

  public resolve(profileId: string): ProviderProfile {
    const profile = this.#byId.get(profileId);

    if (profile === undefined) {
      throw new ProviderRegistryError("unknown-provider-profile");
    }

    return profile;
  }
}
