# Reviewed diagram pipeline — target implementation contract

Status: D1.1 `sequence` implemented and automatically verified on
`feature/reviewed-diagram-pipeline`; owner smoke S1 remains pending. The experimental D1 ledger pipeline is
archived on `checkpoint/d1-ledger-pipeline`; see
[`ADR 0001`](adr/0001-reviewed-diagram-generation.md). This document specifies the smallest
end-to-end path needed for D1.1 `sequence`, not a general diagram framework.

## End-to-end path

```text
flow + selected architecture source
  → ArchitectureContextProvider → one validated ArchitectureSnapshot + digest
  → sequence DiagramProfile.buildGeneratorRequest → generator { plantUml }
  → document boundary → sequence parser → DiagramFacts → deterministic validation
  → sequence DiagramProfile.buildReviewerRequest → independent semantic reviewer
  → deterministic final decision → unchanged PlantUML + report v2
```

No model call precedes successful context resolution and profile selection. The parser and
validators never repair the diagram. The final PlantUML is the validated generator text,
byte-for-byte. No new renderer is introduced.

## ArchitectureSnapshot and provider

The neutral snapshot contains `snapshotId`, `digest`, `elements`, `relationships`, `rules`,
`flowEvidence`, and `sources`. Each element has a stable ID, canonical name, controlled aliases, kind and source
references. Relationships and rules use stable endpoint IDs and retain source references,
direction, mode, interface information and evidence class. `sources` identify provenance
without including full documents or raw exports. Knowledge Pack relationships are
`source-confirmed`. Each nonempty physical flow line has a stable `flowEvidenceId`, its line
number and bounded text with class `user-stated`. This is a reference to text, not an extracted
relationship; absence in a source does not prove nonexistence.
The digest is deterministic over the canonical semantic snapshot, independent of input ordering.

`ArchitectureContextProvider` is a provider-neutral operation that resolves the minimal
architecture relevant to the request, validates it and returns either one snapshot or bounded
safe issues. D1.1's first implementation wraps the existing Knowledge Pack loader and grounding
logic; it does not duplicate that loader. The provider never sends whole packs to the LLM.
Later M1 maps deterministic MCP results to the same contract, not to a separate model-facing
shape. D1.1 may keep the minimal snapshot representation local to its vertical path; M1 extends
the source boundary only when needed. The generator and reviewer receive the same selected
snapshot and digest in separate, purpose-specific prompts.

## Minimal DiagramProfile boundary

The D1.1 profile has only `id`, `buildGeneratorRequest`, `parsePlantUml`, `validateFacts`, and
`buildReviewerRequest`. Only the `sequence` implementation is in D1.1. Each operation uses
bounded, provider-neutral inputs and outputs. The profile is not a renderer, registry framework,
configuration system or source loader. Unsupported types fail before source or provider I/O;
later D2, D3/D4 and D5 add their own accepted PlantUML subsets and checks when approved.

## Generator contract

The generator receives the user task and only relevant canonical snapshot content, aliases,
rules and evidence. Its strict Structured Outputs schema is exactly `{ "plantUml": string }`:
the sole property is required, additional properties are forbidden, and size is bounded.
There are no model-generated `messages`, ledger entries, `order` values or `lineNumber` fields.
One completion is attempted. OpenAI and OpenRouter project the strict wire schema to supported
JSON Schema keywords while the complete local Zod limits remain in force. Provider adapters retain existing allowlists, limits and credential
boundaries. Invalid JSON or PlantUML is rejected, not normalized into a different answer.

## Local DiagramFacts and deterministic validation

The sequence parser accepts a closed PlantUML subset and derives `DiagramFacts` exclusively
from its physical lines: declared elements, directed relationships/interactions, annotations
(including labels, interface information, fragments and modes), physical line numbers and
stable local fact IDs. Fact IDs allow violations to point to parsed facts, not model-authored
ledger references. The parser does not infer unsupported syntax and does not modify PlantUML.

Validation order is fail-closed:

1. Document safety: exact markers, bounded bytes/lines/text, controls, directives, includes and
   remote URLs rejected; a final LF is not required solely for formatting.
2. Profile syntax: only permitted declarations, arrows and balanced fragments.
3. Grounding: aliases resolve to stable snapshot IDs; participant declarations use canonical
   names and allowed `[NEW]` conventions.
4. Semantics: source-confirmed relationships, direction, sync/async and response mode, interface
   type/name and explicit blocking rules are checked against the snapshot. A fact without matching
   source-confirmed evidence proceeds to semantic review. No local text heuristic infers a
   user-stated relationship; an explicit prohibition stops before review.

Missing evidence is reported as missing evidence, not silently converted into an assertion that
the relationship does not exist. Every rejection exposes a safe code, line/fact identifier when
valid, and bounded counts or evidence IDs; never the prompt, raw model answer or secret.
An invalid deterministic result stops before semantic review.

## Independent semantic reviewer

After deterministic acceptance, `buildReviewerRequest` constructs a separate compact request
from the same snapshot/digest, the task, the unchanged PlantUML, parsed facts and validation
summary. The reviewer evaluates coverage, meaning, abstraction level, unsupported inference
and diagram-type fit. It does not repair or regenerate the diagram.

Its strict bounded response has required `verdict` (`accept` or `reject`), `violations` and
`confirmations`. On accept, exactly one confirmation per pending fact links its `factId` to one
or more distinct `flowEvidenceId` values in the same snapshot. The reviewer judges direction,
meaning, mode and interface information; local code validates coverage and references without
reinterpreting the flow text.
Each violation has required `code`, `diagramLine`, `factId`, `evidenceIds` and `explanation`;
extra fields are forbidden. The accepted verdict has no violations. A rejected verdict has at
least one. The closed codes are `coverage-gap`, `meaning-mismatch`, `abstraction-level`,
`unsupported-inference` and `diagram-type-fit`. `diagramLine` and `factId` identify the same
locally parsed fact, or both are `null` for a missing fact; every `evidenceIds` entry resolves
to the selected snapshot. Explanations are untrusted bounded text and never become instructions. Malformed
or ungrounded review output fails closed. The final decision is local: accept only if both
deterministic validation and the reviewer accept; otherwise reject without altering PlantUML.

Initially both calls use the same configured provider profile and model, but separate requests
and contexts. This is logical independence of the reviewer, not a requirement for a second
provider or configuration surface.

## Call and cancellation policy

| Condition | Model calls | Result |
| --- | ---: | --- |
| Unsupported type, invalid flow/snapshot/context, or cancellation before generation | 0 | Safe rejection |
| Generator result rejected by schema, parser or deterministic validation | 1 | Safe rejection; no review |
| Deterministically valid result sent to review | 2 | Local final accept/reject decision |

Successful generation requires exactly two calls. There is no retry, repair, fallback or extra
model call. Cancellation between phases prevents the next call; cancellation during a call is
propagated through the existing client boundary and prevents later phases.

## Grounding report v2

The reviewed path emits a versioned report with `reportSchemaVersion: 2`, `diagramType`,
`generationPath`, `snapshotDigest`, generator and reviewer metadata, parsed-facts summary,
deterministic-validation result, semantic-review verdict and violations, `sources`, and
`outputs`. Metadata records safe model/provider identifiers and call counts, not credentials.
Every reported fact carries selected source-confirmed or reviewer-confirmed user-stated evidence
IDs. The source map records evidence class, logical file and line, allowing fact → evidence →
source tracing without embedding entire documents or raw exports.
The report contains no prompts, raw responses or secrets. It is produced only after the final
decision and follows the existing safe artifact-output boundary.

## Security and compatibility

PlantUML is untrusted text within a closed grammar: no include, URL, remote fetch, arbitrary
directive or execution. Enforce limits before deep parsing. Existing provider allowlists,
loopback-only local transport, HTTPS-only cloud transport, VS Code `SecretStorage`, safe error
codes and no sensitive logging remain in force. Imported content and MCP results are data,
not instructions.

The old `Generate Sequence Diagram` command and deterministic sequence renderer remain on the
existing compatibility pipeline. They are not an automatic fallback if D1.1 rejects an answer.
R1 recorded this contract; D1.1 implements the Knowledge Pack-backed sequence path, reviewer
and report v2. MCP remains a later M1 step. S1 must pass before D2.
