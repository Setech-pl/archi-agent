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
| Local OpenAI-compatible model adapter (loopback, one request, no retry or repair), LM Studio | implemented | `src/node/llm`, `docs/local-model.md` |
| Offline Space Mission demo and LM Studio demo | implemented | `src/demo`, `docs/demo.md` |

## Current

| Item | Status | Open parts | Depends on |
| --- | --- | --- | --- |
| Phase 1 — cleanup | partial | Branding: the extension and README use Archi Agent; the root package (`archground`) and several docs still use the ArchGround codename. Public/private repository policy and final regression checkpoint not recorded. | — |
| Phase 2 — self-contained VSIX (`v0.2.0-alpha.1`) | implemented | Foundation implemented and accepted: host-neutral runtime, one command, settings, esbuild bundles, VSIX packaging and content verification, tests. Automatic verification and the owner manual smoke test both PASS on the current HEAD. Artifact persistence, richer configuration UI and further provider profiles are later extensions, not gaps blocking this foundation checkpoint. | Phase 1 core |

## Next

| Item | Status | Notes | Depends on |
| --- | --- | --- | --- |
| Provider-neutral architecture-source contract | partial | The runtime source union has one kind (`local-directory`) and the `KnowledgePackSource` port reads the five Markdown pack files; no source-independent catalog contract exists yet. | Phase 2 runtime contract |
| EA XML export as the first additional architecture source, from a local file | planned | No EA or XML parsing code exists. Local file before HTTPS and cloud storage. | Provider-neutral contract |

## Later

The order of the diagram profiles below is the agreed order. The order of the other items is not a
commitment.

| Item | Status | Depends on |
| --- | --- | --- |
| LLM-first final PlantUML path | planned | Grounding core; sequence pipeline stays as compatibility path |
| Deterministic validation of LLM-generated PlantUML per profile | planned (sequence validation implemented) | LLM-first path |
| Profile `component` | planned | LLM-first path, profile validation |
| Profile `c4-context` | planned | LLM-first path, profile validation |
| Profile `c4-container` | planned | LLM-first path, profile validation |
| Profile `archimate-hld` | planned | LLM-first path, profile validation |
| Further architecture sources: reduced JSON catalog, EA API, Prolaborate | planned | Provider-neutral contract |
| External artifact providers: HTTPS, then Google Drive, OneDrive, SharePoint | planned | Local-file architecture source |
| Document sources (Markdown, plain text, PDF, DOCX, Confluence) as a separate path | planned | Evidence classes kept distinct from architecture sources |
| Semantic review | deferred | Deterministic validation, LLM-first path |
| Controlled, bounded repair | deferred | Deterministic validation, semantic review |
| Quality modes `economy`, `balanced`, `quality` | deferred | `economy`: deterministic validation; `balanced`: semantic review; `quality`: semantic review and repair |
| Remote model providers | deferred | Provider-neutral generator port (exists) |

---

## Constraints

Grounding stays deterministic and local; only minimal context reaches a model. Untrusted output
is validated. New providers, sources, diagrams, retry/repair/fallback and extra calls need approved
scope. No functionality is imported from later main by this documentation cleanup.
