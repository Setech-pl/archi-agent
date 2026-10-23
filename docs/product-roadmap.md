# Archi Agent — Product Roadmap

## Available

The branch implements reviewed Sequence and Component, local document conversion/offline OCR,
Knowledge Pack onboarding, extraction/review/new-folder saving, ART1 original-pair saving,
Configuration, Knowledge Browser and PL/EN Help. It also implements Structurizr JSON + overlay,
VER1 Sequence/prose, C4 Context/Container, CLI/function MCP and one deterministic MCP knowledge source.

Distribution and quality limits: [project state](project-state.md). Public release packages have
their own source identity; a published package is not a production-readiness claim.

## Enterprise Architecture and approved order

EA1/EA1b add deterministic Capability Map from a separate local enterprise catalog or MCP source,
available in VS Code, CLI and the function MCP server with zero LLM calls. The integration candidate
preserves software knowledge v1. EAU1 adds captured active JSON; EAK1 adds reviewed enterprise catalog creation from selected documents or a company description, followed by the deterministic map. The combined scope has passed local acceptance and independent review; owner smoke remains deferred. Public DEMO1 packages do not contain this addition.
[Catalog contract](enterprise-catalog.md) · [Tutorial EN](en/capability-map.md) / [PL](pl/capability-map.md).

| Order | Stage | Status / boundary |
| --- | --- | --- |
| 1 | EA1/EA1b integration | Integration base; no release publication |
| 2 | EAU1 + EAK1 | Local acceptance and independent review complete; owner smoke deferred |
| 3 | AUD-003/004 fixes | Local AUD-FIX2 fixes and acceptance complete; owner smoke deferred; no publication |
| 4 | EAK2 catalog updates | Implemented local candidate; native UI acceptance blocked; no functional checkpoint yet |
| 5 | EA2 Capability–Application Map | Implemented local candidate with explicit application IDs/support/provenance/coverage; shared acceptance pending native UI |
| 6 | EA3 Value Stream | Implemented candidate: explicit ordered stages, context/outcomes, capability mappings and reviewed updates |
| 7 | EA4 Application Landscape | Implemented candidate: shared application identities, domains, optional owner/lifecycle, explicit scale ratings |

The order is approved; the current EA3/EA4 release brief authorizes completion and prerelease publication.

## Considered / deferred

- Existing software-pack update/merge, persistent review drafts and richer retrieval.
- Further source adapters; EA XML remains deferred until a safe representative fixture exists.
- External documents/artifacts, API/EA/Prolaborate integrations, and ArchiMate HLD.
- VS Code Chat participant, broader branding and Marketplace/stable distribution.
- Retry, repair, fallback and extra model calls require explicit scope.

Grounding remains local and deterministic; absent relationships are unknown. Source-confirmed
facts remain distinct from user-stated facts. Core/runtime stay host-neutral, and VSIX self-contained.
New-pack and ART1 saves use exclusive creation/conditional cleanup, without atomic multi-file
publication or crash recovery. See [architecture](architecture.md) and [workflow](development-workflow.md).
