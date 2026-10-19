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

| Order | Item | Status | Notes | Depends on |
| --- | --- | --- | --- | --- |
| P2 | Cloud model providers: Anthropic, OpenAI, OpenRouter | implemented | HTTPS only with production-boundary transport tests, fixed host/path allowlist, strictly validated API keys in VS Code `SecretStorage`, capability-filtered bounded model listing, strict cloud finish contracts, one generation call, no retry/repair/fallback. | P1 |
| D1 | Experimental final-PlantUML ledger path | automatically verified; owner smoke failed | Archived on `checkpoint/d1-ledger-pipeline`; not the target architecture. | Grounding core |
| R1 | Reviewed-pipeline architecture and governance | completed | ADR, target contract, KISS/BUZI and branch handoff. | D1 findings |
| D1.1 | Reviewed sequence pipeline | implemented and automatically verified | Generator `{ plantUml }`, local facts and validation, independent reviewer; S1 pending. | R1 |
| S1 | Owner smoke Ollama `qwen3:30b` | planned | Must PASS before D2. | D1.1 |
| D2 | Profile `component` | planned | | S1 |
| C1 | VS Code Chat Participant `@archi-agent` and `/diagram` | planned | Uses the reviewed path and only its own conversation history; no automatic access to other chat histories or panels. | D2 |
| M1 | ArchitectureSnapshot and deterministic MCP adapter | planned | Extends D1.1's minimal Knowledge Pack snapshot boundary; MCP tools are called by the orchestrator, never autonomously by LLM. | C1 |
| D3/D4 | Profiles `c4-context` and `c4-container` | planned | | M1 |
| D5 | Profile `archimate-hld` | planned | | D3/D4 |
| K2 | Knowledge Pack Builder extraction and evidence verifier | planned | Approved stage B decisions unchanged; model proposes candidates, deterministic renderer writes final Markdown. | D5, stage A/B1 |
| K3 | Knowledge Pack Builder UI and five-file write | planned | Runtime integration, review UI and atomic output. | K2 |
| REL | `v0.3.0-alpha.1` | planned | Demo, branding, provider comparison and owner-accepted VSIX. | K3 |

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
