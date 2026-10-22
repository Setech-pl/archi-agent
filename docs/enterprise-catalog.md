# Enterprise catalog — EA1

EA1/EA1b are local VS Code/CLI/MCP candidates. Published DEMO1 packages do not contain Capability Map.
[Tutorial EN](en/capability-map.md) · [Tutorial PL](pl/capability-map.md) · [Reviewed plan](plans/ea1-capability-map.md).
Capabilities are business abilities, independent of systems, actors and containers. No technical
relationships or model inference are created. EA1b adds CLI, function MCP and an MCP knowledge source without changing software knowledge v1.

## File contract

One strict UTF-8 `enterprise.json` supplies `schemaVersion: 1`, `format: "archi-agent-enterprise/1"`,
`source`, `scales` and `capabilities`. Unknown fields and duplicate JSON keys are rejected.
The [complete synthetic Retail input](../examples/retail-checkout/architecture/enterprise.json)
is executable documentation; [schema and validation](../src/core/enterprise/enterprise-catalog.ts)
are the authoritative implementation.

| Field | Contract |
| --- | --- |
| `source` | `{id, name, scope: {id, description, coverage}}`; stable source ID |
| `coverage` | `complete`, `partial` or `not-provided`; completeness refers only to the declared scope |
| `capabilities[]` | `{id, name, description, parentId?, ratings?, provenance}` |
| `parentId` | Original capability ID in this catalog; absent = L1, parent = L2, grandparent = L3 |
| `ratings` | Optional map from explicit scale ID to one exact integer value in its levels; missing is unknown |
| `scales[]` | `{id, name, levels: [{value, label}], provenance}`; 2–7 strictly increasing distinct integer values 0–100 |
| `provenance[]` | `{sourceId, recordId, fields, reference?}`; 1–16 entries, 1–32 distinct field pointers per entry |
| `reference` | Existing source reference `{uri, version, fragment?}`; URI has no userinfo/query/hash, never fetched |

IDs match `[a-z][a-z0-9-]{0,63}`. Identity is `(source.id, capability.id)`, never derived from a name.
Renaming preserves bindings and changes the semantic digest. Duplicate names remain distinct IDs;
the report lists duplicate names and the scope picker shows IDs. Missing names, duplicate IDs,
missing/self parents, cycles and levels below L3 are errors, including in partial sources.

Provenance `sourceId` must match the declared source. Preserve the original `recordId`.
`fields` covers each supplied business field: `/name`, `/description`, optional `/parentId`,
and each `/ratings/<scaleId>`. Scale provenance covers `/name` and `/levels`.
The adapter separately adds exact JSON Pointers and physical lines for capabilities and scales,
plus a fingerprint of the read bytes. It does not invent external references or line locations.

`not-provided` requires zero capabilities and returns a missing-data outcome; an empty
partial/complete catalog returns empty scope. Neither produces a successful blank diagram.
The UI asks for an explicit local enterprise file; a software source is not converted into capabilities.
The selection is per operation, with no persistent enterprise source setting in EA1.

## Validation and limits

The existing bounded reader rejects symbolic links, path escapes, nonregular files, invalid UTF-8,
NUL and changes during a read. JSON limits: **1 MiB**, **100,000 tokens**, syntax nesting **64**.
Catalog limits: **1,000 capabilities**, hierarchy **3**, scales **8**, names/labels **160 Unicode
code points**, descriptions **2,000**, provenance record IDs **128**. Text is nonempty, trimmed,
NFC, without control/format/surrogate characters. Rendered labels reuse the existing conservative
PlantUML display policy: markup, directives, links, quotes and backslashes are rejected with a
field and actual source line. Descriptions stay in the report and are not executed or rendered.
Source reference lengths and URI schemes follow the existing source-reference schema.
Diagnostics return at most 100 issues plus the actual issue count. No LLM repair is attempted.

Views show the whole map or one L1 branch, with absolute L1, L1–L2 or L1–L3 detail.
Limits: **120 visible tiles**, **12 L1 roots**, **256 KiB PlantUML**, **1 MiB report**.
Exceeding a limit returns `map-too-large`; select a branch or lower detail explicitly and retry.
There is no truncation, auto aggregation or inferred maturity. Reads check a 10-second deadline;
generation checks a 30-second deadline and cancellation between stages and bounded read chunks.
These checks do not promise OS-level interruption of a blocked filesystem operation.

## Snapshot, rendering and report

Inspection validates a frozen snapshot. Generation reads one new snapshot and checks its catalog
digest against the selection; changed semantics returns `stale-source`. Save never refreshes data.
Record/provenance/field ordering is canonicalized by stable IDs and UTF-16 comparison.
`catalogDigest` is SHA-256 of canonical JSON `{domain:"archi-agent-enterprise-snapshot/1", catalog}`.
It includes all logical data and declared provenance, excluding adapter positions and raw-byte hashes.
`projectionDigest` hashes `{domain:"archi-agent-capability-map/1", catalogDigest, selection,
visibleRecords, excludedIdsWithReasons, rendererVersion:1}`; selection excludes expectedCatalogDigest.
View language, roots, detail and coloring affect this digest. `sourceBytesSha256` independently
identifies the exact UTF-8 bytes. Formatting/permutation changes fingerprints/positions but not semantics.

PlantUML uses only local nested rectangles, controlled aliases, a title and legend. Siblings and
roots sort by ID; tiles show their actual L1–L3 level, wrap long names, and contain no technical arrows.
Colors identify explicit scale levels in a fixed palette; values/labels appear on tiles and in the legend.
Missing ratings are gray with “No data”/“Brak danych”. No coloring uses neutral gray without an assessment.
Parent ratings are never inherited or computed from children. Tile size reflects layout only.
The closed render grammar is validated before success; no external include, resource or user macro exists.

The strict `archi-agent-capability-map-report` v1 declares deterministic projection, `modelCalls:0`,
passed deterministic validation, and semantic review `not-applicable`. It is not Verify Flow or model review.
It records the contract/source/scope/coverage, snapshot and digests, selected view, full source hierarchy,
visible records with original provenance/ratings and render lines, scale provenance, omitted IDs with
`outside-selected-scope` or `below-detail-level`, duplicate-name warnings and limitations.
Full hierarchy does not claim completeness beyond source coverage; omitted view data is not missing source data.

ART1 preserves its v1 envelope and existing exclusive writer. A separate strict capture retains the original
pair in memory; metadata has enterprise digests and no fabricated provider/model. Source paths are
project-relative or logical-name-only. Manual preview edits do not change the original saved bytes.
Cancel, registry lifetime, collision protection and conditional rollback follow
[ART1](diagram-artifact-save.md). Closing both previews/reloading loses the in-memory entry.
No atomic two-file publication or crash recovery guarantee is added.

## MCP source and parity — EA1b

The optional fixed tool get_enterprise_snapshot takes {sourceId,contractVersion:1}, returning strict
archi-agent-enterprise-snapshot/1: schemaVersion, source:{id,version}, snapshot:{id,digest}, catalog.
Source identity must match the requested ID and catalog.source.id. Source version hashes
{domain:"archi-agent-enterprise-source-version/1",catalog} in response order; snapshot digest reuses
EA1 canonical catalogDigest. Client verifies both plus enterprise-${digest}, then freezes once.
Client responseFingerprint hashes the full structuredContent (not JSON-RPC/text). Object keys use
UTF-16 order; response arrays keep order. Semantic snapshot sorts records/provenance/fields as EA1.
Raw byte hash is local only. Declared reference/version stays semantic, never excluded from parity.

The knowledge v1 protocol remains strict and unchanged. Discovery checks the exact enterprise tool,
with 16 pages/256 tools/1 MiB listing limits. No tool or unsupported version yields explicit unsupported,
no fallback. Catalog bounds remain 1 MiB/100000 tokens/depth 64; structured enterprise response is
2 MiB, complete knowledge reply 64 MiB, including escaped text copy. Each inspect/generation has
30 s total budget (local read 10 s), cancellation and confirmed transport closure. No retries.

Local report v1 is unchanged. MCP report v2 uses source.transport containing kind:mcp, sourceId,
sourceVersion,responseFingerprint,tool,contractVersion, and response JSON Pointer locators without
file/line. Original provenance/reference is retained in capabilities/scales. Snapshot/projection digests
and PlantUML are identical for the same semantic catalog and view across hosts; transport evidence
and ART1/meta identity may differ. ART1 keeps envelope v1 and original bytes with a remote-source
reference. CLI/function MCP return data and cannot write files automatically.

Complete executable configuration and user adapter instructions:
[EN](en/cli-mcp.md#capability-map-with-no-model--local-ea1b-candidate) /
[PL](pl/cli-mcp.md#capability-map-bez-modelu--lokalny-kandydat-ea1b).

## Captured editor text

The runtime also accepts the explicit in-memory `enterprise-text` input with a logical leaf name
and captured JSON text. It uses the same strict parser, catalog validation, snapshot, rendering
and report v1 contract. No file is created or read for this input. Its local evidence label is
`editor-buffer:<name>`; exact captured UTF-8 bytes determine sourceBytesSha256 and real buffer
positions determine locators. The report explicitly states this evidence is not disk content.
ART1 retains its v1 envelope and records an enterpriseCatalog reference with availability
`in-memory-input`, never an invented disk path. File and MCP behavior remain unchanged.
This path is not included in published DEMO1 packages.


## Reviewed catalog builder

The builder uses a separate strict candidate contract, not software architecture rows or extra enterprise/1 fields. [Candidate schema](../src/core/enterprise/enterprise-candidates.ts) and [runtime session](../src/runtime/enterprise-builder.ts) define two explicit modes: material extraction and a proposed company model. Per-field source support claims require exact captured-text evidence; inferred additions and hierarchy remain model proposals. Mechanical quote validation does not certify semantic relevance. User acceptance/edits are recorded separately and never promote them to original-source facts. IDs are assigned once per session and survive edits; parents/cycles/depth/collisions use production validation. No ratings/scales/owners/application mappings are inferred.

`enterprise.review.json` retains the bounded captured material, original fingerprints and editor version/selection locations or converted-text locations, original candidates/classification/evidence, current user decisions and edited fields, scope, warnings acknowledgment and approval time. Its digest is over the report without the digest field. Catalog provenance points to the real `urn:archi-agent:enterprise-review:<sessionId>`, with that digest as version and stable candidate ID as fragment/recordId. It attributes all supplied catalog business fields to the reviewed decision; it does not fabricate an external document reference or source line. Keep both files together to inspect that provenance. The catalog remains enterprise/1 compatible and declares partial coverage.

Only selected materials are prepared through the existing bounded converter (Core/Full policy unchanged), previewed and sent. One extraction call, up to 16,384 output tokens, 120 seconds total extraction/provider-selection budget, no retry/repair/fallback/chunk loop. Existing document bounds apply: 8 documents, 10 MiB each/20 MiB total bytes, 64 KiB text per source, 160 KiB bundle, 256 KiB request, 1 MiB response and 1,000 records. Exceeding a limit is an error, never truncation. Material preparation retains the existing bounded read/conversion/OCR stages and a 360-second total deadline. A truncated or invalid answer never becomes an accepted catalog. Existing provider configuration and secret storage are reused; potentially paid cloud extraction requires a separate explicit authorization.

The review workbench supports accept/reject/pending and name/description/parent edits. Rejecting a parent cannot silently reparent retained children; reject that subtree explicitly or move children yourself. Local conversion warnings are derived from the frozen material independently of the model, displayed in the warning section and retained as source-bound materialWarnings in the review report. Both local and model warnings require an explicit review acknowledgment. Pending decisions, unresolved warnings, empty catalogs and invalid accepted hierarchies block save. The shared exclusive writer creates only new `enterprise.json` and `enterprise.review.json`, conditionally cleans up owned files on failure, and verifies exact bytes with the production loader before `saved`. No multi-file atomic publication, crash recovery or existing-catalog merge is added. The saved catalog then enters the existing EA1 scope/detail/color path without another model call.

## Controlled catalog updates — EAK2

`Archi: Update Enterprise Catalog` selects a clean local catalog and captures its exact bytes,
semantic digest and source identity before material selection. It reuses the EAK1 bounded material
preview, provider configuration, converter and one-call extraction. The base catalog is not sent to
the model. Selection, whole active document, typed description and explicitly selected local documents
are supported. Captured materials never refresh silently. Source instructions remain untrusted data.

The native review loop shows a before/after diff and a separate decision/evidence preview. Additions,
name/description changes, parent changes, explicit ratings, no-op, conflicts and deletion proposals
have separate decisions. Each model candidate must be explicitly bound to an existing capability ID
or assigned a new ID. Names provide suggestions only; action tags never reserve legal IDs such as `new` or `reject`. Rename preserves ID. Omission never deletes
records. Reject a conflicting proposal explicitly; hierarchy, references, levels L1–L3 and duplicate
identities are validated with the production loader. Delete proposals show children and support links;
retained dependencies block save until separately removed or moved. No automatic cascade exists.

Unchanged fields retain their original provenance. Changed fields refer to the actual immutable update
review by `urn:archi-agent:enterprise-update:<sessionId>`, report digest and operation ID. The review
retains original captured evidence, model proposals and user decisions separately. It lives beside the
catalog under `enterprise-updates/<sessionId>/<revision>/enterprise.review.json`. Keep it with the
catalog. It is created exclusively before the native catalog save and may remain after cancellation,
conflict or failure; its existence alone does not prove that the catalog was saved. Catalog updates
preserve scales, ratings, applications, links and coverage unless a specific change is approved.

The host checks the captured document version, dirty flag, URI, exact text and current disk
fingerprint before editing, and disk bytes again before native save. A changed semantic base returns
`stale-source`; other concurrent changes return `conflict`. Save cancellation/failure is distinct from
`prepared` and `saved`. After native save the production loader and exact-byte checks validate both
the catalog and companion report. A later foreign edit prevents confirmed success; it is never rolled
back. Resolve changes outside this session, then start a new update. There is no automatic rebase,
filesystem compare-and-swap, multi-file transaction, durable draft or crash recovery. A successful proposal import disables further extraction in that session; imported warnings require a fresh acknowledgment. This operation
does not update legacy five-file software Knowledge Packs. CLI/function MCP never write catalogs.

## Applications and explicit support — enterprise/2

Enterprise/1 remains strict and readable/writable without migration. Extended catalogs explicitly use
`schemaVersion:2`, `format:"archi-agent-enterprise/2"`, retaining the v1 source/scales/capabilities and:

| Field | Contract |
| --- | --- |
| `applications[]` | `{id,name,description?,provenance}`; stable ID, safe name; at most 1,000 |
| `supports[]` | `{applicationId,capabilityId,provenance}`; exact existing endpoints; at most 4,000 |
| `supportScope` | `{description,applications,relationships}`; each coverage is complete/partial/not-provided |

Application and capability IDs have distinct namespaces; equal ID strings do not merge identities.
A support record is uniquely identified by its endpoint pair. Duplicate pairs/IDs, missing endpoints,
unknown fields and incomplete provenance fail validation. Application provenance covers `/name` and
optional `/description`; link provenance covers `/applicationId` and `/capabilityId`. Declared
`not-provided` requires the corresponding collection to be empty. No owners, technology, maturity,
lifecycle or recommendations are inferred. Coverage describes only the declared scope.

The update command offers Add application, Add explicit support and explicit deletion using native
QuickPick. Propose and accept an application, then choose its ID and a capability ID and approve that
link separately. Adding applications upgrades the reviewed copy to v2 with partial support coverage;
capability-only edits to v1 stay v1. Reading v1 invents no collections. A v2 update preserves all
supported collections. Canonical snapshots normalize application IDs, endpoint pairs and provenance;
digest domain `archi-agent-enterprise-snapshot/2` includes all logical v2 data and version semantics.
Capability Map retains its business meaning; v2 inputs use report formatVersion 3 with truthful v2
source identity, while v1 inputs keep existing local report v1 / MCP report v2.

## Capability–Application Map — EA2

Create Diagram, CLI and function MCP select `capability-application-map`. Rendering is deterministic,
uses zero model calls and requires no configured provider. A whole view shows all capabilities and
applications, including unlinked applications. A chosen capability/domain includes its descendants
when requested and only directly linked applications. No support is inherited by parents. CLI/MCP can
set `includeDescendants:false`. Identical labels include stable IDs. Limits are 120 total nodes,
240 explicit links, 256 KiB PlantUML and 1 MiB report: exceeding any bound requests a narrower scope,
without truncation. V1 or not-provided application/link information yields `support-data-unavailable`.

The strict `archi-agent-capability-application-map-report/1` records source identity, transport evidence,
snapshot/catalog/projection digests, selection, visible original records/provenance, render lines,
actual local JSON positions or MCP pointers, omitted records/reasons and separate support coverage.
Support counts mean documented direct links only. Zero links mean no documented support; partial
sources cannot prove absence of a system. Several apps do not prove redundancy, retirement or an
investment need. The safe closed renderer has generated aliases and no external includes. The original
diagram/report pair uses unchanged ART1 envelope v1 and exclusive writer. Preview edits never alter it.
[Synthetic v2 Retail example](../examples/retail-checkout/architecture/enterprise-applications.json).

## Explicit MCP version 2

`get_knowledge_snapshot` v1 and `get_enterprise_snapshot` v1 keep their strict contracts. The new fixed
`get_enterprise_snapshot_v2({sourceId,contractVersion:2})` returns
`archi-agent-enterprise-snapshot/2`, schemaVersion 2 and an enterprise/2 catalog. Source version uses
`archi-agent-enterprise-source-version/2`; all envelope/source/snapshot digests are verified.
Old tools reject v2 catalogs rather than silently removing application data. V2 rejects v1 catalogs;
use the v1 tool for them. Discovery and transport bounds, readRoots, cancellation and cleanup remain.

Enterprise source configuration may specify `contractVersion:2`; absent means v1. EA2 selects v2
before contacting MCP, never in response to an error. Missing tool or incompatible version is an
explicit error; there is no v1 fallback. The same choice exists in VS Code `enterpriseSource` and
config v2 `enterpriseSources`. Software source configuration and knowledge v1 are unchanged.

## Value Stream and Application Landscape — enterprise/3

Strict `schemaVersion:3`, `format:"archi-agent-enterprise/3"` extends enterprise/2 without migration.
Applications retain EA2 IDs and support links; optional fields are `domainId`, `owner`,
`lifecycle` (planned/active/retiring/retired) and `ratings` using existing explicitly defined scales.
`domains[]` contains stable `id`, `name`, `provenance`. Applications without a domain remain visible
in a whole-portfolio view. Unknown ratings differ from explicit zero. Domain membership and
multiple applications never imply redundancy, cost, risk or investment advice.

`valueStreams[]` contains `id`, `name`, explicit `context` (recipient or value context), optional
`outcome`, `stages[]` and provenance. A stage has stable stream-local `id`, `name`, optional
`outcome`, explicit `capabilityIds[]` and provenance. The array order is declared information;
capability IDs are references, never stage identities. Several capabilities may support a stage,
and capabilities may appear in several stages/streams. Stage order requires `/stages` provenance;
all supplied business fields require field coverage. Reference/duplicate/scale validation is strict.
`valueStreamScope:{description,streams,relationships}` and `landscapeScope:{description,domains,attributes}`
use complete/partial/not-provided. These declarations describe supplied knowledge, never universal absence.

Limits: 1 MiB input, 1,000 applications/capabilities/domains, 100 streams, 100 stages per stream,
4,000 explicit stage mappings. A view is limited to 120 nodes including domain groups, 240 edges,
256 KiB PlantUML and 1 MiB report. Exceeding bounds requires narrowing; nothing is silently clipped.
Canonical snapshots sort identity collections and capability sets, retaining declared stage order.

`generateValueStream` selects `streamId`, optional `stageIds` (empty means all), language and optional
expected catalog digest. Narrowed stages keep original ordinals; omitted stages never create new
adjacency. `generateApplicationLandscape` selects `domainIds`/`applicationIds` (empty means all),
`colorBy:{kind:"none"}` or `{kind:"rating",scaleId}`, language and optional expected digest.
Reports `archi-agent-value-stream-report/1` and `archi-agent-application-landscape-report/1` retain
records, provenance, source/transport evidence, actual JSON/MCP locators, scope, omissions and
snapshot/projection digests. Rendering uses safe generated aliases and zero LLM/provider calls.
ART1 saves the original pair. EA1 uses report formatVersion 4 for v3; EA2 uses report/2 for v3.
Earlier report contracts and v1/v2 catalogs remain supported.

The fixed `get_enterprise_snapshot_v3({sourceId,contractVersion:3})` returns strict
`archi-agent-enterprise-snapshot/3`. Source-version and semantic digests include all v3 information.
V1/v2 tools reject v3 catalogs rather than removing fields. New views explicitly select v3 before
transport; no fallback after errors. Config v2 accepts enterprise `contractVersion:3`; knowledge v1
is unchanged. No remote source writes.

The existing update review offers native guided domain/stream/application/scale forms, model proposals
from captured materials, before/after review, identity binding, explicit decisions and guarded save.
Order has a separate explicit confirmation. Model basis/evidence is retained separately from accepted
user operations in the companion report. Acceptance never manufactures a source quote. Defining a
scale requires 2–7 explicit ascending levels; no ratings are inferred. Updates retain untouched v3
collections/provenance; deletion blocks on unresolved references without cascades. Guarded save
preserves EOL, verifies document version and disk digest, then reloads exact saved bytes. This is not
filesystem CAS or an atomic multi-file transaction. Historical unexplained safe-conflict remains an
open LOW observation; no evidence of foreign-data loss or false saved status was found.
