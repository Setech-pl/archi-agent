# Archi Agent

Archi Agent is a VS Code extension for generating grounded PlantUML architecture diagrams from a flow description and a local Architecture Knowledge Pack. Version **0.3.0-alpha.1** is a prerelease candidate for evaluation.

The extension generates **Sequence** and **Component** diagrams. A model proposes a bounded plan; local code validates the plan and renders PlantUML; a separate model call reviews the candidate. Verified results open as unsaved PlantUML and grounding-report editors. **Generate Sequence Diagram** remains a separate compatibility command with its earlier report format.

## Install the prerelease

When the release is published, download [archi-agent-0.3.0-alpha.1.vsix](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.1/archi-agent-0.3.0-alpha.1.vsix) and its [SHA-256 file](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.1/archi-agent-0.3.0-alpha.1.sha256) from the [v0.3.0-alpha.1 prerelease page](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.1). Verify the downloaded VSIX against the checksum. In VS Code, open **Extensions → … → Install from VSIX…** and select the file. These links become usable only after publication.

The VSIX contains its runtime and conversion worker. End users do not need to clone this repository, install npm or Node.js separately, or run an Archi Agent backend. Diagram generation still needs a configured model provider and Knowledge Pack; document conversion needs neither.

## First run

1. Run **Archi Agent: Open** from the Command Palette. Its four sections are **Generate Diagram**, **Configuration**, **Knowledge Management**, and **Convert to Markdown**.
2. For diagrams, create a local [Architecture Knowledge Pack](docs/knowledge-pack-format.md): one directory with systems.md, actors.md, relationships.md, aliases.md, and rules.md. Set its absolute path through **Knowledge Management → Configure Knowledge Pack Path** or the **archiAgent.knowledgePackPath** setting. The pack is not included in the VSIX.
3. Under **Configuration**, run **Select Provider Profile**, then **Select Model**. Local profiles use LM Studio or Ollama through loopback OpenAI-compatible endpoints. Cloud profiles use Anthropic, OpenAI, or OpenRouter; also run **Set or Update API Key**. Choose a model capable of structured JSON output. Cloud calls may incur provider charges.
4. Choose **Generate Diagram → Sequence** or **Component**. Supply the active flow document, a local flow file, or a typed description. A flow document needs the required [front matter](docs/front-matter.md). Resolve ambiguous names and confirm explicit **[NEW: Name]** elements when prompted.
5. Inspect the PlantUML and grounding report. Save the untitled editors yourself if you want files. If semantic review rejects or fails after local validation, the extension may offer a clearly marked **unverified candidate** without a report; cancelling opens no result.

**Archi Agent: Convert to Markdown** can also be run directly. Select one local text-layer PDF, DOCX, or XLSX; the conversion opens as one unsaved Markdown editor. It does not edit the source, use a model, read a Knowledge Pack, or make a network request. Cancel or failure opens no partial document.

## Grounding, providers, and privacy

The Knowledge Pack is parsed and indexed locally. Canonical names, aliases, ambiguity decisions, explicit new elements, rules, and source evidence constrain the plan. Source-confirmed relationships remain distinct from user-stated ones; absence from the pack does not prove absence in the architecture. Only bounded context relevant to the request is sent to the selected model, never the complete pack. Generator output and reviewer verdicts are validated locally. Reviewed generation uses at most one generator call and one independent reviewer call, without automatic retry or repair.

Implemented provider profiles are **LM Studio**, **Ollama**, **Anthropic**, **OpenAI**, and **OpenRouter**. Local endpoints are restricted to loopback. Cloud profiles use fixed HTTPS endpoints and API keys stored in VS Code SecretStorage; keys are not ordinary settings or packaged with the VSIX. Profile and model selections are machine scoped. Selecting a cloud profile does not itself send a request; explicit model listing and generation do. See [local models](docs/local-model.md), [cloud models](docs/cloud-models.md), and the [extension guide](docs/vscode-extension.md).

Automated tests cover the provider adapters and reviewed pipelines with controlled transports and synthetic data. Packaged-runtime smoke has exercised an extracted VSIX outside the repository. Historical owner smoke passed for the self-contained extension, reviewed Sequence with Ollama, UX1 navigation and conversion, and D2 Component. The owner reported **PASS** for all nine smoke checks on this exact release-candidate VSIX. The five profiles have not all received live owner smoke; no paid cloud smoke is claimed.

## Current limits and deferred work

- One local Knowledge Pack directory is supported. Diagram output is untitled; the extension does not persist or version artifacts. A PlantUML preview requires separate editor support.
- PDF conversion extracts text without OCR or layout reconstruction. DOCX complex layout and merged cells may lose fidelity. XLSX uses saved formula results and does not recalculate formulas. Input, output, archive, page, sheet, cell, and time limits apply; see [known limitations](docs/vscode-extension.md#known-limitations).
- DOC, XLS, scanned-PDF OCR, Enterprise Architect integration, MCP (M1), VS Code Chat (C1), C4 and ArchiMate diagram types (D3–D5), and Knowledge Pack Builder (K2/K3) are planned or deferred, **not implemented in this candidate**. Conversion does not automatically build a Knowledge Pack or feed documents into diagram grounding.

## Documentation and development

- [Release notes](docs/releases/v0.3.0-alpha.1.md) and [extension guide](docs/vscode-extension.md)
- [Knowledge Pack format](docs/knowledge-pack-format.md), [flow front matter](docs/front-matter.md), and [reviewed pipeline](docs/reviewed-diagram-pipeline.md)
- [Architecture](docs/architecture.md), [product roadmap](docs/product-roadmap.md), and [project state](docs/project-state.md)
- [Development workflow](docs/development-workflow.md), [contributor instructions](AGENTS.md), and [offline demo](docs/demo.md)

Contributors can install locked dependencies with **npm ci**, run **npm test**, and use the scripts in the root [package manifest](package.json) to typecheck, build, package, and verify the extension. Those tools are for development, not VSIX users.

The [local-model demo](docs/local-model.md) is also a contributor workflow. With an LM Studio server running, list models with **npm run local:models** and provide an explicit model ID:

```bash
npm run demo:llm:dry-run -- "<model-id>"
npm run demo:llm -- "<model-id>"
```
