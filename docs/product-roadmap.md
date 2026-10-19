# Archi Agent — Product Roadmap

This roadmap describes this branch only; Git and its implementation define available behavior.
Historical milestones are retained locally and in Git. Plans do not authorize implementation.

## Done

| Item | Status | Evidence |
| --- | --- | --- |
| Architecture Knowledge Pack (strict Markdown tables, loader, indexes) | implemented | `src/core/knowledge-pack`, `test/unit/knowledge-pack` |
| Deterministic grounding: identifiers, canonical names, aliases, controlled normalization, ambiguity detection and explicit resolution, `[NEW: ...]` | implemented | `src/core/grounding`, `test/core/grounding` |
| Minimal grounded context, source references, stable SHA-256 digest | implemented | `src/core/grounding`, `src/core/util/stable-digest.ts` |
| Sequence pipeline: strict model schema (required `async` / `isResponse`), normalization, grounding, relationship, interaction-mode and interface-name validation, deterministic PlantUML renderer, structural PlantUML check, grounding report | implemented | `src/core/pipeline`, `src/core/validation`, `src/core/render` |
| Safe artifact naming, versioning and writing (Node adapters, demo) | implemented | `src/core/output`, `src/node` |
| Local OpenAI-compatible model adapter (loopback, one request, no retry or repair), LM Studio and Ollama profiles | implemented | `src/core/llm/provider-profile.ts`, `src/node/llm`, `docs/local-model.md` |
| Offline Space Mission demo and LM Studio demo | implemented | `src/demo`, `docs/demo.md` |
| Phase 2 — self-contained VSIX foundation (`v0.2.0-alpha.1`): host-neutral runtime, one command, settings, esbuild bundles, VSIX packaging and content verification; automatic verification and owner smoke test PASS | implemented | `src/runtime`, `vscode-extension`, `docs/vscode-extension.md` |
| Knowledge Pack Builder — stage A: candidate and evidence model (explicit / inferred), reviewed draft validation, deterministic renderer of the five pack files, in-memory round trip through the regular loader | implemented | `src/core/knowledge-pack/builder`, `test/unit/knowledge-pack/builder` |

## Current

| Item | Status | Open parts | Depends on |
| --- | --- | --- | --- |
| B1 — neutral `StructuredChatClient` port and extraction of the local transport | implemented | Provider-neutral structured-chat request/result/client contracts in core; local OpenAI-compatible transport in the Node adapter; sequence behavior preserved through a thin generator layer. | Local OpenAI-compatible adapter |
| P1 — local provider profiles and editor selection | implemented | Immutable core profile registry; LM Studio and Ollama mapped to one OpenAI-compatible transport; machine-scoped profile/model selection with legacy LM Studio migration. | B1 |
| Phase 1 — cleanup | partial | Branding: the extension and README use Archi Agent; the root package (`archground`) and several docs still use the ArchGround codename. Public/private repository policy and final regression checkpoint not recorded. Branding is completed in the demo and release step. | — |

## Next

Ordered as agreed in [Product priority](product-roadmap.md).

| Item | Status | Notes | Depends on |
| --- | --- | --- | --- |
| P2 | implemented | Cloud providers Anthropic, OpenAI and OpenRouter. | P1 |
| D1 | historical experiment; owner smoke failed | Ledger path on `checkpoint/d1-ledger-pipeline`. | Grounding core |
| R1 | completed; superseded as active architecture | ADR 0001 and governance retained historically. | D1 |
| D1.1 | implemented and automatically verified; superseded as active path | Final PlantUML path on `checkpoint/d1-final-plantuml-reviewed`; S1 failed. | R1 |
| R2 | completed | ADR 0002 and documentation of DiagramPlan architecture. | D1.1 findings |
| D1.2 | completed | `sequence` Wire Plan v3, validator, deterministic renderer and independent reviewer. | R2 |
| S1 | PASS | Verified owner smoke with Ollama `qwen3:30b` on 2026-09-23. | D1.2 |
| UX1 | completed; owner smoke PASS on 2026-09-23 | QuickPick navigation and local PDF/DOCX/XLSX to untitled Markdown; no LLM or network. | S1 |
| D2 | completed; owner smoke PASS on 2026-09-28 | `component` plan, validator and renderer. | UX1 owner smoke |
| M1 | planned | Deterministic MCP adapter into ArchitectureSnapshot. | D2 |
| C1 | planned | VS Code Chat Participant `@archi-agent` and `/diagram`. | M1 |
| D3 | planned | `c4-context` plan, validator and renderer; no external includes. | C1 |
| D4 | planned | `c4-container` plan, validator and renderer; no external includes. | D3 |
| D5 | planned | `archimate-hld` plan, validator and renderer; no external includes. | D4 |
| K2 | planned | Knowledge Pack Builder extraction and evidence verifier. | D5 |
| K3 | planned | Knowledge Pack Builder UI and five-file write. | K2 |
| REL | planned | Broader release work and owner-accepted VSIX after K3; the v0.3.0-alpha.1 prerelease candidate is prepared earlier, after D2. | K3 |

## Later

The order of the items below is not a commitment.

| Item | Status | Depends on |
| --- | --- | --- |
| Additional semantic-review modes beyond mandatory D1.1 review | deferred | D1.1 |
| Controlled, bounded repair | deferred | Deterministic validation, semantic review |
| Quality modes `economy`, `balanced`, `quality` | deferred | `economy`: deterministic validation; `balanced`: semantic review; `quality`: semantic review and repair |
| Document sources (Markdown, plain text, PDF, DOCX; Confluence and Jira preferably through MCP) as a separate path | planned | Evidence classes kept distinct from architecture sources; M1 for MCP-backed sources |
| EA XML export as an architecture source, from a local file | deferred | No safe, public fixture that represents real EA data; no EA or XML parsing code exists. M1 source boundary and a safe synthetic EA fixture would be prerequisites. |
| Further architecture sources: reduced JSON catalog, EA API, Prolaborate | planned | M1 source boundary |
| External artifact providers: HTTPS, then Google Drive, OneDrive, SharePoint | planned | Local-file architecture source |

---

## Constraints

Grounding stays deterministic and local; only minimal context reaches a model. Untrusted output
is validated. New providers, sources, diagrams, retry/repair/fallback and extra calls need approved
scope. No functionality is imported from later main by this documentation cleanup.
