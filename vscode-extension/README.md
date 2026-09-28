# Archi Agent for VS Code

Archi Agent **0.3.0-alpha.1** is a prerelease. It generates grounded PlantUML **Sequence** and **Component** diagrams from a flow and a local Architecture Knowledge Pack. A model proposes a plan, local code validates and renders it, and an independent model review checks the candidate. Verified diagrams and reports open in untitled editors.

## Install and start

After the prerelease is published, download **archi-agent-0.3.0-alpha.1.vsix** and **archi-agent-0.3.0-alpha.1.sha256** from the [release page](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.1). Verify the checksum and choose **Extensions → … → Install from VSIX…** in VS Code. The VSIX is self-contained: no repository checkout, npm, separate Node.js installation, or Archi Agent backend is required.

Run **Archi Agent: Open**. It has four sections: **Generate Diagram**, **Configuration**, **Knowledge Management**, and **Convert to Markdown**. Back returns to the first picker; Escape closes it.

For diagram generation:

1. Prepare a local Knowledge Pack directory containing systems.md, actors.md, relationships.md, aliases.md, and rules.md. Set its absolute path with **Knowledge Management → Configure Knowledge Pack Path** (**archiAgent.knowledgePackPath**). See the [format](https://github.com/Setech-pl/archi-agent/blob/v0.3.0-alpha.1/docs/knowledge-pack-format.md) after publication.
2. Under **Configuration**, select a provider profile and model. Profiles are LM Studio and Ollama on loopback, plus Anthropic, OpenAI, and OpenRouter over fixed HTTPS. Cloud providers also need an API key entered through **Set or Update API Key**; VS Code keeps it in SecretStorage. Use a structured-output capable model.
3. Choose **Generate Diagram → Sequence** or **Component**. Use the active flow document, a flow file, or a typed description. Resolve ambiguous references and confirm **[NEW: Name]** elements if prompted.
4. Review the unsaved PlantUML and grounding report. If independent review rejects or fails after local checks, a modal can show a marked unverified candidate without a report. Cancel opens nothing.

**Archi Agent: Convert to Markdown** selects one local text-layer PDF, DOCX, or XLSX and opens one unsaved Markdown editor after success. It needs no provider, key, model, or Knowledge Pack; it makes no network or LLM request and does not change the source.

## Commands and settings

The public commands are **Open**, **Convert to Markdown**, **Generate Diagram**, **Generate Sequence Diagram** (the separate compatibility path), **Select Provider Profile**, **Select Model**, **Set or Update API Key**, and **Delete Saved API Key**, all under **Archi Agent**. Configuration in **Open** links to these commands and settings. The legacy local profile/model command IDs remain callable.

**archiAgent.localModel.profile** and **archiAgent.localModel.selectedModel** are machine scoped. **archiAgent.localModel.selectedModelProfile** is an extension-managed binding; do not edit it. Legacy LM Studio **archiAgent.localModel.baseUrl** and **archiAgent.localModel.model** work until an explicit profile is selected. **archiAgent.localModel.timeoutSeconds** controls one model request, **archiAgent.defaultAuthor** applies to typed descriptions, and **archiAgent.diagnostics.verbose** enables safe structured diagnostics. Cloud keys are not settings.

## Limits and privacy

Only bounded, relevant grounded context is sent to the selected model, not the full pack. Local profiles accept loopback endpoints only; cloud profiles use fixed HTTPS hosts. Profile choice alone makes no provider request. Automated tests cover all adapters, but live owner smoke does not cover every provider. The release candidate awaits its own owner smoke.

One Knowledge Pack directory is supported. Generated editors are not saved automatically, and PlantUML preview needs separate editor support. PDF extraction has no OCR or layout recovery. DOCX complex layout may lose fidelity; XLSX uses cached formula results. Conversion limits include 10 MiB input, 2 MiB Markdown output, 100 PDF pages, 20 sheets, 100,000 cells, and 30 seconds. DOC and XLS are unsupported. MCP, VS Code Chat, C4/ArchiMate types, Knowledge Pack Builder, retry, and repair are deferred. See the [full extension guide](https://github.com/Setech-pl/archi-agent/blob/v0.3.0-alpha.1/docs/vscode-extension.md) and [root README](https://github.com/Setech-pl/archi-agent/blob/v0.3.0-alpha.1/README.md) after publication.
