# VS Code host specification

User instructions: [English](en/user-guide.md) · [Polski](pl/user-guide.md).
This document describes the host on main. Published package identities and their source commits
are maintained in the release manifests linked from [project state](project-state.md).

## Boundaries

`vscode-extension/src` imports product operations only through `src/runtime/index.ts`.
It adapts commands, settings, SecretStorage, progress/cancellation, native pickers, editors,
the Knowledge tree and two webviews. Core and runtime never import `vscode`.
Node adapters own bounded source reads, provider transport and conversion workers.
[Technical architecture](architecture.md) defines the shared operations and call budgets.

Create Diagram dispatches Sequence, Component, C4 Context and C4 Container through the shared
runtime. The hidden old Sequence command delegates to the type picker; the internal
`generateSequenceDiagram` compatibility API remains separate. Verify Flow uses the shared
verification session. CLI and function MCP are separate hosts of the same runtime.

Expected failures use typed outcomes and bounded safe issues. UI messages expose a closed
stage/code and a useful next action, without raw exceptions, prompts, responses or source text.
A rejected semantic review may offer a locally valid, warning-marked unverified candidate;
it cannot register a completed original pair for ART1. Cancel opens no result.

## Commands and panels

The manifest in [package.json](../vscode-extension/package.json) is authoritative for command IDs,
menu visibility, settings, Workspace Trust restrictions and supported VS Code versions.
Visible commands use category **Archi**. Open is the task hub; compatibility IDs remain callable
but hidden where declared by the manifest.

Configuration is a singleton editor with Knowledge Management and LLM Provider tabs.
Knowledge Pack Review is a linked panel backed by `KnowledgePackReviewSession`.
Both use local scripts, nonce CSP, empty localResourceRoots, closed operation allowlists and
bounded host-validated messages. Imported names/text use `textContent` or `value`.
Panel lifetime and cancellation are rechecked after asynchronous reads before dispatch.
[Configuration contract](configuration-workbench.md) owns draft/applied state, listing,
publication guards, key handling and the native tree. [Review contract](knowledge-pack-review.md)
owns decisions, preview, save and activation; no duplicate session engine lives in the host.

Active MD/TXT input is captured synchronously before an await, including dirty and untitled
buffers. Supported local PDF/DOCX/XLSX preview tabs contribute their real file URI.
Unsupported or stale tabs fail explicitly; no alternate editor or temporary surrogate is used.

## Settings, credentials and trust

Profile, selected model and profile binding are machine-scoped User settings. Only absence of
a global profile activates legacy LM Studio resolution. A present malformed/unknown profile
fails before provider I/O. An explicit profile accepts a model only when its stored binding
matches. Endpoint/timeout can have effective workspace overrides subject to Workspace Trust.
Knowledge Pack/source selection is resource scoped; multi-root operations select a project.
The knowledge MCP executable is read from User settings only.

Provider keys are separate SecretStorage values. Native masked input handles entry; webviews
receive presence only. One operation captures its final selected profile/model/credential and
retains it for generation and review. Configuration writes are sequential and guarded against
observed changes, including external ABA; they are not atomic compare-and-swap. No rollback
may overwrite a newer setting. [ABA repair](audit-provider-configuration-aba-fix.md) and
[independent review](audit-provider-configuration-aba-independent-review.md) preserve the evidence.

No provider request runs during activation, key entry or Help. Explicit model listing, generation
and acquisition have separate budgets. Local transports require literal loopback; cloud adapters
use fixed HTTPS allowlists. A configured knowledge MCP stdio process is a Node adapter, with
no shell or automatic installation. [CLI/MCP](en/cli-mcp.md) documents its permissions.

## Editors and original artifacts

Successful generation opens two unsaved linked previews and registers a frozen runtime artifact.
The host never reconstructs that artifact from edited buffers. Save Diagram and Report selects
the result and project, displays native confirmation and calls the existing ART1 operation.
At least one real preview keeps the registry entry alive; language changes are not closes.
Closing both removes the menu/palette entry. A pending generation notification retains its own
original; restart/reload clears memory. [ART1](diagram-artifact-save.md) owns byte digests,
exclusive creation, conditional cleanup and the absence of atomic multi-file publication.

## Offline Help

`docs/en/user-guide.md` and `docs/pl/user-guide.md` are the instruction sources.
Run `node scripts/docs/sync-help.mjs` to generate both extension READMEs. Help selects Polish
for VS Code display language `pl` and regional variants, English otherwise. Local language
links resolve to packaged `readme.md` / `README.pl.md`; screenshots, license and notices remain
local. Supplementary repository links target main. Historical evidence uses a full commit SHA.
No provider or application language setting is involved.

## Build and distribution

Development requires the root manifest's Node >=22.12.0 and `npm ci`.

```bash
npm run extension:typecheck
npm run extension:test
npm run extension:build
npm run extension:package -- --profile core --out build/docs-core
npm run extension:verify -- build/docs-core/archi-agent-core-0.3.0-alpha.7.vsix
npm run extension:package -- --profile full --out build/docs-full
npm run extension:verify -- build/docs-full/archi-agent-full-0.3.0-alpha.7.vsix
```

Package sequentially in new output directories. Full requires prepared pinned OCR assets;
see [development](en/development.md) and [ICU provenance](ci-clean-clone-icu.md).
The build uses esbuild, target Node 20, CommonJS, no source maps:

| Bundle | Entry | Allowed external boundary |
| --- | --- | --- |
| `extension.js` | `vscode-extension/src/extension.ts` | VS Code, Node built-ins, sibling runtime |
| `archi-agent-runtime.js` | `src/runtime/index.ts` | Node built-ins |
| `archi-agent-converter-worker.js` | `src/node/document-conversion/worker.ts` | Node built-ins |

Core is the default (`setech-pl.archi-agent-core`); Full (`setech-pl.archi-agent`) adds pinned
PL/EN OCR resources. Runtime bundles are identical. Both installed IDs require exactly one
enabled profile and reload; neither silently disables the other or copies SecretStorage.
The installed extension needs no repository, npm or separate Node installation.

Packaging uses explicit allowlists and stages both instructions, bounded Help PNGs, license,
third-party notices and the distribution profile. Full appends verified OCR resources and
an integrity/provenance manifest, including the same-version Windows ICU supplement.
The verifier checks entries, imports, byte limits, repository-path leakage, OCR hashes,
platform coverage and profile-specific exclusions. It rejects development files, private data,
source maps and unexpected entries. Root `node_modules` is not a runtime dependency.

## Verification references

Host regression tests live in `test/vscode-extension`; packaged contracts in
`test/vscode-extension/packaging.test.ts`; runtime tests in `test/runtime`.
[Development workflow](development-workflow.md) defines functional gates and the distinction
between controlled Host answers, visible native UI, manual smoke and live-model quality.
[Documentation tooling](../scripts/docs/README.md) defines Help/link/image/license checks.
Historical smoke results are not current acceptance evidence; release/candidate reports are
linked from [project state](project-state.md).
