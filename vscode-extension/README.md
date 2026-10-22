# User guide

**English** · [Polski](README.pl.md) · [Home](https://github.com/Setech-pl/archi-agent/blob/main/README.md)

## Public DEMO1: profiles and knowledge

The public prerelease [**DEMO1 v0.3.0-alpha.7-demo.1**](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1) provides Core and Full VSIX, CLI and two bilingual demo ZIPs. It includes the four-tool MCP function server and MCP knowledge client. Identify the exact downloads with its [release manifest](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/release-manifest.json) and [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS). This branch also contains the EA1/EA1b integration candidate described below; public DEMO1 does not contain Capability Map. [CLI/MCP installation, commands and contracts](https://github.com/Setech-pl/archi-agent/blob/main/docs/en/cli-mcp.md).

**Core** (`setech-pl.archi-agent-core`) is recommended for new users. It includes the shared runtime and text PDF/DOCX/XLSX conversion, with no OCR dependencies or models. **Full** (`setech-pl.archi-agent`) adds pinned offline PL/EN OCR. Existing Full installations stay Full. Neither profile downloads OCR. In Core, Auto OCR succeeds for text PDFs; a page requiring OCR stops conversion with explicit coverage, without partial Markdown. OCR all pages requires Full. A broken Full reports an installation error: reinstall the verified Full VSIX.

To change profile, install the chosen VSIX, disable the previous profile yourself and reload VS Code. Both IDs may remain installed, but enable exactly one. When both are enabled their static declarations collide before activation; VS Code can report duplicate contributions and Archi Agent blocks operations until you choose one and reload. Updates target each ID independently. Shared `archiAgent.*` settings remain; SecretStorage belongs to each ID. Enter cloud keys again for the chosen profile: keys are never copied or read by CLI/MCP.

Choose one source per operation: a Markdown Knowledge Pack; **Structurizr workspace.json + overlay**; or **MCP knowledge**. Structurizr requires `workspace.json` and the SRC1 overlay files `aliases.md`, `relationships.md`, `rules.md`, bound to original IDs. The existing production resolver validates required interface type/mode, references and conflicts; Knowledge Browser shows validation, original IDs, provenance, supported scope and omissions. People, software systems, containers and static relationships are supported; components/deployment/views are omitted. DSL is unsupported. [Full SRC1 contract](https://github.com/Setech-pl/archi-agent/blob/main/docs/src1-structurizr-source.md).

For MCP set `archiAgent.knowledgeServer` in **User settings**, then set `archiAgent.architectureSource` to `{"kind":"mcp","sourceId":"bank"}`. Workspace executable settings are ignored. Start with the standalone example in the [CLI/MCP guide](https://github.com/Setech-pl/archi-agent/blob/main/docs/en/cli-mcp.md#mcp-knowledge-client-and-example-server). Each operation fetches one immutable snapshot; the next fetches again. Failures stop the operation; there is no stale local fallback or automatic alias save. LLM does not choose source tools. The JSON shown by Verify Flow uses the same portable report as CLI/MCP.

The **function MCP server** (`archi-agent mcp serve`) exposes `inspect_knowledge`, `verify_flow`, `resolve_flow_names`, `generate_diagram` to external clients. The **knowledge MCP client** above fetches `get_knowledge_snapshot` from a separate source server. The included `archi-agent-knowledge-server` example shares production SRC1/K1 and separates transport from `KnowledgeAdapter.load`. Neither direction lets the LLM choose source tools. CLI/servers require Node 22.12+ and explicit readRoots/environment credentials; the VSIX uses VS Code's Node and SecretStorage. In a PR pipeline, use `flow verify` and accept exit 0 only; 1 is discrepancies, 2 inconclusive/partial/unsupported, 3 execution error. Full setup and commands: [CLI/MCP](https://github.com/Setech-pl/archi-agent/blob/main/docs/en/cli-mcp.md).

## Capability Map — local EA1b candidate

Available in the new local EA1b Core/Full candidate, **not in the published DEMO1 downloads above**.
Open a local project and run **Archi: Create Diagram → Enterprise Architecture → Capability Map**.
Select `enterprise.json`, choose the whole map or an L1 branch, L1–L3 detail, and no colors or an
explicit rating scale. In multi-root workspaces select the source project first. No software pack,
provider, model or API key is needed; this operation makes zero model calls.

To start from a company description or documents, run **Archi: Build Business Capability Catalog / Utwórz katalog zdolności biznesowych**. Choose **Extract from materials** or **Propose a company model**, then selection, active document (including dirty/untitled), entered description or explicit local documents. Review the frozen materials before the maximum one model call; cloud calls require separate authorization. Review/edit the L1–L3 hierarchy and provenance, accept/reject candidates, declare scope and save a new `enterprise.json` with `enterprise.review.json`. Existing files are never overwritten. **Generate Capability Map** then uses the saved catalog with zero additional model calls. Ratings stay unknown and coverage partial. [Full walkthrough and budgets](https://github.com/Setech-pl/archi-agent/blob/main/docs/en/capability-map.md#company-description--reviewed-catalog--map).

For existing JSON, **Active document — including unsaved changes** captures text before the first diagram picker. Later edits do not replace the operation's input; invalid JSON never triggers a model call. Explicit file/MCP sources remain available. Reports use captured buffer positions/fingerprint and ART1 records in-memory input.

A graphical preview requires a separate PlantUML renderer. Two unsaved editors show PlantUML and the deterministic provenance report. Save the original pair
with **Archi: Save Diagram and Report** and confirm the destination; Cancel writes no partial pair.
Gray “No data” means an absent rating. Parent ratings are not aggregated; tile size is not a rating.
The legend/report show source coverage and deliberate scope/detail omissions. Large maps require
an explicit narrower view. This report is not semantic review or Verify Flow.
In the current checkout, `docs/en/capability-map.md` contains the Retail exercise and reference map;
`docs/enterprise-catalog.md` describes the exact contract. These new files are local candidate documentation.
The local EA1b CLI also accepts diagram generate with --type capability-map and a config v2 enterpriseSources entry, without input/provider. The function server uses the same generate_diagram tool with a separate capability-map variant. Published DEMO1 does not contain this addition.

For the MCP catalog, use the locally packaged archi-agent-knowledge-server with a config v2 enterpriseSources entry named retail-business pointing to architecture/enterprise.json under its readRoots, sources/providers empty. Check it with --check-source retail-business --type enterprise. The following steps contain the complete offline configuration. Adjust the absolute executable/package/config paths.

Save this complete source configuration as `/srv/retail-knowledge.json`. Replace the readRoot with the current Retail checkout folder. Use Node >=22.12 and the knowledge-server executable from the **new local CLI package**; published DEMO1 CLI does not supply this tool variant. The source config and command below also work offline. The configured MCP client starts the process; the check command exits after validation.

```json
{
  "schemaVersion": 2,
  "readRoots": {"project": "/srv/retail-checkout"},
  "sources": {},
  "enterpriseSources": {
    "retail-business": {"kind": "enterprise-json", "file": {"root": "project", "path": "architecture/enterprise.json"}}
  },
  "providers": {}
}
```

```bash
node /opt/archi-agent-cli/package/bin/archi-agent-knowledge-server.cjs --config /srv/retail-knowledge.json --check-source retail-business --type enterprise
```

Then set these User settings:

```json
{
  "archiAgent.enterpriseSource": {"kind": "mcp", "sourceId": "retail-business"},
  "archiAgent.knowledgeServer": {
    "command": "/opt/node/bin/node",
    "args": ["/opt/archi-agent-cli/package/bin/archi-agent-knowledge-server.cjs", "--config", "/srv/retail-knowledge.json"]
  }
}
```

Create Diagram → Enterprise Architecture → Capability Map now offers Configured MCP source and Local enterprise.json. Choose MCP, then the same scope/detail/rating options. Only User knowledgeServer can configure a process; workspace values cannot. Software architectureSource is separate. Each generation loads one snapshot, makes zero model calls and saves only after ART1 confirmation. Missing get_enterprise_snapshot v1 gives enterprise-unsupported with no fallback. Remote report v2 preserves references and JSON Pointers, never fictitious file/line. The old get_knowledge_snapshot v1 remains unchanged.

## Verify Flow and C4

Verify Flow and C4 are included in DEMO1. Screens 15–20 illustrate these features; their original capture identities are recorded in the provenance below.

**Archi: Verify Flow (Sequence / prose)** checks entered text, selection or the active buffer.
Sequence PlantUML uses no LLM; prose uses one interpretation request. The JSON report distinguishes
confirmed steps, discrepancies, unresolved names and omitted syntax/source scope. Only the exact
Archi Agent legend establishes arrow sync/async/response semantics; arbitrary styles may remain
inconclusive. C4 input is outside this verifier. Unknown names require explicit element selection.
For Structurizr, Save confirmed aliases prepares a minimal overlay edit and native save; dirty,
changed or conflicting files stop the save. Standalone pack choices remain session-only. A source
change during confirmation requires a new verification; decisions are never silently rebased.

**Create Diagram** also offers **C4 Context** and **C4 Container**. Configure a local Structurizr
JSON source and its SRC1 overlay in Source Settings. Pick the software system explicitly. Context
shows people and directly connected software systems, without internal containers. Container shows
the parent's containers inside a labelled boundary and the supported external environment. No
relationship is invented from membership or rolled up from children. Technology and descriptions
come from source fields; reports retain hierarchy provenance and omissions. A standalone pack
without hierarchy reports missing data. Successful C4 generation uses one plan request and one
review request with the same snapshot. **Save Diagram and Report** saves their original pair.
Graphical preview still needs separate PlantUML support; no remote C4 include is needed.


## Current product screens

Actual installed UI, public Big Bank fixture, synthetic model responses. The first three images show PNGs rendered **separately with local PlantUML 1.2026.6 / Smetana**, opened in VS Code: Sequence/Context beside the original report, Container at full width. This graphical support is not bundled in Archi Agent. [Capture provenance](https://github.com/Setech-pl/archi-agent/blob/main/docs/assets/screenshots/provenance-doc2.json).

![Sequence + report](help-assets/15-sequence.png)

![C4 Context](help-assets/16-c4-context.png)

![C4 Container](help-assets/17-c4-container.png)

![Verify Flow / zero LLM](help-assets/18-verify-flow.png)

![Knowledge Browser](help-assets/19-knowledge-browser.png)

![Configuration / Structurizr JSON + overlay](help-assets/20-configuration.png)

## Installation on Mac and Windows

Download the Core or Full VSIX from [public DEMO1](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1). Compare its SHA-256 with that release's [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS) and [manifest](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/release-manifest.json). The package version is **0.3.0-alpha.7**; the release tag is **v0.3.0-alpha.7-demo.1**. A local build or CI artifact may have a different hash and is not the published package.

Mac:

```bash
shasum -a 256 <file.vsix>
```

Windows PowerShell:

```powershell
Get-FileHash <file.vsix> -Algorithm SHA256
```

In VS Code, open **Extensions → … → Install from VSIX…**, select the file and reload if requested. Check the version in **Archi Agent** extension details. No repository, npm or separate Node.js installation is needed. If an older version is installed, use the same command to install this identified prerelease.

The earlier public alpha.6 remains available separately. [Collective owner smoke](https://github.com/Setech-pl/archi-agent/blob/main/docs/testing/mcp1-owner-smoke.md) gives the acceptance procedure; owner smoke of the exact DEMO1 packages remains **DEFERRED**. Publication does not establish stable/Marketplace readiness.

### Requirements and first launch

Use desktop VS Code satisfying the manifest's `^1.91.0`, a local filesystem and a model provider for extraction or reviewed software diagrams. Capability Map requires no provider. Both profiles include Node runtime bundles and conversion worker; Full also includes offline OCR assets; no separate Node/npm installation is required. Native UI evidence is from macOS arm64; equivalent end-to-end operation on other platforms is not yet confirmed. Binaries are also bundled for Mac Intel, Linux x64/arm64 GNU and musl, and Windows x64/arm64, but this is packaging coverage, not native UI verification on those systems. Remote and virtual workspaces do not establish support for remote document paths; use local folders. In an untrusted workspace restricted configuration is read from user settings.

Install the correct VSIX with **Extensions → … → Install from VSIX…**, then run **Archi: Open**. The menu contains **Create Diagram**, **Verify Flow (Sequence / prose)**, **Save Diagram and Report**, **Configuration**, **Knowledge Browser**, **Build Knowledge Pack from Documents**, **Build Knowledge Pack from Active File**, **Convert to Markdown** and **Help**. **Archi: Configuration** opens one editor panel with **Knowledge Management** and **LLM Provider** tabs; repeating the command reveals that panel. **Archi: Create Diagram** asks for **Sequence**, **Component**, **C4 Context** or **C4 Container** before generation. The separate Sequence command is hidden and delegates to this selection. **Check Provider Configuration** is available in the Provider tab; its compatibility command ID is hidden from the palette. Cloning/building belongs in [development](https://github.com/Setech-pl/archi-agent/blob/main/docs/en/development.md).

## Start here — first use

1. Download Core or Full from DEMO1, verify its checksum, install through **Extensions → … → Install from VSIX…**, enable exactly one profile, reload and open a local project folder. Confirm **0.3.0-alpha.7** in extension details.
2. Run **Archi: Configuration → LLM Provider**. Prepare LM Studio/Ollama or choose a cloud profile. For cloud, use **Set / Replace Key for <provider>** and enter the key in the masked native input.
3. Click **Refresh Models** before or after Apply. Choose an exact ID in **Available models / Dostępne modele**; it appears in **Selected model**. Click **Apply**, then **Check Provider Configuration**. Refresh does not save anything; **Discard Changes** restores applied fields. There is one selected model, shared by diagram generator and reviewer; there is no multi-model “Selected Models” list.
4. In **Knowledge Management**, use **Choose Existing Knowledge Pack**, or **Create Knowledge Pack** for a small catalog. The complete Alpha/Beta example below is suitable for a first diagram. Alternatively build from documents, review every candidate, validate the five previews and use **Save and use** to activate the new pack.
5. Run **Archi: Knowledge Browser** to check the active catalog. Run **Archi: Create Diagram → Sequence** or **Component**, and enter `Alpha stores data in Beta.` with the example pack.
6. Read both result editors, then **Archi: Save Diagram and Report** and confirm the new project folder. Use **Archi: Help** or **Archi: Open → Help** for this offline instruction.

Help opens Polish when the VS Code display language is `pl` (including regional variants), English otherwise. Its **English / Polski** links open the other bundled instruction. This changes the help language only: most product controls retain their English labels, and there is no persistent application language switch.

## What each artifact means

| Artifact | Example | Purpose and next step |
| --- | --- | --- |
| Source document | `architecture.pdf`, or a dirty `source.md` editor | Input facts and context; the extension does not change the source. |
| Conversion result | Unsaved Markdown containing `## Page 1` and OCR markers | Local text extraction, without a model. It is not yet architecture knowledge; inspect it or use a source with Builder. |
| Knowledge candidates | Proposed Alpha service and Alpha → Beta relationship, still `pending` | Untrusted model proposals with evidence; accept, reject or edit in Knowledge Pack Review. A literal quote verifies location, not interpretation. |
| Accepted Knowledge Pack | Five Markdown tables in a new folder | Your reviewed catalog, read by the production loader. Save creates it; Save and use also activates it. |
| Diagram and report | `diagram.puml` and `report.json` | A generated view of a flow and its linked evidence/validation record. Saving them does not create or update a pack. |

A PDF can therefore become converted text, then candidates, then an accepted pack. A later flow description plus that pack produces a diagram. These are separate operations; converting a file does not automatically extract knowledge or generate a diagram.

## Provider, profile and model

A provider is the service executing the model. A profile selects its adapter and endpoint policy; the model ID selects one model at that provider.

| UI profile | ID | Endpoint | Key |
| --- | --- | --- | --- |
| LM Studio | `local-lm-studio` | `http://127.0.0.1:1234/v1` by default | none |
| Ollama | `local-ollama` | `http://127.0.0.1:11434/v1` | none |
| Anthropic | `cloud-anthropic` | fixed `https://api.anthropic.com` | SecretStorage |
| OpenAI | `cloud-openai` | fixed `https://api.openai.com` | SecretStorage |
| OpenRouter | `cloud-openrouter` | fixed `https://openrouter.ai/api/v1` | SecretStorage |

Prepare your local server/model yourself; the extension does not download models. Open **Archi: Configuration → LLM Provider**. Select a profile, edit the applicable endpoint/timeout/model fields, and use **Apply**. **Discard Changes** restores the applied values. Unapplied edits survive tab changes. Refresh Models reads the visible profile/endpoint without saving settings; applied-configuration checks require Apply or Discard; key operations target the displayed draft profile before or after Apply; external settings changes are shown without overwriting those edits. After such a conflict, Discard and re-enter the intended changes. Changing settings invalidates prior diagnostics. **Refresh Models** lists models in one bounded request. Choose the exact ID from **Available models** or enter it in Selected model, then Apply. Empty, invalid and failed lists have distinct EN/PL messages and a next action. Exact repeated safe IDs from local providers become one choice; unsafe IDs still reject the list. No model is selected automatically. Cloud profiles need **Set / Replace Key** (native password input); **Remove Key** asks for confirmation. Keys stay in provider-specific SecretStorage entries; the screen receives only presence. **Check Provider Configuration** tests applied settings with at most one list request and no generation. It shows connection, listing, selected-model and generation findings with a next action. Listing does not prove generation readiness, access, billing or quota. An explicit **Create Diagram** operation is the generation test and retains the existing request policy. Not every provider has live manual testing.

| Setting | Meaning |
| --- | --- |
| `archiAgent.knowledgePackPath` | absolute folder of five pack files; resource scoped |
| `archiAgent.localModel.profile` | machine-scoped profile ID |
| `archiAgent.localModel.selectedModel` | machine-scoped model ID |
| `archiAgent.localModel.selectedModelProfile` | extension-managed binding; do not edit |
| `archiAgent.localModel.baseUrl` | LM Studio loopback URL; Ollama ignores it |
| `archiAgent.localModel.model` | legacy LM Studio model, used until explicit profile selection |
| `archiAgent.localModel.timeoutSeconds` | one model request, default 120; range 1–600 |
| `archiAgent.defaultAuthor` | author for typed flow, default `Archi Agent` |
| `archiAgent.diagnostics.verbose` | safe Output-channel JSON diagnostics; default false |

Machine-scoped profile/model selections are not synchronized by Settings Sync or overridden by a workspace. After changing profile, select a model again; stale bindings are inactive. Prefer the UI to editing model settings. Local URLs accept literal `127.0.0.1` or `[::1]` with `/v1`; `localhost`, remote hosts, redirects and credential-bearing URLs are rejected. Details: [local adapters](https://github.com/Setech-pl/archi-agent/blob/main/docs/local-model.md), [cloud adapters](https://github.com/Setech-pl/archi-agent/blob/main/docs/cloud-models.md).

## Choose or create the active Knowledge Pack

A Knowledge Pack is a local architecture catalog: systems, actors, relationships, aliases and rules. Grounding matches canonical names and aliases to this catalog before model generation.

Open **Configuration → Knowledge Management** (the hidden **Configure Knowledge Pack** compatibility ID opens the same tab). Check the displayed project, active absolute path, saved write scope, effective source, loader validation and actual row counts. In multi-root, explicitly select a project first. **Choose Existing Knowledge Pack** uses the native folder picker and validates five strict tables before activating through UX3. **Validate / Refresh** re-reads the pack; **Open systems.md** and the other four buttons open its files. One project writes WorkspaceFolder; no workspace writes User/Global. Cancel preserves the setting. Only one pack is active for the selected scope.

**Create Knowledge Pack** selects an existing parent through the native folder picker, asks for one folder name and one real system (ID, canonical name, kind, description), and creates five tables without invented relationships. UX3 still supports a new or existing empty destination and rejects nonempty folders. Document Builder below requires a new folder. First-run **Create Diagram** onboarding retains its native Create/Choose/Cancel controls and editable absolute default destination; it uses no model.

For the small demo catalog, start Alpha as `service`, then add Beta as `database` and a relationship using the [five-table format](https://github.com/Setech-pl/archi-agent/blob/main/docs/knowledge-pack-format.md). Do this by deliberate file editing and reload validation; the document Builder does not update this pack. A relationship's `interface_type` can be `DB`, `interface_name` `Writer`, and `mode` `synchronous`.


### Complete synthetic five-file pack

Create these five UTF-8 files in one folder, then choose it with Configuration → Knowledge Management → Choose Existing Knowledge Pack. These are manual example files, not Builder output with provenance.

`systems.md`:

```markdown
| id | canonical_name | kind | description |
| --- | --- | --- | --- |
| a | Alpha | service | Synthetic service |
| b | Beta | database | Synthetic store |
```

`actors.md`:

```markdown
| id | canonical_name | kind | description |
| --- | --- | --- | --- |
```

`relationships.md`:

```markdown
| from_id | to_id | interface_type | interface_name | mode | purpose |
| --- | --- | --- | --- | --- | --- |
| a | b | DB | Writer | synchronous | Store |
```

`aliases.md`:

```markdown
| alias | target_id |
| --- | --- |
```

`rules.md`:

```markdown
| rule | from_id | to_id | reason |
| --- | --- | --- | --- |
```

## Local document conversion and OCR

Full sends visible vector shapes without a text layer to local OCR in Auto and all; these may be letters or an illustration. Coverage distinguishes raster images (`imageCount`), OCR outcome (`ocrText`: recognized/empty) and a white render (`blankAssessment`: rendered-white). Empty OCR does not mean a blank page. `blank` describes a white render at the chosen resolution, not proof that no content exists; compare coverage with the original. Core reports pages without accessible text as requiring OCR.

Run **Archi: Convert to Markdown**, select one local `.pdf`, `.docx` or `.xlsx` file and inspect the unsaved Markdown editor. For PDF choose **No OCR**, **Auto OCR** or, in Full, **OCR all pages**. Auto retains text pages and OCRs pages without usable text. In Full, bundled PL/EN OCR works offline; this command makes no provider request and needs no Knowledge Pack. Save the Markdown with the normal editor Save command if you want to retain it. Inspect OCR errors before using text as evidence. A conversion does not create a pack or diagram.

## Documents to a new pack

1. Run **Build Knowledge Pack from Documents** from the palette or the **Build Knowledge Pack from Documents** button in **Configuration → Knowledge Management**. Select explicit local `.md`, `.txt`, `.pdf`, `.docx`, `.xlsx` files. No directory scan or URL retrieval occurs. An existing pack is not needed.
2. For PDFs the Builder's **PDF OCR mode** picker uses **none**, **auto**, **all**. `auto` keeps text pages and OCRs pages without text; `all` OCRs every page; `none` requires usable text. The separate **Convert to Markdown** command labels these choices **No OCR**, **Auto OCR**, **OCR all pages** and opens one unsaved Markdown editor. It needs neither provider nor pack and makes no network request.
3. Local acquisition captures exact bounded bytes, hashes them, converts private copies and freezes normalized text. Review never rereads the originals. This capture is not an atomic snapshot of a file being concurrently written. Prepare stable documents. Missing model selection follows input validation; progress supports Cancel. Valid extraction makes one StructuredChatClient generation request with bounded document text, then checks proposals/evidence locally.
4. The linked **Knowledge Pack Review** editor shows all proposals, validation issues, source and OCR limitations. Expand **Evidence, references and original proposal** on each row. `pending` means no decision yet; `accepted` means your decision to include; `rejected` excludes it. `explicit` and `inferred` describe the original proposal; inferred rows require reasoning. Evidence is a literal quote with source identity, original/text digests and offsets/lines in normalized text. Correct offsets and a real quote do not prove the architectural interpretation. OCR confidence is unavailable; coverage stays partial.
5. Use **Accept selected**, **Reject selected**, **Return selected to pending** for groups, or **Accept all pending** / **Reject remaining pending**. Check evidence before accepting. Expand **Edit proposed row**, change its fields and select **Apply row edit**; references use entity selection. It cannot add proposals or edit IDs, evidence, basis or reasoning. An edited row retains original evidence and an `editedByUser` marker; the quote is not claimed to state your edit verbatim. Unapplied row edits do not change the session.
6. **Validate and preview** blocks while any row is pending, an accepted relationship/alias/rule lacks accepted endpoints, conflicts remain, aliases collide, or the accepted set has no system. Dependencies are not accepted automatically. Change decisions/fields and validate again. Every change invalidates the previous immutable preview.
7. Choose an existing parent folder and one **new pack folder name**. Expand the five read-only previews on the same screen: `systems.md`, `actors.md`, `relationships.md`, `aliases.md`, `rules.md`. The immutable preview is the exact content saved.
8. **Save** creates the new pack and leaves the active setting unchanged. **Save and use** saves/loads first, then activates in the selected UX3 project scope (Global without a project). **saved, not activated** means valid files were retained but configuration failed; use Choose Existing Knowledge Pack to choose them later. Decisions remain above the previews; **Cancel** or closing the review panel exits before saving. After a collision, **Choose new pack folder** selects another new destination without extraction.

There is one active build per Extension Host. Cancel or closing the review panel ends the build; a completed save releases the build guard. There are no persistent drafts, autosave, existing-pack update/merge or acceptance history. A new command means a new extraction. Review/edit/validation/preview/save/activation use **zero additional LLM requests**, even after a save collision and return to review.

Builder limits are stricter than standalone conversion:

| Boundary | Builder | Standalone conversion |
| --- | --- | --- |
| Files/input | 8; 10 MiB each, 20 MiB total | one; 50 MiB |
| Text/output | 64 KiB UTF-8 per source; serialized bundle 160 KiB | 8 MiB Markdown |
| Request/candidates | 256 KiB prepared request; 128 candidates, 32 aliases, 64 relationships | no LLM |
| Work deadline | 360 seconds; generation 120 seconds capped by remaining time | 120 seconds without OCR; OCR deadline 300 seconds |

Both conversion paths retain 300 PDF pages, 20 OCR pages, 10 MP rendered canvas, 16 MP embedded image; Office ZIP 1000 entries, 100 MiB inflated total, 25 MiB per entry, 100:1 ratio; XLSX 40 sheets, 20000 rows, 150 columns, 250000 cells. PDF loses layout/table structure; DOCX excludes images/external resources and complex layout may lose fidelity; XLSX uses cached formula values, never recalculation. DOC/XLS are unsupported. Full bundles PL/EN OCR models offline; Core reports pages requiring OCR. Cancel/failure returns no partial conversion or candidates. Worker closure/cleanup can extend beyond the work deadline. See [full extraction limits](https://github.com/Setech-pl/archi-agent/blob/main/docs/document-candidates.md#limits-and-cancellation).

## Active file and Knowledge Browser

**Archi: Build Knowledge Pack from Active File** captures unsaved Markdown/TXT text (including untitled) before extraction. It never saves the editor. A local PDF/DOCX/XLSX custom preview must expose its file URI; otherwise open a supported source explicitly. The same evidence review, five previews, Save and Save and use follow.

**Archi: Knowledge Browser** reveals **Archi Agent — Knowledge** in Explorer. Expand the project and active pack, then Systems, Relations, Rules, Sources/Evidence when available, or Files. Systems show aliases and incoming/outgoing references. Records open their pack file/line; source evidence without an original location opens local details. Refresh and pack-file saves reload production validation; invalid knowledge is not shown as current.

In Configuration, the profile description and key buttons follow the form selection. Key input names its target profile and stays bound to it even if selection changes. Effective configuration remains applied until successful Apply. Changing profile clears the draft model. Discard restores saved settings. Extraction progress identifies read/conversion/provider selection/generation/validation, with Cancel. K2 generation is capped at 120s or the shorter provider timeout; use a faster model or smaller input after a timeout. No automatic retry occurs.


The tree also includes **Actors**. Use **Refresh Knowledge** in the tree title after external file edits. Saving a pack file in VS Code, changing the active path or workspace folders refreshes the view automatically. Evidence from an active editor opens that editor only while its normalized text digest matches the captured input; otherwise frozen evidence details open. This is a read-only browser, not a knowledge editor or a pack catalog.

## Generate and inspect a diagram

Choose **Create Diagram → Sequence** (ordered interactions) or **Component** (components and dependencies). Select the active flow document, **Choose a flow file**, or type a description. A file needs restricted front matter; a typed description supplies metadata through UI. Use the same synthetic file in either language:

```markdown
---
diagram_name: synthetic-art1
flow_name: Synthetic ART1
author: Test
language: en
---
Alpha stores data in Beta.
```

Resolve ambiguous mentions by selecting the intended element. Unknown ordinary text is not a new element; explicitly write `[NEW: Name]` and confirm it. Aliases do not establish a relationship. Source-confirmed relationships and flow-stated relationships remain distinguishable; a missing source relationship does not prove nonexistence. Local prohibitions still block generation.

Reviewed Sequence supports explicitly confirmed `[NEW: Name]` participants. They carry the `[NEW]` label and `user-confirmed` origin; their interactions remain user-stated facts requiring review. They are not written to the architecture source. Rejecting or cancelling confirmation blocks generation; the model cannot add a participant itself.

Invalid input/grounding makes zero generation calls; generator/local rejection one; a locally valid candidate triggers one separate reviewer call, for two total. Generator and reviewer use the same configured profile/model, separate requests and the same frozen snapshot. No retry, repair, fallback or third call. A verified success opens unsaved PlantUML and a linked JSON grounding report side by side. Inspect facts, evidence classes, source lines, warnings, deterministic validation, semantic verdict and snapshot digest. The editor contains PlantUML text; a graphical preview needs separate PlantUML editor support. No official PlantUML rendering guarantee is inferred from local subset validation.

If semantic review rejects/fails after local checks, **Show unverified candidate** may open a marked candidate without a report; Cancel opens nothing. It is not a completed ART1 result. User cancellation does not offer an unverified candidate. The old `archiAgent.generateSequenceDiagram` command ID is an invisible delegate to **Create Diagram**. The older one-call runtime compatibility API remains available internally; it is not a separate user entry or fallback.

## Save the original diagram and report

Use the generation notification's **Save Diagram and Report**, the palette's **Archi: Save Diagram and Report**, or the Open menu. The menu/palette selects an original result by diagram type, UTC creation time and result UUID. With one local project it is the target; multi-root explicitly asks for the destination project. Without a project, open a local folder first. Confirm the displayed original result, full new folder, `diagram.puml` and `report.json` in the modal. Cancel before save creates nothing.

```text
<project>/archi-agent-results/<UTC-time>-<bundle-UUID>/
  diagram.puml
  report.json
```

ART1 captures a frozen result at successful generation: original PlantUML (including terminal LF), linked report, source/snapshot metadata and safe configuration. Manual buffer edits, later settings/pack changes or another generation do not replace this pair. To save an edited buffer use ordinary editor Save separately; it is not the original ART1 pair. ART1 makes **no new LLM, listing, diagnostic, conversion, credential or source-refresh request** and changes no settings.

`report.json` is the version-1 `archi-agent-artifact` envelope. `generationReport` retains the generation report's contract. `diagram.sha256` and `byteLength` describe the exact UTF-8 diagram bytes, including whitespace and newline. Knowledge/snapshot digests identify canonical semantic inputs; original/text digests identify captured document bytes/normalized text; the configuration digest covers a deterministic safe projection, not credentials or a replayable configuration. These hashes identify content, not authenticity or model quality. Missing source-file byte hashes/runtime version are `null`, not reconstructed later.

Sources inside the destination project use project-relative references where possible; external sources use logical basenames marked `logical-name-only`. In-memory flow has `in-memory-input`. Documents and full snapshots are not copied. Report facts retain available evidence and warnings. **Open Diagram** / **Open Report** opens the saved files after success. If opening fails, the pair remains saved; open it manually.

The menu/palette lists results in the current Extension Host while at least one linked preview remains open. Closing both diagram and report removes that list entry; closing just one keeps it. A still-pending generation notification can retain its own original result and invoke Save Diagram and Report directly, even after both previews close. Changing editor language is not a real close. Restart/reload loses in-memory results and pending notifications; saved files do not re-import them. A repeated explicit save creates a new bundle UUID for the same original result. There is no persistent history.

## Save failures and troubleshooting

### Symptom → cause → action

| Symptom | Likely cause | User action |
| --- | --- | --- |
| Available models is empty | No refresh yet, an empty response, or a listing error | Read the list status; start/load the local server/model or check the cloud key, then explicitly Refresh Models. HTTP 200 alone does not prove a usable list. |
| Model choice disappears after Discard/reload | Selection was only a draft | Select the ID again and Apply; reopen Configuration and check Effective configuration. |
| Check is disabled | Unapplied provider edits | Apply to save them, or Discard Changes to test the saved setup. Refresh Models can read the draft. |
| Apply reports changed settings | Project/settings changed while editing | Discard Changes, verify the project and applied values, re-enter changes, Apply. |
| Key present but authentication fails | Saved presence does not prove valid credentials/access | Set / Replace Key for the displayed provider; check access in its console, Apply the intended profile/model and Check again. |
| Knowledge Browser shows no pack/unavailable | Missing path or rejected tables in that project's scope | Configuration → Knowledge Management: choose the project, Validate / Refresh, repair the five tables or choose another valid pack; refresh the tree. |
| Active File build rejects the tab | Unsupported format, remote URI or preview without a local file URI | Activate a Markdown/TXT editor, including untitled, or select the binary file through Build Knowledge Pack from Documents. |
| PDF reports no text / OCR limit | Scan in No OCR mode, or more than 20 OCR pages | Choose Auto OCR or OCR all pages for a small scan; split a larger document before retrying. |
| Extraction times out | Model exceeded 120 seconds or the shorter provider timeout | Choose a faster model or reduce input. Increasing provider timeout beyond 120 does not increase extraction's cap. |
| Evidence-location mismatch or invalid model row | Model proposal failed deterministic checks | Inspect the safe failure code; use a model that follows structured output/evidence slices and explicitly start again. Validation is not bypassed. |
| Cancel appears to take time | Worker shutdown or owned temporary-file cleanup is finishing | Wait for completion; no partial conversion/candidates are returned. |

| Situation | What to do |
| --- | --- |
| Builder target exists, even empty | keep it; return through review/location selection and choose another new folder; no re-extraction needed |
| ART1 destination exists | retry Save to obtain a new bundle; no overwrite/merge |
| Symbolic link, missing/non-directory parent or containment error | fix the indicated local project/path first; merely retrying a bundle cannot fix the path |
| Cancel during write, or write/verification failure | wait for cleanup outcome; inspect the displayed location if cleanup is incomplete |
| Foreign edit/replacement/unproven partial write retained | keep edits, inspect retained data, move preserved files or choose a new location before retrying |
| Pack saved but activation failed | retain files, check settings and activate via Choose Existing Knowledge Pack |
| Missing model/key/connection or structured-output failure | use Configuration and Check Provider Configuration; correct setup and explicitly start a new operation |
| Pending rows/dependency/conflict error | review the displayed issues, decide all rows, accept required entities or reject dependent rows; validate again |
| No completed result available | keep result previews open or run a new successful generation; unsaved edited files alone are not ART1 results |

Save success follows exact-byte/load/ownership checks and a final cancellation check. Files can become visible incrementally. These are controlled operations with conditional rollback, **not atomic publication of a directory or two files**. Cleanup removes only resources proved owned and unchanged; uncertain data is preserved. There is no crash recovery or fsync durability guarantee, and portable path checks do not eliminate hostile races between system calls. Cancel after success does not undo saved data. Pack files and VS Code settings are separate operations.

On macOS, a native picker can return `/tmp` instead of `/private/tmp`. Controlled pack saving rejects the symbolic path. Choose a regular parent folder outside that alias (for example a local project folder); do not bypass the path check.

## Screenshots, Help and license

**Archi: Help** opens this instruction from the installed package. The **English / Polski** switch and screenshots are bundled and work offline. External repository, release and technical links need a network; they are supplementary. [Current screenshot gallery PL/EN](https://github.com/Setech-pl/archi-agent/blob/main/docs/assets/screenshots/README.md) lists actions and provenance. Synthetic responses demonstrate the UI, not live-model quality or owner smoke results.

Own code: [MIT](LICENSE.txt). Bundled components: [notices](THIRD_PARTY_NOTICES.md) and OCR notices. Product limits, open findings and verification status: [roadmap](https://github.com/Setech-pl/archi-agent/blob/main/docs/product-roadmap.md), [technical state](https://github.com/Setech-pl/archi-agent/blob/main/docs/project-state.md). SRC1, VER1, C4 and MCP1 are included in DEMO1; local EA1/EA1b functions are not.

## Local Structurizr source — SRC1

This source is available in DEMO1.
Configure a local workspace JSON and a three-file Knowledge Pack overlay in VS Code User
or project settings. Configuration → Knowledge Management shows validation and omitted content.
Source Settings opens User JSON; use `.vscode/settings.json` for a project override.

```json
{"archiAgent.architectureSource":{"kind":"structurizr-json","sourceId":"big-bank","modelPath":"/project/architecture/workspace.json","overlayPath":"/project/architecture/overlay"}}
```

The overlay contains aliases.md, rules.md and relationships.md. Relationship metadata binds the
original relationship ID and expected from_id/to_id. interface_type is explicit. Model
interactionStyle determines mode; otherwise the overlay must provide it. Conflicts block generation.
Container names use `System / Container`; original IDs remain stable after renaming.
Source components and deployment are omitted; Sequence, Component, C4 Context and C4 Container output is supported.
Each operation reads again. The generated pair preserves its original snapshot when saved.

Set `archiAgent.architectureSource` to null to use knowledgePackPath again. K3 Save and use
does this in the selected scope automatically; it creates a standalone pack, not an overlay.

## Update an enterprise catalog and map application support

Use **Archi: Update Enterprise Catalog** (also in **Archi: Open**) and select a clean local JSON
catalog. The command freezes the base. Choose new information from the captured selection/document,
a typed description, or selected supported local files. The EAK1 preview shows exactly the selected
materials and a maximum of one extraction call. No complete catalog/workspace is sent. Existing
provider/model settings and secure credentials are reused.

Resolve each candidate to a specific existing ID, explicitly create a new capability, or reject it.
A matching name is a suggestion. **Review differences and decisions** opens before/after and original
evidence/decision previews; choose each operation and accept/reject it. You can propose name,
description, parent and explicit rating changes, including unknown ratings. Omitted capabilities
remain. Deletions show children and support references and remain blocked until you separately move
or remove dependencies. Contradictions, cycles, invalid levels/IDs and pending decisions block save.

To enter support data, propose **Add application** with a stable ID/name and accept it in review.
Choose **Add explicit application support**, select the application and capability, then approve that
link separately. Application and capability IDs are separate identities. No manual JSON authoring is
required. Explicit application entry upgrades the reviewed catalog to enterprise/2; capability-only
updates preserve v1. Updates preserve existing apps, links, assessments and unchanged provenance.

**Approve and save catalog** uses the native editor save. A dirty buffer, changed document version or
disk bytes stops the operation; resolve those changes and start a new session. A review report is kept
under `enterprise-updates/<sessionId>/<revision>/enterprise.review.json`; keep it with the catalog.
A retained report alone is not a saved catalog. Only production readback and validation confirm
`saved`. Foreign edits are never rolled back. No automatic merging, transaction or crash recovery.

Choose **Create Diagram → Enterprise Architecture → Capability–Application Map** and the extended
local catalog, captured active JSON or configured enterprise MCP source. Select the whole map or a
capability/domain. No provider is needed: rendering makes **0 model calls**. Only explicit direct
support is shown; parents do not inherit child links. Missing links mean no documented support,
not a missing system. Several links do not prove redundancy. Partial coverage stays partial.
The report records scope, evidence, omitted records and digests. Narrow the view if it exceeds 120
nodes or 240 links; nothing is truncated. **Save Diagram and Report** stores the original ART1 pair.

Try `examples/retail-checkout/architecture/enterprise-applications.json`: one app supports several
capabilities, payment has several apps, other capabilities have unknown support and Back Office has
no links. Rename a capability through update/review; its ID and links remain stable. V1 catalogs and
Capability Map remain supported. Enterprise MCP v1 remains unchanged; EA2 deterministically uses
`get_enterprise_snapshot_v2` / contractVersion 2 without fallback. For Capability Map on a v2 remote
catalog set `enterpriseSource.contractVersion:2`. See [enterprise contract](https://github.com/Setech-pl/archi-agent/blob/main/docs/enterprise-catalog.md)
and [CLI/MCP](https://github.com/Setech-pl/archi-agent/blob/main/docs/en/cli-mcp.md).

OCR notices: [ux2-ocr/TRIAL_NOTICES.md](ux2-ocr/TRIAL_NOTICES.md).
