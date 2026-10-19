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
| D1 | LLM-first final PlantUML path with shared structural validation and diagram-type selection | completed and verified | Sequence pipeline stays the compatibility path and regression oracle. | Grounding core |
| D2 | Profile `component` | planned | | D1 |
| C1 | VS Code Chat Participant `@archi-agent` and `/diagram` | planned | Active file, selection, explicitly indicated file or text sent to the participant; only its own conversation history; existing `generateDiagram()` and configured provider; grounding, validation and one generation call. No automatic access to other chat histories or panels; agent integration through MCP stays in K4. | D2 |
| D3 | Profile `c4-context` | planned | | D1 |
| D4 | Profile `c4-container` | planned | | D1 |
| D5 | Profile `archimate-hld` | planned | | D1 |
| K1 | Provider-neutral architecture catalog contract | partial | The runtime source union has one kind (`local-directory`) and the `KnowledgePackSource` port reads the five Markdown pack files; no source-independent catalog contract exists yet. | Phase 2 runtime contract |
| K2 | Knowledge Pack Builder stages B2 and B3 | planned | Approved stage B decisions unchanged. The model only proposes candidates; the final Markdown always comes from the deterministic renderer. | Stage A, B1 |
| K3 | Knowledge Pack Builder stage C: runtime API, source adapters, review UI, atomic write of the five files | planned | | K1, K2 |
| K4 | MCP knowledge source | planned | MCP client in the node layer; the extension makes deterministic tool calls (the LLM does not drive tools); results are mapped to the architecture catalog; demonstration MCP server with Space Mission data. No MCP code exists. See [Source architecture](product-roadmap.md). | K1 |
| Demo | AI SDLC demo and release | planned | Archi Agent branding, description of the agentic workflow, demo scenario, comparison of local and cloud models, VSIX checkpoint with owner smoke test. | Preceding steps |

## Later

The order of the items below is not a commitment.

| Item | Status | Depends on |
| --- | --- | --- |
| Semantic review | deferred | Deterministic validation, LLM-first path |
| Controlled, bounded repair | deferred | Deterministic validation, semantic review |
| Quality modes `economy`, `balanced`, `quality` | deferred | `economy`: deterministic validation; `balanced`: semantic review; `quality`: semantic review and repair |
| Document sources (Markdown, plain text, PDF, DOCX; Confluence and Jira preferably through MCP) as a separate path | planned | Evidence classes kept distinct from architecture sources; K4 for MCP-backed sources |
| EA XML export as an architecture source, from a local file | deferred | No safe, public fixture that represents real EA data; no EA or XML parsing code exists. K1, safe synthetic EA fixture |
| Further architecture sources: reduced JSON catalog, EA API, Prolaborate | planned | K1 |
| External artifact providers: HTTPS, then Google Drive, OneDrive, SharePoint | planned | Local-file architecture source |

---

## Constraints

Grounding stays deterministic and local; only minimal context reaches a model. Untrusted output
is validated. New providers, sources, diagrams, retry/repair/fallback and extra calls need approved
scope. No functionality is imported from later main by this documentation cleanup.
