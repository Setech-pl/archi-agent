# Architecture

**English** · [Polski](../pl/architecture.md) · [Home](../../README.md)

This branch implements SRC1/VER1/C4/MCP1. Public DEMO1 packages have a distinct source identity; see [project state](../project-state.md). [roadmap](../product-roadmap.md) owns plans. Current acquisition supports local Structurizr JSON with an ID-bound overlay, standalone Markdown packs and selected documents to build a new pack; a Node MCP knowledge client fetches normalized partial contributions from one explicitly configured stdio server. The standalone example reuses production SRC1 parsing/mapping and K1 validation. No EA adapter or DSL parser exists. Sequence and Component use separate plans/validators/renderers. C4 Context/Container use source-bound Structurizr metadata and separate plans/validators/renderers; VER1 checks Sequence/prose. ArchiMate remains planned. The compatibility sequence renderer is a separate older path.

Core is deterministic and has no Node/VS Code I/O; orchestration calls injected ports and Node adapters. Runtime is host-neutral; the editor imports only `src/runtime/index.ts`. Providers are interchangeable adapters for StructuredChatClient. Documents/model responses are untrusted data. Only bounded relevant diagram snapshots or bounded selected extraction text reach a model. VS Code settings and SecretStorage stay at the editor boundary; CLI/MCP use process configuration, pinned readRoots and named environment credentials. The four-tool function server and knowledge client have separate roles; all hosts compose the same runtime.

UX4 adds a singleton Configuration editor with Knowledge Management / LLM Provider and a linked K3 review webview. Both delegate to existing runtime services; a closed host protocol, nonce CSP and text-only rendering guard untrusted data. Keys remain in SecretStorage; the screen receives presence only. [UX4 contract](../configuration-workbench.md).

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

## Configuration, limits and failures

Configuration keeps the visible draft separate from applied User settings. Refresh Models uses the draft profile/endpoint/timeout, validates the bounded response and never persists a model. Available models updates Selected model; Apply writes profile and model binding sequentially. Discard restores applied settings and invalidates the draft catalog. External changes make a stale Apply fail; a partial settings failure re-reads actual values. Check Provider Configuration uses applied settings. Profile/model/binding are machine scoped; pack selection is resource scoped. LM Studio endpoint/timeout can have effective workspace overrides, subject to Workspace Trust. Local URLs require literal loopback; cloud adapters use fixed HTTPS allowlists.

Keys are provider-specific VS Code SecretStorage entries. Native masked inputs handle entry; webviews receive only presence, never the secret. Help uses VS Code's display language and bundled Markdown; it makes no provider request and does not introduce an application language switch. Browser reads only the active pack through the production loader; record navigation uses pack line locations and frozen document provenance, with digest checks before opening live editor evidence.

Standalone conversion accepts one file up to 50 MiB and 8 MiB Markdown; non-OCR work has a 120-second deadline, OCR 300 seconds and at most 20 OCR pages. Builder accepts eight sources, 10 MiB each/20 MiB total, 64 KiB text per source/160 KiB serialized bundle, 256 KiB prepared request and 128 candidates. Builder's total work deadline is 360 seconds; extraction is capped at 120 seconds or the shorter provider timeout. AbortSignals propagate to requests/workers/writes; child closure and conditional cleanup may finish after the work deadline. Progress reports reading, conversion/OCR, provider selection, generation and evidence validation. Failures return bounded stage/code outcomes; no partial conversion/candidates or automatic retry/repair/fallback. Full limits: [document contract](../document-candidates.md).

## Self-contained build and package

`npm run extension:build` uses esbuild for three sibling CommonJS bundles: extension, host-neutral runtime and conversion worker. The extension externalizes `vscode` and its sibling runtime; runtime externalizes Node built-ins only. `npm run extension:package` rebuilds these bundles and uses the explicit VSIX allowlist, then, for Full only, appends pinned offline OCR resources with their license/hash manifest. Both language instructions are included as `readme.md` and `README.pl.md`. End users use VS Code's bundled Node runtime; no repo-relative runtime lookup, npm or separate Node installation is required.

`npm run extension:verify` checks archive entries, bundle imports/limits, repository-path leakage, pinned OCR hashes and platform resource coverage. Product data, fixtures, tests and development scripts are excluded. Native Mac ARM evidence does not establish equivalent execution on every packaged platform. Historical verification and package identities live in [project-state history](https://github.com/Setech-pl/archi-agent/blob/fa586dd6f0398f72cdab4925bf5db907e00ebb23/docs/project-state-history.md); current checks and the auditor handoff are in [project state](../project-state.md).

MCP1 packaging defaults to Core, with no OCR dependencies/assets. Full retains the existing ID and pinned offline OCR, with explicit installation integrity checks. Both profiles use identical runtime bundles. See [CLI/MCP and profiles](cli-mcp.md) for the strict versioned result/source contracts and setup.

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

SRC1 overlay alias saving is a separate VS Code adapter operation: minimal edit and native save after version and dirty-buffer checks. Pack and MCP decisions remain session-only; CLI/MCP do not write sources. VER1 does not verify C4.

Rendered copies (SVG / PNG): [A SVG](../assets/diagrams/en-A.svg) / [PNG](../assets/diagrams/en-A.png) · [B SVG](../assets/diagrams/en-B.svg) / [PNG](../assets/diagrams/en-B.png) · [C SVG](../assets/diagrams/en-C.svg) / [PNG](../assets/diagrams/en-C.png) · [D SVG](../assets/diagrams/en-D.svg) / [PNG](../assets/diagrams/en-D.png) · [E SVG](../assets/diagrams/en-E.svg) / [PNG](../assets/diagrams/en-E.png) · [F SVG](../assets/diagrams/en-F.svg) / [PNG](../assets/diagrams/en-F.png)

## Provider configuration consistency

Resolve credentials for the final selected provider/model immediately before starting the operation.
Generation and review share that immutable operation configuration despite later setting changes.
The host observes relevant scoped configuration events before the first await; a monotonic revision
invalidates stale interactions even after external A→B→A changes. Only one extension writer publishes
at a time. Each setting write checks expected scoped state before and after await; only its own
expected notification is consumed. Unexpected events, trust/workspace changes or a newer publication
cancel stale selection. Dispose observations in finally, including failure and cancellation.

Keep fail-closed binding order, activate an explicit profile last, and re-read the effective result.
Partial publication can leave an unbound model. Multiple VS Code updates are non-atomic: there is
no rollback over newer values, crash recovery or CAS against arbitrary in-flight external writers.
Secrets stay in SecretStorage and never enter webviews, diagnostics or reports.

## Source and MCP boundaries


The shared runtime is composed by VSIX, CLI and the four-tool MCP function server. Portable results project existing reports without a second assessment engine. The Node MCP knowledge client is a separate source adapter: one configured stdio server, fixed get_knowledge_snapshot call, strict versioned normalized contributions and no LLM tool choice. Runtime pins one immutable snapshot per operation; a fresh fetch precedes a new operation or stale-session check. Production SRC1 parsing/mapping and K1 validation are shared with the standalone example. Remote records keep true references and original IDs; optional local locators are never fabricated. See [contracts and limits](cli-mcp.md) and [quality limits](../project-state.md).

Core and Full use identical runtime/worker bundles. Core excludes OCR dependencies and assets; Full contains pinned offline resources with an installation manifest. Both installed IDs require one enabled profile; no automatic disable or secret transfer. CLI/MCP use explicit readRoots and environment credentials, never VS Code SecretStorage.


See [knowledge source contract](../mcp-knowledge-source.md).

## Knowledge snapshot invariants

`src/core/knowledge-pack/knowledge-snapshot.ts` assembles a provider-neutral, immutable
knowledge snapshot using the existing pack record semantics and validators. Contributions
declare a logical source identity, kind and per-table scope (`partial` or `complete`;
omission means not provided). Complete describes the source's declared scope, never a
closed-world claim about architecture. A contribution may contain only systems and no
file positions. Source identity is retained for each claim; file/line provenance appears
only when supplied. Missing positions, categories and references remain explicit gaps.

Equivalent claims retain all their provenance. Incompatible entity/relationship/rule
claims, actor/system ID collisions, conflicting rules and forbidden relationships remain
explicit conflicts with references to every claim. There is no source precedence or
implicit winner. Multi-target aliases remain ambiguous. The sorted snapshot has a SHA-256
digest over semantic facts, source scopes, provenance, gaps, ambiguities and conflicts;
its ID contains that full digest. Source and record order do not change serialized bytes.
