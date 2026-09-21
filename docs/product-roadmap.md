# Archi Agent — Product Roadmap

## Product priority

Owner decision (2026-09-19), superseded by accepted R1 on 2026-09-21. The priority of the
project is to demonstrate vibe-coding and AI SDLC techniques on a working product. The product must provide:

1. generation of several PlantUML diagram types;
2. architecture knowledge built from project material (Knowledge Pack Builder) or retrieved from a
   connected MCP server;
3. local and cloud model providers: local models listed from LM Studio or Ollama; cloud providers Anthropic,
   OpenAI and OpenRouter, with API keys kept in VS Code `SecretStorage`.

The current mandatory sequence is: **R1 → D1.1 → S1 → D2 → C1 → M1 → D3/D4 → D5 → K2 → K3 → REL**.
R0, B1, P1 and P2 were implemented earlier. D1 is an automatically verified experimental
checkpoint, not an accepted product path: owner smoke exposed a brittle model-generated ledger.
R1 records the replacement architecture; D1.1 is the next implementation step. D2 is blocked
until S1 owner smoke passes. See [ADR 0001](adr/0001-reviewed-diagram-generation.md) and
[the target pipeline contract](reviewed-diagram-pipeline.md).

Agreed order of work:

| Order | Step | Scope |
| --- | --- | --- |
| 1 | R1 | Record governance, ADR, reviewed-pipeline contract and branch checkpoint; documentation only. |
| 2 | D1.1 | Implement sequence generator `{ plantUml }`, deterministic parsing/validation and independent semantic reviewer; exactly two model calls on a successful reviewed run. |
| 3 | S1 | Owner smoke of D1.1 with Ollama `qwen3:30b`; gate before D2. |
| 4 | D2 | Profile `component`; keep the old sequence command as compatibility path. |
| 5 | C1 | VS Code Chat Participant `@archi-agent` with `/diagram` over the reviewed runtime path; see [C1 — VS Code Chat Participant](#c1--vs-code-chat-participant). |
| 6 | M1 | ArchitectureSnapshot source boundary and deterministic MCP adapter; map tool results before model calls. |
| 7 | D3/D4 | Profiles `c4-context` and `c4-container`. |
| 8 | D5 | Profile `archimate-hld`. |
| 9 | K2 | Knowledge Pack Builder extraction and evidence verifier (remaining stage B scope). |
| 10 | K3 | Knowledge Pack Builder UI, runtime integration and atomic write of the five pack files. |
| 11 | REL | `v0.3.0-alpha.1`: AI SDLC demo, branding, provider comparison and accepted owner smoke. |

### C1 — VS Code Chat Participant

**Status: planned after D2.** C1 adds `@archi-agent` and `/diagram` to VS Code Chat. A diagram
request may come from the active file, a selection, a file explicitly named by the user, or text
sent to `@archi-agent`. Conversation history may be used only when it belongs to interactions with
`@archi-agent`; the participant does not automatically read other participants' history or separate
chat panels. C1 reuses the reviewed `generateDiagram()` path and configured Archi Agent provider,
retaining grounding, deterministic validation and semantic review under the D1.1 call policy.
Deterministic MCP integration follows in M1, after C1. C1 adds no implementation scope to D1.1.

Later, in no committed order: bounded repair, quality modes, document sources
(PDF, DOCX; Confluence and Jira preferably through MCP), EA XML (still deferred — no safe fixture),
EA API, Prolaborate, external artifact providers (HTTPS, Google Drive, OneDrive, SharePoint).

This order is a direction, not an instruction to implement: every step still goes through
planning and an explicit implementation prompt (see [development-workflow.md](development-workflow.md)).

---

## Product vision

Archi Agent is intended to become a grounded architecture assistant integrated with Visual Studio Code.

Its role is not simply to ask an LLM to draw a diagram.

The system should combine:

* deterministic enterprise architecture knowledge,
* project requirements and documentation,
* LLM reasoning,
* strict validation,
* source attribution,
* independent semantic review on the D1.1 path.

The target user workflow is:

```text
architecture sources
+ requirements
+ user description
        ↓
grounding
        ↓
compact architecture context
        ↓
LLM generation
        ↓
deterministic validation
        ↓
independent semantic review
        ↓
optional future repair (not in D1.1)
        ↓
PlantUML
```

---

# Product principles

## Grounding before generation

Architecture knowledge is resolved before an LLM is called.

The model should receive canonical architecture entities rather than an unrestricted architecture repository.

---

## Architecture repositories and documents are different sources

Architecture repositories provide controlled architectural knowledge:

* canonical system names,
* identifiers,
* aliases,
* known relationships,
* architecture classifications.

Documents provide contextual knowledge:

* requirements,
* integration descriptions,
* constraints,
* decisions,
* process descriptions.

The system should not treat these source types as interchangeable.

---

## Models reason; deterministic code guards

LLMs should perform tasks requiring interpretation:

* understanding a process,
* selecting meaningful interactions,
* choosing diagram structure,
* deciding architectural detail,
* producing clear descriptions.

Local deterministic code should handle:

* parsing,
* indexing,
* canonical naming,
* alias lookup,
* ambiguity,
* evidence,
* size limits,
* schema validation,
* structural validation,
* caching,
* persistence.

---

## LLM usage must be economical

Sending entire architecture repositories or large document sets to a model is explicitly avoided.

The target is:

```text
large source repository
        ↓
local retrieval / filtering
        ↓
small grounded context
        ↓
LLM
```

The D1.1 reviewed path makes one generator call and, after deterministic acceptance, one
independent review call. Invalid context makes none; deterministic rejection makes one.
The older compatibility path retains its existing one-call behavior. No retry or repair is
part of D1.1.

---

# Status overview

Statuses are derived from the code, tests and documentation in this repository, not from plans.
The operational state of the current work (branch, verification, active task) lives in
[project-state.md](project-state.md); the working process in
[development-workflow.md](development-workflow.md). A roadmap entry is not an instruction to
implement it.

| Status | Meaning |
| --- | --- |
| implemented | Present in code and covered by tests. |
| partial | Some of the scope exists in code; named parts are missing. |
| planned | Agreed direction; no implementation in the repository. |
| deferred | Agreed direction, intentionally postponed until earlier stages exist. |

The four concern areas stay separate: **architecture sources** (canonical architecture),
**document sources** (requirements and context), **diagram profiles** (what is generated) and
**quality modes** (how many model calls and which checks).

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

Ordered as agreed in [Product priority](#product-priority).

| Order | Item | Status | Notes | Depends on |
| --- | --- | --- | --- | --- |
| P2 | Cloud model providers: Anthropic, OpenAI, OpenRouter | implemented | HTTPS only with production-boundary transport tests, fixed host/path allowlist, strictly validated API keys in VS Code `SecretStorage`, capability-filtered bounded model listing, strict cloud finish contracts, one generation call, no retry/repair/fallback. | P1 |
| D1 | Experimental final-PlantUML ledger path | automatically verified; owner smoke failed | Archived on `checkpoint/d1-ledger-pipeline`; not the target architecture. | Grounding core |
| R1 | Reviewed-pipeline architecture and governance | accepted documentation step | ADR, target contract, KISS/BUZI and branch handoff. | D1 findings |
| D1.1 | Reviewed sequence pipeline | planned — next implementation | Generator `{ plantUml }`, local facts and validation, independent reviewer. | R1 |
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

# Phase 1 — Grounding core

**Status: implemented; cleanup partial** (see Status overview)

Goals:

* deterministic architecture knowledge,
* safe grounding,
* strict schema contracts,
* reproducible context,
* ambiguity handling,
* local model integration.

Remaining work in this phase:

* documentation cleanup,
* branding migration from development codename to Archi Agent,
* public/private repository policy,
* final regression checkpoint.

---

# Phase 2 — Self-contained VS Code extension

**Status: implemented — foundation accepted; `v0.2.0-alpha.1` automatically verified and owner smoke accepted on commit `d4de130`**

The production application should be a self-contained VS Code extension. The foundation exists:
a VSIX built from bundled JavaScript with generation and local profile/model commands, loopback-only local model settings, an
explicit Knowledge Pack path, interactive ambiguity resolution and `[NEW]` confirmation, and
package-content verification (see `docs/vscode-extension.md`). Cloud provider profiles now extend
this foundation. Artifact persistence and richer configuration UI remain further extensions, not
gaps blocking the accepted checkpoint.

Target installation:

```text
VS Code
+ VSIX
+ optional LM Studio
```

No requirement for:

* cloned project source,
* Git,
* npm,
* workspace build,
* root `node_modules`,
* separately installed application backend.

## Work items

* extension-host runtime boundary — implemented,
* bundled application runtime — implemented,
* configuration UI — partial (VS Code settings only),
* LLM profile and model selection — implemented (P1: LM Studio and Ollama),
* architecture-source configuration — partial (one Knowledge Pack directory),
* generated PlantUML editor integration — partial (untitled editors, no persistence),
* safe user-data storage — planned,
* VSIX allowlist/denylist validation — implemented,
* clean-install smoke test — PASS, owner-run on commit `d4de130` (2026-09-17).

## Checkpoint

Milestone:

```text
v0.2.0-alpha.1
```

Acceptance goal:

> Install the VSIX into a clean VS Code profile, configure a local model and architecture source, and generate a sequence diagram without cloning the repository or installing npm dependencies.

Status: **met**. Automatic verification passed on commit `d4de130`, and the owner reproduced the
acceptance goal on 2026-09-17 in a clean VS Code profile with LM Studio, outside the repository.

## LLM provider profiles

Current state — implemented:

* immutable provider profiles and deterministic registry,
* LM Studio (`local-lm-studio`) and Ollama (`local-ollama`) through one loopback OpenAI-compatible transport,
* model list fetched from the selected local endpoint and model chosen explicitly by the user,
* machine-scoped profile/model/binding settings with independent choices per computer, fail-closed
  handling of unknown explicit profiles and legacy LM Studio migration only when no explicit global
  profile exists.

Implemented foundation:

* B1 — a neutral `StructuredChatClient` port, with the local transport extracted behind it,

Implemented next step in the mandatory product scope (see [Product priority](#product-priority)):

* P2 — cloud profiles for Anthropic, OpenAI and OpenRouter: HTTPS only, a fixed host/path allowlist,
  the model list fetched from the provider API, one call per generation, no retry/repair/fallback,
* runtime contracts stay provider-neutral.

Remote provider credentials are not stored in ordinary settings or in the repository. API keys are
kept in provider-specific VS Code `SecretStorage` entries; see `cloud-models.md`.

---

# Knowledge Pack Builder

**Status: partial — stage A implemented.** After the extension foundation was merged to `main`
(`b759bb9`), the priority moved from the EA XML source to building a Knowledge Pack from project
material. EA XML is deferred because no safe, public fixture representing real EA data is
available. B1 (the neutral model port) is implemented; the remaining builder stages follow the
reviewed diagram work as K2 and K3.

The builder produces the same five Markdown files that the loader already reads. A language model
may later propose candidates, but it never writes the pack: every candidate carries evidence and an
`explicit` or `inferred` basis, inferred candidates need an explicit user acceptance, and the final
Markdown always comes from a deterministic renderer whose output is loaded back through the regular
loader before it is accepted. Evidence stays out of the pack files.

| Stage | Scope | Status |
| --- | --- | --- |
| A | Candidate and evidence model, reviewed draft validation, deterministic renderer, in-memory round trip through the loader (`src/core/knowledge-pack/builder`) | implemented |
| B1 | Neutral `StructuredChatClient` port and extraction of the local transport (approved stage B plan) | implemented |
| B2, B3 | Remaining stage B scope: bounded source bundle and LLM extraction of candidates (approved stage B decisions unchanged; roadmap step K2) | planned |
| C | Runtime API, source adapters, review UI, atomic write of the five files (roadmap step K3) | planned |

---

# Phase 3 — Enterprise Architect source

**Status: deferred.** Postponed in favour of the [Knowledge Pack Builder](#knowledge-pack-builder) and the MCP knowledge source because no safe, public fixture representing real EA data exists; not part of the agreed order in [Product priority](#product-priority). No EA or XML parsing code exists. The first step is an EA XML export read from a local file, behind a provider-neutral architecture-source contract.

Enterprise Architect becomes an architecture knowledge source instead of requiring knowledge to be manually represented as Markdown.

Planned source types:

* EA XML export,
* reduced architecture JSON catalog,
* EA API,
* potentially Prolaborate.

## Required behavior

EA data should be:

```text
loaded locally
    ↓
validated
    ↓
indexed
    ↓
filtered
    ↓
converted to compact grounding
```

Raw EA exports must not be sent to the LLM.

## External artifacts

EA exports may be supplied through:

* local files,
* HTTPS,
* later Google Drive,
* OneDrive,
* SharePoint.

---

# Phase 4 — LLM-first final PlantUML

**Current code:** D1 is an automatically verified experimental path. It supports sequence with
one structured-chat call and strict `{ plantUml, messages }` output, including a physical-line
ledger. The Generate Diagram picker offers only Sequence; other types are rejected before I/O.
Its owner smoke did not pass, so it is not a completed product path. The full smoke diagnosis
is archived on `checkpoint/d1-ledger-pipeline`.

**Approved target:** D1.1 replaces the ledger with one `{ plantUml }` generator call,
deterministic parsing/validation and a separate semantic-review call. Successful reviewed runs
make exactly two model calls, deterministic rejection after generation makes one, and invalid
context makes none. No retry, repair or fallback. D1.1 is next; S1 owner smoke gates D2.
See [the reviewed pipeline](reviewed-diagram-pipeline.md).

The current sequence pipeline uses an intermediate sequence model and deterministic renderer.

For multi-diagram generation the target architecture is different.

```text
ArchitectureSnapshot
        ↓
sequence profile generator request
        ↓
LLM generator { plantUml }
        ↓
local parser and validation
        ↓
independent semantic reviewer
        ↓
local final decision
```

Archi Agent should not create a new handcrafted renderer for every diagram type.

The current deterministic sequence renderer may remain as:

* compatibility path,
* regression oracle,
* controlled sequence implementation,
* validation reference.

---

# Phase 5 — Multi-diagram profiles

**Status: sequence exists in the experimental D1 ledger path and deterministic compatibility path;
D1.1 reviewed sequence is planned next.** `component` (D2) follows S1 PASS, C1 follows D2,
M1 follows C1, then `c4-context`/`c4-container` (D3/D4) and `archimate-hld` (D5).

Profiles:

## Sequence

D1 implements an experimental ledger-based Sequence path; D1.1 will replace it on the active
branch with reviewed final PlantUML. The deterministic sequence renderer remains a compatibility
path and regression oracle, not an automatic fallback.

## Component

Applications, components, services, databases, APIs, queues and dependencies.

## C4 System Context — C1

System context with users and external systems.

## C4 Container — C2

Container-level internal architecture.

## ArchiMate HLD

A constrained high-level ArchiMate profile rather than complete language support.

See:

[diagram-profiles.md](diagram-profiles.md)

---

# Phase 6 — Semantic diagram review

**Status: approved for D1.1; not yet implemented.**

Deterministic validation detects structural and evidence problems but cannot fully determine whether a diagram correctly represents the user's intent.

An independent LLM reviewer is mandatory after deterministic acceptance in D1.1.

Reviewer input:

```text
original request
+ selected source context
+ grounded architecture
+ generated PlantUML
+ parsed DiagramFacts and source evidence
```

The reviewer checks:

* coverage,
* missing elements,
* missing relationships,
* unsupported elements,
* unsupported relationships,
* contradictions,
* abstraction level,
* diagram-type fit.

Example result:

```text
accept
reject with evidence-linked violations
```

The reviewer is logically independent from the generator even if both initially use the same
configured profile and model. It never repairs PlantUML. See the D1.1 contract for its strict
verdict schema and call policy.

---

# Phase 7 — Quality policies

**Status: deferred.** No quality-mode setting exists. D1.1 has one fixed reviewed path with two
calls on success; the examples below are optional later ideas, not D1.1 variants.

The system should support different model-cost policies.

## Economy

```text
generation
+ deterministic validation
```

Intended for:

* simple diagrams,
* local models,
* frequent iterations.

## Balanced

```text
generation
+ deterministic validation
+ conditional semantic review
```

Review triggers may include:

* ambiguity,
* inferred relationships,
* many new elements,
* conflicting sources,
* complex diagram.

## Quality

```text
generation
+ deterministic validation
+ semantic review
+ optional repair
```

Intended for architecture material requiring stronger confidence.

---

# Phase 8 — Repair loop

**Status: deferred.**

Repair should not blindly regenerate everything.

A repair request should contain:

* previous candidate,
* validation issues,
* reviewer findings,
* minimal relevant context.

The model is asked to fix specific defects while preserving correct content.

Repair attempts must be bounded.

Example:

```text
generation
    ↓
validation fails
    ↓
repair #1
    ↓
validation
    ↓
accept or stop
```

---

# Phase 9 — Project document sources

**Status: planned.**

Architecture generation should use requirements and project documents in addition to architecture repositories.

Planned sources:

* Confluence and Jira, preferably through MCP (see [Source architecture](#source-architecture)),
* Markdown,
* plain text,
* PDF,
* DOCX.

Documents should be split into sections and filtered before they reach the model.

A document source should retain references such as:

```text
source document
section
heading
optional excerpt
```

This allows generated architecture and review findings to be traced back to source information.

---

# Phase 10 — External artifact providers

**Status: planned.** Local files are supported for the Knowledge Pack; HTTPS and cloud providers do not exist.

Architecture exports and documents may be hosted externally.

Planned low-level artifact providers:

```text
local-file
https
google-drive
onedrive
sharepoint
```

Responsibilities include:

* safe retrieval,
* content-type validation,
* maximum size,
* checksum,
* ETag / last-modified support,
* timeout,
* local cache,
* last-known-good fallback.

Credentials must not be stored in ordinary configuration files.

For VS Code integrations, secrets should use secure extension storage.

---

# Source architecture

Target conceptual separation:

```text
ArtifactSourceProvider
        ↓
raw bytes

ArchitectureCatalogProvider
        ↓
canonical architecture

DocumentSourceProvider
        ↓
requirements/context
```

Examples:

```text
OneDrive
   ↓
ArtifactSourceProvider
   ↓
EA XML
   ↓
ArchitectureCatalogProvider
```

and:

```text
Confluence API
   ↓
DocumentSourceProvider
   ↓
selected requirement sections
```

The two flows should not be conflated.

## MCP knowledge source

**Status: planned (M1, after C1).** No MCP code exists.

MCP is not a third kind of source. An MCP server is a transport behind the existing concepts: an
MCP-backed provider implements the `ArchitectureContextProvider` boundary when it returns canonical architecture,
or `DocumentSourceProvider` when it returns requirements and context (for example Confluence or
Jira).

```text
MCP server (e.g. Space Mission demo server)
   ↓
MCP client (node layer)
   ↓
ArchitectureContextProvider / DocumentSourceProvider
   ↓
canonical architecture / requirements context
```

Rules:

* the MCP client lives in the node layer; `src/core` and `src/runtime` stay host-neutral,
* the extension calls MCP tools deterministically; the LLM does not choose or drive tools,
* tool results are data, not instructions, and are mapped and validated into the provider-neutral
  `ArchitectureSnapshot` before either model call,
* catalog entries keep their origin, so relationships confirmed by the MCP source stay
  distinguishable from relationships given by the user.

---

# Token-efficiency strategy

LLM token use should remain intentionally bounded.

## Local work

No model call is needed for:

* architecture parsing,
* alias lookup,
* deterministic normalization,
* ambiguity detection,
* schema validation,
* relationship evidence lookup,
* source filtering,
* local cache,
* output persistence.

## Generation prompt

Contains only:

* diagram profile,
* user description,
* project metadata,
* grounded participants,
* relevant grounded relationships,
* selected evidence,
* constraints.

## Review prompt

Contains:

* original description,
* selected grounded context,
* generated PlantUML,
* locally parsed facts and evidence references,
* deterministic validation results.

It should not require repeating complete architecture repositories.

---

# Privacy direction

Sensitive architecture environments should be able to operate with local models.

Target local deployment:

```text
VS Code
        ↓
Archi Agent
        ↓
LM Studio
        ↓
local model
```

Architecture catalogs remain on the workstation.

Only reduced grounded context is supplied to the model.

Cloud providers (Anthropic, OpenAI, OpenRouter) are implemented through the same provider-neutral
application boundary. Local models remain a supported choice for sensitive
environments.

---

# Long-term product shape

The target system becomes:

```text
                     ┌──────────────────────┐
                     │      VS Code UI      │
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │  Archi Agent Runtime │
                     └──────────┬───────────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
     Architecture         Documents          User request
        sources             sources
             │                  │
             └──────────┬───────┘
                        │
                 Grounding layer
                        │
                compact context
                        │
                     LLM
                        │
                   PlantUML
                        │
        deterministic validation
                        │
               semantic review
                        │
                optional repair
```

---

# Milestones

Summary of the [Status overview](#status-overview), which is authoritative.

| Milestone | Status |
| --- | --- |
| Grounding core | implemented |
| Local LLM sequence demo | implemented |
| Self-contained VSIX foundation | implemented |
| VS Code generation checkpoint `v0.2.0-alpha.1` | implemented — automatically verified and owner smoke accepted |
| Knowledge Pack Builder — stage A (deterministic core) | implemented |
| Documentation/public repository cleanup | partial |
| B1 — neutral `StructuredChatClient` port, local transport extracted | implemented |
| P1 — provider profiles and registry, LM Studio/Ollama profiles, selection in the extension | implemented and automatically verified |
| P2 — cloud providers Anthropic, OpenAI, OpenRouter | implemented and automatically verified |
| D1 — ledger-based final PlantUML | experimental checkpoint; automatic checks passed, owner smoke failed |
| R1 — reviewed architecture ADR and governance | accepted documentation step |
| D1.1 — generator, deterministic validation, reviewer | planned — next implementation |
| S1 — Ollama `qwen3:30b` owner smoke | planned; D2 gate |
| D2 — Component diagram | planned after S1 PASS |
| C1 — VS Code Chat Participant | planned after D2 |
| M1 — ArchitectureSnapshot and MCP adapter | planned after C1 |
| D3/D4 — C4 context / container | planned after M1 |
| D5 — ArchiMate HLD | planned after D3/D4 |
| K2 — Knowledge Pack Builder extraction and evidence verifier | planned |
| K3 — Knowledge Pack Builder UI and five-file write | planned |
| REL — `v0.3.0-alpha.1` | planned |
| Semantic reviewer in the D1.1 path | planned |
| Repair loop | deferred |
| Quality modes | deferred |
| Document sources (PDF, DOCX; Confluence/Jira via MCP) | planned |
| EA XML architecture source (local file) | deferred (no safe public EA fixture) |
| EA API, Prolaborate | planned |
| HTTPS / GDrive / OneDrive / SharePoint | planned |

Milestones up to the AI SDLC demo follow the agreed order in [Product priority](#product-priority);
the rest are not ordered. The order may change as integration constraints appear. No release dates
are set.
