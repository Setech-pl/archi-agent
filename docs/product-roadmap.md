# Archi Agent — Product Roadmap

## Current implemented product

The current branch includes the locally verified SRC1 Structurizr JSON source with an ID-bound Markdown overlay, plus OBS1 diagnostics, UX3 onboarding, K1 shared knowledge/provenance, K2 bounded document extraction, K3 user review/new-pack saving, ART1 controlled original diagram/report saving, DOC1 bilingual documentation, UX4 Configuration and its FU1/FU2 corrections. Sequence, Component, C4 Context and C4 Container are implemented. VER1 verifies bounded Sequence PlantUML without LLM and prose with one interpretation call; alias decisions remain explicit. Local profiles are LM Studio/Ollama; cloud profiles are Anthropic/OpenAI/OpenRouter with SecretStorage keys. Offline conversion/OCR and PL/EN help are bundled. Knowledge Browser and active-buffer extraction are available; one model is selected explicitly with Apply/Discard.

The earlier UX4-FU2 baseline `6863a30` passed its 294/294 automatic profile and independent review; those results remain historical. SRC1 checkpoint `3e33a6a` and the current locally accepted VER1/D3/D4 candidate have separate evidence in [project state](project-state.md) and [verification](ver1-c4-verification.md).

The implemented product is available as a GitHub test prerelease: [downloads](https://github.com/Setech-pl/archi-agent/releases), [README](../README.md) and [PL/EN owner tests](testing/owner-smoke.md). AUD-001/002 fixes and clean-clone CI are integrated; publication status and exact validation evidence are maintained in [project state](project-state.md). The earlier public alpha.4 remains the UX2 artifact. Release publication does not establish M1 or production readiness; AUD-003–006 remain OPEN.

## Known limits

- Native end-to-end evidence is Mac ARM; other bundled platform resources do not establish equivalent tested support.
- Knowledge Pack saves create new folders only: no existing-pack merge/update, persistent review drafts, autosave or acceptance history. SRC1 overlay aliases have a separate controlled native-editor save path.
- Diagram/editor results are held in Extension Host memory; ART1 saves the original frozen pair, not later manual edits.
- Saves use exclusive creation and conditional cleanup; no atomic multi-file publication, crash recovery or fsync guarantee.
- Local checks verify a renderer subset; graphical PlantUML preview requires separate support.
- Full live scanned-PDF knowledge build and model-selector keyboard automation remain unconfirmed by the earlier technical evidence. The original MD timeout was not reproduced.
- Help is PL/EN; most controls are English, without a persistent whole-application language switch.

## Backlog and approved direction

The owner's current direction is **SRC1 → VER1 → D3 → D4 → MCP1**. The clean-clone CI gate
has a local checkpoint with clean-clone validation PASS on macOS ARM64 / Node 22.12.0.
The approved packaging repair supplies the missing Windows ARM64 ICU from the SRI-verified
Windows x64 canvas 0.1.97 tarball, retaining both lockfiles and all eight platforms.
Linux x64 and macOS ARM64 GitHub jobs passed for main `152542f35c839c06a9bd0eed05a8a7e8e2523752`
([run 38611666025](https://github.com/Setech-pl/archi-agent/actions/runs/38611666025)).
This satisfies the CI prerequisite for SRC1; it is not evidence for the SRC1 implementation.
SRC1 is locally implemented and verified under the [approved corrected contract](src1-structurizr-source.md); [verification](src1-verification.md) is separate from base CI and from the unchanged published alpha.6. VER1, D3 and D4 are implemented in the current local candidate; their passing local gates are recorded separately in [verification](ver1-c4-verification.md). MCP1 is implemented and locally verified; [MCP1 verification](mcp1-verification.md) records the exact candidate. Owner smoke remains DEFERRED; remote CI and Windows ARM64 runtime remain NOT_RUN.
AUD-001/002 remain closed; AUD-003–006 remain OPEN. Windows ARM64 runtime is NOT_RUN.
This does not establish M1 or production readiness.

| Step | Status / scope |
| --- | --- |
| CI | Local clean-clone PASS after the approved ICU packaging repair: 1824 root tests, 662 extension tests, package/verify 532 entries. GitHub Linux/macOS PASS for main 152542f (run 38611666025); Windows ARM64 runtime NOT_RUN. |
| SRC1 → VER1 → D3 → D4 → MCP1 | Active owner-approved order. SRC1, VER1, D3 and D4 locally accepted; MCP1 implemented and locally verified; owner smoke DEFERRED. |
| M1 | Historical MCP milestone; not resumed or declared ready. Active MCP work follows SRC1 and VER1 as MCP1. |
| C1 | Deferred VS Code Chat participant; no current Chat integration or authorization to resume. |
| D3 / D4 | C4 Context and Container in Create Diagram, source-bound local Structurizr hierarchy; see [contract](c4-diagrams.md). |
| D5 | ArchiMate HLD remains planned. |
| Knowledge updates | Existing-pack update/merge, additional sources and richer retrieval require separate approved scope. |
| EA / external documents | EA XML remains deferred without a safe fixture. EA API, Prolaborate and external artifact providers remain future direction. |
| Quality modes | Retry, repair, fallback or extra model calls require an explicit approved task. |
| REL | Broader demo/branding/provider comparison/release preparation remains separate. Root package codename is preserved. |

The product remains a grounded architecture assistant with local deterministic names, aliases, explicit ambiguity resolution, confirmed NEW elements, provenance and partial coverage. Missing source relationships do not prove nonexistence. Runtime remains host-neutral and the installed VSIX self-contained. KISS/BUZI and ADR 0002 remain binding; the documentation task does not change architecture or request budgets.

[Historical roadmap, milestones and detailed future scope](product-roadmap-history.md) preserve the previous record. Historical “next” sections are not active implementation instructions. Every new functional increment still requires approved scope under [development workflow](development-workflow.md).
