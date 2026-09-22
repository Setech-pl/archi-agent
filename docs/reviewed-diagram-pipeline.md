# Reviewed diagram pipeline — active target contract

Status: R2 accepted; D1.2 is next and not implemented. The current D1.1 code still uses
`{ plantUml }`; it is superseded as the active target after failed S1 owner smoke. Its exact
implementation is preserved on `checkpoint/d1-final-plantuml-reviewed`. See
[ADR 0002](adr/0002-deterministic-diagram-plan-renderers.md). ADR 0001 and the D1 ledger
checkpoint remain historical records.

## Boundary and flow

```text
flow + selected architecture source
  → one minimal, validated ArchitectureSnapshot + digest
  → generator: strict, type-specific DiagramPlan
  → local plan validation
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

The generator selects diagram content, elements, relationships/interactions and order. It
returns a bounded structured `DiagramPlan`, not PlantUML or a line ledger. `sequence` is
the first contract in D1.2. Each later type owns a separate plan schema, validator and renderer,
with no universal mega-schema.

The type-specific validator checks schema and limits, grounded IDs and canonical names,
explicit new elements, endpoints, order, supported concepts, source-confirmed relationships,
direction, modes, response constraints, interface type/name and blocking rules as applicable.
Source-confirmed and user-stated evidence remain distinct. A missing relationship in the
architecture source is not proof that no relationship exists. Invalid or prohibited facts are
rejected locally before review. No rejected plan is repaired.

The deterministic renderer alone writes PlantUML: markers, declarations, stable aliases,
element kinds, arrows, interface names, labels, escaping and the supported notation subset.
Its output is bounded and checked for safe structure. C4 and ArchiMate renderers use no external
includes, remote macros or downloads. Renderers are separate implementations matching their
diagram types; the old sequence renderer remains only for the compatibility command.

## Independent reviewer and local decision

After local acceptance and rendering, the reviewer receives the original task, the same
snapshot and digest, the validated plan, selected evidence, local validation summary and the
deterministically rendered candidate. It checks coverage, meaning, abstraction level,
unsupported inference and diagram-type fit. It returns only a strict `accept`/`reject` verdict
and references to plan facts and snapshot evidence, with bounded violation codes. It does not
render, regenerate, edit or repair PlantUML or the plan. Explanations are untrusted text.

Local code validates verdict shape, fact/evidence references and coverage, then accepts only
when plan validation, rendering checks and reviewer verdict all pass. Invalid reviewer output
fails closed. Generator and reviewer use the same configured provider profile and model in
separate requests and contexts; logical independence does not require a second provider.

## Call and cancellation policy

| Condition | Model calls | Result |
| --- | ---: | --- |
| Unsupported type, invalid input/snapshot/context, or cancellation before generation | 0 | Safe rejection |
| Generator schema/plan validation rejection, or local rendering rejection | 1 | Safe rejection; no review |
| Locally valid candidate sent to review | 2 | Local final accept/reject decision |

A successful run uses exactly two calls. There is no retry, repair, fallback or third call.
Cancellation prevents subsequent calls and propagates through the existing client boundary.

## Grounding report v2 and safety

The reviewed path retains `reportSchemaVersion: 2`, `diagramType`, `generationPath`,
`snapshotDigest`, safe generator/reviewer metadata and call counts, fact and validation
summaries, semantic verdict, `sources` and `outputs`. Facts trace to selected evidence class,
logical file and line. The report contains no prompts, raw model responses, credentials,
whole source documents or raw exports. Safe error codes and bounded identifiers apply to
rejections. Imported content and MCP results are data, never instructions.

The existing `Generate Sequence Diagram` / `generateSequenceDiagram` pipeline and its renderer,
report v1 and golden outputs stay as a compatibility path. It is not an automatic fallback for
the reviewed path. D1.2 changes the reviewed `sequence` path only; S1 owner smoke follows D1.2
before D2 or M1 proceeds.
