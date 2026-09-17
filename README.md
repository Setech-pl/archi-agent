# Archi Agent

**AI-assisted architecture diagramming with deterministic grounding, validation and local-model support.**

Archi Agent is an architecture-assistance project designed to turn natural-language system and process descriptions into architecture diagrams while keeping generated content grounded in controlled architectural knowledge.

The project combines deterministic architecture grounding with LLM-based interpretation and generation.

The current implementation focuses on sequence-diagram generation, strict grounding, validation, safe PlantUML output and local OpenAI-compatible models such as LM Studio.

The long-term goal is a self-contained Visual Studio Code extension supporting multiple architecture diagram profiles and multiple enterprise knowledge sources.

---

## Why Archi Agent?

LLMs are good at understanding architectural descriptions, but unrestricted diagram generation creates several problems:

* invented system names,
* inconsistent naming,
* unsupported relationships,
* accidental changes to canonical architecture terminology,
* ambiguous aliases,
* diagrams that look plausible but are not grounded in the actual architecture,
* very large prompts when whole repositories or documents are sent to the model.

Archi Agent separates two responsibilities.

### Deterministic grounding

Local code decides which architecture facts are available to the model:

* canonical system and actor names,
* aliases,
* known relationships,
* architecture rules,
* explicitly confirmed new elements,
* ambiguity candidates,
* source references.

Grounding is deterministic and auditable.

### LLM reasoning

The language model handles interpretation:

* process understanding,
* interaction selection,
* message wording,
* diagram structure,
* appropriate architectural detail,
* eventually generation of multiple diagram types.

The model receives a compact grounded context instead of the full knowledge repository.

---

# Current status

Archi Agent is under active development.

The current branch contains a working architecture-generation core and local-model pipeline.

Implemented today:

* Architecture Knowledge Pack loading and validation,
* deterministic participant grounding,
* canonical-name enforcement,
* alias resolution,
* ambiguity detection and explicit ambiguity resolution,
* `[NEW: ...]` participant handling,
* minimal grounded context generation,
* stable grounding digest,
* strict generated-model schema,
* deterministic normalization,
* relationship validation,
* interface-name validation,
* PlantUML text-safety checks,
* deterministic PlantUML rendering for the current sequence pipeline,
* structural PlantUML validation,
* grounding reports,
* safe artifact writing and versioning,
* offline deterministic demo,
* local OpenAI-compatible model support,
* LM Studio integration,
* VS Code extension foundation: a self-contained VSIX with one command that runs the sequence pipeline against a configured Knowledge Pack and a local model (see [docs/vscode-extension.md](docs/vscode-extension.md)),
* unit and integration tests.

Not yet implemented in this repository:

* artifact persistence and richer configuration UI in the VS Code extension,
* Enterprise Architect XML/API integration,
* C4 and ArchiMate diagram profiles,
* semantic LLM review,
* repair loop,
* remote model providers,
* Confluence integration,
* Google Drive / OneDrive artifact providers.

See [docs/product-roadmap.md](docs/product-roadmap.md).

---

# Architecture principles

## 1. Ground first, generate second

The model never receives an unrestricted enterprise architecture repository.

Instead:

```text
Architecture knowledge
        ↓
deterministic parsing
        ↓
grounding
        ↓
compact Grounded Context
        ↓
LLM
        ↓
diagram candidate
        ↓
validation
```

Only architecture information relevant to the current request should reach the model.

---

## 2. Canonical architecture names are authoritative

Known systems and actors use canonical architecture names.

Aliases are accepted only to resolve user terminology.

Example:

```text
User writes:
"MCC sends telemetry to Flight DB"

Knowledge Pack:
MCC → Mission Control
Flight DB → Telemetry Repository

Generated diagram:
Mission Control → Telemetry Repository
```

The LLM must not silently rename known architecture elements.

---

## 3. Ambiguity is surfaced, not guessed

When an alias or normalized name maps to multiple architecture elements, Archi Agent does not automatically choose one.

The ambiguity must be resolved explicitly.

This keeps grounding:

* reproducible,
* reviewable,
* deterministic,
* safe for enterprise use.

---

## 4. Unknown architecture is explicit

An unknown participant is not automatically added to the architecture.

New elements must be explicitly identified.

Current syntax:

```text
[NEW: Ground Station]
```

Confirmed new elements remain visibly marked in the generated architecture context.

---

## 5. Relationships carry evidence

A relationship may be based on:

* architecture knowledge,
* explicit user description,
* future document sources,
* model inference.

These evidence classes must not be confused.

In particular:

> A relationship explicitly described by the user may be represented even when it is not present in the architecture repository.

But it must not be falsely labelled as repository-confirmed.

---

## 6. LLM usage should be token-efficient

Large knowledge repositories should not be sent directly to the model.

Local deterministic processing should perform:

* repository parsing,
* alias lookup,
* candidate selection,
* filtering,
* source attribution,
* schema validation,
* structural validation.

The model receives only the information required to reason about the requested diagram.

---

# Current sequence-generation pipeline

The current implementation uses a validated sequence-model pipeline:

```text
Flow description
        ↓
Knowledge Pack
        ↓
Grounding
        ↓
Minimal grounded context
        ↓
SequenceModelGenerator
        ↓
strict model validation
        ↓
normalization
        ↓
relationship validation
        ↓
interface validation
        ↓
PlantUML rendering
        ↓
PlantUML structural validation
        ↓
grounding report
```

The generation strategy is provider-neutral.

Current generators include:

* deterministic scripted demo,
* local OpenAI-compatible model adapter.

The local model path has been tested with LM Studio-compatible endpoints.

---

# Target generation architecture

The current sequence renderer is not the intended architecture for every future diagram type.

The target architecture moves toward:

```text
User description
+ architecture sources
+ project documents
        ↓
Grounded Diagram Context
        ↓
diagram profile
        ↓
LLM generates final PlantUML
        ↓
deterministic validation
        ↓
optional semantic LLM review
        ↓
optional repair
```

Archi Agent will not implement a separate handcrafted renderer for every supported diagram type.

Diagram-specific behavior should primarily live in:

* prompt profiles,
* grounding constraints,
* validation rules,
* supported PlantUML conventions.

The current deterministic sequence renderer remains useful as a compatibility path, regression oracle and controlled sequence implementation while the LLM-first pipeline evolves.

---

# Planned diagram profiles

The target set is intentionally small.

## Sequence

Interaction and process flows between actors, systems and technical components.

**Current status:** implemented through the existing validated sequence pipeline.

## Component

Technical view showing:

* applications,
* services,
* databases,
* brokers,
* APIs,
* major dependencies.

**Status:** planned.

## C4 System Context — C1

High-level context showing:

* users,
* the system of interest,
* external systems,
* major relationships.

**Status:** planned.

## C4 Container — C2

Internal decomposition into deployable/runtime containers such as:

* frontend applications,
* backend services,
* databases,
* brokers,
* stores,
* external dependencies.

**Status:** planned.

## ArchiMate HLD

A constrained high-level ArchiMate-oriented profile focused initially on selected concepts such as:

* Application Component,
* Application Service,
* Business Actor / Role,
* Technology Node,
* Flow,
* Serving,
* Access,
* Realization.

The goal is not to implement the entire ArchiMate language immediately.

**Status:** planned.

See [docs/diagram-profiles.md](docs/diagram-profiles.md).

---

# Architecture knowledge

The current implementation uses an **Architecture Knowledge Pack** consisting of strict Markdown tables.

Typical content includes:

```text
systems.md
actors.md
relationships.md
aliases.md
rules.md
```

The Knowledge Pack is parsed locally and converted into validated indexes.

The LLM never receives the complete pack.

See:

* [docs/knowledge-pack-format.md](docs/knowledge-pack-format.md)
* [docs/architecture.md](docs/architecture.md)

---

# Future architecture sources

The same grounding layer is intended to support additional architecture repositories.

Planned sources include:

* Enterprise Architect XML export,
* reduced architecture catalog JSON,
* Enterprise Architect API,
* Prolaborate,
* local architecture artifacts,
* HTTPS-hosted architecture artifacts.

External architecture catalogs may later be stored in locations such as:

* Google Drive,
* OneDrive,
* SharePoint.

Full enterprise architecture exports should not be bundled with the final extension.

---

# Future document sources

Architecture repositories and project documentation have different responsibilities.

Future document sources may include:

* Confluence,
* Markdown,
* plain text,
* PDF,
* DOCX,
* project requirements.

Documents provide additional context and requirements.

Architecture repositories remain authoritative sources for canonical architecture entities and confirmed relationships.

The system should retain source references so generated architecture can be traced back to supporting evidence.

---

# Local model support

Archi Agent supports a local OpenAI-compatible generation path.

The intended use case includes LM Studio.

The current local-model implementation:

* connects only to a loopback endpoint,
* requires an explicit model identifier,
* sends compact grounded context,
* uses structured output,
* performs one model request,
* applies the same deterministic validation pipeline,
* performs no automatic retry or repair.

See:

[docs/local-model.md](docs/local-model.md)

---

# Quick start

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

---

# Offline demo

The synthetic Space Mission example demonstrates the complete deterministic pipeline without calling an LLM.

Dry run:

```bash
npm run demo:dry-run
```

Generate artifacts:

```bash
npm run demo
```

See:

[docs/demo.md](docs/demo.md)

---

# LM Studio demo

Start LM Studio with an OpenAI-compatible local server.

List available models:

```bash
npm run local:models
```

Dry-run generation:

```bash
npm run demo:llm:dry-run -- "<model-id>"
```

Generate:

```bash
npm run demo:llm -- "<model-id>"
```

The current implementation performs exactly one model request.

---

# Validation philosophy

LLM output is always treated as untrusted input.

Validation currently includes:

* strict JSON/schema validation,
* participant grounding,
* canonical-name validation,
* relationship direction validation,
* interaction-mode validation,
* interface-name validation,
* PlantUML text safety,
* PlantUML structural checks,
* bounded output sizes.

Future validation will add optional semantic review by another LLM pass.

The reviewer will compare:

```text
user description
+ grounded context
+ source evidence
+ generated diagram
```

and identify:

* missing architecture,
* unsupported elements,
* unsupported relationships,
* contradictions,
* incorrect abstraction level,
* potentially incorrect diagram semantics.

---

# Planned quality modes

To avoid unnecessary model usage, the target architecture will support different validation policies.

### Economy

```text
1 generation request
+ deterministic validation
```

### Balanced

```text
1 generation request
+ deterministic validation
+ semantic review only when risk indicators exist
```

### Quality

```text
1 generation request
+ deterministic validation
+ independent semantic review
+ optional repair
```

Examples of review risk indicators:

* ambiguous architecture references,
* inferred relationships,
* many `[NEW]` elements,
* contradictory source information,
* complex multi-source requests.

---

# Target VS Code experience

The final product is intended to be installed as a self-contained VS Code extension. The current
branch contains the first foundation of that extension: a VSIX built from bundled JavaScript that
runs the existing sequence pipeline without the repository or npm. See
[docs/vscode-extension.md](docs/vscode-extension.md).

Target experience:

```text
Install VSIX
    ↓
configure LLM or LM Studio
    ↓
configure architecture/document sources
    ↓
describe requested architecture
    ↓
generate diagram
```

The production extension should not require:

* cloning the source repository,
* running `npm install`,
* workspace npm scripts,
* a separately installed Node.js runtime,
* a separately running Archi Agent backend.

External enterprise architecture artifacts remain outside the extension.

---

# Security and privacy

The project is designed around minimal disclosure to language models.

Important principles:

* full architecture repositories should remain local,
* only selected grounded context should be sent to the model,
* credentials must not appear in prompts or logs,
* local models should be usable for sensitive environments,
* external artifacts are treated as untrusted input,
* generated model output is always validated,
* new architecture elements remain explicit.

The repository includes leak-scanning support intended to reduce accidental publication of private project information.

---

# Documentation

| Document                                               | Purpose                                        |
| ------------------------------------------------------ | ---------------------------------------------- |
| [Architecture](docs/architecture.md)                   | Current technical architecture                 |
| [Product roadmap](docs/product-roadmap.md)             | Product direction and implementation roadmap   |
| [Diagram profiles](docs/diagram-profiles.md)           | Current and planned diagram types              |
| [Knowledge Pack format](docs/knowledge-pack-format.md) | Architecture knowledge schema                  |
| [Local model](docs/local-model.md)                     | LM Studio / OpenAI-compatible local generation |
| [VS Code extension](docs/vscode-extension.md)          | Self-contained extension foundation and VSIX   |
| [Demo](docs/demo.md)                                   | Synthetic offline demo                         |
| [Front matter](docs/front-matter.md)                   | Flow-document metadata                         |
| [Project state](docs/project-state.md)                 | Current implementation state and next step     |
| [Development workflow](docs/development-workflow.md)   | Planning, review, implementation and handoff   |
| [AGENTS.md](AGENTS.md)                                 | Shared rules for coding agents                 |

---

# Project direction

Archi Agent is evolving from a validated sequence-diagram prototype into a grounded architecture assistant.

The main engineering priorities are:

1. preserve deterministic grounding,
2. reduce unnecessary LLM context,
3. keep architecture evidence auditable,
4. package the runtime as a self-contained VS Code extension,
5. add Enterprise Architect as an architecture source,
6. introduce LLM-first multi-diagram generation,
7. add semantic review and repair,
8. extend document and artifact sources.

See the full roadmap:

[docs/product-roadmap.md](docs/product-roadmap.md)
