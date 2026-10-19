[Polski](START-HERE.pl.md) · [Public packages](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1)

# Mission Control — start here

A complete synthetic architecture is already in `architecture/`. The first result uses **Verify Flow on PlantUML, without an LLM**. You do not need to build a Knowledge Pack.

![Mission Control in the installed product](assets/project.png)

![Architecture](assets/architecture.png)

## 1. Download and install

Download this [project ZIP](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-demo-mission-control-0.3.0-alpha.7-demo.1.zip) and extract it into a new local folder. Spaces and Polish characters are supported. Desktop VS Code **1.91+** is required. Pick [Core VSIX](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-core-0.3.0-alpha.7.vsix) for this first exercise, or [Full VSIX](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-full-0.3.0-alpha.7.vsix) for optional offline PL/EN OCR. Verify the release `SHA256SUMS` before installation. Core and Full run the same product runtime.

Use **Extensions → … → Install from VSIX…**, enable exactly one profile, and **Developer: Reload Window**. Existing Full users may keep Full. When changing profiles, shared settings stay, but cloud keys belong to each extension ID and must be entered again. Normal VSIX use needs **no clone, npm, separate Node, Java or PlantUML**. Archi Agent opens diagram text; a graphical preview requires an additional PlantUML renderer.

## 2. Open the ready source

Use **File → Open Folder** on the extracted `mission-control` folder. Open VS Code's integrated terminal in that folder and run:

- macOS/Linux: `sh ./setup.sh`
- Windows PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1`

Setup only creates `.vscode/settings.json`, refuses to overwrite it, and writes absolute local paths. It does not expand `${workspaceFolder}`. Read the bundled script before running it. Trust this synthetic workspace if VS Code requests Workspace Trust.

For an existing settings file, preserve its entries. In **Preferences: Open Workspace Settings (JSON)**, add the following object, replacing MODEL and OVERLAY with **Copy Path** from `architecture/workspace.json` and `architecture/overlay` in Explorer (JSON-escape Windows backslashes):

```json
"archiAgent.architectureSource": {
  "kind": "structurizr-json",
  "sourceId": "mission-control",
  "modelPath": "MODEL",
  "overlayPath": "OVERLAY"
}
```

Run **Archi: Configuration → Knowledge Management**. Expect **1 actor, 6 systems, 6 relationships**, valid Structurizr JSON and zero omitted components. The 6 systems include the parent software system and 5 containers. Then **Archi: Knowledge Browser**: expand the source, systems and relationships; inspect original IDs and separate JSON/overlay field provenance. No provider is needed. The alias tables are already complete for the basic scenarios.

![Current Configuration example (DOC2, Big Bank)](assets/20-configuration.png)

This DOC2 reference shows the same controls with Big Bank counts; the first image above is this project. [DOC2 capture provenance](https://github.com/Setech-pl/archi-agent/blob/v0.3.0-alpha.7-demo.1/docs/assets/screenshots/README.md).

## 3. First result — no model

Open `inputs/en/01-good.puml`, keep the whole document active without a selection, run **Archi: Verify Flow (Sequence / prose)** and choose **Use active document**. Expected JSON: `report.execution = completed`, `report.assessment = conformant-within-scope`, `report.modelCalls = 0`, one conformant step. Read `evidence` for actual source and overlay references. This is conformance within the loaded scope, not a proof of complete architecture correctness. Cancel any name picker in negative examples to keep the original unresolved finding.

Save the report explicitly with **File → Save As** under a new `reports/` filename. Verification does not use ART1 and does not automatically save reports.

## 4. Isolated verification exercises

Every file is ready; PL equivalents are in `inputs/pl/`. Each negative example changes one concern. `expected/verification.json` is the machine-readable contract.

| File (inputs/en/) | Expected before saving the new alias |
| --- | --- |
| 01-good.puml | conformant-within-scope, sync, zero model calls |
| 02-direction.puml | discrepancies; direction-mismatch + relationship-not-in-model |
| 03-mode.puml | discrepancies; interaction-mode-conflict (async used for a sync relation) |
| 04-unknown.puml | inconclusive / needs-resolution; unknown-element; cancel mapping for Unknown Gateway |
| 05-partial.puml | inconclusive; syntax-not-covered for the unsupported autonumber directive; known step still evaluated |
| 06-alias-after-save.puml | unknown-element for Komendami initially; conformant after exercise 6 |
| 09-async-good.puml | conformant-within-scope for the known asynchronous relation |

![Current Verify Flow reference (DOC2, Big Bank)](assets/18-verify-flow.png)

The exact bundled legend assigns arrow semantics. Do not change it: an arrow alone does not establish sync/async/response meaning. C4 and Component verification are not implemented. No source relation means “absent from loaded scope”, not “impossible”.

## 5. Configure your model, then generate four diagrams

Open **Archi: Configuration → LLM Provider**. Choose **LM Studio** (`http://127.0.0.1:1234/v1`) or **Ollama** (`http://127.0.0.1:11434/v1`), start its local server with your model loaded, select the profile, refresh **Available models**, select one **Selected model**, and **Apply**. A model must support the product's structured JSON requests. Model availability, quality and machine requirements depend on your chosen model.

Alternatively choose **Anthropic**, **OpenAI** or **OpenRouter**, use **Set / Replace Key**, select an available model, and **Apply**. Keys are stored in VS Code SecretStorage, never in this project. Cloud calls use your account and may cost money. **Check Provider Configuration** checks the applied selection. Configuration edits remain drafts until Apply; Discard restores applied values.

Open `inputs/en/08-generate.md`, run **Archi: Create Diagram**, choose **Sequence**, then **Use the active editor document**. Repeat with **Component**. Expect grounded participants/dependencies from this source and a linked JSON report. For **C4 Context** and **C4 Container**, choose software system **Mission Control**; these exercises use source type and hierarchy. Context shows the actor and system; Container shows the five containers and source-supported surrounding interactions. Successful generation uses one plan and one review request on one frozen snapshot. There is no retry/repair/fallback. An unverified or failed model response is not a passing result.

## 6. Prose, explicit meaning and persistent alias

Open `inputs/pl/07-prose.txt`, run Verify Flow, **Use active document → Prose (one interpretation request)**. The intended interpretation retains literal **Komendami**. When prompted, consciously map it to **Mission Control / Command Service**, inspect its original ID and provenance, and confirm. The same interpretation is reused without another model request. Expected assessment after the mapping: conformant-within-scope. The real model may interpret prose imperfectly: inspect the interpreted step and evidence before accepting.

Choose **Save confirmed aliases** in the completion notification, inspect the proposed edit to `architecture/overlay/aliases.md`, and approve the native save confirmation. Only then is the new alias persistent. Reopen `inputs/en/06-alias-after-save.puml` and verify: expected conformant-within-scope with zero LLM requests and no name picker. Standalone packs/MCP support session decisions, not this SRC1 alias save. `inputs/en/07-prose.txt` is a ready English counterpart without inflection.

## 7. Save the original diagram/report pair (ART1)

With a successful generated diagram preview and its report still open, run **Archi: Save Diagram and Report**, select the original result by type/time/UUID and approve the native destination dialog. Expect `archi-agent-results/<UTC>-<UUID>/diagram.puml` and `report.json`. ART1 stores the original frozen pair, including provenance; editing a preview does not replace the saved bytes. Save performs no model call. Closing both result previews removes its in-memory save choice.

## Repeat safely and use your own data

Keep the downloaded ZIP unchanged. For a fresh alias exercise, extract a second copy and run setup there; do not overwrite a working overlay. Results use new UUID folders. Save reports under new names. When moving a project, create settings again with the new paths (preserve the previous file first). No author paths, keys or private endpoints are bundled.

Replace a **copy** of `architecture/workspace.json` with your Structurizr JSON, retain stable original IDs, update all three overlay tables and source_id, then validate in Configuration before use. People, systems, containers and static relationships are supported; components/deployment/views are outside projection. DSL and direct EA import are unavailable. A flat Markdown pack does not provide the hierarchy C4 requires. Review facts before sending the selected minimal context to your provider.

Owner smoke **DEFERRED**; live LLM and Windows ARM64 runtime **NOT_RUN** during preparation; AUD-003–006 **OPEN**. Synthetic transport tests prove integration, not live-model quality. Native UI evidence is macOS ARM64. New-folder saves are guarded, without atomic multi-file publication/crash recovery. [Feature/evidence matrix](https://github.com/Setech-pl/archi-agent/blob/v0.3.0-alpha.7-demo.1/docs/demo1-verification.md).

Every report also includes the shared informational `source-not-covered` for Structurizr views outside the import projection. It does not invalidate a conformant supported step; the exercise table lists the additional isolated concern.

## 8. CLI and the two MCP directions (optional, Node required)

![The two MCP directions](assets/mcp-directions.png)

Only these advanced process exercises require **Node.js >=22.12.0** on PATH. Download [CLI/MCP tarball](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-cli-0.3.0-alpha.7.tgz), verify SHA-256 and extract it with `tar -xzf archi-agent-cli-0.3.0-alpha.7.tgz`. A `package/bin/` directory appears. No npm install or source repository is needed. In the project terminal run (replace the quoted package path with its actual absolute path):

```sh
node tools/setup-cli.mjs "/absolute/path/to/package"
node tools/knowledge-server.mjs --check-source mission-control
node tools/run-cli.mjs good
node tools/run-cli.mjs direction
node tools/run-cli.mjs partial
```

Setup creates new `local-config/` JSON files with real absolute paths and refuses to overwrite existing files. It uses the local Structurizr adapter already bundled in the CLI. The check must say `valid`, 1 actor / 6 systems / 6 relationships. The CLI examples return **0 / 1 / 2** respectively: conformance, demonstrated discrepancy, partial inconclusive evaluation. A nonzero exit for the last two is expected. Every stdout is one versioned JSON result. Use `> reports/cli-good.json` after creating `reports/` to retain a report; stderr remains diagnostic.

### Knowledge client → knowledge server

`node tools/knowledge-server.mjs` is the runnable stdio knowledge server; silence while waiting for MCP input is normal. Stop it with Ctrl+C. A real client starts its own process, rather than connecting to this terminal instance. `local-config/archi-agent.json` contains both `mission-local` and `mission-mcp` sources and an explicit knowledgeServers command. Read that complete generated file to see configuration with readRoots, relative input locators and no providers required.

```sh
node tools/run-cli.mjs good mission-mcp
```

Expected: a real child process serving `get_knowledge_snapshot`, fresh source snapshot and conformant-within-scope, with zero LLM calls. In VS Code, open **Preferences: Open User Settings (JSON)** and copy **only** `archiAgent.knowledgeServer` from `local-config/vscode-user-settings.json` there. This executable configuration is accepted only at **User** scope. In the project's `.vscode/settings.json`, replace `archiAgent.architectureSource` with `{"kind":"mcp","sourceId":"mission-control"}`. Run Configuration → Validate / Refresh, Knowledge Browser and Verify Flow on `01-good.puml`. Expect the same counts and assessment, with MCP provenance. Do not put knowledgeServer in workspace settings. To return to local SRC1, restore the source object from exercise 2; do this before the persistent alias exercise. Do not overwrite unrelated User settings.

### External client → Archi Agent function server

```sh
node tools/call-functions.mjs
```

This dependency-free example launches the **Archi Agent function server**, negotiates MCP, lists the four functions and calls `verify_flow` on source `mission-mcp`. That function server in turn starts a separate knowledge server process. Expected: `meta.adapter = mcp`, conformant-within-scope in `outcome.report.report.assessment`; no LLM. The command exits after the result and closes stdio. `local-config/function-client.json` contains a ready command/args entry for an external MCP client's `mcpServers` configuration. Direct tool arguments are `{"source":"mission-mcp","input":{"root":"project","path":"inputs/en/01-good.puml"},"format":"plantuml-sequence"}` for `verify_flow`; `inspect_knowledge` takes `{"source":"mission-mcp","limit":20}`. This direction exposes Archi Agent functions; it does not replace its architecture source.

The adapter is documented in [adapter/README.md](adapter/README.md), with the current [adapter source](adapter/adapter.ts). Running the ready adapter needs no build. Implementing a different data adapter is a separate optional developer exercise requiring the release source tree and `npm ci`; it preserves the normalized contract and transport.

## 9. Documents, extraction, review and a NEW pack

The demo source is already usable. This exercise deliberately creates a **different** standalone pack from the small `documents/en/mission-notes.md` (or PL equivalent), which describes an additional Planning → Archive relation. Do not merge it into or overwrite `architecture/`.

Configure your provider (exercise 5). **Archi: Build Knowledge Pack from Documents**, choose this project if requested, and select one notes file in the native picker. Expect one extraction request and **pending** proposals in Knowledge Pack Review. Check every quote, explicit/inferred basis, source reference and proposed value. Edit a description with **Edit proposed row → Apply row edit** if needed. Accept or reject each row, keeping accepted relationship endpoints accepted. Pending decisions or missing endpoints must block saving.

Choose **Validate and preview**; inspect all five exact Markdown file previews. Create a `new-packs/` parent folder yourself if needed. Select it using **Choose new pack folder**, enter a new unused folder name such as `mission-reviewed-en-1`, then **Save**. Expected: five files, valid standalone pack with partial coverage and evidence metadata; active architecture stays the original demo. **Save and use** additionally switches the active source and masks Structurizr with null; use it only deliberately, and restore the original settings before repeating the source exercises. Review/save makes no additional LLM requests. Repeating extraction may produce different model proposals. Keep each saved pack in a new folder.

## 10. Optional offline OCR — Full

Use the same VSIX installation procedure to switch to **Full** (disable Core and reload, enable Full and reload). `documents/en/mission-scan.pdf` and `documents/pl/mission-scan.pdf` are short synthetic raster-only scans. The adjacent PNG and transcript show the intended text. They contain no text layer.

Open a scan, run **Archi: Convert to Markdown** (or select the scan during Build Knowledge Pack), choose **Auto OCR** / OCR all pages when prompted. Expect locally extracted text including Operator, Planning/Archive and Telemetry/Alarms, OCR page markers and no OCR confidence score. OCR alone needs no provider; extraction into candidates additionally needs your provider and one request. Core Auto must report **ocr-unavailable**, with no partial Markdown passed into extraction. Full bundles PL/EN OCR resources and downloads nothing automatically. Check accents against the transcript: OCR output is evidence to review, not verified truth. Save output under `reports/`, never over the original scan.
