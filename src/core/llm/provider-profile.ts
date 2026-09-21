/** Provider-neutral capabilities exposed to hosts before they perform any I/O. */
export interface ProviderCapabilities {
  readonly modelListing: boolean;
  readonly structuredChat: boolean;
}

/**
 * A provider profile is identity and capability metadata only. Endpoint, transport, credentials
 * and host-specific configuration belong to adapters outside core.
 */
export interface ProviderProfile {
  readonly profileId: string;
  readonly providerKind: string;
  readonly displayName: string;
  /** Whether a host must supply a credential before any provider I/O. */
  readonly credentialRequirement: "none" | "api-key";
  readonly capabilities: ProviderCapabilities;
}
