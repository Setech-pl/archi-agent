# Archi Agent — Product Roadmap

## Available

The branch implements reviewed Sequence and Component, local document conversion/offline OCR,
Knowledge Pack onboarding, extraction/review/new-folder saving, ART1 original-pair saving,
Configuration, Knowledge Browser and PL/EN Help. Later SRC1/VER1/C4/MCP1 are absent here.

Distribution and quality limits: [project state](project-state.md). Public release packages have
their own source identity; a published package is not a production-readiness claim.

## Next

Keep this historical branch within its implemented scope. New source adapters and diagram profiles
require a separately approved increment; current main is not merged into this branch.

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
