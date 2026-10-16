# SRC1 — local Structurizr architecture source

Approved implementation scope, including the owner's corrections. SRC1 adds a source;
verification against an existing diagram remains VER1. No model writes, DSL, remote source,
EA, MCP, retry, repair, fallback or Core/Full packaging.

## Configuration

`archiAgent.architectureSource` is an optional resource-scoped, Workspace Trust restricted object:

```json
{"kind":"structurizr-json","sourceId":"big-bank","modelPath":"/project/architecture/workspace.json","overlayPath":"/project/architecture/overlay"}
```

Explicit null masks inherited Structurizr settings when K3 activates a standalone pack.
Without it, the existing `archiAgent.knowledgePackPath` and five-file pack work unchanged.
Runtime accepts the same object in `request.knowledgePack`. Paths are absolute, local and
link-free; sourceId is logical, matches `^[a-z][a-z0-9-]{0,55}$`, and is independent of paths.

## Model and identity

People become actors/person; software systems and containers become systems/system.
Container canonical names use **parent name + ` / ` + original container name**. Original
names, original IDs, types and parent IDs remain in provenance. Element ID is `sz-` followed
by the first 60 hex characters of SHA-256 of canonical JSON
`["structurizr-json", sourceId, "element", originalId]`; detected collisions are errors.
Rename of an element or its parent never changes element ID or overlay binding.
Names/descriptions are not invented. Required missing values fail before LLM.

Components, their incident relationships, deployment and views are outside the projection;
omission counts are explicit. Existing container relationships, including linkedRelationshipId,
are retained; hierarchy never invents a relationship. Unknown endpoints are errors, not omissions.

## Knowledge Pack Overlay v1

Three required Markdown files; aliases and rules may be empty tables. No systems/actors,
new relationships or model overrides. The standalone five-file format is unchanged.

- aliases.md: `alias | source_id | target_id`
- rules.md: `rule | source_id | from_id | to_id | reason`
- relationships.md: `source_id | relationship_id | from_id | to_id | interface_type | interface_name | mode`

All IDs in these tables are ORIGINAL Structurizr IDs. Every source_id must equal configured
sourceId. Relationship metadata binds its ID AND expected source/destination: changed endpoints
under a reused relationship ID fail before LLM. Duplicate/orphan bindings fail.

interface_type is required: REST_API, SOAP, EVENT, FILE, DB or INTERNAL. interface_name is
optional and never inferred. mode may be empty: explicit model interactionStyle Synchronous or
Asynchronous determines mode. If absent, overlay mode is required. If both exist, they must agree.
Technology, tags and visual styles never determine interface or mode.

## Snapshot, provenance and boundaries

Core parses/maps/validates without I/O. Node implements the existing KnowledgePackSource port
with explicit allowlists and bounded, cancellable reads. Runtime composes sources and freezes
one K1 snapshot. Host passes configuration and displays results. Each runtime operation reads
all four files once; generator, reviewer and saved original artifact share frozen data. The next
operation reads again, without cache or retry. This is not an atomic filesystem transaction.

Model fields and overlay fields have separate provenance, actual file/line and original IDs.
JSON locations use Microsoft jsonc-parser 3.3.1 (already present in the lock), strict syntax,
duplicate-key rejection and bounded depth/tokens. Fixture bytes are never reserialized.
File digests, provenance and omission counts participate in snapshot identity. Only the selected
context reaches the LLM; full JSON, deployment, views and absolute paths do not.

Limits: 1 MiB per file, JSON depth 64, 100000 tokens, 10000 elements/relationships, 100 issues;
existing selected diagram context limits remain. Invalid input uses zero model calls; successful
reviewed Sequence/Component uses two. Legacy sequence remains its separate compatibility path.
Existing rules/ambiguity/NEW semantics remain fail-closed. Source relationship presence and
user-stated relationships stay distinguishable. ART1 preserves the provenance allowlist.

## Fixture and acceptance

Official Big Bank: structurizr/structurizr commit da99caf2f2857e5373f7b58569152274f1725ba3,
structurizr-export/src/test/resources/big-bank-plc.json, unmodified with Apache-2.0 LICENSE.
Expected projection: 3 actors, 9 systems (including 5 containers), 18 static relationships;
6 components and 13 incident static relationships omitted. Deployment is omitted separately.
The overlay is explicitly synthetic test metadata, not upstream architectural evidence.
Sequence and Component acceptance flow: SPA -> Banking API -> Banking Database (8 -> 11 -> 18).

Required regressions: rename with stable ID (including parent), same container names in different
parents, removed targets, duplicate IDs/names/keys, metadata/endpoint/mode conflicts, reused
relationship IDs with changed source OR target, fresh next-operation reads, snapshot equality
across generator/reviewer/save, precise lines, cancellation/limits, old packs and K3 activation.
Full gates, packaged runtime outside repo, actual Extension Host/UI and independent read-only
review are required. Owner smoke DEFERRED; remote CI for SRC1 is NOT_RUN until separately run.
AUD-003–006 remain OPEN.

## Owner smoke — Big Bank

Install the locally verified VSIX (check the exact SHA-256 in project-state). Copy the complete
`test/fixtures/structurizr/big-bank-plc` folder outside the repository. Configure modelPath to
its workspace.json and overlayPath to its overlay directory, sourceId big-bank.
Choose a provider/model explicitly. Validate: 9 systems, 3 actors, 18 relationships, 6 components
omitted. Browse the qualified API Application and the separate model/overlay field references.
Create both Sequence and Component for `SPA calls Banking API. Banking API reads Banking Database.`
Inspect sourceProvenance and save the original pair. Change expected endpoint of relationship 45
in the overlay: validation must block before a model request. Restore it. Rename a container or
parent in a COPY of JSON: next operation sees a new name with unchanged element IDs and overlay
bindings. K3 Save and use should activate a new standalone pack and mask inherited Structurizr
with null in the chosen scope. Record OS/arch/VS Code/provider/model, VSIX hash and observations.
Synthetic transport gates establish integration, not live-model quality.
