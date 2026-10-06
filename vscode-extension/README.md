# Archi Agent for VS Code

This local K3 candidate retains the **0.3.0-alpha.4** package version and has a different SHA-256 from the published release. It generates grounded PlantUML **Sequence** and **Component** diagrams from a flow and a local Architecture Knowledge Pack. A model proposes a plan, local code validates and renders it, and an independent model review checks the candidate. Verified diagrams and reports open in untitled editors.

## Install and start

For candidate smoke, install the locally built **archi-agent-0.3.0-alpha.4.vsix** through **Extensions → … → Install from VSIX…** in a fresh VS Code profile. Check its SHA-256 against the local release notes. This candidate has not been published. The VSIX is self-contained: no repository checkout, npm, separate Node.js installation, runtime download, or Archi Agent backend is required.

Run **Archi Agent: Open**. It has four sections: **Generate Diagram**, **Configuration**, **Knowledge Management**, and **Convert to Markdown**. Back returns to the first picker; Escape closes it.

For diagram generation:

1. Generate Diagram validates the configured Knowledge Pack before provider setup. A missing or invalid pack offers **Create Knowledge Pack**, **Choose Existing**, or **Cancel**, with Settings available for repair. **Configure Knowledge Pack** is also available from Configuration, Knowledge Management and the Command Palette, even when a valid pack is configured. Create shows an editable absolute destination before asking for one real system; its default is the selected project's `.archi-agent/knowledge`, or `Documents/ArchiAgent/knowledge` without a project. Create accepts a new or existing empty destination; nonempty destinations are rejected without changing their files. See the [format](https://github.com/Setech-pl/archi-agent/blob/main/docs/knowledge-pack-format.md).
2. Under **Configuration**, select a provider profile and model. Profiles are LM Studio and Ollama on loopback, plus Anthropic, OpenAI, and OpenRouter over fixed HTTPS. Cloud providers also need an API key entered through **Set or Update API Key**; VS Code keeps it in SecretStorage. Use a structured-output capable model.
3. Choose **Generate Diagram → Sequence** or **Component**. Use the active flow document, a flow file, or a typed description. Resolve ambiguous references and confirm **[NEW: Name]** elements if prompted.
4. Review the unsaved PlantUML and grounding report. If independent review rejects or fails after local checks, a modal can show a marked unverified candidate without a report. Cancel opens nothing.

**Archi Agent: Convert to Markdown** selects one local PDF, DOCX, or XLSX and opens one unsaved Markdown editor after success. For PDF, choose **Auto OCR**, **No OCR**, or **OCR all pages**. Auto OCR uses bundled offline Polish and English models for pages without text; headings identify OCR and blank pages. Progress and Cancel are shown during conversion. It needs no provider, key, model, or Knowledge Pack; it makes no network or LLM request and does not change the source.

## Commands and settings

The public commands are **Open**, **Build Knowledge Pack from Documents**, **Configure Knowledge Pack**, **Convert to Markdown**, **Generate Diagram**, **Generate Sequence Diagram** (the separate compatibility path), **Select Provider Profile**, **Select Model**, **Set or Update API Key**, and **Delete Saved API Key**, all under **Archi Agent**. Configuration in **Open** links to these commands and settings. The legacy local profile/model command IDs remain callable.

**archiAgent.localModel.profile** and **archiAgent.localModel.selectedModel** are machine scoped. **archiAgent.localModel.selectedModelProfile** is an extension-managed binding; do not edit it. Legacy LM Studio **archiAgent.localModel.baseUrl** and **archiAgent.localModel.model** work until an explicit profile is selected. **archiAgent.localModel.timeoutSeconds** controls one model request, **archiAgent.defaultAuthor** applies to typed descriptions, and **archiAgent.diagnostics.verbose** enables safe structured diagnostics. Cloud keys are not settings.

## Limits and privacy

Only bounded, relevant grounded context is sent to the selected model, not the full pack. Local profiles accept loopback endpoints only; cloud profiles use fixed HTTPS hosts. Profile choice alone makes no provider request. Automated tests cover all adapters, but live owner smoke does not cover every provider. The prior UX2 VSIX passed owner smoke on Mac ARM; this `alpha.4` file awaits its own installation smoke.

One Knowledge Pack directory is supported. Generated editors are not saved automatically, and PlantUML preview needs separate editor support. PDF OCR does not recover layout or tables. DOCX complex layout may lose fidelity; XLSX uses cached formula results. Conversion limits are 50 MiB input, 8 MiB Markdown output, 120 seconds, and 300 PDF pages. OCR allows 20 recognized pages, a 10 MP rendered canvas, a 16 MP embedded image, and a 300-second deadline once a page without text becomes an OCR candidate. Office ZIP allows at most 1000 entries, 100 MiB inflated in total, 25 MiB per entry, and a 100:1 compression ratio. XLSX allows at most 40 sheets, 20000 rows, 150 columns, and 250000 cells; worksheet XML is checked before parsing. DOC and XLS are unsupported. MCP, VS Code Chat, C4/ArchiMate types, retry, and repair are deferred. Knowledge Pack Builder K3 exposes document extraction and review using the deterministic Builder Stage A core. See the [full extension guide](https://github.com/Setech-pl/archi-agent/blob/main/docs/vscode-extension.md) and [root README](https://github.com/Setech-pl/archi-agent/blob/main/README.md).

### Build a Knowledge Pack from documents

Use **Archi Agent: Build Knowledge Pack from Documents**, also available under
**Open → Knowledge Management**. Select local MD/TXT/PDF/DOCX/XLSX files, review the pending
proposals, accept/reject groups, edit row fields and inspect the five exact Markdown previews.
Pending decisions and unresolved dependencies/conflicts block saving. Evidence, IDs and
inferred basis remain unchanged; OCR and partial coverage warnings remain visible.

Choose an existing parent folder and a **new** pack folder name. **Save** leaves the configured
pack unchanged; **Save and use** activates only after successful save/load, at the selected
project scope (or Global without a workspace). An existing folder, even empty, is rejected.
Activation failure preserves the saved pack. No autosave, existing-pack update/merge, extra LLM
review call or persistent draft is added. Technical validation does not prove proposal truth.
See the repository's `docs/knowledge-pack-review.md` for limitations and owner smoke.
