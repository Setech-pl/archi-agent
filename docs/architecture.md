# ArchGround architecture

ArchGround turns a plain-language flow description into a sequence diagram that is grounded
in an Architecture Knowledge Pack. This document describes the layers that exist today and
the ports that later stages will add. All examples use the synthetic Space Mission sample.

## Layers and the core boundary

| Layer | Location | Responsibility |
| --- | --- | --- |
| Core | `src/core` | Parsing, validation, indexing, grounding, digests, generation pipeline, rendering, report, output planning. Pure TypeScript. |
| Node adapters | `src/node` | Bounded file reading, safe path resolution, the Node Knowledge Pack source and the Node artifact file system. |
| Demo | `src/demo` | The offline Space Mission demo and its deterministic scripted generator. |
| Later adapters | later | Editor, model provider and official renderer integrations. |

The core imports neither `node:*` modules nor the editor API. It performs no network or
file access, runs no shell commands, reads no environment variables, evaluates no dynamic code
and calls no language model. Everything that touches the outside world is an adapter behind a
small port: `KnowledgePackSource` supplies pack files, `SequenceModelGenerator` produces an
untrusted model and `ArtifactFileSystem` writes artifacts. An automated test checks the import
boundary of every core module.

## Knowledge Pack loading and indexing

A pack is five strict Markdown tables: `systems.md`, `actors.md`, `relationships.md`,
`aliases.md` and `rules.md` (see `docs/knowledge-pack-format.md`). The loader reads each
file once, validates it, checks references across files and returns either a complete,
frozen pack with read-only indexes or a sorted list of safe issues and no pack at all.

The indexes answer lookups by identifier, canonical name, normalized name, alias,
directed relationship and directed rule. They always return every candidate and never
choose between them.

## Flow documents

A flow document starts with a restricted front matter block (`diagram_name`, `flow_name`,
`author`, `language`) followed by plain text. `parseFlowDocument` parses the front matter
and keeps the body and the line number where it starts, so every mention can be reported
by document line and column.

## Deterministic grounding

Grounding recognises references to known actors and systems in the flow body. The terms
are the identifiers, canonical names and declared aliases of the pack.

Resolution precedence, highest first:

| Rank | Match kind | Example text | Result |
| --- | --- | --- | --- |
| 1 | exact identifier | `mission-control` | `mission-control` |
| 2 | exact canonical name | `Mission Control` | `mission-control` |
| 3 | exact declared alias | `MCC` | `mission-control` |
| 4 | normalized identifier | `Mission-Control` | `mission-control` |
| 5 | normalized canonical name | `MISSION CONTROL` | `mission-control` |
| 6 | normalized declared alias | `mcc` | `mission-control` |
| - | several targets in the deciding rank | `control` | ambiguous |
| - | no term matches | `Ground Station` | ignored |

The first rank with any hit decides. One target resolves the mention; several targets
make it ambiguous. Normalization is limited to Unicode NFKC, case folding, trimming and
collapsing whitespace. There is no fuzzy, edit-distance, partial-word, semantic or
model-assisted matching.

Matching is boundary-aware: a term matches only as a whole word sequence, so
`Mission Controls` and `MissionControl` do not refer to Mission Control. When mentions
overlap, the longest span wins. A shorter alias inside an accepted longer name is not a
separate mention: `Mission Control` never also counts as the ambiguous alias `control`.
Repeated mentions of one element produce one participant with all its positions.

## Ambiguity handling

Every ambiguous mention appears in the ambiguity report with its normalized text, its
positions in the flow, and each candidate's identifier, kind, canonical name and pack
source line. Candidates are sorted by identifier, entries by mention.

The caller resolves an ambiguity only by an explicit selection such as
`{ "control": "flight-controller" }`. A selection is valid only if the identifier is one of
the reported candidates. Without a valid selection the grounding result is blocked; the
builder never picks the first or a "best" candidate.

## Confirmed new participants

A participant that is not in the pack must be written as `[NEW: Ground Station]` and
confirmed explicitly by the caller. The rules:

- only the exact `[NEW: Name]` form is recognised; other spellings are malformed;
- names are at most 64 characters, start with a letter or digit, and contain only
  letters, digits, spaces and `. _ ' ( ) -`, so markup and directives cannot appear;
- a name that matches a known identifier, canonical name or alias is rejected;
- an unconfirmed marker blocks grounding;
- a confirmed participant is marked as new and receives no pack identifier.

Unknown text and unresolved ambiguity never turn into new participants.

## Minimal grounded context

A successful result contains only:

- the actors and systems the flow refers to, with canonical names from the pack;
- confirmed new participants;
- relationships whose two endpoints are both selected;
- rules whose two endpoints are both selected;
- pack source references (file name and line) and warnings.

Unrelated elements, aliases, relationships and rules, whole pack tables, raw files,
timestamps and machine paths are excluded. The context is validated against a strict
schema and against the pack before it is returned.

For the sample flow `samples/space-mission/flows/telemetry-command-flow.md` the context
holds the flight controller, six systems, nine relationships and both rules, while the
mission commander and its relationship are left out.

## Stable digest

Each grounded context has a SHA-256 digest of a canonical serialization of its semantic
content: metadata (without the author), participants, confirmed new participants,
relationships and rules. Arrays are sorted and object keys ordered before hashing, so the
digest does not depend on insertion order, mention positions or pack line numbers. The
SHA-256 implementation is part of the core and is synchronous; it needs no platform crypto
module.

## Generator port

`SequenceModelGenerator` is a provider-neutral, asynchronous port. A generator receives the
parsed flow document, the successful minimal grounded context and its digest, never the whole
pack, and returns untrusted data. Nothing it returns is used before validation. Phase 3F ships
only the deterministic scripted demo generator (`scripted-demo`); real providers are planned for
Phase 3G behind the same port.

## Generation pipeline

`generateSequenceDiagram` owns the order of the stages:

1. receive the validated flow and the loaded pack;
2. build the grounded context and stop when grounding is blocked;
3. call the injected generator;
4. validate the result against the strict generated-model schema;
5. normalize it;
6. validate structure, fragments, text safety and participant grounding;
7. validate relationships, directions and modes;
8. apply the interface-name policy;
9. render PlantUML;
10. validate the emitted PlantUML subset;
11. build the grounding report;
12. return both artifacts in memory.

The pipeline never writes. Its outcome is a discriminated value: `success`,
`grounding-blocked`, `invalid-generator-output`, `semantic-validation-failed` or
`render-validation-failed`; writing adds `output-failed`. Issues after grounding use a sibling
issue contract with fixed codes, severities and messages, carrying schema paths, identifiers and
counts only.

### Strict model schema and normalization

The generated model is the existing participant and message model plus optional combined
fragments (`alt` with `else` branches, `opt`, `loop`, `group`) over ranges of message order
numbers. Unknown keys are rejected, enums are closed, nothing is coerced, every text passes the
PlantUML text policy, duplicates and undeclared endpoints are rejected, and fragments must nest
strictly within a bounded depth. Normalization only applies Unicode NFC, trims display text,
turns empty optional values into absent ones and orders messages, participants and fragments
deterministically. It never invents, removes or repairs anything.

### Grounding and relationship validation

A known participant must use the element identifier, canonical name and kind of an element of
the grounded context. A confirmed new participant must use its grounding key and the display
name `[NEW] <name>`. A message between two different known participants needs a grounded
relationship with the same direction (the opposite one for a response), interface type and mode.
INTERNAL is an interface classification like the others: between two different participants it
needs an explicit grounded INTERNAL relationship with the same direction and mode. A self-message
is identified only by equal sender and receiver; it must use INTERNAL, needs no relationship and
never authorizes an interaction between different participants. A non-INTERNAL interaction with a
confirmed new participant is accepted with a warning and is never labelled as grounded; INTERNAL
with a new participant cannot be grounded and is rejected. The generation summary counts
synchronous, asynchronous and response messages by interaction behavior and reports
`selfMessageCount` as a separate structural metric. A forbid rule blocks its interaction; a missing required
interaction gives a warning.

### Interface-name policy

An interface name is kept only when the applicable grounded relationship declares exactly that
name. An absent name stays absent. Any other name is removed with a warning; the model is not
rejected for this alone and no replacement is guessed.

### Rendering and structural validation

The renderer builds every line from fixed keywords, aliases derived from stable participant
references and text that passed the text policy. Display names of known participants come from
the grounded context. There are no includes, themes, skin parameters or other directives.
Metadata comments carry the diagram name, flow name, author, language, grounding digest and
generator type. A fixed local legend is emitted in English or, for language `pl`, in Polish.

The local PlantUML validator checks the exact subset the renderer emits: markers, comments,
declarations, arrows, balanced fragments, the known legend and bounded size. It is a structural
check, not an execution of the official PlantUML engine.

### Grounding report and output

The grounding report records the evidence behind each diagram (see `docs/demo.md`). The output
planner chooses one shared file-name base for the diagram and its report, with `-v2`, `-v3`
versions instead of overwriting, and the artifact writer publishes both files only after both
temporary files were written. The Node adapters enforce containment below the selected root and
reject links and junctions.

## Why grounding has no model or renderer

Grounding decides which architecture elements a diagram may use. Keeping it deterministic
and free of models and renderers makes that decision reproducible, testable and auditable:
the same flow and pack always give the same context and the same digest, and any
ambiguity is surfaced to a person instead of being resolved by a guess.
