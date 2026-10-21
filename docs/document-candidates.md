# K2 document candidates

The production entry is `createArchiAgentRuntime().extractDocumentCandidates(request)`,
exported through `src/runtime/index.ts` and the packaged runtime. It takes explicit absolute
local file paths and the existing `GeneratorConfig`; the host supplies the selected model/profile
binding using its existing `readLocalModelSettings` resolver (the combined diagram settings
resolver is not a prerequisite). A present unknown profile fails closed.
No Knowledge Pack, onboarding, diagram generation, model listing or readiness request is required.
K2 adds no UI; K3 will call this operation and provide review and persistence separately.

## Frozen sources

Only `.md`, `.txt`, `.pdf`, `.docx`, `.xlsx` are supported. PDF accepts `none`, `auto` or `all`
OCR mode through the existing local converter. No directory scan, URL retrieval, attachments,
external document resources or model-directed file reads are performed. Each operation owns a
private temporary directory outside the repository and user documents. Regular files are read
through bounded chunks from one descriptor, with no final symlinks. Those exact bytes are hashed,
then conversion reads only a private mode-0600 copy. Changing the original later cannot change
conversion or evidence. A concurrent write during the initial read is not an atomic filesystem
snapshot; provenance describes the exact captured bytes, which may contain a concurrent writer's
changes. Temporary resources are removed after success, error, Cancel and timeout. Cleanup failure
is a blocking `cleanup-failed`, never a candidate success.

Normalization is UTF-8 fatal decoding for text inputs, removal of one leading BOM, CRLF/CR to LF,
then Unicode NFC. Conversion text receives the same normalization. Whitespace is otherwise retained.
The bundle records `sourceId`, SHA-256 `originalDigest`, SHA-256 `textDigest`, type, explicit-file
scope, partial knowledge coverage and conversion metadata. Text digest is always included, even
when bytes are identical. Source IDs depend on original bytes, type and conversion policy/metadata,
not absolute paths, temporary paths, order or time. Bundle v1 is deeply frozen, sorted by source ID;
its digest uses K1 canonical serialization and deterministic SHA-256.

Converted evidence locates normalized output text, never a reconstructed layout. Available PDF page
metadata retains `text`, `ocr`, `blank`; page headings and OCR/blank annotations remain in text.
No confidence is invented. OCR warns `ocr-confidence-unavailable`; PDF/DOCX warn about lost layout.
DOCX excludes images/external resources and exposes the presence of converter warnings through
`converter-warnings`, without raw messages. XLSX keeps cached values, does not evaluate formulas,
and makes original row locations unavailable explicitly. Sources remain partial and absence of
an entity or relationship never proves its nonexistence. All warnings and page metadata enter
both the prompt and result. Blank-only PDF and empty/undecodable inputs fail before generation.

## Request and result

Schema `archi_document_candidates_v1` is a closed JSON object with version 1 and `candidates`.
The runtime exports its frozen JSON Schema. Each candidate uses the existing KPB-A table and row
columns, `explicit`/`inferred`, evidence and nullable reasoning. Inferred requires nonblank reasoning;
explicit requires null. Reasoning is inference, never a source quote. Temporary entity `row.id` keys
are unique and references must resolve inside this candidate set. The system message describes the
operation; the separately serialized user message is untrusted source data. Documents cannot change
models, limits, sources, operations or request count. Existing provider structured-output mappings
are used; local validation keeps all constraints removed by a provider's wire projection.

Evidence must include source ID and the two bundle digests, exact nonblank excerpt and zero-based
UTF-16 start/end offsets (end exclusive) in normalized text. Code checks the source/digests and
literal slice equality, then derives one-based start/end lines from the same frozen text. No fuzzy
matching or repair is used. Code assigns final entity IDs from table/semantic row content, remaps
relationship/alias/rule references, and assigns candidate IDs from semantic rows, basis, reasoning
and sorted evidence. Full candidate IDs and result digests use deterministic SHA-256. Entity IDs
use `e-` plus 62 hex digits to preserve the existing 64-character pack identifier limit; repeated
IDs are blocking, with no first/last-wins rule. Candidate/evidence/source permutations and temporary
key renaming cannot change identity. Text normalization does not normalize row values or merge facts. Row values changed by the
pack parser’s trim pass, including whitespace-only required fields, are rejected.

The KPB-A envelope, representability/collision checks, existing table row/duplicate validators and
loader cross-file checks validate proposals without rendering Markdown or accepting knowledge.
The K1 snapshot additionally checks recognizable conflicts and ambiguous aliases. Empty and
actor-only candidate sets are supported; they are partial proposals, not five-file packs. Invalid
rows, references, duplicate keys/rows/evidence, normalized name/alias collisions, forbid/relationship
and forbid/require conflicts fail the entire operation. Nothing is silently dropped.

Success returns a frozen `DocumentCandidateResult` with bundle, candidates, digest,
`knowledgeCoverage: partial` and `semanticAcceptance: requires-user-review`. Every candidate is
`decision: pending` and interoperates with KPB-A after K3 records an explicit user decision.
Presence of a real quote, schema validity and resolvable references do **not** establish semantic
truth or that the quoted passage supports a particular architectural interpretation. OCR is not
confirmed knowledge. This is not automatic acceptance or a benchmark of real-model quality.

Failures expose only closed stage/code and logical request count, never source text, paths, prompts,
responses, keys or raw provider errors. Typical codes: `invalid-document-input`, `not-a-file`,
`input-too-large`, `empty-source`, `unreadable-source`, `read-failed`, converter codes, `text-too-large`, `bundle-too-large`,
`request-too-large`, configuration/transport codes, `response-too-large`, `invalid-candidate-schema`,
`invalid-inference`, `evidence-source-mismatch`, `evidence-location-mismatch`, `invalid-entity-reference`,
`duplicate-entity-key`, `duplicate-entity`, `duplicate-candidate`, `duplicate-evidence`,
`candidate-semantic-conflict`, `candidate-limit`, `cancelled`, `timeout`, `cleanup-failed`.

## Limits and cancellation

One immutable policy is exported as `documentCandidateLimits`:

| Boundary | Limit |
| --- | --- |
| Documents | 8 |
| Single input / total captured input | 10 MiB / 20 MiB |
| Normalized text per source | 64 KiB UTF-8 |
| Complete serialized bundle | 160 KiB UTF-8 |
| Prepared structured request, including messages and schema | 256 KiB UTF-8 |
| Generation token budget | 8192 (a token ceiling, not a byte/token conversion) |
| Raw transport response before parsing | 1 MiB; existing strict content parser additionally limits content to 262144 UTF-16 units |
| Serialized parsed response | 1 MiB UTF-8 |
| All candidates / aliases / relationships | 128 / 32 / 64 |
| Evidence per candidate / total evidence | 4 / 512 |
| Wire row fields / reasoning / excerpt | 512 UTF-16 units; existing pack limits further constrain IDs to 64 and names to 256 Unicode characters |
| Source ID | 80 UTF-16 units |
| Operation work deadline | 360 seconds |
| Per-source read / conversion / OCR | 30 / 120 / 300 seconds, capped by remaining operation time |
| Generation / validation | 120 / 10 seconds, capped by remaining operation time |

These are conservative relative to the existing 512 KiB transport request ceiling, 16384-token
structured port, CL1 50 MiB/8 MiB/120s and UX2 300s/20-page OCR ceilings. No CL1/UX2 limits increase.
The existing converter resource/page/archive limits remain in force. No truncation, splitting,
additional generation, retry, repair, fallback or reviewer call occurs in production.
Input/conversion/budget blocks cause **0** logical calls and **0** generation exchanges. A valid
controlled operation causes **1** logical StructuredChat call and **1** transport generation attempt.
Invalid responses still have one call, with no repair. The result reports logical counts; transport
attempts are counted independently in controlled HTTP/provider-seam tests. An already-cancelled
operation has zero calls. A network connection failure may occur before a server receives a request.

`AbortSignal` is propagated through read checkpoints, temporary writes, converter/OCR workers,
existing transport and local validation. Stage/operation deadlines abort the same active signal,
not a detached Promise.race. Ordinary conversion awaits worker termination; the OCR parent awaits
child closure. Validation yields between candidates so cancellation can run, with bounded schema
and hashing work between checks. The work deadline is followed by awaited worker/child closure and resource cleanup; it is not a
promise that cleanup finishes at exactly that millisecond. Operation timeout can only be lowered via `timeoutMs`; configured
provider timeout can end generation earlier. Fail/Cancel returns no candidates and cleans only this
operation's directory. No pack files or settings are read or written by the operation.

K3 handoff: call this runtime entry, display pending proposals and normalized evidence/limitations,
collect explicit decisions/edits, then revalidate with KPB-A before K3 implements its separately authorized safe five-file
transaction. KPB-A currently renders/validates in memory; K2 supplies no accepted-pack writer.
K2 does not provide write authorization, change `knowledgePackPath`, or initialize trusted knowledge.

## K3 integration

K3 reuses this production extraction operation and frozen `result.bundle.sources[].text`.
The request's `generator` also accepts an async selection callback returning the existing
`GeneratorConfig` or `undefined` (Cancel). It runs only after bounded read/conversion and
bundle/request validation; static configurations remain compatible. Cancel or invalid input
makes no generation request. This callback is a host interaction within the operation's
existing deadline, not another extraction or retry.

`KnowledgePackReviewSession` maps candidates to the existing KPB-A reviewed draft. Immutable
entity and candidate IDs stay stable through row edits; references remain valid identity keys.
Evidence is rechecked against frozen K2 text, never the original file. Row edits preserve basis,
reasoning, evidence and conversion/OCR limitations, with a separate user-edit flag. Accepted
provenance persists inside the same five Markdown files and survives the production loader/K1
snapshot. See [K3 review and save](knowledge-pack-review.md) for user flow and transaction limits.

The optional generator resolver receives the extraction AbortSignal. Cancel or deadline ends
waiting even if a credential/model callback has not returned; a late result cannot construct a
provider client or generate. K3 also forwards cancellation to model listing and its picker.

## UX4-FU1 input/location clarification

The request also accepts explicit `editor-buffer` MD/TXT inputs (`uri`, `type`, `content`). The host captures before yielding; runtime clones inputs before asynchronous work. Source scope and editor URI survive local provenance/save; the URI is omitted from the model message. Original digest hashes captured UTF-8 bytes; text digest hashes the existing normalized text. No disk read or temporary source identity is used for buffers.

Each model input source additionally provides deterministic `evidenceSlices` (nonblank lines, split at the excerpt ceiling without splitting surrogate pairs). These are request annotations, not a changed frozen bundle or evidence verifier. The model must copy a full slice and offsets; validation still rejects any nonliteral location. Provider selection has its own stage under the operation deadline; generation's unchanged 120s budget begins after selection returns. Optional `onStage` emits closed stage names to host progress.


PDF coverage keeps the original page numbers. Full routes non-white rendered content without
extractable text to local OCR in auto and all, including vector outlines. Raster `imageCount`
is not text detection. `ocrText` records `recognized` or `empty` after recognition; empty OCR
is uncertain content, not a confirmed blank page. `blankAssessment: rendered-white` records an
exactly white render at the bounded conversion resolution and carries `rendered-blank-not-proof`.
`ocr-no-text-recognized` warns about pages with empty recognition. These optional measurements
survive document provenance and review reports. Core has no rendering/OCR backend and retains
`requires-ocr` for pages without accessible text. No mode claims perfect PDF classification.
