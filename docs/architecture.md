# ArchGround architecture

ArchGround turns a plain-language flow description into a sequence diagram that is grounded
in an Architecture Knowledge Pack. This document describes the layers that exist today and
the ports that later stages will add. All examples use the synthetic Space Mission sample.

## Layers and the core boundary

| Layer | Location | Responsibility |
| --- | --- | --- |
| Core | `src/core` | Parsing, validation, indexing, grounding, digests. Pure TypeScript. |
| Adapters | later | File system, editor, model provider and renderer integrations. |

The core imports neither `node:*` modules nor the editor API. It performs no network or
file access, runs no shell commands, evaluates no dynamic code and calls no language model.
Everything that touches the outside world is an adapter behind a small port, for example
the `KnowledgePackSource` port that supplies pack files. An automated test checks the
import boundary of every core module.

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

## Future generator port

A later stage adds a generator port that receives the grounded context and returns a
structured diagram model. Providers, including language models, live in adapters behind
that port. They will receive only the minimal context, never the whole pack.

## Future validation and rendering pipeline

Later stages validate the generated model against the context (known participants,
declared relationships, forbidden and required rules, declared interface names) using the
shared validation issue contract, and then render it. Rendering belongs to its own stage
and module.

## Why grounding has no model or renderer

Grounding decides which architecture elements a diagram may use. Keeping it deterministic
and free of models and renderers makes that decision reproducible, testable and auditable:
the same flow and pack always give the same context and the same digest, and any
ambiguity is surfaced to a person instead of being resolved by a guess.
