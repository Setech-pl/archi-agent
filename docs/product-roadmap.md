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

# Current state

## Implemented

### Architecture Knowledge Pack

Strict local architecture knowledge containing:

* systems,
* actors,
* relationships,
* aliases,
* architecture rules.

### Deterministic grounding

Implemented features include:

* exact identifier resolution,
* canonical-name resolution,
* aliases,
* controlled normalization,
* ambiguity detection,
* explicit ambiguity resolution,
* `[NEW: ...]` handling.

### Minimal grounded context

Only architecture relevant to the current request reaches the generator.

Unrelated knowledge is excluded.

### Evidence and traceability

The grounded context retains architecture references and source positions.

### Stable grounding digest

Grounded semantic content can be represented by a deterministic SHA-256 digest.

### Sequence-model generation pipeline

A provider-neutral generator produces an untrusted sequence model which passes strict validation.

### Validation

Current checks include:

* schema validation,
* canonical-name validation,
* grounding validation,
* relationship validation,
* interaction-mode validation,
* interface-name policy,
* PlantUML text policy,
* PlantUML structural validation.

### Output

Implemented:

* deterministic artifact naming,
* versioning,
* safe artifact writing,
* grounding report.

### Local LLM

Implemented OpenAI-compatible local-model support suitable for LM Studio.

Current policy:

```text
one request
no retry
no repair
no fallback
```

### Demo

Synthetic Space Mission examples exercise both deterministic and model-driven paths.

---

# Phase 1 — Grounding core

**Status: substantially implemented**

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

**Status: next major product milestone**

The production application should be a self-contained VS Code extension.

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

## Planned work

* extension-host runtime boundary,
* bundled application runtime,
* configuration UI,
* LLM profile selection,
* architecture-source configuration,
* generated PlantUML editor integration,
* safe user-data storage,
* VSIX allowlist/denylist validation,
* clean-install smoke test.

## Checkpoint

Planned milestone:

```text
v0.2.0-alpha.1
```

Acceptance goal:

> Install the VSIX into a clean VS Code profile, configure a local model and architecture source, and generate a sequence diagram without cloning the repository or installing npm dependencies.

---

# Phase 3 — Enterprise Architect source

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

| Milestone                               | Target           |
| --------------------------------------- | ---------------- |
| Grounding core                          | implemented      |
| Local LLM sequence demo                 | implemented      |
| Documentation/public repository cleanup | current          |
| Self-contained VSIX foundation          | next             |
| EA XML architecture source              | next             |
| VS Code generation checkpoint           | `v0.2.0-alpha.1` |
| LLM-first PlantUML path                 | planned          |
| Component diagram                       | planned          |
| C4 C1/C2                                | planned          |
| Semantic reviewer                       | planned          |
| Repair loop                             | planned          |
| ArchiMate HLD                           | planned          |
| Confluence                              | planned          |
| GDrive / OneDrive sources               | planned          |

The order may change as the extension checkpoint exposes integration constraints.
