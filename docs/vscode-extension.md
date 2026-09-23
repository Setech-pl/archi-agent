# Archi Agent VS Code extension

The extension is the first self-contained host of the Archi Agent runtime. It packages the existing
sequence pipeline (Knowledge Pack loading, deterministic grounding, the local OpenAI-compatible
generator, validation, PlantUML rendering, the grounding report) into a VSIX that runs without the
source repository, npm, a TypeScript compiler, a root `node_modules` directory or a separately
installed Node.js. P1 added local profile/model selection; P2 adds Anthropic, OpenAI and OpenRouter
with credentials held by VS Code `SecretStorage`. This document describes
the current extension; it is not published to any
marketplace.

## Architecture

```text
VS Code UI  (quick picks, input boxes, progress, editors, settings)
    |
    v
vscode-extension/src            editor layer: extension.ts, the generate command, settings, messages
    |
    v  createPackagedRuntime()
src/runtime                     application runtime: ArchiAgentRuntime (editor-independent, Node)
    |
    v
src/core + src/node             unchanged grounding core, pipeline and Node adapters
```

| Layer | Location | May import | Responsibility |
| --- | --- | --- | --- |
| Editor layer | `vscode-extension/src` | `vscode`, `node:path`, `src/runtime/index.ts` | Collect input, show progress, ask the user to resolve ambiguity and confirm new participants, open the artifacts, log safe diagnostics. |
| Application runtime | `src/runtime` | `src/core`, `src/node` | Resolve request sources with the Node adapters, build the generator from the configuration, run the pipeline, map the outcome to a host-neutral result. Never imports `vscode`, never reads `process.cwd()` or `process.env`. |
| Core and Node adapters | `src/core`, `src/node` | as before | Provider-neutral registry and pipeline core; concrete local/cloud profiles, loopback HTTP and fixed-allowlist HTTPS transports in Node. |

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

`Archi Agent: Select Provider Profile` lists LM Studio, Ollama, Anthropic, OpenAI and OpenRouter
without contacting any provider or reading `SecretStorage`. It shows the current profile but no
saved/not-saved key status. Changing profile clears `selectedModel`, then clears its `selectedModelProfile` binding,
then stores the new profile; selecting the same explicit profile preserves both values. A failure
stops that sequence, and the new profile is never activated with an old model. Cancellation writes
nothing.

`Archi Agent: Set or Update API Key` uses a password input and writes only to provider-specific VS
Code `SecretStorage`. `Archi Agent: Delete Saved API Key` requires confirmation. Neither command
contacts a provider; local profiles never request or read a key. Values are accepted only when they
contain 1–1024 characters, have no edge whitespace and contain no control character.

`Archi Agent: Select Model` performs exactly one explicit bounded model-list GET, preserves the
runtime's deterministic identifier order and stores the chosen model with a binding to the current
profile. If no profile was explicitly stored, the command lists legacy LM Studio models, stores the
model and binding, and stores the profile last so only a complete choice activates profile mode.
For a cloud profile, a missing key blocks the GET before network I/O. The key is read only after
the profile has been resolved, directly before the explicit listing call. The returned model list
is required to construct the picker, so dismissing an already displayed cloud model picker occurs
after one `SecretStorage.get` and one model-list GET. That cancellation writes no model or binding
and does not start generation.

`Archi Agent: Generate Diagram` (`archiAgent.generateDiagram`) first asks for a diagram type.
The picker offers only Sequence and runs the D1.2 Wire Plan v3 path: one strict operation-selection
request, local plan resolution and deterministic PlantUML rendering, then one independent
semantic review request. Verified success opens PlantUML and report v2. If review rejects or
fails after all local checks, one modal offers the unverified candidate. **Show unverified
candidate** opens one untitled PlantUML document with a fixed warning header and no report;
**Cancel** or dismissal opens nothing. User cancellation during review never offers a candidate.
No retry, repair, fallback or third request occurs. The latest Wire Plan v3 owner smoke passed
local validation but reviewer output was truncated; S1 remains FAIL until verified owner smoke.
The four
reserved types remain unsupported through direct runtime calls before any credential read or
provider I/O. `Archi Agent: Generate
Sequence Diagram` (`archiAgent.generateSequenceDiagram`) remains the compatible command and
retains its existing output and report behavior.

1. Settings are read and checked. Problems name the setting and offer **Open Settings**.
2. The flow source is chosen: the active editor document, a flow file from the open dialog, or a
   flow name and a one-line description typed in (the runtime composes the front matter with the
   configured default author and a diagram name derived from the flow name).
3. When no model is configured, the models reported by the selected profile are listed only after
   this explicit generate command; the choice is stored in machine-scoped user settings.
4. Dismissing the flow-source picker happens before any cloud secret read or provider I/O. When no
   model is configured, continuing past the flow choice reads the cloud key and performs one
   model-list GET before displaying the model picker; dismissing that picker writes no settings and
   performs no generation POST. With an already selected model there is no listing GET, and the
   cloud key is read directly before generation.
5. Generation runs under a cancellable progress notification.
6. If grounding is blocked by ambiguity, one quick pick per ambiguous mention shows every candidate
   (canonical name, identifier, kind, pack source line). Nothing is chosen automatically; dismissing
   the pick cancels the command. If the flow contains unconfirmed `[NEW: Name]` markers, a
   multi-select quick pick asks which to confirm; a marker left unselected keeps the flow blocked.
   Resolution is bounded to three rounds.
7. On verified success the PlantUML opens in an untitled editor (language `plantuml` when an extension
   registered it, otherwise plain text) and the grounding report opens as JSON beside it. A
   notification shows the summary counts; the output channel **Archi Agent** lists the digest, the
   generator and every warning.
8. On unverified review, a modal offers one marked PlantUML candidate. Cancel opens no document.
   No grounding report is created on this path.
9. On earlier failure a notification explains the stage; **Show Details** opens the output channel with the
   issue lines.

Nothing is written to disk. Save the editors where you want the artifacts; versioned writing through
the existing artifact writer is a later checkpoint.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `archiAgent.knowledgePackPath` | (empty) | Absolute path of the Knowledge Pack directory holding the five pack files. Relative paths are rejected; nothing is resolved against a workspace or the working directory. |
| `archiAgent.localModel.profile` | `local-lm-studio` | Explicit local or cloud profile. Scope `machine`: not synchronized and not overridable by workspace settings. The manifest default is not an explicit migration. |
| `archiAgent.localModel.selectedModel` | (empty) | Model for the explicit profile. Scope `machine`; written through `ConfigurationTarget.Global`. Cloud IDs may contain a namespace slash. |
| `archiAgent.localModel.selectedModelProfile` | (empty) | Extension-managed binding of `selectedModel` to its profile. Scope `machine`; written through `ConfigurationTarget.Global`. |
| `archiAgent.localModel.baseUrl` | `http://127.0.0.1:1234/v1` | Legacy LM Studio loopback URL and compatible LM Studio override. Ollama ignores it and uses `http://127.0.0.1:11434/v1`. |
| `archiAgent.localModel.model` | (empty) | Legacy LM Studio model only. New profile-aware choices are never stored here. |
| `archiAgent.localModel.timeoutSeconds` | `120` | Time limit of one model request (1 to 600). |
| `archiAgent.defaultAuthor` | `Archi Agent` | Author written into the front matter of a typed description. |
| `archiAgent.diagnostics.verbose` | `false` | Machine-scoped safe JSON Lines pipeline diagnostics in the existing **Archi Agent** Output Channel. |

In an untrusted workspace the path and model settings are read from user settings only
(`restrictedConfigurations`), so a workspace cannot point the extension at another directory or
port. Cloud API keys are not settings at all; they exist only in `SecretStorage`.

Only `inspect("localModel.profile").globalValue === undefined` selects legacy LM Studio mode, where
effective `baseUrl` and `model` values retain normal VS Code precedence. Every present global value
is explicit: an unknown, empty or malformed profile produces `unknown-provider-profile` before any
model-list or generation request and does not use legacy values. With a registered explicit profile,
the extension reads only global `selectedModel` and accepts it only when global
`selectedModelProfile` exactly matches the active profile. Workspace values cannot override any of
these three machine-scoped settings. A manual profile change leaves a stale model/binding stored but
inactive, so generation asks for a model rather than moving one between profiles. Existing legacy
settings are retained. Machine scope keeps a Windows LM Studio choice independent from a MacBook
Ollama choice even when Settings Sync is enabled.

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

Requires Node.js 22.12 or later and the repository dependencies:

```bash
npm ci
npm run extension:typecheck   # tsc over vscode-extension/src and src/runtime
npm run extension:build       # esbuild -> vscode-extension/dist/{extension.js,archi-agent-runtime.js}
npm run extension:test        # runtime, editor-layer and packaging tests
```

Press F5 in VS Code with this repository open: the launch configuration builds the bundles and
starts an Extension Development Host with `vscode-extension` as the extension.

### Bundling

Two CommonJS bundles are produced by `vscode-extension/scripts/build.mjs`:

| Bundle | Entry | Content |
| --- | --- | --- |
| `dist/archi-agent-runtime.js` | `src/runtime/index.ts` | Core, Node adapters, runtime API and `zod`; requires only `node:` built-ins. |
| `dist/extension.js` | `vscode-extension/src/extension.ts` | Editor layer; requires `vscode`, `node:path` and `./archi-agent-runtime.js`. |

The build rewrites the import of `src/runtime/index.ts` in the editor layer to the sibling runtime
bundle, so the extension links to the packaged runtime and never to the source tree. No source map is
emitted, so the bundles carry no machine path. `node_modules` is never packaged: the single
dependency is bundled.

### Node and VS Code target

| Item | Value |
| --- | --- |
| `engines.vscode` | `^1.91.0` |
| Extension host runtime | Node 20 (VS Code 1.91 ships Electron 29) |
| esbuild target | `node20`, format `cjs` |
| `@types/vscode` | `1.91.0`, pinned to the engine so no newer API is used |
| Development Node | 22.12 or later (root `engines.node`); the development version does not affect the bundle target |

## VSIX packaging

```bash
npm run extension:package     # builds, then vsce (library mode) -> vscode-extension/build/archi-agent-<version>.vsix
npm run extension:verify      # inspects the newest VSIX in vscode-extension/build
```

`vsce` runs with dependency detection disabled, without a license prompt and without a marketplace
call; it needs no `node_modules` inside `vscode-extension`. The package is ignored by Git.

### Verification

`vscode-extension/scripts/verify-vsix.mjs` reads the VSIX as a ZIP (own minimal reader, no archive
dependency) and requires exactly:

```text
extension.vsixmanifest
[Content_Types].xml
extension/package.json
extension/dist/extension.js
extension/dist/archi-agent-runtime.js
extension/readme.md            (optional; the extension README)
```

Any other entry fails verification, and these are also rejected by name: Git metadata, `.env`
files, `node_modules`, TypeScript sources, test directories, coverage, nested archives, samples and
Knowledge Packs, generated `.puml` or `.grounding.json` artifacts, source maps, logs and dumps,
credential material and editor-local configuration. The packaged manifest must declare no
dependencies and no scripts; the extension bundle must link to `vscode` and the runtime bundle and to
nothing else; the runtime bundle must not link to `vscode`; both may require only Node built-ins and
must not contain the repository path, an npm invocation or `child_process`.

## Installation

1. Build the VSIX as above, or take one that was built for you.
2. In VS Code: **Extensions** view, `...` menu, **Install from VSIX...**, choose the file.
   Or from a shell: `code --install-extension vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix`.
3. Open **Settings**, search for `Archi Agent`, set `archiAgent.knowledgePackPath`.

The installed extension needs neither the repository nor npm.

## Local model configuration

1. Start LM Studio on port 1234 or Ollama's OpenAI-compatible endpoint on port 11434, and prepare an
   instruction model that supports structured JSON output. Very small models
   often fail the structured-output contract or the grounding rules.
2. Run **Archi Agent: Select Provider Profile**.
3. Run **Archi Agent: Select Model**. The choice stays local to this computer.

Legacy LM Studio users need no manual migration: existing effective `baseUrl` and `model` values
continue to work until either selection command establishes the profile path.

## Cloud model configuration

Select Anthropic, OpenAI or OpenRouter, run **Set or Update API Key**, then **Select Model**. The
profile/model binding and key survive restart in their separate stores; deleting one provider's key
does not affect another provider or the selected profile/model. Full endpoints, request contracts,
failure policy and cost-warning smoke flows are in [`cloud-models.md`](cloud-models.md).

## Knowledge Pack configuration

Set `archiAgent.knowledgePackPath` to the absolute path of a directory holding `systems.md`,
`actors.md`, `relationships.md`, `aliases.md` and `rules.md` (see `docs/knowledge-pack-format.md`).
The directory may be anywhere; it is not part of the VSIX and not resolved relative to a workspace.
The repository sample `samples/space-mission/architecture` works as a first pack when its absolute
path is configured. The pack directory must be a real directory reached without symbolic links or
junctions.

## Owner smoke flows (optional)

LM Studio flow: package and verify the VSIX, install it in a clean VS Code profile, configure the
sample Knowledge Pack, select **LM Studio**, select a model, generate from the sample flow, and
verify the PlantUML and grounding report. Confirm the server observed one model-list GET (when the
model picker was used) and one chat-completions POST.

Ollama flow: repeat in a separate clean VS Code profile or computer, select **Ollama**, select a
tagged model such as `qwen3:8b`, generate, and verify the same outputs and one POST through
`http://127.0.0.1:11434/v1`. Confirm that LM Studio's legacy workspace model and base URL are not
used.

The earlier LM Studio-only procedure remains useful for checking legacy migration:

```text
1. npm ci
2. npm run extension:package && npm run extension:verify
3. Install vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix into VS Code
   (a clean profile is best: code --profile archi-agent-smoke)
4. Set archiAgent.knowledgePackPath to the absolute path of samples/space-mission/architecture
5. Start LM Studio with its local server on port 1234
6. Load a structured-output capable instruction model; leave archiAgent.localModel.model empty
7. Open samples/space-mission/flows/telemetry-command-flow.md, run
   "Archi Agent: Generate Sequence Diagram", choose "Use the active editor document",
   pick the model when asked
8. Verify that an untitled PlantUML document opens with @startuml ... @enduml, that the
   grounding report opens beside it, and that the notification reports the counts
```

Steps 1 and 2 are for building the VSIX; the installed extension itself needs neither. Automated
tests never contact LM Studio: they use a fake generator and a loopback server double.

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

## Known limitations

- The description input is a single line; multi-line flows need a flow document in an editor or a
  file.
- Artifacts are opened as untitled editors and not written to disk; versioned writing is deferred.
- Only one Knowledge Pack directory can be configured; model profiles are limited to LM Studio,
  Ollama, Anthropic, OpenAI and OpenRouter.
- The runtime bundle is about 1 MB unminified because it carries the complete `zod` library.
- The PlantUML editor has no preview; a PlantUML extension, if installed, provides language support
  and preview independently.
- Package names in the root project (`archground`, `ArchGround`) remain unchanged; only the
  extension and its user-facing text use `Archi Agent`. Renaming the root package is deferred.
- Deferred by design at this checkpoint: Enterprise Architect XML and API sources, Confluence,
  Google Drive, OneDrive and SharePoint, component, C4 and ArchiMate profiles,
  the repair loop and marketplace publishing. Semantic review is implemented for D1.2 Sequence;
  the runtime contract leaves room for
  each of them without changing the editor layer.
