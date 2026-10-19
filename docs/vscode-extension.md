# Archi Agent VS Code extension

Current complete user instructions: [English](en/user-guide.md) · [Polski](pl/user-guide.md). These describe the current UX4-FU2 branch build; the public UX2 package is distinct. This stable path remains a technical reference.

The extension is the first self-contained host of the Archi Agent runtime. It packages the existing
sequence compatibility path and the reviewed Sequence and Component pipelines (Knowledge Pack loading,
deterministic grounding, plan validation, PlantUML rendering and grounding reports) into a VSIX that runs without the
source repository, npm, a TypeScript compiler, a root `node_modules` directory or a separately
installed Node.js. P1 added local profile/model selection; P2 adds Anthropic, OpenAI and OpenRouter
with credentials held by VS Code `SecretStorage`. This document describes
the current extension; it is not published to any
marketplace.

Offline **Archi: Help** / **Archi: Open → Help** selects the bundled Polish README for display language `pl`, English otherwise; both language links stay within the VSIX. Current component/data-flow diagrams: [architecture](architecture.md). Historical technical results are identified by date/artifact, not current smoke acceptance.

## Architecture

```text
VS Code UI  (quick picks, input boxes, progress, editors, settings)
    |
    v
vscode-extension/src            editor layer: configuration/review webviews, QuickPick diagram selection, generation, conversion, settings
    |
    v  createPackagedRuntime()
src/runtime                     application runtime: ArchiAgentRuntime + convertDocument
    |
    v
src/core + src/node             grounding pipeline + isolated local document converters
```

| Layer | Location | May import | Responsibility |
| --- | --- | --- | --- |
| Editor layer | `vscode-extension/src` | `vscode`, `node:path`, `src/runtime/index.ts` | Collect input, show progress, open artifacts and one untitled Markdown result, log safe diagnostics. |
| Application runtime | `src/runtime` | `src/core`, `src/node` | Keep generation on `ArchiAgentRuntime`; expose separate `convertDocument` with a disposable worker. Never imports `vscode`, never reads `process.cwd()` or `process.env`. |
| Core and Node adapters | `src/core`, `src/node` | as before | Provider-neutral pipeline and local conversion contracts; concrete providers and bounded document readers in Node. |

The editor layer reaches the repository only through `src/runtime/index.ts`; a test enforces this.
The runtime contract (`src/runtime/runtime-types.ts`) speaks about sources, not implementations:
a flow source (document text, an absolute file path or a plain description), a Knowledge Pack source
(today: one local directory), a provider-neutral generator configuration (legacy local endpoint or
profile/model/credential selection) and a typed result. Verified `generateDiagram` success carries
PlantUML and report v2; its unverified result carries only the locally valid candidate and closed
review codes. D1 added `generateDiagram` next to `generateSequenceDiagram`. Later knowledge
sources and model providers add variants to the source and generator unions. Hosts written against
the interface do not change.

### Runtime results

`generateSequenceDiagram` never throws for an expected failure. It returns either a success
(diagram name, generator type, grounding digest, PlantUML text, report JSON, summary counts,
warnings) or a failure with one of these stages:

| Stage | Meaning |
| --- | --- |
| `flow` | The flow document or description was rejected (front matter, limits, control characters, unreadable file). |
| `knowledge-pack` | The pack directory could not be opened or loaded; issues name the pack file and line. |
| `generator-configuration` | The base URL is not a literal loopback URL or the model identifier is unsafe. |
| `grounding-blocked` | Grounding needs a decision or cannot proceed. The result lists the ambiguous mentions with every candidate and the unconfirmed `[NEW: ...]` names. |
| `invalid-generator-output` | The model request failed (stable transport code) or the answer violates the strict schema. |
| `semantic-validation-failed` | The answer violates the grounded architecture. |
| `render-validation-failed` | The rendered PlantUML failed the structural check. |

Issues carry codes, fixed messages, positions, identifiers and counts. They never carry flow text,
pack content, prompts, model answers or machine paths; the report uses the bare file name of the
flow and the bare directory name of the pack.

## Commands

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## Settings

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## Security and privacy

- Local profiles connect only to literal loopback endpoints; cloud profiles connect only to the
  fixed HTTPS hosts and paths in `docs/cloud-models.md`. Redirects are rejected.
- API keys exist only in `SecretStorage` and are never logged, displayed or written to generated
  artifacts. No request is made during activation, profile selection or key set/delete.
- The model receives the compact grounded context of the current flow, never the whole pack.
- Verbose is off by default. When enabled, each bounded JSON Lines event carries timestamp, run ID,
  phase, safe IDs/rules and counts. It never includes prompts, raw model answers, request or response
  bodies, API keys, authorization headers, flow or Knowledge Pack fragments, message labels, full
  PlantUML, full grounding report, local absolute paths or provider error responses. The Output
  Channel still shows short user messages and safe issue details.
- The pack directory is opened with the link-free, bounded Node adapters; only the five fixed file
  names are read.
- The extension spawns no process and runs no npm script.

## Development build

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## VSIX packaging

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## Installation

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## Local model configuration

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## Cloud model configuration

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## Knowledge Pack configuration

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## Manual smoke flows (optional)

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## UX2 phase 2 manual smoke (PASS, 2026-10-02)

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## Tests

| Area | File | Covers |
| --- | --- | --- |
| Runtime | `test/runtime/archi-agent-runtime.test.ts` | Success with a fake generator, cwd independence, external and invalid packs, absolute-path flow files, typed descriptions, controlled failures for every stage, ambiguity and `[NEW]` handling, model listing against a loopback double. |
| Cloud runtime | `test/runtime/cloud-provider-runtime.test.ts`, `test/node/llm/*remote*` | Fixed endpoints, exact bodies/headers, model listing, structured responses, no retry/fallback, limits, cancellation and safe errors through controlled transport doubles only. |
| Secrets | `test/vscode-extension/api-key-management.test.ts` | Provider-specific set/get/delete, password input, cancellation, empty input, write failures and pre-I/O missing-key behavior. |
| Settings | `test/vscode-extension/settings.test.ts` | Parsing, defaults, missing or relative pack path, unsafe model id, non-loopback URLs, timeout range. |
| Session | `test/vscode-extension/sequence-generation-session.test.ts` | Request building, ambiguity prompts, candidate validation, new-participant confirmation, bounded rounds, cancellation. |
| Messages | `test/vscode-extension/user-messages.test.ts` | Safe issue lines, stage texts, endpoint hint, bounds. |
| Command | `test/vscode-extension/extension-command.test.ts` | Activation and manifest consistency, the command through an in-memory `vscode` double: editors opened, quick picks, model listing, failures and actions. |
| Packaging | `test/vscode-extension/packaging.test.ts` | Bundle build and link contract, runtime bundle executed by a child process from an empty directory with an empty PATH, VSIX packaging and verification, source boundaries. |
| UX1 conversion | `test/core/document-conversion.test.ts`, `test/node/document-conversion.test.ts`, `test/runtime/convert-document.test.ts`, `test/vscode-extension/ux1-commands.test.ts` | Local PDF/DOCX/XLSX, ZIP and output limits, worker cancellation and timeout, QuickPick routing and untitled editor behavior. |

## Known limitations

See [user guide](en/user-guide.md), [development](en/development.md),
[architecture](en/architecture.md) and [current limits](project-state.md).

## ART1 controlled save

The separate save command consumes the original completed runtime artifact associated with open
result previews. It does not read settings, buffers, secrets or architecture sources. It saves two
files in a new project subdirectory only after explicit confirmation; multi-root chooses a project.
See [format, digests and conditional rollback](diagram-artifact-save.md).
