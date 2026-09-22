/**
 * Core model types shared by grounding, validation and rendering.
 *
 * Participants are identified by stable knowledge-pack element identifiers.
 * Canonical names and diagram aliases are resolved by local code only; a
 * language model never supplies them.
 */

export const allowedInterfaceTypes = [
  "REST API",
  "SOAP",
  "EVENT",
  "FILE",
  "DB",
  "INTERNAL"
] as const;

export type InterfaceType = (typeof allowedInterfaceTypes)[number];

export type { DiagramType } from "./diagram-type.js";

export const diagramLanguages = ["en", "pl"] as const;

export type DiagramLanguage = (typeof diagramLanguages)[number];

export interface DiagramMetadata {
  diagramId: string;
  diagramName: string;
  author?: string;
  language: DiagramLanguage;
  created: string;
}

export const participantKinds = ["actor", "system", "database", "queue"] as const;

export type ParticipantKind = (typeof participantKinds)[number];

/** The declaration keyword shared by the compatibility renderer and reviewed prompt. */
export const participantDeclarationKeywords: Readonly<Record<ParticipantKind, "actor" | "participant" | "database" | "queue">> = Object.freeze({
  actor: "actor", system: "participant", database: "database", queue: "queue"
});

/** A system or actor declared in the knowledge pack. */
export interface ArchitectureElement {
  elementId: string;
  canonicalName: string;
  kind: ParticipantKind;
  description?: string;
}

export const interactionStyles = ["sync", "async"] as const;

export type InteractionStyle = (typeof interactionStyles)[number];

/** A relationship declared in the knowledge pack between two elements. */
export interface ArchitectureRelationship {
  relationshipId: string;
  fromElementId: string;
  toElementId: string;
  style: InteractionStyle;
  interfaceType?: InterfaceType;
  interfaceName?: string;
  description?: string;
}

/** Prefix that marks a participant which is not part of the knowledge pack. */
export const newParticipantPrefix = "[NEW]" as const;

export type NewParticipantDisplayName = `[NEW] ${string}`;

/** Participant resolved to exactly one knowledge-pack element. */
export interface KnowledgePackParticipant {
  readonly origin: "knowledge-pack";
  readonly elementId: string;
  readonly canonicalName: string;
  readonly kind: ParticipantKind;
}

/**
 * Participant absent from the knowledge pack. It exists only after the user
 * explicitly confirmed it as new; an ambiguous reference never becomes one.
 */
export interface NewParticipant {
  readonly origin: "new";
  readonly newName: string;
  readonly displayName: NewParticipantDisplayName;
  readonly kind: ParticipantKind;
  readonly confirmedByUser: true;
}

export type SequenceParticipant = KnowledgePackParticipant | NewParticipant;

/** Message endpoints reference participants by identifier, never by display name. */
export type ParticipantRef =
  | { readonly elementId: string; readonly newName?: never }
  | { readonly newName: string; readonly elementId?: never };

export interface SequenceMessage {
  from: ParticipantRef;
  to: ParticipantRef;
  label: string;
  interfaceType: InterfaceType;
  interfaceName?: string;
  businessDescription?: string;
  async?: boolean;
  isResponse?: boolean;
  order: number;
}

export interface SequenceDiagramModel {
  metadata: DiagramMetadata;
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
  warnings: ValidationIssue[];
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
