# Reviewed diagram pipeline — active target contract

Status: R2 accepted; D1.2 Sequence completed; S1 owner smoke PASS on 2026-09-23. The D1.1 code used
`{ plantUml }`; it was superseded after failed S1 owner smoke. Its exact
implementation is preserved on `checkpoint/d1-final-plantuml-reviewed`. See
[ADR 0002](adr/0002-deterministic-diagram-plan-renderers.md). ADR 0001 and the D1 ledger
checkpoint remain historical records.

## Boundary and flow

```text
flow + selected architecture source
  → one minimal, validated ArchitectureSnapshot + digest
  → local allowed-operation catalog
  → generator: strict, type-specific Wire Plan v3
  → local plan validation and resolution
  → deterministic, type-specific PlantUML renderer
  → independent semantic reviewer
  → local decision and grounding report v2
  → result
```

Grounding resolves canonical names, aliases, ambiguity, explicit resolutions and `[NEW]`
elements locally. The first snapshot provider wraps the Knowledge Pack. The planned M1 MCP
adapter maps untrusted tool results into the same provider-neutral snapshot before either model
call; the model never chooses MCP tools. Full repositories, raw exports and unrelated documents
do not enter either request. The same immutable snapshot and digest are supplied to both calls.

## Generator and plan

The generator returns a bounded Wire Plan v3 with exactly `version`, `groundedSteps` and
`userStatedSteps`, without PlantUML, participants or a line ledger. Both lists are required.
Each grounded step has exactly `order`, `operationId` and a bounded `label`. Local code builds
the ordered catalog from one snapshot; each opaque operation contains direction, mode, interface,
evidence and, for a response, a request link. The model cannot restate those facts. Each
user-stated step has exactly `order`, known `fromId` and `toId`, request or asynchronous
`interactionKind`, `interfaceType`, nullable `interfaceName`, one existing `flowEvidenceId`
and `label`. There is no `stepType` or unused nullable fields from the other variant. D1.2 has no
user-stated response representation. Core retains full limits after provider schema projection.
Each later type owns its own plan schema, validator and renderer.

The resolver merges both lists by global, positive, unique, gapless `order` starting at 1,
without silently renumbering. It checks schema and limits, operation membership and uniqueness,
response order, known endpoints, user-stated conflicts with source-confirmed relationships,
flow evidence and blocking rules. It assigns local fact IDs and derives participants from first
use; their aliases, canonical names and declaration kinds come from the snapshot.
Source-confirmed and user-stated evidence remain distinct. A missing relationship in the
architecture source is not proof that no relationship exists. Invalid or prohibited facts are
rejected locally before review. No rejected plan is repaired.

A user-stated step also fails locally with `interaction-direction-mismatch` when it reverses a
source-confirmed relationship with the same interface type and the same nullable interface name.
An independent reverse relationship with different interface data remains eligible for review;
an explicit forbid remains blocking. Labels share the PlantUML display-text policy before
rendering: quotes, backslashes, line breaks, controls, directive/URL/comment/markup forms and
characters outside the bounded punctuation allowlist are rejected without rewriting model text.

The deterministic renderer receives only the resolved plan and alone writes PlantUML: markers, declarations, stable aliases,
element kinds, arrows, interface names, labels, escaping and the supported notation subset.
Its output is bounded and checked for safe structure. C4 and ArchiMate renderers use no external
includes, remote macros or downloads. Renderers are separate implementations matching their
diagram types; the old sequence renderer remains only for the compatibility command.

## Independent reviewer and local decision

After local plan resolution, rendering, PlantUML document validation and subset parsing, the
reviewer receives the original task, the same snapshot and digest, resolved plan, fact/evidence
map and the exact rendered candidate. Its response has exactly three fields:
`accepted: boolean`, `confirmedUserStatedFactIds: string[]` and
`violations: { code, factId }[]`. The four closed codes are
`unsupported-user-stated-evidence`, `sequence-inconsistency`,
`participant-inconsistency` and `candidate-semantics-invalid`; `factId` may be null for a
whole-diagram violation. There are no explanations or other free-text fields. The local schema
bounds confirmations to 512, violations to 32 and fact IDs to nine characters. The reviewer
response limit is 8192 tokens, sufficient for the 512-fact maximum while keeping the generator
limit and provider token mapping unchanged.

Local code checks the full verdict, including exact confirmation of every user-stated fact,
existing fact references, empty violations on acceptance, at least one violation on rejection,
and no duplicates. It does not trust `accepted` alone. The reviewer does not render, regenerate,
edit or repair PlantUML or the plan. Generator and reviewer use the same configured profile and
model in separate requests. Verified success returns PlantUML and grounding report v2.

If the second request rejects or fails after all local checks, runtime returns a typed
`unverified` outcome with the exact candidate and closed review codes, without report v2 or final
metadata. VS Code asks once in a modal whether to inspect it. Show opens one untitled PlantUML
document with fixed `UNVERIFIED CANDIDATE` comments after `@startuml`; Cancel or dismissal opens
nothing. The candidate passed local structure and grounding checks, but is not a verified
architecture artifact or S1 PASS. Reviewer cancellation by the user does not offer it.

## Call and cancellation policy

| Condition | Model calls | Result |
| --- | ---: | --- |
| Unsupported type, invalid input/snapshot/context, or cancellation before generation | 0 | Safe rejection |
| Generator schema/plan validation rejection, or local rendering rejection | 1 | Safe rejection; no review |
| Locally valid candidate sent to review | 2 | Verified success, or explicit offer of an unverified candidate |

A verified or unverified reviewed run uses exactly two calls. There is no retry, repair, fallback or third call.
Cancellation prevents subsequent calls and propagates through the existing client boundary.

## Grounding report v2 and safety

The reviewed path retains `reportSchemaVersion: 2`, `diagramType`, `generationPath`,
`snapshotDigest`, safe generator/reviewer metadata and call counts, fact and validation
summaries, semantic verdict, `sources` and `outputs`. Facts trace to selected evidence class,
logical file and line, plus `operationId` or `flowEvidenceId`. The report contains no prompts, raw model responses, credentials,
whole source documents or raw exports. Safe error codes and bounded identifiers apply to
rejections. Imported content and MCP results are data, never instructions.

The existing `Generate Sequence Diagram` / `generateSequenceDiagram` pipeline and its renderer,
report v1 and golden outputs stay as a compatibility path. It is not an automatic fallback for
the reviewed path. D1.2 changes the reviewed `sequence` path only. S1 PASS unlocks M1 and the
gauntlet; M1 precedes D2 in the current roadmap. Neither is implemented here.

Optional machine-scoped `archiAgent.diagnostics.verbose` writes bounded JSON Lines to the existing
**Archi Agent** Output Channel. It defaults to false. Entries contain run ID, timestamp, phase,
safe rule/ID and counts; they contain no prompts, request or response bodies, secrets, message
labels, full PlantUML, full flow or Knowledge Pack fragments, provider error body or absolute path.
One central identifier sanitizer recognizes POSIX, Windows drive, UNC and all `file:` URI forms
on every host and replaces them with a constant redaction; it never records a basename or path
hash. Provider transport tests inspect the schemas from both actual request payloads for all five
profiles, including strict required fields, nested closed objects, nullable/enums and provider
limit projection; full Zod limits remain local.
Every started run has one completion entry with 0/1/2 call counts. Safe verbose includes
`reviewer.failed` and, after completion, `unverified-candidate.offered/opened/dismissed` without
PlantUML or labels. The latest Ollama `qwen3:30b` Wire Plan v3 smoke passed local validation
with four grounded and one user-stated step, four participants and an 11-line candidate; the
reviewer returned a verdict but was reported as `invalid-verdict`. A controlled reviewer-only
reproduction returned `accepted: true` with confirmations for two source-confirmed facts and
the one user-stated fact; the local exact confirmation rule rejected the extra references.
The original raw owner-smoke verdict was not preserved. The reviewer prompt now asks for only
user-stated confirmations and `reviewer.failed` records an allowlisted failure subcode.
The subsequent owner smoke returned a verified outcome on 2026-09-23: S1 PASS. M1 and the
gauntlet are unlocked but remain unimplemented.
