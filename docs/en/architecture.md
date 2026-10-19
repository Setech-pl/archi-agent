# Architecture overview

**English** · [Polski](../pl/architecture.md) · [User guide](user-guide.md)

Archi Agent keeps the editor host thin. Core owns deterministic knowledge, grounding, validation and rendering; Node adapters provide bounded file access, conversion and model transports. The shared runtime composes these operations for VS Code, CLI and MCP. Only the selected evidence reaches a model. Imported content and model answers remain untrusted.

The diagrams below explain the implemented flows. Detailed interfaces, limits and failure contracts live in the [technical architecture](../architecture.md). [Diagram profiles](../diagram-profiles.md) explain which view to choose.

The local EA1 candidate adds a separate deterministic enterprise catalog projection for Capability Map. It needs no provider, software pack or model, and uses its own provenance report with ART1. [Enterprise contract](../enterprise-catalog.md). The six software flow diagrams below keep their existing meaning.

## A. Components and boundaries

```mermaid
flowchart TB
  subgraph Host["VS Code host"]
    UI["Commands / Configuration / Browser / Help"] --> Settings["Settings / SecretStorage"]
  end
  CLI["CLI adapter / src/cli"] --> Ops["Local host composition / readRoots / env credentials"]
  MCP["Function MCP server / four tools / src/mcp"] --> Ops
  Ops --> App
  UI -->|src/runtime/index.ts| App
  subgraph Runtime["Host-neutral runtime / src/runtime"]
    App["Generation / VER1 / acquisition / original artifacts"]
  end
  subgraph Core["Deterministic core / no Node or VS Code I/O"]
    Knowledge["K1 snapshot / grounding / provenance"] --> Pipeline["Type-specific plans / validators / renderers / comparison"]
  end
  subgraph Node["Node adapters / src/node"]
    Local["Pack / Structurizr JSON + overlay"] --> Files["Bounded filesystem reads / exclusive writes"]
    Client["Knowledge MCP client / fixed get_knowledge_snapshot"]
    Providers["StructuredChatClient / local or cloud provider"]
    Conversion["Document worker / local conversion"]
  end
  App --> Knowledge
  App --> Local
  App --> Client
  Client --> KS["Separate knowledge MCP server / source adapter"]
  KS --> Model["Architecture model / example: production SRC1 + K1"]
  App --> Conversion
  App --> Files
  Pipeline --> Providers
  App --> Providers
  Build["One shared codebase / three identical runtime bundles"] --> CP["Core VSIX / text conversion / no OCR"]
  Build --> FP["Full VSIX / pinned offline PL-EN OCR"]
  FP --> OCR["PDF.js / canvas / Tesseract WASM / model resources"]
  Conversion -->|Full only when OCR needed| OCR
```

## B. Documents and frozen input

```mermaid
flowchart LR
  Source["Local documents / active MD-TXT buffer"] --> Capture["Bounded bytes or buffer capture / hashes"]
  Capture --> Convert["Conversion / offline OCR / normalized text"]
  Convert --> Extract["ONE extraction request / untrusted candidates"]
  Extract --> Evidence["Deterministic schema / evidence / references"]
  Evidence --> Review["User decisions / edits / validated preview"]
  Review --> Pack["NEW five-file Knowledge Pack / provenance"]
  Structurizr["Structurizr workspace.json + overlay / original IDs"] --> Snapshot
  MCPSource["Knowledge MCP / normalized contributions / scope"] --> Snapshot
  Pack --> Snapshot["Loader / K1 snapshot / deterministic grounding"]
  Flow["Flow description / explicit decisions"] --> Snapshot
  Snapshot --> Plan["ONE generator request / type-specific plan"]
  Plan --> Local["Validation / deterministic rendering / subset checks"]
  Local --> Semantic["ONE semantic review request / validated verdict"]
  Semantic --> Result["Original diagram + linked report / frozen ART1 result"]
  Result --> Save["Explicit confirmation / exclusive save / conditional cleanup"]
  Pack --> Browser["Read-only Knowledge Browser"]
```

## C. Extraction, review and new-pack save

```mermaid
sequenceDiagram
  participant UI as Extension UI
  participant K2 as Runtime
  participant Core as Local core
  participant LLM as StructuredChatClient
  participant W as Exclusive writer
  UI->>K2: Frozen input, resolve model configuration
  K2->>LLM: complete: exactly ONE extraction request
  LLM-->>K2: Untrusted candidates
  K2->>Core: Validate schema, references, literal evidence, conflicts
  Core-->>K2: Frozen pending candidate result
  K2-->>UI: Evidence, inferred basis, source limits
  loop User review and edits — no LLM
  UI->>K2: Accept / reject / pending / edit existing row
  K2->>Core: KPB-A validation, frozen evidence retained
  end
  alt Pending, conflicts or missing accepted dependencies
  K2-->>UI: Block preview/save, display issues
  else Valid reviewed draft
  K2->>W: Stage five files, production load and exact-byte checks
  W-->>K2: Clean staging, immutable preview
  K2-->>UI: Five file previews
  UI->>K2: New folder, Save or Save and use
  K2->>W: Exclusive create, final load and ownership checks
  W-->>K2: Success or conditional cleanup/recovery
  K2-->>UI: Saved, activation separately for Save and use
  end
  Note over UI,W: Review/edit/preview/save/activation: zero additional model calls
```

## D. Diagram generation and report

```mermaid
sequenceDiagram
  participant UI as Extension UI
  participant R as Runtime
  participant Core as Local core
  participant G as Generator
  participant V as Reviewer
  UI->>R: Type + flow + active pack + decisions
  R->>Core: Load K1, ground, freeze selected diagram snapshot
  alt Invalid input / context
  Core-->>UI: Reject, zero generation calls
  else Valid context
  Core->>G: One type-specific plan request
  G-->>Core: Untrusted Sequence / Component / C4 Context / Container plan
  Core->>Core: Validate, resolve, render, subset checks
  alt Local rejection
  Core-->>UI: Reject after one call, no review
  else Locally valid rendered candidate
  Core->>V: One review: same snapshot/model, exact candidate
  V-->>Core: Untrusted verdict and fact references
  Core->>Core: Validate complete verdict and confirmations
  alt Verified acceptance
  Core-->>R: Original PlantUML + grounding report v2
  R->>R: Capture frozen ART1 result
  R-->>UI: Two unsaved linked editors
  else Review rejection/failure after local checks
  R-->>UI: Offer marked unverified candidate, no report/artifact
  end
  end
  end
  Note over UI,V: At most two calls, no retry/repair/fallback<br/>Cancellation stops later calls
```

## E. ART1 original-pair save

```mermaid
sequenceDiagram
  participant UI as Extension UI
  participant A as Frozen artifact
  participant P as Path checks
  participant W as Exclusive writer
  participant FS as Filesystem
  Note over UI,A: Original successful generation already captured in memory
  UI->>A: Select result, select project if multi-root
  A-->>UI: New bundle plan: folder, diagram.puml, report.json
  UI->>UI: Native modal confirmation, Cancel writes nothing
  UI->>P: Confirmed project + planned relative destination
  P-->>A: Canonical, contained, link-free, no existing target
  A->>A: Exact UTF-8 SHA-256, report envelope from captured data
  A->>W: Frozen pair + cancellation signal
  W->>FS: Exclusive mkdir and two wx+ files, incremental visibility
  W->>FS: Verify bytes, identities, ancestry, final Cancel check
  alt Verified success
  W-->>UI: Receipt, offer Open Diagram / Open Report
  else Error or Cancel before completion
  W->>FS: Conditional rollback: unchanged owned resources only
  W-->>UI: Safe error, inspect retained data if cleanup incomplete
  end
  Note over UI,FS: No LLM or source refresh, no atomic publication/crash recovery/fsync guarantee
```

## F. VER1 — snapshot and provenance

```mermaid
sequenceDiagram
  participant H as VS Code / CLI / function MCP
  participant R as Shared verification runtime
  participant S as Local source or knowledge MCP
  participant C as Deterministic core
  participant L as Interpretation model
  H->>R: Sequence PlantUML or prose
  R->>S: Load one immutable source snapshot
  S-->>R: Facts, digest, scope and provenance
  alt Sequence PlantUML
  R->>C: Bounded parser, zero model calls
  else Prose
  R->>L: One bounded interpretation request
  L-->>R: Untrusted interpretation with evidence
  R->>C: Validate interpretation
  end
  R->>C: Resolve names and compare with the frozen snapshot
  C-->>H: Assessment, steps, omissions, provenance and digests
  opt Explicit name decisions / alias save
  H->>R: Confirm decisions against expected digests
  R->>S: Read source again and check version
  alt Changed source or input
  R-->>H: Stale result, restart verification
  else Same source and input
  R->>C: Apply explicit decisions without LLM
  C-->>H: Updated report with provenance
  end
  end
```

## Technical references

[Host and packaging](../vscode-extension.md) · [Sources](../src1-structurizr-source.md) · [Flow verification](../ver1-flow-verification.md) · [C4](../c4-diagrams.md) · [Document extraction](../document-candidates.md) · [Review and new-pack saving](../knowledge-pack-review.md) · [Original-pair saving](../diagram-artifact-save.md) · [CLI/MCP](cli-mcp.md) · [Architecture decisions](../adr/0002-deterministic-diagram-plan-renderers.md).

Rendered copies (SVG / PNG): [A SVG](../assets/diagrams/en-A.svg) / [PNG](../assets/diagrams/en-A.png) · [B SVG](../assets/diagrams/en-B.svg) / [PNG](../assets/diagrams/en-B.png) · [C SVG](../assets/diagrams/en-C.svg) / [PNG](../assets/diagrams/en-C.png) · [D SVG](../assets/diagrams/en-D.svg) / [PNG](../assets/diagrams/en-D.png) · [E SVG](../assets/diagrams/en-E.svg) / [PNG](../assets/diagrams/en-E.png) · [F SVG](../assets/diagrams/en-F.svg) / [PNG](../assets/diagrams/en-F.png)

## Enterprise catalog across hosts — local EA1b

Capability Map uses the same EA1 validation, frozen snapshot, view projection and renderer in
VS Code, CLI and function MCP. It has no flow/provider/model fields and makes zero LLM calls.
Config v2 adds enterpriseSources separately from software sources. The optional knowledge tool
get_enterprise_snapshot v1 transports enterprise/1 catalogs; get_knowledge_snapshot v1 is unchanged.
The source client validates identity, source version and semantic digest, with bounded discovery,
response, deadline and confirmed child cleanup. VS Code enterpriseSource may select a catalog;
only User knowledgeServer can configure its executable. Local report v1 retains actual file lines,
remote report v2 retains response pointers and declared references. ART1 keeps its original-pair
writer/envelope; CLI/function MCP never gain automatic write permission. This candidate is local,
not an update of published DEMO1 downloads.
