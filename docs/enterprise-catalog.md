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
