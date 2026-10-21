# Capability Map — local EA1b candidate

[Polski](../pl/capability-map.md) · [User guide](user-guide.md)

Use the **new local EA1b Core or Full VSIX**, identified in the local verification report.
The published DEMO1 VSIX/ZIP does not include this feature. Use the current checkout's
[Retail folder](../../examples/retail-checkout/START-HERE.en.md) and
[enterprise.json](../../examples/retail-checkout/architecture/enterprise.json).
Do not replace the published archives. Enable exactly one Core/Full profile and reload VS Code.

## Company description → reviewed catalog → map

1. Run **Archi: Build Business Capability Catalog / Utwórz katalog zdolności biznesowych** from the Command Palette or the Archi menu.
2. Choose **Extract from materials** for supported capabilities, or **Propose a company model** for a proposed L1–L3 business model. For example: “We manufacture food and household chemicals. We have three factories, sell through retail chains and distributors, and run our own online store. Propose an L1–L3 capability model.”
3. Choose the captured selection, the whole active document (including dirty/untitled text), an entered description, or explicit local MD/TXT/PDF/DOCX/XLSX documents. Editor text is captured before the first picker; selection evidence uses original document positions and version/fingerprint. Local files are frozen before conversion and model access. Converted document references identify converted text, with converter/OCR warnings, not invented original page coordinates.
4. Review the opened material preview, then explicitly authorize sending it. Only those materials go to the configured provider/model. Existing configuration and secure key storage apply. A cloud provider requires a separate authorization for this potentially paid call.
5. Review the hierarchy, original proposals and evidence. Select candidates to accept, reject or mark pending; edit names, descriptions or parents in the row editor. IDs remain stable. To reject a parent, explicitly reject its retained children or move them first. Review material warnings before saving.
6. Name the catalog and declare its scope. Choose the destination folder and **Save new catalog**. This creates `enterprise.json` and `enterprise.review.json`; existing files block the save. The production reader validates the saved bytes before success. There is no merge/update operation.
7. Click **Generate Capability Map**. It uses that saved catalog through the existing deterministic path, with **zero additional model calls**. Choose a domain/detail when a large catalog exceeds 12 visible roots or 120 tiles. ART1 can preserve the resulting original diagram/report.

The model supplies semantic proposals, never PlantUML. Each field distinguishes claimed material support from a model proposal; quotes and locations are checked mechanically, while their relevance needs your review. A proposed hierarchy remains a proposal. Acceptance and manual edits are user decisions and do not turn original materials into confirmation of new content. The separate report retains originals, evidence and decisions; catalog provenance points to the actual review session and report digest. Ratings, owners and application support are not guessed. Coverage stays `partial`.

One bounded bundle makes at most **one extraction call**, with 16,384 output tokens and a 120-second total extraction deadline (or a shorter provider timeout). Up to 8 documents, 10 MiB each/20 MiB total original bytes, 64 KiB text per document, 160 KiB bundle, 256 KiB request, 1 MiB response and 1,000 catalog records are allowed. Oversized material fails explicitly: narrow the selected material and retry consciously. No silent truncation, unlimited chunking, automatic retry, repair or fallback exists. Truncated responses, invalid schema/evidence, timeout and cancellation do not produce a saved catalog. Core has no OCR; select text-only PDF mode or use Full for supported local OCR. Conversion warnings and partial coverage remain visible. Source instructions are data, never execution instructions.

## Map from an existing catalog or active JSON

**Create Diagram** captures the active local text document before its first diagram picker. Choose **Active document — including unsaved changes** to use that JSON, including dirty or untitled text. Later editor changes do not replace the operation's captured input. Explicit local-file and configured MCP choices remain available. The active-document path uses no provider/model; malformed JSON never triggers interpretation by a model. A local project folder is required for the existing-catalog workflow and optional ART1 save.

Evidence labels `editor-buffer:<name>` and UTF-8 hashes refer to the captured text, not disk bytes. ART1 records `in-memory-input` and preserves the captured original. Custom previews, diff tabs and remote documents cannot substitute a stale editor. These features are in the current development candidate; published DEMO1 archives do not include them.

1. Open the current `examples/retail-checkout` folder in VS Code. You can leave all provider,
   model, API key and software architecture settings empty. No setup script is needed for this map.
2. Run **Archi: Create Diagram → Enterprise Architecture → Capability Map**.
   In a multi-root workspace choose the project, then select `architecture/enterprise.json`.
3. Choose **Whole map**, **L1–L3**, then **Dojrzałość**. The example has three L1 areas,
   eleven capabilities and explicit partial coverage. Names stay Polish; the UI language controls the legend.
4. Read the PlantUML and JSON report opened side by side. Expect `modelCalls: 0`,
   `generationPath: deterministic-catalog-projection` and semantic review `not-applicable`.
   A graphical preview needs a separate local PlantUML renderer; the reference image below is already rendered.
5. Run **Archi: Save Diagram and Report**, select the original capability result, choose the save
   project if asked and confirm. A new `archi-agent-results/<time-and-UUID>/` contains
   `diagram.puml` and `report.json`. This saves the original pair, including after preview edits.
   Cancel at any selection or confirmation creates no partial result on disk.

![Retail business capabilities](../../examples/retail-checkout/assets/capability-map.png)

[Reference PlantUML](../../examples/retail-checkout/assets/capability-map.puml) ·
[Render provenance](../../examples/retail-checkout/assets/capability-map-provenance.json).

Nesting expresses business decomposition: L1 area, L2 capability, L3 detail. Colors correspond
only to the explicit scale and the labels printed in the legend. Gray **No data** is an absent
assessment, not zero. Explicit zero is valid in this example. Parents do not inherit child ratings;
tile size carries no assessment. **No rating colors** deliberately hides ratings in the view.

Repeat with **Sprzedaż** and **L1–L2**: the report marks other branches outside selected scope
and L3 records below detail level. Source coverage stays partial. These are deliberate omissions,
not missing source records. Limit errors ask you to choose a branch or lower detail; no data is silently cut.
If the catalog changes during selection, repeat Create Diagram. Invalid input gives a field/code/line;
fix the catalog, never ask a model to guess a missing parent or name.

[Exact file contract, bounds and digests](../enterprise-catalog.md).
CLI/MCP and the MCP enterprise source are available in the local EA1b candidate. Follow the complete configurations and commands in the [CLI/MCP tutorial](cli-mcp.md#capability-map-with-no-model--local-ea1b-candidate). With enterpriseSource configured, choose Configured MCP source instead of a file; scope/detail/colors and ART1 stay the same. Remote errors show a code and JSON Pointer without invented file lines. Application support maps, value streams and application landscapes remain future work.
