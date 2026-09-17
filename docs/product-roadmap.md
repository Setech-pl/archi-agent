# Archi Agent — Product Roadmap

## Product vision

Archi Agent is intended to become a grounded architecture assistant integrated with Visual Studio Code.

Its role is not simply to ask an LLM to draw a diagram.

The system should combine:

* deterministic enterprise architecture knowledge,
* project requirements and documentation,
* LLM reasoning,
* strict validation,
* source attribution,
* optional independent semantic review.

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
optional semantic review
        ↓
optional repair
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

Most requests should require one model generation call.

Additional model calls should be driven by quality policy or concrete validation failures.

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
| Local OpenAI-compatible model adapter (loopback, one request, no retry or repair), LM Studio | implemented | `src/node/llm`, `docs/local-model.md` |
| Offline Space Mission demo and LM Studio demo | implemented | `src/demo`, `docs/demo.md` |

## Current

| Item | Status | Open parts | Depends on |
| --- | --- | --- | --- |
| Phase 1 — cleanup | partial | Branding: the extension and README use Archi Agent; the root package (`archground`) and several docs still use the ArchGround codename. Public/private repository policy and final regression checkpoint not recorded. | — |
| Knowledge Pack Builder — stage A: deterministic core | implemented | Candidate and evidence model (explicit / inferred), reviewed draft validation, deterministic renderer of the five pack files, in-memory round trip through the regular loader. Stage B (bounded source bundle and local LLM extraction), review, runtime, UI and writing to disk are not implemented. See [Knowledge Pack Builder](#knowledge-pack-builder). | Knowledge Pack loader |
| Phase 2 — self-contained VSIX (`v0.2.0-alpha.1`) | implemented | Foundation implemented and accepted: host-neutral runtime, one command, settings, esbuild bundles, VSIX packaging and content verification, tests. Automatic verification and the owner manual smoke test both PASS on the current HEAD. Artifact persistence, richer configuration UI and further provider profiles are later extensions, not gaps blocking this foundation checkpoint. | Phase 1 core |

## Next

| Item | Status | Notes | Depends on |
| --- | --- | --- | --- |
| Provider-neutral architecture-source contract | partial | The runtime source union has one kind (`local-directory`) and the `KnowledgePackSource` port reads the five Markdown pack files; no source-independent catalog contract exists yet. | Phase 2 runtime contract |
| Knowledge Pack Builder — stage B: bounded source bundle and local LLM extraction of candidates | planned — next | The model only proposes candidates; the final Markdown always comes from the deterministic renderer. | Stage A |
| EA XML export as the first additional architecture source, from a local file | deferred | Postponed in favour of the Knowledge Pack Builder: there is no safe, public fixture that represents real EA data. No EA or XML parsing code exists. Local file before HTTPS and cloud storage. | Provider-neutral contract, safe synthetic EA fixture |

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

**Status: implemented — foundation accepted; `v0.2.0-alpha.1` automatically verified and owner smoke accepted on the current HEAD**

The production application should be a self-contained VS Code extension. The foundation exists:
a VSIX built from bundled JavaScript with one command, loopback-only local model settings, an
explicit Knowledge Pack path, interactive ambiguity resolution and `[NEW]` confirmation, and
package-content verification (see `docs/vscode-extension.md`). Artifact persistence, richer
configuration UI and additional provider profiles are further extensions of this foundation, not
gaps blocking the checkpoint.

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
* LLM profile selection — planned,
* architecture-source configuration — partial (one Knowledge Pack directory),
* generated PlantUML editor integration — partial (untitled editors, no persistence),
* safe user-data storage — planned,
* VSIX allowlist/denylist validation — implemented,
* clean-install smoke test — PASS, owner-run on the current HEAD (2026-09-17).

## Checkpoint

Milestone:

```text
v0.2.0-alpha.1
```

Acceptance goal:

> Install the VSIX into a clean VS Code profile, configure a local model and architecture source, and generate a sequence diagram without cloning the repository or installing npm dependencies.

Status: **met**. Automatic verification passed on the current HEAD, and the owner reproduced the
acceptance goal on 2026-09-17 in a clean VS Code profile with LM Studio, outside the repository.

## LLM provider profiles

Current state — implemented:

* one local OpenAI-compatible provider (loopback),
* model list fetched from the local endpoint,
* model chosen by the user.

Planned direction — not implemented in this task:

* provider profiles for OpenAI, Anthropic Claude and OpenRouter, in addition to the local
  OpenAI-compatible provider,
* the extension will let the user choose a provider profile and a model within it,
* runtime contracts stay provider-neutral (the existing provider-neutral generator port already
  supports this).

Remote provider credentials must not be stored in ordinary settings or in the repository. The
intended mechanism for secrets in VS Code is `SecretStorage`. Providers, UI and credential
handling for this direction are not implemented and are not part of the current Knowledge Pack
Builder stage ordering.

---

# Knowledge Pack Builder

**Status: partial — stage A implemented; stage B next.** After the extension foundation was merged
to `main` (`b759bb9`), the priority moved from the EA XML source to building a Knowledge Pack from
project material. EA XML is deferred because no safe, public fixture representing real EA data is
available.

The builder produces the same five Markdown files that the loader already reads. A language model
may later propose candidates, but it never writes the pack: every candidate carries evidence and an
`explicit` or `inferred` basis, inferred candidates need an explicit user acceptance, and the final
Markdown always comes from a deterministic renderer whose output is loaded back through the regular
loader before it is accepted. Evidence stays out of the pack files.

| Stage | Scope | Status |
| --- | --- | --- |
| A | Candidate and evidence model, reviewed draft validation, deterministic renderer, in-memory round trip through the loader (`src/core/knowledge-pack/builder`) | implemented |
| B | Bounded source bundle and local LLM extraction of candidates | planned — next |
| Later | Review of candidates, runtime API, VS Code command and UI, writing the five files to disk | planned |

---

# Phase 3 — Enterprise Architect source

**Status: deferred.** Postponed in favour of the [Knowledge Pack Builder](#knowledge-pack-builder) because no safe, public fixture representing real EA data exists. No EA or XML parsing code exists. The first step is an EA XML export read from a local file, behind a provider-neutral architecture-source contract.

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

**Status: planned.**

The current sequence pipeline uses an intermediate sequence model and deterministic renderer.

For multi-diagram generation the target architecture is different.

```text
GroundedDiagramContext
        ↓
diagram prompt profile
        ↓
LLM
        ↓
final PlantUML
        ↓
local validation
```

Archi Agent should not create a new handcrafted renderer for every diagram type.

The current deterministic sequence renderer may remain as:

* compatibility path,
* regression oracle,
* controlled sequence implementation,
* validation reference.

---

# Phase 5 — Multi-diagram profiles

**Status: sequence implemented (compatibility path); `component`, `c4-context`, `c4-container`, `archimate-hld` planned in this order.**

Planned profiles:

## Sequence

Current implementation exists.

Future version may also use the LLM-first final-PlantUML pipeline.

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

**Status: deferred.**

Deterministic validation detects structural and evidence problems but cannot fully determine whether a diagram correctly represents the user's intent.

An independent LLM reviewer is planned.

Reviewer input:

```text
original request
+ selected source context
+ grounded architecture
+ generated PlantUML
+ evidence ledger
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
accepted
accepted-with-warnings
repair-required
```

The reviewer is logically independent from the generator even if both use the same underlying model.

---

# Phase 7 — Quality policies

**Status: deferred.** No quality-mode setting exists; the current pipeline matches the `economy` description (one request plus deterministic validation).

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

* Confluence,
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
* evidence ledgers,
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

Remote provider support may be added later but must use the same provider-neutral application boundary.

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

| Milestone                                   | Status                          |
| ------------------------------------------- | ------------------------------- |
| Grounding core                              | implemented                     |
| Local LLM sequence demo                     | implemented                     |
| Documentation/public repository cleanup     | partial (current)               |
| Self-contained VSIX foundation              | implemented                     |
| VS Code generation checkpoint `v0.2.0-alpha.1` | implemented — automatically verified and owner smoke accepted on current HEAD |
| Knowledge Pack Builder — stage A (deterministic core) | implemented                |
| Knowledge Pack Builder — stage B (source bundle, local LLM extraction) | planned (next) |
| Provider-neutral architecture-source contract | partial                       |
| EA XML architecture source (local file)     | deferred (no safe public EA fixture) |
| LLM-first PlantUML path                     | planned                         |
| Component diagram                           | planned                         |
| C4 C1/C2                                    | planned                         |
| ArchiMate HLD                               | planned                         |
| Semantic reviewer                           | deferred                        |
| Repair loop                                 | deferred                        |
| Quality modes                               | deferred                        |
| Document sources (incl. Confluence)         | planned                         |
| HTTPS / GDrive / OneDrive / SharePoint      | planned                         |

The order may change as the extension checkpoint exposes integration constraints. No release dates are set.
