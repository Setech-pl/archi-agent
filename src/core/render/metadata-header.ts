import type { ContextDigest } from "../grounding/grounded-context.js";
import type { FlowLanguage } from "../knowledge-pack/front-matter.js";
import { isSha256Hex } from "../util/stable-digest.js";
import { commentText } from "./plantuml-escape.js";

/**
 * Metadata written as single-line PlantUML comments at the top of a diagram.
 *
 * Only the diagram name, flow name, author, language, grounding digest and generator type appear.
 * There is no generation time, path, operating-system user, environment value, prompt or raw
 * generator response. The author is metadata only; it is not part of the grounding digest.
 */

export interface DiagramHeaderMetadata {
  readonly diagramName: string;
  readonly flowName: string;
  readonly author: string;
  readonly language: FlowLanguage;
  readonly digest: ContextDigest;
  readonly generatorType: string;
}

const generatorTypePattern = /^[a-z][a-z0-9-]{0,31}$/;

export function isSafeGeneratorType(value: unknown): value is string {
  return typeof value === "string" && generatorTypePattern.test(value);
}

export const headerTitle = "ArchGround sequence diagram";

/** Comment lines; throws UnsafePlantUmlTextError for a value that failed the text policy. */
export function metadataHeaderLines(metadata: DiagramHeaderMetadata): readonly string[] {
  if (metadata.digest.algorithm !== "sha256" || !isSha256Hex(metadata.digest.value)) {
    throw new Error("The grounding digest must be a SHA-256 value.");
  }

  if (!isSafeGeneratorType(metadata.generatorType)) {
    throw new Error("The generator type must be a short lower-case identifier.");
  }

  return Object.freeze([
    `' ${headerTitle}`,
    `' diagram: ${commentText(metadata.diagramName)}`,
    `' flow: ${commentText(metadata.flowName)}`,
    `' author: ${commentText(metadata.author)}`,
    `' language: ${metadata.language}`,
    `' grounding digest: sha256:${metadata.digest.value}`,
    `' generator: ${metadata.generatorType}`
  ]);
}
