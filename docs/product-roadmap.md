# Archi Agent — Product Roadmap

## Available

The branch implements reviewed Sequence and Component, local document conversion/offline OCR,
Knowledge Pack onboarding, extraction/review/new-folder saving, ART1 original-pair saving,
Configuration, Knowledge Browser and PL/EN Help. It also implements Structurizr JSON + overlay,
VER1 Sequence/prose, C4 Context/Container, CLI/function MCP and one deterministic MCP knowledge source.

Distribution and quality limits: [project state](project-state.md). Public release packages have
their own source identity; a published package is not a production-readiness claim.

## Next

Enterprise Architecture begins with a separate business catalog and deterministic Capability Map.
EA1/EA1b are local work, not published by this cleanup. Further enterprise views need separate scope.

## Considered / deferred

- Existing-pack update/merge, persistent review drafts and richer retrieval.
- Further source adapters; EA XML remains deferred until a safe representative fixture exists.
- External documents/artifacts, API/EA/Prolaborate integrations, and ArchiMate HLD.
- VS Code Chat participant, broader branding and Marketplace/stable distribution.
- Retry, repair, fallback and extra model calls require explicit scope.

Grounding remains local and deterministic; absent relationships are unknown. Source-confirmed
facts remain distinct from user-stated facts. Core/runtime stay host-neutral, and VSIX self-contained.
New-pack and ART1 saves use exclusive creation/conditional cleanup, without atomic multi-file
publication or crash recovery. See [architecture](architecture.md) and [workflow](development-workflow.md).
