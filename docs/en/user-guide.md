# User guide

**English** · [Polski](../pl/user-guide.md) · [Home](../../README.md)

## Build and requirements

This guide describes the local UX4 candidate based on DOC1 `8375861`. The public `v0.3.0-alpha.4` download contains UX2; later OBS1/UX3/K1–K3/ART1/UX4 features require the identified local candidate. See [build selection and checksums](../../README.md#choose-the-right-build).

Use desktop VS Code satisfying the manifest's `^1.91.0`, a local filesystem and a model provider for extraction or diagrams. The VSIX includes Node runtime bundles, conversion worker and offline OCR assets; no separate Node/npm installation is required. Mac ARM is the 1.0 target. Existing native UI verification ran on macOS arm64 (VS Code 1.140.0); owner smoke for UX4 is not completed. Binaries are also bundled for Mac Intel, Linux x64/arm64 GNU and musl, and Windows x64/arm64, but this is packaging coverage, not native UI verification on those systems. Remote and virtual workspaces do not establish support for remote document paths; use local folders. In an untrusted workspace restricted configuration is read from user settings.

Install the correct VSIX with **Extensions → … → Install from VSIX…**, then run **Archi Agent: Open**. The menu contains **Create Diagram**, **Save Diagram and Report**, **Configuration**, **Knowledge Management** (a shortcut to the same screen), **Convert to Markdown** and **Help**. **Archi: Configuration** opens one editor panel with **Knowledge Management** and **LLM Provider** tabs; repeating the command reveals that panel. **Archi: Create Diagram** asks for **Sequence** or **Component** before any generation. The separate Sequence command is hidden and delegates to this selection. **Check Provider Configuration** remains callable. Cloning/building belongs in [development](development.md).

## Provider, profile and model

A provider is the service executing the model. A profile selects its adapter and endpoint policy; the model ID selects one model at that provider.

| UI profile | ID | Endpoint | Key |
| --- | --- | --- | --- |
| LM Studio | `local-lm-studio` | `http://127.0.0.1:1234/v1` by default | none |
| Ollama | `local-ollama` | `http://127.0.0.1:11434/v1` | none |
| Anthropic | `cloud-anthropic` | fixed `https://api.anthropic.com` | SecretStorage |
| OpenAI | `cloud-openai` | fixed `https://api.openai.com` | SecretStorage |
| OpenRouter | `cloud-openrouter` | fixed `https://openrouter.ai` | SecretStorage |

Prepare your local server/model yourself; the extension does not download models. Open **Archi: Configuration → LLM Provider**. Select a profile, edit the applicable endpoint/timeout/model fields, and use **Apply**. **Discard Changes** restores the applied values. Unapplied edits survive tab changes and block listing, keys and checks; external settings changes are shown without overwriting those edits. After such a conflict, Discard and re-enter the intended changes. Changing settings invalidates prior diagnostics. **Refresh Models** explicitly lists models in one bounded request; choose a model supporting structured JSON or enter its exact ID, then Apply. No model is selected automatically. Cloud profiles need **Set / Replace Key** (native password input); **Remove Key** asks for confirmation. Keys stay in provider-specific SecretStorage entries; the screen receives only presence. **Check Provider Configuration** tests applied settings with at most one list request and no generation. It shows connection, listing, selected-model and generation findings with a next action. Listing does not prove generation readiness, access, billing or quota. An explicit **Create Diagram** operation is the generation test and retains the existing request policy. Not every provider has live owner smoke.

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

Machine-scoped profile/model selections are not synchronized by Settings Sync or overridden by a workspace. After changing profile, select a model again; stale bindings are inactive. Prefer the UI to editing model settings. Local URLs accept literal `127.0.0.1` or `[::1]` with `/v1`; `localhost`, remote hosts, redirects and credential-bearing URLs are rejected. Details: [local adapters](../local-model.md), [cloud adapters](../cloud-models.md).

## Choose or create the active Knowledge Pack

A Knowledge Pack is a local architecture catalog: systems, actors, relationships, aliases and rules. Grounding matches canonical names and aliases to this catalog before model generation.

Open **Configuration → Knowledge Management** (the **Configure Knowledge Pack** compatibility shortcut opens the same tab). Check the displayed project, active absolute path, saved write scope, effective source, loader validation and actual row counts. In multi-root, explicitly select a project first. **Choose Existing Knowledge Pack** uses the native folder picker and validates five strict tables before activating through UX3. **Validate / Refresh** re-reads the pack; **Open systems.md** and the other four buttons open its files. One project writes WorkspaceFolder; no workspace writes User/Global. Cancel preserves the setting. Only one pack is active for the selected scope.

**Create Knowledge Pack** selects an existing parent through the native folder picker, asks for one folder name and one real system (ID, canonical name, kind, description), and creates five tables without invented relationships. UX3 still supports a new or existing empty destination and rejects nonempty folders. Document Builder below requires a new folder. First-run **Create Diagram** onboarding retains its native Create/Choose/Cancel controls and editable absolute default destination; it uses no model.

For the small demo catalog, start Alpha as `service`, then add Beta as `database` and a relationship using the [five-table format](../knowledge-pack-format.md). Do this by deliberate file editing and reload validation; the document Builder does not update this pack. A relationship's `interface_type` can be `DB`, `interface_name` `Writer`, and `mode` `synchronous`.


### Complete synthetic five-file pack

Create these five UTF-8 files in one folder, then choose it with Configure Knowledge Pack. These are manual example files, not Builder output with provenance.

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

## Documents to a new pack

1. Run **Build Knowledge Pack from Documents** from the palette or the **Build Knowledge Pack from Documents** button in **Configuration → Knowledge Management**. Select explicit local `.md`, `.txt`, `.pdf`, `.docx`, `.xlsx` files. No directory scan or URL retrieval occurs. An existing pack is not needed.
2. For PDFs the Builder's **PDF OCR mode** picker uses **none**, **auto**, **all**. `auto` keeps text pages and OCRs pages without text; `all` OCRs every page; `none` requires usable text. The separate **Convert to Markdown** command labels these choices **No OCR**, **Auto OCR**, **OCR all pages** and opens one unsaved Markdown editor. It needs neither provider nor pack and makes no network request.
3. Local acquisition captures exact bounded bytes, hashes them, converts private copies and freezes normalized text. Review never rereads the originals. This capture is not an atomic snapshot of a file being concurrently written. Prepare stable documents. Missing model selection follows input validation; progress supports Cancel. Valid extraction makes one StructuredChatClient generation request with bounded document text, then checks proposals/evidence locally.
4. The linked **Knowledge Pack Review** editor shows all proposals, validation issues, source and OCR limitations. Expand **Evidence, references and original proposal** on each row. `pending` means no decision yet; `accepted` means your decision to include; `rejected` excludes it. `explicit` and `inferred` describe the original proposal; inferred rows require reasoning. Evidence is a literal quote with source identity, original/text digests and offsets/lines in normalized text. Correct offsets and a real quote do not prove the architectural interpretation. OCR confidence is unavailable; coverage stays partial.
5. Use **Accept selected**, **Reject selected**, **Return selected to pending** for groups, or **Accept all pending** / **Reject remaining pending**. Check evidence before accepting. Expand **Edit proposed row**, change its fields and select **Apply row edit**; references use entity selection. It cannot add proposals or edit IDs, evidence, basis or reasoning. An edited row retains original evidence and an `editedByUser` marker; the quote is not claimed to state your edit verbatim. Unapplied row edits do not change the session.
6. **Validate and preview** blocks while any row is pending, an accepted relationship/alias/rule lacks accepted endpoints, conflicts remain, aliases collide, or the accepted set has no system. Dependencies are not accepted automatically. Change decisions/fields and validate again. Every change invalidates the previous immutable preview.
7. Choose an existing parent folder and one **new pack folder name**. Expand the five read-only previews on the same screen: `systems.md`, `actors.md`, `relationships.md`, `aliases.md`, `rules.md`. The immutable preview is the exact content saved.
8. **Save** creates the new pack and leaves the active setting unchanged. **Save and use** saves/loads first, then activates in the selected UX3 project scope (Global without a project). **saved, not activated** means valid files were retained but configuration failed; use Configure Knowledge Pack to choose them later. Decisions remain above the previews; **Cancel** or closing the review panel exits before saving. After a collision, **Choose new pack folder** selects another new destination without extraction.

There is one active build per Extension Host. Cancel or closing the review panel ends the build; a completed save releases the build guard. There are no persistent drafts, autosave, existing-pack update/merge or acceptance history. A new command means a new extraction. Review/edit/validation/preview/save/activation use **zero additional LLM requests**, even after a save collision and return to review.

Builder limits are stricter than standalone conversion:

| Boundary | Builder | Standalone conversion |
| --- | --- | --- |
| Files/input | 8; 10 MiB each, 20 MiB total | one; 50 MiB |
| Text/output | 64 KiB UTF-8 per source; serialized bundle 160 KiB | 8 MiB Markdown |
| Request/candidates | 256 KiB prepared request; 128 candidates, 32 aliases, 64 relationships | no LLM |
| Work deadline | 360 seconds; generation 120 seconds capped by remaining time | 120 seconds without OCR; OCR deadline 300 seconds |

Both conversion paths retain 300 PDF pages, 20 OCR pages, 10 MP rendered canvas, 16 MP embedded image; Office ZIP 1000 entries, 100 MiB inflated total, 25 MiB per entry, 100:1 ratio; XLSX 40 sheets, 20000 rows, 150 columns, 250000 cells. PDF loses layout/table structure; DOCX excludes images/external resources and complex layout may lose fidelity; XLSX uses cached formula values, never recalculation. DOC/XLS are unsupported. PL/EN OCR models are bundled offline. Cancel/failure returns no partial conversion or candidates. Worker closure/cleanup can extend beyond the work deadline. See [full extraction limits](../document-candidates.md#limits-and-cancellation).

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

Invalid input/grounding makes zero generation calls; generator/local rejection one; a locally valid candidate triggers one separate reviewer call, for two total. Generator and reviewer use the same configured profile/model, separate requests and the same frozen snapshot. No retry, repair, fallback or third call. A verified success opens unsaved PlantUML and a linked JSON grounding report side by side. Inspect facts, evidence classes, source lines, warnings, deterministic validation, semantic verdict and snapshot digest. The editor contains PlantUML text; a graphical preview needs separate PlantUML editor support. No official PlantUML rendering guarantee is inferred from local subset validation.

If semantic review rejects/fails after local checks, **Show unverified candidate** may open a marked candidate without a report; Cancel opens nothing. It is not a completed ART1 result. User cancellation does not offer an unverified candidate. The old `archiAgent.generateSequenceDiagram` command ID is an invisible delegate to **Create Diagram**. The older one-call runtime compatibility API remains available internally; it is not a separate user entry or fallback.

## Save the original diagram and report

Use the generation notification's **Save Diagram and Report**, the palette's **Archi Agent: Save Diagram and Report**, or the Open menu. The menu/palette selects an original result by diagram type, UTC creation time and result UUID. With one local project it is the target; multi-root explicitly asks for the destination project. Without a project, open a local folder first. Confirm the displayed original result, full new folder, `diagram.puml` and `report.json` in the modal. Cancel before save creates nothing.

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

| Situation | What to do |
| --- | --- |
| Builder target exists, even empty | keep it; return through review/location selection and choose another new folder; no re-extraction needed |
| ART1 destination exists | retry Save to obtain a new bundle; no overwrite/merge |
| Symbolic link, missing/non-directory parent or containment error | fix the indicated local project/path first; merely retrying a bundle cannot fix the path |
| Cancel during write, or write/verification failure | wait for cleanup outcome; inspect the displayed location if cleanup is incomplete |
| Foreign edit/replacement/unproven partial write retained | keep edits, inspect retained data, move preserved files or choose a new location before retrying |
| Pack saved but activation failed | retain files, check settings and activate via Configure Knowledge Pack |
| Missing model/key/connection or structured-output failure | use Configuration and Check Provider Configuration; correct setup and explicitly start a new operation |
| Pending rows/dependency/conflict error | review the displayed issues, decide all rows, accept required entities or reject dependent rows; validate again |
| No completed result available | keep result previews open or run a new successful generation; unsaved edited files alone are not ART1 results |

Save success follows exact-byte/load/ownership checks and a final cancellation check. Files can become visible incrementally. These are controlled operations with conditional rollback, **not atomic publication of a directory or two files**. Cleanup removes only resources proved owned and unchanged; uncertain data is preserved. There is no crash recovery or fsync durability guarantee, and portable path checks do not eliminate hostile races between system calls. Cancel after success does not undo saved data. Pack files and VS Code settings are separate operations.

## Demonstrations and license

The text above is complete without animation. [Media and provenance](../assets/README.md) explain the controlled synthetic transport; recordings demonstrate the earlier DOC1 UI, not the new UX4 screens, live LLM quality or owner smoke. Follow the current text instructions for UX4.

[Choose a pack and generate](../assets/choose-pack-generate.gif) — configure Alpha/Beta's existing pack, choose Sequence and a flow, inspect the result/report. [Static preview](../assets/choose-pack-generate.png).

![Actual VS Code selection of an existing Knowledge Pack, followed by Sequence generation and its report](../assets/choose-pack-generate.gif)

[Documents to review to save](../assets/documents-review-save.gif) — select `source.md`, inspect proposals, edit Beta's description, accept, preview, save in a new folder. [Static preview](../assets/documents-review-save.png).

![Actual VS Code document picker, candidate review and new Knowledge Pack save](../assets/documents-review-save.gif)

[Save the original pair](../assets/save-original-pair.gif) — select the completed Sequence result, confirm the new folder, save and open its report. [Static preview](../assets/save-original-pair.png).

![Actual VS Code original result selection, ART1 native confirmation and saved report](../assets/save-original-pair.gif)

Own code/docs use [MIT](../../LICENSE); bundled components retain [their notices](../../vscode-extension/THIRD_PARTY_NOTICES.md) and [OCR licenses](../../experiments/ux2-ocr/TRIAL_NOTICES.md). MCP, EA acquisition, Context/Container, ArchiMate, Chat and retry/repair remain planned. Do not use roadmap entries as instructions for current UI.
