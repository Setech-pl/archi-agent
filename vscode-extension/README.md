# Archi Agent for VS Code

Archi Agent **0.3.0-alpha.4** is a local release candidate. It generates grounded PlantUML **Sequence** and **Component** diagrams from a flow and a local Architecture Knowledge Pack. A model proposes a plan, local code validates and renders it, and an independent model review checks the candidate. Verified diagrams and reports open in untitled editors.

## Install and start

For candidate smoke, install the locally built **archi-agent-0.3.0-alpha.4.vsix** through **Extensions → … → Install from VSIX…** in a fresh VS Code profile. Check its SHA-256 against the local release notes. This candidate has not been published. The VSIX is self-contained: no repository checkout, npm, separate Node.js installation, runtime download, or Archi Agent backend is required.

Run **Archi Agent: Open**. It has four sections: **Generate Diagram**, **Configuration**, **Knowledge Management**, and **Convert to Markdown**. Back returns to the first picker; Escape closes it.

For diagram generation:

1. Prepare a local Knowledge Pack directory containing systems.md, actors.md, relationships.md, aliases.md, and rules.md. Set its absolute path with **Knowledge Management → Configure Knowledge Pack Path** (**archiAgent.knowledgePackPath**). See the [format](https://github.com/Setech-pl/archi-agent/blob/main/docs/knowledge-pack-format.md).
2. Under **Configuration**, select a provider profile and model. Profiles are LM Studio and Ollama on loopback, plus Anthropic, OpenAI, and OpenRouter over fixed HTTPS. Cloud providers also need an API key entered through **Set or Update API Key**; VS Code keeps it in SecretStorage. Use a structured-output capable model.
3. Choose **Generate Diagram → Sequence** or **Component**. Use the active flow document, a flow file, or a typed description. Resolve ambiguous references and confirm **[NEW: Name]** elements if prompted.
4. Review the unsaved PlantUML and grounding report. If independent review rejects or fails after local checks, a modal can show a marked unverified candidate without a report. Cancel opens nothing.

**Archi Agent: Convert to Markdown** selects one local PDF, DOCX, or XLSX and opens one unsaved Markdown editor after success. For PDF, choose **Auto OCR**, **No OCR**, or **OCR all pages**. Auto OCR uses bundled offline Polish and English models for pages without text; headings identify OCR and blank pages. Progress and Cancel are shown during conversion. It needs no provider, key, model, or Knowledge Pack; it makes no network or LLM request and does not change the source.

## Commands and settings

The public commands are **Open**, **Convert to Markdown**, **Generate Diagram**, **Generate Sequence Diagram** (the separate compatibility path), **Select Provider Profile**, **Select Model**, **Set or Update API Key**, and **Delete Saved API Key**, all under **Archi Agent**. Configuration in **Open** links to these commands and settings. The legacy local profile/model command IDs remain callable.

**archiAgent.localModel.profile** and **archiAgent.localModel.selectedModel** are machine scoped. **archiAgent.localModel.selectedModelProfile** is an extension-managed binding; do not edit it. Legacy LM Studio **archiAgent.localModel.baseUrl** and **archiAgent.localModel.model** work until an explicit profile is selected. **archiAgent.localModel.timeoutSeconds** controls one model request, **archiAgent.defaultAuthor** applies to typed descriptions, and **archiAgent.diagnostics.verbose** enables safe structured diagnostics. Cloud keys are not settings.

## Limits and privacy

Only bounded, relevant grounded context is sent to the selected model, not the full pack. Local profiles accept loopback endpoints only; cloud profiles use fixed HTTPS hosts. Profile choice alone makes no provider request. Automated tests cover all adapters, but live owner smoke does not cover every provider. The prior UX2 VSIX passed owner smoke on Mac ARM; this `alpha.4` file awaits its own installation smoke.

One Knowledge Pack directory is supported. Generated editors are not saved automatically, and PlantUML preview needs separate editor support. PDF OCR does not recover layout or tables. DOCX complex layout may lose fidelity; XLSX uses cached formula results. Conversion limits are 50 MiB input, 8 MiB Markdown output, 120 seconds, and 300 PDF pages. OCR allows 20 recognized pages, a 10 MP rendered canvas, a 16 MP embedded image, and a 300-second deadline once a page without text becomes an OCR candidate. Office ZIP allows at most 1000 entries, 100 MiB inflated in total, 25 MiB per entry, and a 100:1 compression ratio. XLSX allows at most 40 sheets, 20000 rows, 150 columns, and 250000 cells; worksheet XML is checked before parsing. DOC and XLS are unsupported. MCP, VS Code Chat, C4/ArchiMate types, Knowledge Pack Builder extraction/UI (K2/K3), retry, and repair are deferred; an internal deterministic Builder Stage A core exists but is not exposed by the VSIX. See the [full extension guide](https://github.com/Setech-pl/archi-agent/blob/main/docs/vscode-extension.md) and [root README](https://github.com/Setech-pl/archi-agent/blob/main/README.md).
