# Archi Agent — Product Roadmap

## Current implemented product

The current branch includes OBS1 diagnostics, UX3 onboarding, K1 shared knowledge/provenance, K2 bounded document extraction, K3 user review/new-pack saving, ART1 controlled original diagram/report saving, DOC1 bilingual documentation, UX4 Configuration and its FU1/FU2 corrections. Sequence and Component are implemented. Local profiles are LM Studio/Ollama; cloud profiles are Anthropic/OpenAI/OpenRouter with SecretStorage keys. Offline conversion/OCR and PL/EN help are bundled. Knowledge Browser and active-buffer extraction are available; one model is selected explicitly with Apply/Discard.

The latest technical baseline is `6863a30`; its full automatic profile passed 294/294 and independent review found no open HIGH/MEDIUM. These are historical technical results for that exact candidate, reused only where source fingerprints and package bytes agree. Current documentation/help checks are recorded separately in [project state](project-state.md).

This branch is published with a draft PR to main. Independent architecture/code audit follows in a separate session; further functional work follows evaluation of that audit. PR merge and VSIX release require separate tasks. The earlier public alpha.4 download remains the UX2 release; a branch build with the same version is a different artifact.

## Known limits

- Native end-to-end evidence is Mac ARM; other bundled platform resources do not establish equivalent tested support.
- Knowledge saves create new folders only: no existing-pack merge/update, persistent review drafts, autosave or acceptance history.
- Diagram/editor results are held in Extension Host memory; ART1 saves the original frozen pair, not later manual edits.
- Saves use exclusive creation and conditional cleanup; no atomic multi-file publication, crash recovery or fsync guarantee.
- Local checks verify a renderer subset; graphical PlantUML preview requires separate support.
- Full live scanned-PDF knowledge build and model-selector keyboard automation remain unconfirmed by the earlier technical evidence. The original MD timeout was not reproduced.
- Help is PL/EN; most controls are English, without a persistent whole-application language switch.

## Backlog and approved direction

The owner's current direction is **SRC1 → VER1 → MCP1**. The clean-clone CI gate
has a local candidate; clean-clone validation is blocked by a missing declared asset in
the pinned canvas Windows ARM64 package. Linux x64 and macOS ARM64 GitHub jobs remain
unconfirmed until actual runs. SRC1 entry remains OPEN. AUD-001/002 are closed in the local reviewed fix;
AUD-003–006 remain OPEN. This does not establish M1 or release readiness.
Earlier audit/PR and technical evidence above is historical; publication and validation
of both CI jobs require a separate task.

| Step | Status / scope |
| --- | --- |
| CI | Local candidate; clean-clone gate FAIL before full tests/package due to missing canvas Windows ARM64 icudtl.dat. Both GitHub jobs NOT_RUN; gate not closed. |
| SRC1 → VER1 → MCP1 | Active approved order; separate implementation tasks. No stage is implemented by this CI task. |
| M1 | Historical MCP milestone; not resumed or declared ready. Active MCP work follows SRC1 and VER1 as MCP1. |
| C1 | Deferred VS Code Chat participant; no current Chat integration or authorization to resume. |
| D3 / D4 / D5 | Planned C4 Context, C4 Container and ArchiMate HLD with type-specific plans/validators/renderers; no current UI option. |
| Knowledge updates | Existing-pack update/merge, additional sources and richer retrieval require separate approved scope. |
| EA / external documents | EA XML remains deferred without a safe fixture. EA API, Prolaborate and external artifact providers remain future direction. |
| Quality modes | Retry, repair, fallback or extra model calls require an explicit approved task. |
| REL | Broader demo/branding/provider comparison/release preparation remains separate. Root package codename is preserved. |

The product remains a grounded architecture assistant with local deterministic names, aliases, explicit ambiguity resolution, confirmed NEW elements, provenance and partial coverage. Missing source relationships do not prove nonexistence. Runtime remains host-neutral and the installed VSIX self-contained. KISS/BUZI and ADR 0002 remain binding; the documentation task does not change architecture or request budgets.

[Historical roadmap, milestones and detailed future scope](product-roadmap-history.md) preserve the previous record. Historical “next” sections are not active implementation instructions. Every new functional increment still requires approved scope under [development workflow](development-workflow.md).
