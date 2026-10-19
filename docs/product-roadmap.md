# Archi Agent — Product Roadmap

## Implemented product

Archi Agent verifies Sequence PlantUML deterministically and prose with one interpretation
request. It generates reviewed Sequence, Component, C4 Context and C4 Container diagrams.
Local Markdown Knowledge Packs, Structurizr JSON + overlay and a deterministic MCP knowledge
client supply canonical names, aliases, explicit ambiguity/NEW decisions and provenance.
Document conversion, offline OCR in Full, candidate review/new-pack saving, original diagram/report
saving, Knowledge Browser and PL/EN Help are implemented. VS Code, CLI and the four-tool MCP
function server share one runtime. Local model profiles are LM Studio/Ollama; cloud profiles
are Anthropic/OpenAI/OpenRouter.

Distribution: [demonstration prerelease v0.3.0-alpha.7-demo.1](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1),
with Core (recommended), Full (offline PL/EN OCR), CLI and two prepared project ZIPs.
Main and release packages have distinct source identities. Exact evidence and unresolved issues
belong in [project state](project-state.md), not in product descriptions.

## Enterprise Architecture / Architektura korporacyjna

This is the next planned diagram group. It begins with a small separate business catalog,
not a universal metamodel or a capability encoded as a software system.
[EA1 plan](plans/ea1-capability-map.md) is ready for review; implementation requires a separate task.

| Order | View | Scope and dependencies |
| --- | --- | --- |
| EA1 | Capability Map | Local versioned enterprise.json; business capability IDs, L1–L3 hierarchy, provenance and optional explicit-scale assessments; deterministic projection, zero LLM; existing Create Diagram and ART1 |
| EA1b | CLI/MCP and MCP knowledge source | Explicit enterprise contract/version discovery; retain existing knowledge v1 servers and functions; no invented capabilities when enterprise data is missing |
| EA2 | Capability–Application Map | Explicit application IDs and capability support mappings with provenance and coverage; builds on the capability catalog |
| EA3 | Value Stream | Explicit ordered stages, delivered value and capability mappings; no inferred process order |
| EA4 | Application Landscape | Application portfolio, ownership/domains and optional explicit assessments; depends on the application contract |

## Other planned and deferred work

The order below is not a commitment and does not authorize implementation.

| Area | Direction / boundary |
| --- | --- |
| Existing knowledge | Controlled existing-pack update/merge, persistent review drafts and richer retrieval need separate scope; current saves create new packs only |
| Architecture sources | Additional API/database/EA/Prolaborate adapters behind validated source contracts; Enterprise Architect XML remains deferred until a safe representative fixture exists |
| Document sources | Requirements/context remain distinct from canonical architecture; selected Confluence/Jira content through adapters is future work |
| External artifacts | HTTPS, Google Drive, OneDrive and SharePoint are future artifact access, separate from parsing architecture or interpreting documents |
| ArchiMate HLD | Planned small supported subset, with explicit concepts/relationships and no external includes; not complete language support |
| VS Code Chat | Deferred participant integration; current MCP support does not imply a Chat participant |
| Quality policies | Additional review modes, bounded repair, retry/fallback and extra model calls need explicit approval; no economy/balanced/quality setting exists |
| Other views | Broader user-edited PlantUML validation and knowledge visualisation remain future work; Verify Flow currently covers Sequence/prose only. ST1 remains an unscoped backlog item |
| Distribution | Marketplace/stable production release, wider native-platform validation and broader branding/provider comparison need separate acceptance; root package codename remains unchanged |

## Product constraints

Grounding remains local and deterministic. Source-confirmed facts stay distinct from user-stated
facts; missing relationships do not prove nonexistence. Only minimal selected evidence reaches
a model. Untrusted results pass strict local validation. The four reviewed generation paths keep
their two-call success budget; no retry/repair/fallback is implicit. EA1 proposes a separate
zero-LLM projection. Core/runtime remain independent of VS Code and installed VSIX self-contained.

Results and review sessions are in memory until saved. New-pack and ART1 saves use exclusive
creation and conditional cleanup, with no atomic multi-file publication or crash recovery.
Graphical PlantUML support is separate. Full supports pinned offline OCR, with known vector-page
limitations recorded in project state. Help is PL/EN; a persistent whole-application language
switch remains outside implemented scope. Native E2E evidence is strongest on macOS ARM64;
packaged resources alone do not establish equivalent execution elsewhere.

[Technical architecture](architecture.md) · [Architecture decisions](adr/0002-deterministic-diagram-plan-renderers.md)
· [Development workflow](development-workflow.md).
