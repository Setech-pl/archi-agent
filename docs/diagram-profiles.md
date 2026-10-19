# Diagram profiles

Choose a view by the question it answers and the source data available. The implemented
profiles are available in Create Diagram and through [CLI/MCP](en/cli-mcp.md).
[User guide EN](en/user-guide.md) · [Instrukcja PL](pl/user-guide.md).

| Profile | Purpose | Required data | Supported boundary |
| --- | --- | --- | --- |
| `sequence` | Interactions over time, sync/async requests and responses | Flow description; known elements, aliases, relevant relationships/rules; explicit ambiguity and NEW decisions | Ordered messages and supported fragments; no arbitrary PlantUML interpretation during generation |
| `component` | Major logical building blocks and directed dependencies | Flow naming the selected elements/dependencies; kinds, interface type/name/mode and provenance | Logical architecture, not classes, methods or deployment topology |
| `c4-context` | One software system, its users and neighbouring systems | Explicit software-system ID and current source digest; source hierarchy/types and confirmed relationships | People and directly connected software systems; no internal containers or inferred roll-ups |
| `c4-container` | Containers within one software system and their external environment | Same explicit system selection, parent IDs, container kinds, optional descriptions/technology and confirmed relationships | Labelled system boundary; source membership never invents an edge |

A five-file Markdown Knowledge Pack supports Sequence and Component. C4 needs explicit source
hierarchy: the local Structurizr JSON + overlay adapter supplies it; a knowledge MCP adapter
may supply the same metadata. Missing hierarchy returns a controlled missing-data result.
[Source contract](src1-structurizr-source.md) · [C4 contract](c4-diagrams.md).

## Common generation contract

The four profiles use a bounded selected snapshot, one type-specific semantic plan request,
local plan/evidence validation, deterministic rendering, one independent semantic review and
local verdict validation. Success uses two model calls; invalid input uses none; rejection
before review uses at most one. No retry, repair, fallback or additional call is implicit.
Each type has its own small contract and renderer; there is no universal diagram metamodel.
[Reviewed pipeline](reviewed-diagram-pipeline.md) · [ADR 0002](adr/0002-deterministic-diagram-plan-renderers.md).

Known elements keep canonical names. Aliases resolve input only. NEW elements need explicit
confirmation and remain visibly new. Reviewed Sequence currently rejects NEW endpoints; see
[the open limitation](project-state.md#otwarte-kwestie) before attempting that flow. Source-confirmed facts remain distinct from user-stated
facts, which require review confirmation. Missing relationships do not prove nonexistence;
explicit forbid rules still block. Generator/reviewer share the same frozen snapshot and digest;
full repositories and raw XML are never sent. Model answers remain untrusted.

The renderer controls safe aliases, escaped text and fixed syntax. Local checks validate the
supported PlantUML subset; official graphical rendering is separate. No remote includes or
macro downloads are required. A failed semantic review can offer a marked unverified candidate
only after local checks pass, with no verified report or completed ART1 artifact.

## Profile-specific checks

Sequence validates endpoint IDs, order, operation/request-response references, mode, evidence
and fragment structure. Its model-generated message fields `async` and `isResponse` are
required; both cannot be true. The separate compatibility Sequence API retains its one-call
model contract and report v1; it is never an automatic fallback or a template for other views.

Component uses its own selected dependency catalog. A source relationship's direction,
interface type/name and mode are inherited, not restated by the model. Shared interface nodes
represent a named REST/SOAP interface only under the validated multiple-consumer condition;
they are notation, not new architecture facts. DB/EVENT edges never invent stores or brokers.
[Component snapshot, plan and rendering](architecture.md#component-contract).

C4 validates the chosen parent, internal/external classification, eligible kinds, source-confirmed
edges and field provenance. It never guesses parents, rolls child relationships up to systems
or treats a technical container as a software system. Technology/description is displayed only
when provided. Scope omissions remain in the report. [C4 details](c4-diagrams.md).

## Planned views

`archimate-hld` remains planned. It needs an agreed small concept/relationship subset and
explicit source mappings before implementation; complete ArchiMate coverage is outside scope.

The planned **Enterprise Architecture / Architektura korporacyjna** group begins with
[Capability Map](plans/ea1-capability-map.md), a zero-LLM projection of a separate business
catalog. Capability–Application Map, Value Stream and Application Landscape follow their own
data requirements. They are not implemented by the four software diagram profiles above.
[Roadmap](product-roadmap.md).
