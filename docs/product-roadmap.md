# Archi Agent — Product Roadmap

## Available

The branch implements reviewed Sequence and Component, local document conversion/offline OCR,
Knowledge Pack onboarding, extraction/review/new-folder saving, ART1 original-pair saving,
Configuration, Knowledge Browser and PL/EN Help. It also implements Structurizr JSON + overlay,
VER1 Sequence/prose, C4 Context/Container, CLI/function MCP and one deterministic MCP knowledge source.

Distribution and quality limits: [project state](project-state.md). Public release packages have
their own source identity; a published package is not a production-readiness claim.

## Enterprise Architecture and approved order

EA1/EA1b provide deterministic Capability Map from a separate local enterprise catalog or MCP
source in VS Code, CLI and the function MCP server, with zero LLM calls. EAU1 captures active JSON;
EAK1 creates reviewed catalogs from materials or a company description. EAK2 updates a captured
catalog with explicit decisions and guarded saves. Software knowledge v1 remains compatible.
These features, EA2–EA4 and AUD-003/004 fixes are included in
[alpha.8](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.8).
The earlier DEMO1 packages retain their original scope and bytes.
[Catalog contract](enterprise-catalog.md) · [Tutorial EN](en/capability-map.md) / [PL](pl/capability-map.md).

| Order | Stage | Status / boundary |
| --- | --- | --- |
| 1 | EA1/EA1b integration | Published in alpha.8: local/MCP Capability Map across all three hosts |
| 2 | EAU1 + EAK1 | Published in alpha.8: captured active JSON and reviewed catalog creation |
| 3 | AUD-003/004 fixes | Published in alpha.8: confirmed NEW and vector-text PDF OCR fixes |
| 4 | EAK2 catalog updates | Published in alpha.8: frozen review and guarded native save |
| 5 | EA2 Capability–Application Map | Published in alpha.8: explicit application IDs/support/provenance/coverage |
| 6 | EA3 Value Stream | Published in alpha.8: ordered stages, context/outcomes and capability mappings |
| 7 | EA4 Application Landscape | Published in alpha.8: shared application identities, domains, owner/lifecycle and explicit ratings |

Publication used an explicit prerelease exception. It does not close deferred owner smoke,
historical visible-UI FAIL/NOT_RUN, safe-conflict LOW or unverified platform/live-model checks.
MAIN1 + STAB1 covers integration and stabilization only; EVAL1 and new features require a new task.
See [current handoff](project-state.md) and [authorized scope](plans/main1-stab1-brief.md).

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
