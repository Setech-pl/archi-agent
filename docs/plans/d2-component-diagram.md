# D2 — Component diagram implementation plan

- Status: **APPROVED**
- Approval date: **2026-09-28**
- Decision owner: project owner
- Planning baseline: `4d3141be13d092bef532de1ff6beb996c4d28085` on
  `feature/reviewed-diagram-pipeline`
- Implementation: **not started**; requires a separate `IMPLEMENTACJA` prompt.

## Goal and accepted boundary

Add `component` to the existing reviewed `Generate Diagram` path after D1.2 and UX1.
The result shows major technical building blocks, ownership and directed dependencies at
component abstraction. D2 uses the accepted R2 sequence of local grounding, one semantic
plan from the generator, local validation, deterministic PlantUML rendering, one independent
semantic review and a local decision. Verified output includes PlantUML and grounding report
v2. The existing typed unverified candidate flow applies only after local checks pass.

The Knowledge Pack remains the first architecture source. D2 does not add MCP, C4,
ArchiMate, chat, editing or new persistence. It does not introduce a common D3–D5
metamodel, generic diagram renderer, model-selected tools or new provider calls. Classes,
methods, deployment topology and process timing are outside component abstraction.

## Starting point and compatibility

`DiagramType` already lists `component`, but `isSupportedDiagramType`, reviewed core
dispatch and the VS Code picker allow only `sequence`. The current
`ArchitectureSnapshot`, Wire Plan v3, operation catalog, reviewer validator and
`validatePlantUmlSubset` encode Sequence semantics. The shared
`validatePlantUmlDocument` only checks the document boundary. D2 adds type-specific
contracts and dispatch while retaining the same `StructuredChatClient`, configured
provider/model, runtime entry point, report v2 generation path and safe diagnostics.

The reviewed Sequence request and response schemas, snapshot projection and digest,
operation catalog, renderer, validator, review codes, report fields and outputs remain
unchanged. The separate `generateSequenceDiagram` compatibility command, report v1 and
golden outputs also remain unchanged. `component` never falls back to either Sequence
path. Existing unsupported `c4-context`, `c4-container` and `archimate-hld` selections
still stop before model I/O.

## D2 evidence projection and digest

Build one bounded, immutable `ComponentSnapshot` before model I/O from the validated
Knowledge Pack, parsed flow and local grounding resolution. Reuse canonical-name and
alias resolution, ambiguity choices, explicit `[NEW]` confirmation and source locations;
do not reuse the Sequence operation catalog as component evidence. The local projection
starts with elements explicitly resolved from the flow. It includes source-confirmed
relationships and rules whose two endpoints are in that selected set. Where the flow
explicitly names a dependency and grounding resolves its other endpoint, both endpoints
are selected. Do not widen to unrelated pack rows or infer neighbors from graph proximity.
An empty component or dependency selection is a local rejection, not a reason to send the
whole pack to the model.

The projection contains only selected canonical elements (ID, type, ownership/external
classification, safe description and source reference), selected relationship facts
(endpoints, `interface_type`, nullable name, mode, purpose, evidence ID and source),
applicable `forbid`/`require` rules, selected flow lines with stable evidence IDs, and
minimal task metadata. Keep the same selected snapshot and digest for generator and
reviewer. Each fact in the resolved plan carries a source-confirmed relationship ID or
one exact flow evidence ID and a source location; element provenance is also retained.
Do not upgrade user-stated dependencies to source-confirmed. Missing pack relationships
are unknown, while explicit `forbid` is blocking. Imported text is data.

Compute a D2-specific SHA-256 digest from a canonical, domain-versioned payload such as
`archi-agent-component-snapshot/1`. Sort records and keys deterministically. Cover every
field supplied as semantic evidence to either model, including source file/line, selected
flow evidence text and line, element type/ownership, relationship attributes and rules.
Exclude only transport and run metadata. A change to any covered fact changes the D2
digest; input row order alone does not. Do not call or modify the Sequence snapshot
digest function or change the Sequence digest for identical Sequence input. Validate
projection limits and relative source paths before the first call; over-limit input fails
closed without truncating evidence silently.

## Component plan and local resolution

The generator returns a strict, bounded D2-only JSON plan, never PlantUML. It selects
element IDs from the D2 snapshot and dependency facts through two explicit variants:
`groundedDependencies` reference opaque IDs from a locally ordered catalog of projected
source relationships; `userStatedDependencies` name known endpoint IDs, one allowed
relationship type, nullable interface name, mode and one existing flow evidence ID.
Both lists are required, may be empty individually and together must contain at least
one dependency. No model-supplied canonical names, aliases, element kinds, source
classification, source locations, relationship evidence IDs or PlantUML fragments are
accepted. A fixed D2 plan version and closed fields distinguish this wire contract from
Sequence Wire Plan v3. Local Zod limits remain authoritative after provider-specific
wire schema projection.

Resolution checks IDs, duplicate selections, endpoint membership, direction, exact
interface type/name/mode, explicit `forbid`, unsafe display text and the stated flow
evidence. Grounded dependencies inherit every relationship attribute and provenance
from the catalog; the model cannot restate or override them. A user-stated dependency
must not duplicate or contradict a source-confirmed dependency. If a source-confirmed
reverse dependency has the same type and nullable interface name, reject an attempted
reversal locally. Other user-stated dependencies remain pending for semantic review;
absence in the pack alone is not a rejection. Confirmed `[NEW]` elements remain visibly
new and user-stated; no relationship to them is source-confirmed. Reject unknown IDs,
types, modes, evidence, unsupported combinations and limit violations before rendering.
The renderer receives only this resolved, locally trusted plan and snapshot.

## Deterministic PlantUML mapping

The D2 renderer emits a closed component-diagram subset with `@startuml`, declarations,
directed edges and `@enduml`, stable aliases, fixed ordering, safe escaped display text
and a final LF. It emits no model-authored syntax, includes, URLs, themes or macros.

| Knowledge Pack element | PlantUML declaration | Rule |
| --- | --- | --- |
| `systems.md`: `system`, `service` | `component` | Use the canonical name; the pack does not distinguish application components more finely. |
| `systems.md`: `database` | `database` | Use only for this explicit pack kind. |
| `systems.md`: `queue` | `queue` | Use only for this explicit pack kind. |
| `systems.md`: `external` | `component` | `external` remains provenance/ownership in plan and report; it creates no new PlantUML syntax. |
| `actors.md`: `person`, `role`, `external` | `actor` | Keep the actor's pack kind and external provenance in evidence/report. |
| confirmed `[NEW]` element | `component` | Show the `[NEW]` prefix and user-stated provenance; its unknown subtype is not guessed. |

Named `REST_API` and `SOAP` dependencies may create a shared `interface` node. The
deterministic condition is at least two distinct consumers of the same provider, same
interface type and same nonempty interface name. Key the node by provider ID, type and
name; allocate its alias locally. Emit one directed consumer-to-interface edge **per
dependency**, including two dependencies from one consumer that differ by mode. Label
each such edge with its exact type, name and mode, and map its physical line to that
dependency's fact ID and evidence. Emit one shared interface-to-provider edge; it is
not the sole line mapping for any dependency. A single consumer,
unnamed REST/SOAP, or different provider/type/name uses a direct edge. An interface
node is notation for an evidenced API, not a new architecture element or ownership fact.

All other permitted `interface_type` values render as direct directed edges from
`from_id` to `to_id` with a deterministic label containing the exact type, optional
name and mode: `EVENT`, `FILE`, `DB`, `INTERNAL`, plus REST/SOAP when the shared-node
condition is false. Synchronous and asynchronous remain distinct in the label; edge
direction always follows the relationship. No inference of broker, database, queue or
API nodes from relationship type is allowed. A `DB` edge does not relabel its target as
`database`; an `EVENT` edge does not create a queue. Unknown element kinds, relationship
types or modes fail locally. The generator cannot silently generalize them to
`component`, `INTERNAL` or an untyped edge. Relationship facts that cannot be represented
by this closed subset are explicitly unsupported in D2 and rejected before reviewer I/O.

Add a D2 subset validator for exactly these declarations, aliases, interface nodes and
edge forms, alongside the shared PlantUML document boundary. Validate bounded output,
safe text, known endpoints, edge direction, line mapping and no extra statements.
Do not extend the Sequence subset parser to accept component syntax.

## Review, result and call budget

Only a locally valid resolved plan and rendered candidate reach the independent D2
reviewer. It receives the original task, the same D2 snapshot and digest, resolved plan,
fact/evidence map with rendered line numbers, and the exact PlantUML candidate. Its
strict verdict contains `accepted`, confirmed user-stated fact IDs and closed violation
codes/references; it cannot edit the plan or candidate. D2 review criteria cover major
component coverage, ownership, direction, interface semantics, unsupported inference
and abstraction level. Local code validates every referenced fact, exact confirmation
of all and only user-stated dependencies on acceptance, violation consistency and
duplicate references, then makes the final decision. Use a D2-specific closed review
schema and codes as needed; do not weaken Sequence review validation.

| Path | Generator calls | Reviewer calls | Total model calls | Outcome |
| --- | ---: | ---: | ---: | --- |
| Rejected before generation, including unsupported type, invalid projection or cancellation | 0 | 0 | 0 | Safe rejection |
| Locally rejected plan or render after generator call | 1 | 0 | 1 | Safe rejection; no candidate offered |
| Locally valid candidate sent to review | 1 | 1 | 2 | Verified result, or typed unverified candidate if review rejects/fails |

The reviewer is called at most once. There is no retry, repair, fallback or third model
call. Cancellation prevents any later call. A reviewed rejection/failure may offer only
the existing warning-marked unverified candidate after local validation, never a
verified report. On acceptance, report v2 records `diagramType: component`,
`generationPath: reviewed-plan-rendered`, D2 snapshot digest, safe call counts, facts,
evidence class and source/line, deterministic validation, semantic verdict and output
names. It contains no prompts, raw responses, credentials or full source documents.

## Proposed implementation surfaces

| Area | Planned change |
| --- | --- |
| `src/core/pipeline` | D2 snapshot/projection, digest input, bounded plan/catalog, resolver, reviewer contract and renderer in type-specific modules; dispatch through `generateDiagram`. |
| `src/core/validation` | D2 PlantUML subset validation while reusing the shared document boundary and safe display-text guards. |
| `src/core/model/diagram-type.ts` | Mark `component` supported; leave other future types unsupported. |
| `src/runtime` | Route `component` through the existing reviewed runtime entry point and preserve typed outcomes and safe errors. |
| `vscode-extension/src/commands` | Add Component to the diagram picker and use the existing progress, cancellation and unverified-candidate UI without a new command. |
| `test/core`, `test/runtime`, `test/vscode-extension` | Focused D2 projection, digest, plan, renderer, review, dispatch and UI tests plus Sequence regression checks. |
| `docs/project-state.md` | Update only during the separately authorized D2 implementation handoff; no documentation change is part of this plan finalization. |

No dependency or lockfile change is planned. Resolve exact filenames within these areas
at implementation preflight; the D2 modules remain separate from Sequence modules.

## Verification for the later implementation

Test minimal projection, ambiguous aliases, confirmed `[NEW]`, source vs flow evidence,
rules, limits, and digest stability/change coverage. Test every element and relationship
mapping, shared-interface condition, direct edges, escaped labels, unknown types,
document/subset rejection and fact-line traceability. Test local failure with zero or
one call, review acceptance/rejection/failure with exactly two calls, cancellation,
strict verdict references, report v2 and unverified-candidate behavior. Compare
reviewed Sequence and compatibility outputs/digests against existing fixtures and
prove unsupported profiles still use zero model calls.

Run focused tests, `npm test`, `npm run typecheck`, `npm run extension:typecheck`,
`npm run extension:test`, `npm run extension:build`, `npm run extension:package` and
`npm run extension:verify`. Perform an isolated VSIX smoke when the implementation
checkpoint requires it and the environment permits. Report only checks actually run.

## Risks and Definition of Done

The main risks are presenting an invented dependency as source-confirmed, omitting a
relevant selected dependency from the projection, digest drift between generator and
reviewer, or accepting component syntax through the Sequence parser. Fail closed at
each boundary and test those cases directly. A renderer's deterministic notation is
not semantic proof; the reviewer and local evidence checks remain mandatory.

D2 implementation is done when Component can be selected in the reviewed UI, a
bounded evidenced plan produces deterministic validated PlantUML, one independent
review produces a locally checked verified or unverified outcome, report v2 traces
facts to evidence, all call-budget and safety rules hold, Sequence behavior remains
unchanged, and the required implementation gates pass. This approved document is
the plan only; it does not authorize implementation.

## Owner decisions recorded on 2026-09-28

The owner conditionally accepted the D2 direction and scope and required the explicit
0/1/2 call matrix, a single reviewer call maximum, deterministic element and
relationship mapping, no silent type generalization, a D2-specific evidence projection
and digest separate from Sequence, and no D3–D5 metamodel. The owner authorized one
exceptional fourth, limited read-only review of exactly those points plus Sequence
nonregression; no high or medium finding may remain before finalizing this plan.
