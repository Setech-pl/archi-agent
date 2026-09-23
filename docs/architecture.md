# ArchGround architecture

ArchGround turns a plain-language flow description into a sequence diagram that is grounded
in an Architecture Knowledge Pack. This document distinguishes the historical code on base commit
`4dbc65a2a698ea1ed7e3d00160c4a802c9a8083b`, the historical D1.1 sequence path, the implemented D1.2 path,
and later extensions. All examples use the synthetic Space Mission sample. The experimental D1
ledger diagnosis is preserved on `checkpoint/d1-ledger-pipeline`; its owner smoke did not pass.

## Layers and the core boundary

| Layer | Location | Responsibility |
| --- | --- | --- |
| Core | `src/core` | Parsing, validation, indexing, grounding, digests, generation pipeline, rendering, report, output planning. Pure TypeScript. |
| Node adapters | `src/node` | Bounded file reading, safe path resolution, the Node Knowledge Pack source and the Node artifact file system. |
| Demo | `src/demo` | The offline Space Mission demo and its deterministic scripted generator. |
| Application runtime | `src/runtime` | Host-neutral `ArchiAgentRuntime`: resolves flow, Knowledge Pack and generator sources through the Node adapters, runs the pipeline and maps outcomes to a result contract. Imports no editor API. |
| Editor layer | `vscode-extension/src` | The VS Code extension: settings, prompts, progress and editors. Reaches the repository only through `src/runtime/index.ts` and is bundled into a self-contained VSIX (see `docs/vscode-extension.md`). |
| Later adapters | later | Further model providers, architecture sources and official renderer integrations. |

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
pack, and returns untrusted data. Nothing it returns is used before validation. A model-backed
generator may declare safe `generationMetadata` (model identifier, temperature, seed, attempt
count, structured output), which the pipeline checks and the grounding report records.

Model-backed generators use the lower-level, provider-neutral `StructuredChatClient` port in
`src/core/llm`. Its request contains only system/user messages, a schema name, JSON Schema, a
bounded maximum token count and optional cancellation; its result contains the untrusted JSON
object and the safe response-channel identifier. The port has no endpoint, host, HTTP, editor or
secret-storage concepts. The sequence implementation is a thin layer that builds its existing
prompt and schema, makes one structured-chat call and returns the value to the unchanged validation
pipeline.

Provider identity is also neutral in core. `ProviderProfile` contains only an identifier, provider
kind, display name, credential requirement and immutable capability flags; `ProviderRegistry` validates, sorts and resolves
profiles without I/O. Concrete LM Studio and Ollama names and loopback defaults live in
`src/node/llm/local-provider-profiles.ts`. The runtime resolves a profile and capability before
constructing the existing local adapter; it reports `unknown-provider-profile` or
`provider-capability-unavailable` as controlled configuration failures.

The VS Code host persists the explicit profile and model as machine-scoped global settings. A third
machine-scoped, extension-managed setting binds the selected model to the exact profile identifier;
the host ignores a model when that binding is absent, invalid or mismatched. Only absence of a global
profile value enables the legacy LM Studio settings. A present unknown profile fails closed before
the runtime can construct a transport.

Provider transports exist in separate Node adapters:

- `openai-compatible-local` (`src/node/llm`): LM Studio and Ollama profiles share this transport;
  the model plans the diagram. The provider-neutral
  prompt builder (`src/core/prompt`) presents the flow and the minimal grounded candidates. The
  `OpenAiCompatibleLocalChatClient` node adapter maps the neutral request to the local HTTP API;
  the response format is a strict JSON Schema derived from the Zod generated-model schema, and a
  strict parser (`src/core/llm`) accepts exactly one JSON object. One request per generation,
  loopback only, temperature 0 and seed 42, no retry, repair or provider fallback. See
  `docs/local-model.md`.
- `anthropic-remote`: native HTTPS Messages API with stable structured outputs and a projected wire
  schema; its strict parser accepts exactly one text block ending with `end_turn`.
- `openai-remote` and `openrouter-remote`: a shared HTTPS OpenAI-compatible adapter with distinct
  fixed hosts, paths and request mappings. OpenRouter disables provider fallback and requires
  structured-output parameter support. Remote profiles report `temperature: null` and `seed: null`
  because neither field is sent. See `docs/cloud-models.md`.
- `scripted-demo` (`src/demo`): a deterministic script used as an offline regression fixture,
  smoke-test baseline and pipeline demonstration; it is not the production generation strategy.

Deterministic code covers parsing, grounding, candidate selection, limits, the structured-output
contract, validation, rendering and output safety. Message creation, wording, relationship choice,
interaction semantics, fragments and level of detail belong to the model. Cloud credentials remain
in the VS Code host's `SecretStorage` and are supplied to the host-neutral runtime only for an
explicit operation.

## Historical D1 generation pipeline on the base commit

`generateDiagram({ diagramType: "sequence", ... })` is the D1 path. It grounds the flow first,
then calls `StructuredChatClient.complete()` exactly once for a strict `{ plantUml, messages }`
answer. The model supplies final PlantUML. A shared document validator checks markers, size,
line endings, controls, directives and remote URLs. The closed sequence validator accepts only
grounded declarations, arrows and balanced `alt`/`else`/`opt`/`loop`/`group` blocks. It checks
every PlantUML arrow against the ledger's required 1-based physical `lineNumber` and continuous
`order`. Every message includes `interfaceName` as a string or `null`. It then applies participant, relationship,
mode and rule validation. It rejects unsupported interface names rather than editing the final
PlantUML. The report uses the existing schema with normalization marked `not-applicable`.
`component`, `c4-context`, `c4-container` and `archimate-hld` are identifiers only in D1;
the runtime rejects them before source reads and provider construction. There is no retry,
repair, fallback, streaming or second model call. This D1 path passed automatic checks but is
an experimental checkpoint: owner smoke exposed a brittle duplicated ledger contract. It is
not the approved architecture for further development.

## Implemented D1.1 reviewed sequence pipeline (historical active path)

D1.1 uses one minimal, validated `ArchitectureSnapshot` from a provider-neutral
`ArchitectureContextProvider`; the first provider wraps the existing Knowledge Pack loader.
The `sequence` profile makes one generator request for strict `{ plantUml }` only. A local parser
derives `DiagramFacts` and physical line numbers, then deterministic checks validate document
safety, syntax, aliases, grounding, relationships, directions, modes, interfaces, rules and
evidence. The snapshot also references nonempty physical flow lines as `user-stated` evidence.
A missing Knowledge Pack relationship leaves a fact pending for semantic review; an explicit
pack prohibition still rejects it locally. The reviewer cites flow evidence for every pending
fact, and local code verifies the references and coverage. If these pass, a separate LLM call reviews semantics. The final accept/reject decision
is deterministic; neither stage repairs PlantUML. A successful reviewed run uses exactly two
model calls, deterministic rejection after generation one, and invalid context or unsupported
type none. There is no retry, repair or fallback.

OpenAI and OpenRouter project strict wire schemas at their adapters while retaining local limits.
Report v2 links every fact to selected evidence and its logical file and line.

Generator and reviewer initially use the same configured profile/model but separate contexts
and the same snapshot/digest. The old `Generate Sequence Diagram` command remains on its
compatibility pipeline, never as an automatic fallback. See
[`ADR 0001`](adr/0001-reviewed-diagram-generation.md) for the historical D1.1 contract.

D1.1 is automatically verified but S1 owner smoke failed. Its final-PlantUML path is
superseded as the active target by [ADR 0002](adr/0002-deterministic-diagram-plan-renderers.md);
the exact code remains on `checkpoint/d1-final-plantuml-reviewed`.

## Implemented D1.2 — semantic plan and deterministic rendering

```text
ArchitectureSnapshot + digest
  → LLM generates type-specific DiagramPlan
  → local plan validation
  → deterministic renderer for the diagram type
  → independent semantic reviewer
  → local decision → result and report v2
```

The generator chooses grounded operations or user-stated interactions and their order. It returns no PlantUML.
Local validation checks grounding, evidence, modes and type-specific constraints. The renderer
controls PlantUML syntax, aliases, element kinds, arrows, interface names and escaping.
The reviewer receives the same snapshot and digest, resolved plan, evidence and rendered candidate;
it returns only `accepted`, `confirmedUserStatedFactIds` and closed `{ code, factId }` violations,
without explanations, rendering or repair. Local code checks the entire verdict. Verified success
returns PlantUML and report v2. After all local validations, a rejected or failed review yields a
typed unverified candidate. VS Code offers it in one modal and, only on Show, opens one untitled
PlantUML document with fixed warning comments. Cancellation offers nothing. No retry, repair,
fallback or third request is used.
The same configured provider and model serve both separate calls. Invalid input makes zero
model calls; local rejection makes one; success makes exactly two. No retry, repair, fallback
or third call. Report v2 contains no prompts or raw responses.

D1.2 implements `sequence` first. Wire Plan v3 has `version: 3` and separate required
`groundedSteps` and `userStatedSteps` lists. Each step has a global `order`; the resolver
rejects duplicates and gaps, then merges the lists without renumbering.
For source-confirmed relationships, local code builds a deterministic catalog of opaque
`operationId` values. The model chooses an operation and supplies only its label; a locally
linked response operation requires its request to appear earlier. A separate user-stated step
names known endpoints, request or asynchronous interaction, interface data and one physical
`flowEvidenceId`. User-stated response is outside the D1.2 contract. The resolver derives
participants in first-use order and assigns fact IDs, directions, modes, interfaces and evidence
from the snapshot or the checked user-stated step. Reviewer confirmation is required for each
user-stated fact. Reversing the same source-confirmed interface as user-stated is rejected locally;
an independent reverse interface remains eligible. Labels pass the shared safe PlantUML text
policy before rendering and are never silently rewritten. The renderer
uses the shared canonical alias allocator and participant keywords, emits one bounded PlantUML
document with terminal LF, and maps each fact to its physical line. Report v2 records those lines,
operation or flow evidence IDs and evidence sources without prompts or raw responses.

The active VS Code command can send bounded JSON Lines diagnostics to the existing **Archi Agent**
Output Channel when `archiAgent.diagnostics.verbose` is enabled. It is off by default and never
records prompts, model responses, secrets, message labels, full PlantUML or absolute local paths.
Its central identifier sanitizer redacts POSIX, Windows drive, UNC and all `file:` URI forms
independently of the host platform.
The latest S1 owner smoke with Ollama `qwen3:30b` used Wire Plan v3 and passed the local resolver,
renderer, document validator and subset parser: four grounded and one user-stated step produced
an 11-line candidate. The reviewer returned `truncated-output`. S1 remains FAIL; an unverified
candidate does not count as acceptance. A new owner smoke must return a verified outcome.

S1 follows D1.2; then M1, D2, C1, D3, D4 and D5
follow the roadmap order. Each diagram type gets its own plan contract, validator and renderer,
rather than a mega-schema. C4 and ArchiMate use no external includes or macro downloads.
The old `generateSequenceDiagram` remains the separate compatibility path. See the
[reviewed pipeline contract](reviewed-diagram-pipeline.md).

The earlier `generateSequenceDiagram` pipeline remains the compatibility path:

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
strictly within a bounded depth. The text policy is applied by rendering context: a message label is
emitted only after the renderer-controlled `<alias> <arrow> <alias> :` prefix on one physical line,
so it may begin with a PlantUML statement keyword such as `return`, `alt` or `end`, which is plain
text in that position; a fragment condition follows `alt` or `else` at the start of a line and may
not. Every other rule of the policy applies to labels unchanged. Normalization only applies Unicode NFC, trims display text,
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
