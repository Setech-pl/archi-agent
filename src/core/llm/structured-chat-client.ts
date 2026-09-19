import type { CancellationSignal } from "../knowledge-pack/knowledge-pack-source.js";

/** A provider-neutral chat message accepted by structured generation clients. */
export interface ChatMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export type JsonSchemaValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonSchemaValue[]
  | { readonly [key: string]: JsonSchemaValue };

export type JsonSchemaObject = { readonly [key: string]: JsonSchemaValue };

export const structuredChatLimits = Object.freeze({ minMaxTokens: 1, maxMaxTokens: 16_384 });

export function isValidStructuredChatMaxTokens(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= structuredChatLimits.minMaxTokens &&
    value <= structuredChatLimits.maxMaxTokens
  );
}

export interface StructuredChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly schemaName: string;
  readonly schema: JsonSchemaObject;
  /** Integer in the inclusive range 1..16384. */
  readonly maxTokens: number;
  readonly signal?: CancellationSignal;
}

export type StructuredChatResultSource = "content" | "reasoning-content-compat";

export interface StructuredChatResult {
  readonly value: Readonly<Record<string, unknown>>;
  readonly source: StructuredChatResultSource;
}

/**
 * Safe model identity and generation settings recorded in grounding reports. It intentionally
 * carries no provider, endpoint, prompt, response, header, timing or secret.
 */
export interface ModelGenerationMetadata {
  readonly modelId: string;
  readonly temperature: number;
  readonly seed: number;
  readonly attemptCount: number;
  readonly structuredOutput: boolean;
}

export interface StructuredChatClient {
  readonly clientType: string;
  readonly generationMetadata: ModelGenerationMetadata;
  complete(request: StructuredChatRequest): Promise<StructuredChatResult>;
}

export const modelIdLimits = Object.freeze({ maxChars: 128 });

const modelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]*$/;
const metadataKeys = "attemptCount,modelId,seed,structuredOutput,temperature";

/** A bounded printable model identifier, with no spaces or parent segments. */
export function isSafeModelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= modelIdLimits.maxChars &&
    modelIdPattern.test(value) &&
    !value.includes("..") &&
    !value.includes("//")
  );
}

export function isSafeModelGenerationMetadata(value: unknown): value is ModelGenerationMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const temperature = record["temperature"];
  const seed = record["seed"];
  const attemptCount = record["attemptCount"];

  return (
    Object.keys(record).sort().join(",") === metadataKeys &&
    isSafeModelId(record["modelId"]) &&
    typeof temperature === "number" &&
    Number.isFinite(temperature) &&
    temperature >= 0 &&
    temperature <= 2 &&
    typeof seed === "number" &&
    Number.isSafeInteger(seed) &&
    seed >= 0 &&
    typeof attemptCount === "number" &&
    Number.isSafeInteger(attemptCount) &&
    attemptCount >= 1 &&
    attemptCount <= 10 &&
    typeof record["structuredOutput"] === "boolean"
  );
}

const safeErrorCodePattern = /^[a-z0-9-]{1,64}$/;

/** Returns only a bounded stable code; it never exposes any other error property. */
export function safeErrorCode(error: unknown): string | undefined {
  try {
    if (error === null || (typeof error !== "object" && typeof error !== "function")) {
      return undefined;
    }

    const code = (error as { readonly code?: unknown }).code;
    return typeof code === "string" && safeErrorCodePattern.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}
