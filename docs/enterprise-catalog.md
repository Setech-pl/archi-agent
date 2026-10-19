# Enterprise catalog — EA1

EA1 is a local VS Code candidate. Published DEMO1 packages do not contain Capability Map.
[Tutorial EN](en/capability-map.md) · [Tutorial PL](pl/capability-map.md) · [Reviewed plan](plans/ea1-capability-map.md).
Capabilities are business abilities, independent of systems, actors and containers. No technical
relationships or model inference are created. CLI and MCP enterprise support belongs to EA1b.

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
