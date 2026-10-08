# Architecture

**English** · [Polski](../pl/architecture.md) · [Home](../../README.md)

This is the implemented architecture at the local FU-01/DOC1 baseline, not the published UX2 package. [Detailed stable architecture](../architecture.md) retains historical explanations; [roadmap](../product-roadmap.md) owns plans. Current acquisition uses local Markdown packs and explicitly selected documents to build a new pack; no EA/MCP acquisition adapter exists. Sequence and Component use separate plans/validators/renderers. Context/Container/ArchiMate remain planned. The compatibility sequence renderer is a separate older path.

Core is deterministic and has no Node/VS Code I/O; orchestration calls injected ports and Node adapters. Runtime is host-neutral; the editor imports only `src/runtime/index.ts`. Providers are interchangeable adapters for StructuredChatClient. Documents/model responses are untrusted data. Only bounded relevant diagram snapshots or bounded selected extraction text reach a model. Settings and SecretStorage stay at the VS Code boundary.

## A. Components and boundaries

```mermaid
flowchart TB
  subgraph Host["VS Code extension boundary"]
    direction TB
    UI["Commands / pickers / editors"] --> Settings["Settings / SecretStorage"]
  end
  subgraph Runtime["Host-neutral runtime"]
    direction TB
    App["archi-agent-runtime / extract-document-candidates"] --> Review["knowledge-pack-review / diagram-artifact"]
  end
  subgraph Core["Deterministic core — no I/O"]
    direction TB
    Knowledge["Pack loader / K1 snapshot / grounding / KPB-A"] --> Pipeline["Plans / validators / renderers / report"]
  end
  subgraph Adapters["Node and packaged local adapters"]
    direction TB
    Pack["NodeKnowledgePackSource"] --> Files["Local filesystem: bounded reads / exclusive writes / cleanup"]
    Conversion["Private input copies / conversion worker"] --> OCR["PDF.js / canvas / Tesseract WASM + PL/EN"]
    Providers["LM Studio / Ollama / Anthropic / OpenAI / OpenRouter"]
  end
  UI -->|src/runtime/index.ts| App
  App --> Knowledge
  Review --> Knowledge
  App --> Pack
  App --> Conversion
  Pipeline -->|StructuredChatClient| Providers
  App -->|StructuredChatClient| Providers
  Review -->|ART1 / K3 / UX3| Files
```

## B. Documents and frozen input

```mermaid
sequenceDiagram
  participant UI as Extension UI
  participant K2 as Runtime
  participant FS as Filesystem
  participant CV as Converter / OCR
  UI->>K2: Explicit document paths + OCR policy
  K2->>FS: Bounded descriptor read, capture bytes
  FS-->>K2: Exact bytes, private temporary copy
  K2->>K2: SHA-256 original bytes
  opt PDF / DOCX / XLSX
  K2->>CV: Convert private copy, propagate cancellation
  CV-->>K2: Text + page coverage + limitations, worker closed
  end
  K2->>K2: UTF-8 / BOM / LF / NFC, text digest, bundle bounds
  K2->>K2: Sort sources, freeze bundle and digest
  Note over UI,K2: Input failure or Cancel: zero generation requests
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
  G-->>Core: Untrusted Sequence v3 / Component v1 plan
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

Acquisition staging is temporary; K2 awaits cleanup before returning candidates. The frozen bundle exists before extraction and remains the evidence source throughout review. Builder save validation includes a production load before immutable preview and after final writes. Activation is a separate setting operation.

Diagram review rejection can offer an unverified candidate only after local validation; user cancellation offers nothing. Generator/reviewer share the configured model but use separate contexts. Compatibility sequence uses one request and report v1.

The ART1 menu/palette registry retains results while at least one linked preview remains open; closing both removes the list entry. A still-pending generation notification retains its own original and can invoke save directly after both previews close. Restart/reload removes in-memory results and notifications. Language changes do not count as actual closes. Two-file saving is incrementally visible and rollback is conditional; no atomic directory rename, crash recovery or fsync guarantee is claimed.

## Source map

| Step / krok | Modules / moduły |
| --- | --- |
| UI navigation / nawigacja | [open-menu.ts](../../vscode-extension/src/commands/open-menu.ts), [build-knowledge-pack.ts](../../vscode-extension/src/commands/build-knowledge-pack.ts), [generate-sequence-diagram.ts](../../vscode-extension/src/commands/generate-sequence-diagram.ts), [save-diagram-and-report.ts](../../vscode-extension/src/commands/save-diagram-and-report.ts) |
| Boundary / granica | [index.ts](../../src/runtime/index.ts), [archi-agent-runtime.ts](../../src/runtime/archi-agent-runtime.ts) |
| Acquisition / przechwycenie | [extract-document-candidates.ts](../../src/runtime/extract-document-candidates.ts), [convert-document.ts](../../src/runtime/convert-document.ts), [convert.mjs](../../experiments/ux2-ocr/convert.mjs), [ocr-parent.mjs](../../experiments/ux2-ocr/ocr-parent.mjs), [ocr-child.mjs](../../experiments/ux2-ocr/ocr-child.mjs) |
| K1 / source / źródło | [knowledge-snapshot.ts](../../src/core/knowledge-pack/knowledge-snapshot.ts), [node-knowledge-pack-source.ts](../../src/node/node-knowledge-pack-source.ts) |
| Extraction evidence / dowody | [document-candidates.ts](../../src/core/knowledge-pack/builder/document-candidates.ts), [knowledge-pack-builder.ts](../../src/core/knowledge-pack/builder/knowledge-pack-builder.ts) |
| Review/save | [knowledge-pack-review.ts](../../src/runtime/knowledge-pack-review.ts), [knowledge-pack-onboarding.ts](../../src/runtime/knowledge-pack-onboarding.ts), [document-provenance.ts](../../src/core/knowledge-pack/document-provenance.ts) |
| ART1 | [diagram-artifact.ts](../../src/runtime/diagram-artifact.ts), [local-file-path.ts](../../src/node/local-file-path.ts) |
| Provider transports / transporty | [local](../../src/node/llm/openai-compatible-local-chat-client.ts), [remote OpenAI-compatible](../../src/node/llm/openai-compatible-remote-chat-client.ts), [Anthropic](../../src/node/llm/anthropic-remote-chat-client.ts) |

Sequence: [reviewed-sequence.ts](../../src/core/pipeline/reviewed-sequence.ts), [sequence-diagram-plan.ts](../../src/core/pipeline/sequence-diagram-plan.ts). Component: [generate-component-diagram.ts](../../src/core/pipeline/generate-component-diagram.ts), [component-diagram-plan.ts](../../src/core/pipeline/component-diagram-plan.ts).
