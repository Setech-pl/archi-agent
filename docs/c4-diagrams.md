# D3 / D4 — C4 source-bound diagrams

Implementation contract approved by the owner's VER1/D3/D4 instruction. Active order:
SRC1 (local checkpoint) → VER1 → D3 → D4 → MCP1. ADR 0002 remains binding.

## Sources and selection

The first supported source is local Structurizr JSON plus the SRC1 overlay. K1 records retain
optional source architecture metadata: person/software-system/container, container parent ID,
and technology only when explicitly present. Metadata and field provenance participate in the
knowledge digest. This extends the source projection, not the five-file Markdown format.
Standalone packs have no reliable C4 hierarchy/type distinction and return
`c4-hierarchy-unavailable` before model requests. Neither names nor nesting of UI items infer it.

The existing Create Diagram command offers Context and Container. The user explicitly picks a
software system by canonical name and stable ID. Duplicate names never select a target implicitly.
The runtime also requires that ID, validates it against the newly loaded source, and captures one
immutable snapshot. Source changes between selection and generation invalidate selection.

## Context

`c4-context` has its own version-1 plan, snapshot domain/digest, validator, renderer and report.
The deterministic eligible slice is the selected software system and directly related people and
other software systems, using only actual relationships at that abstraction level. Containers,
components, deployment, views and relationships incident to excluded elements are reported as
omitted. No child relationship is rolled up to its parent. A system with no relationships can
produce an explicitly isolated view with a limitation; the model must not invent an environment.

## Container

`c4-container` has a separate version-1 plan, snapshot domain/digest, validator, renderer and
report. All imported direct containers of the selected parent are eligible inside one explicit
system boundary. Directly related people and other software systems are eligible outside.
Relationships are actual source relationships whose endpoints are eligible; no edge arises from
membership. Foreign containers and components are omitted, never collapsed to external systems.
No children gives `c4-containers-unavailable`, with zero model calls.

## Plans and safety

Each plan identifies the frozen subject, all eligible element IDs and actual relationship fact
IDs. The generator proposes source-bound semantics, never PlantUML, attributes, ownership or
new relationships. Local validation checks exact membership, uniqueness, boundary and source
rules. An empty relationship set is legal only when the selected slice has none. Both requests
receive the same snapshot and digest. Successful generation uses one plan call and one independent
semantic review call; invalid input uses zero, rejected plans one. No retry/repair/fallback.

Renderers use local PlantUML primitives with C4 Person / Software System / Container labels,
distinguished internal and external elements and a labelled System Boundary. No include, macro,
network, new dependency or C4 library is needed. Names, descriptions and technology come from the
source. Descriptions/technology are omitted when absent; no technical guesses. Escaping and output
limits are enforced locally. The graphical result is checked with a local PlantUML engine for
acceptance, independently of the product runtime.

Reports retain element, relationship and hierarchy evidence, omissions, isolated-view limits,
the selected parent and the type-specific snapshot digest. ART1 captures the original completed
diagram/report pair; later saving performs no source refresh or model calls. Existing Sequence and
Component and the VER1 Sequence/prose scope remain unchanged.

## Acceptance

Big Bank Context and Container, stable-ID rename, duplicate names, absent edges/children/hierarchy,
cancellation, generator/reviewer snapshot equality, source-only relations, original ART1 saves,
exact-VSIX packaged runtime, actual Extension Host and visible UI, graphical readability and
independent read-only review. Owner smoke DEFERRED; remote CI NOT_RUN. No MCP1/EA/DSL/ArchiMate,
Core/Full, publication or AUD-003–006 changes.
