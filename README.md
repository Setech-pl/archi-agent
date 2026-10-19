**English** · [Polski](README.pl.md)

# Archi Agent

## Check the integration before you build it.

Compare a proposed flow with your architecture model. Find unrecognised systems, connections missing from the model and synchronous/asynchronous communication mismatches — with source references for each finding.

Then explain the design with **Sequence, Component, C4 Context and C4 Container diagrams**, using the same architecture knowledge.

**[Download Core — recommended start](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-core-0.3.0-alpha.7.vsix)** · [Download Full — includes offline OCR](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-full-0.3.0-alpha.7.vsix)

**[Try the tutorials](docs/en/tutorials.md)** · [Get started in VS Code](docs/en/user-guide.md) · [Use the CLI and MCP](docs/en/cli-mcp.md)

## Bring better evidence to your architecture review

An integration proposal often spans a written flow, a system model and several documents. Archi Agent brings them into one workflow: check the flow, inspect the differences and share a diagram with the sources behind it.

- **Find discrepancies before implementation.** Check system names, connection direction and communication mode against the connected model.
- **Make reviews easier to follow.** Show the interaction sequence or the system structure at the right level of detail.
- **Keep terminology consistent.** Resolve ambiguous names explicitly and save confirmed aliases in your Structurizr overlay for future checks.
- **Keep the evidence with the design.** Save a generated diagram and its linked report together in your project.

A connection missing from the model is reported as a gap in the available knowledge. You decide whether the model or the proposed flow needs to change.

## See the flow. Explain the structure.

![Sequence diagram and its source report in VS Code](docs/assets/screenshots/15-sequence.png)

### Follow an interaction from start to finish

Generate a Sequence diagram from a written flow, or check an existing sequence diagram against your architecture.

![Flow verification identifies discrepancies and links them to the model](docs/assets/screenshots/18-verify-flow.png)

### Put a system in context

Show who uses the system and how it connects to the surrounding landscape with a C4 Context diagram.

![C4 Context shows a system and its surroundings](docs/assets/screenshots/16-c4-context.png)

### Show what is inside

Use C4 Container to explain the system's internal structure and Component diagrams to discuss dependencies. C4 diagrams require source type and hierarchy metadata.

![C4 Container shows the selected system boundary and its containers](docs/assets/screenshots/17-c4-container.png)

Diagram output is editable PlantUML. Graphical previews use a separate PlantUML tool or extension. [View the gallery](docs/assets/screenshots/README.md).

## Work with the knowledge you already have

- **Structurizr JSON:** use your existing model with an overlay for aliases, rules and interface metadata.
- **Local knowledge packs:** keep systems, relationships and terminology in structured Markdown.
- **Documents:** extract proposed knowledge from PDF, DOCX, XLSX, Markdown and text, then review it before saving a new pack.
- **MCP knowledge sources:** connect your own knowledge server and adapt it to an API, database or architecture repository.

![Knowledge Browser brings systems and their connections into view](docs/assets/screenshots/19-knowledge-browser.png)

[Learn about architecture sources](docs/en/user-guide.md) · [Extend the example knowledge server](examples/knowledge-server/README.md)

## Choose where your model runs

Use **LM Studio or Ollama** for a local model, or connect **Anthropic, OpenAI or OpenRouter** with your own API key.

Verification of the supported Sequence PlantUML subset runs without an LLM. Written descriptions use a model to identify the flow; code compares that interpretation with your architecture.

![Configure your architecture source and model in VS Code](docs/assets/screenshots/20-configuration.png)

## Start with a complete example

Open a ready-made project with architecture knowledge, sample flows and step-by-step instructions.

| Project | What you will explore | Download | Tutorial |
| --- | --- | --- | --- |
| **Retail Checkout** | Orders, payments and fulfilment. Check flows, generate four diagram types and keep the evidence behind your design. | [Project ZIP](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-demo-retail-checkout-0.3.0-alpha.7-demo.1.zip) | [English tutorial](examples/retail-checkout/START-HERE.en.md) |
| **Mission Control** | Telemetry, commands and alerts. Connect an MCP knowledge source, run CLI checks and build knowledge from documents. | [Project ZIP](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-demo-mission-control-0.3.0-alpha.7-demo.1.zip) | [English tutorial](examples/mission-control/START-HERE.en.md) |

Your first check uses Sequence PlantUML and needs **no LLM**. Configure your own model when you move on to diagram generation, written flow descriptions or document extraction.

[Open the tutorial collection](docs/en/tutorials.md)

## Use the same checks beyond VS Code

**CLI:** check sequence diagrams in pull-request pipelines and return a machine-readable report and process exit code. [Download CLI/MCP](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-cli-0.3.0-alpha.7.tgz).

**MCP function server:** let another MCP client inspect knowledge, verify flows and generate diagrams with Archi Agent.

**MCP knowledge client:** bring architecture knowledge into Archi Agent from a server you control.

[CLI and MCP guide](docs/en/cli-mcp.md)

## Get started

Download the [demonstration prerelease v0.3.0-alpha.7-demo.1](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1). [Package selection](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/DOWNLOADS.md) · [SHA-256 checksums](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS).

1. Choose **[Core](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-core-0.3.0-alpha.7.vsix)** as the recommended start for diagrams, verification and architecture sources. Choose **[Full](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-full-0.3.0-alpha.7.vsix)** when you also need local Polish/English OCR for scanned PDFs.
2. Verify the SHA-256 checksum and install your profile in desktop VS Code 1.91+ using **Extensions → … → Install from VSIX…**. Keep exactly one Core/Full profile enabled and reload the window.
3. Open a tutorial project, select its prepared source and run **Archi: Verify Flow (Sequence / prose)**.
4. Configure your model when you are ready to generate diagrams or work with prose.

The VS Code extension includes its runtime: no repository clone, npm or separate Node.js installation is needed. CLI/MCP uses Node.js 22.12 or later.

[Installation and downloads](docs/en/user-guide.md) · [Tutorials](docs/en/tutorials.md) · [Configuration](docs/en/user-guide.md#provider-profile-and-model)

## Documentation

[User guide](docs/en/user-guide.md) · [Architecture](docs/en/architecture.md) · [Developer guide](docs/en/development.md) · [Technical status](docs/project-state.md)

Documentation on main follows current source code; published packages are identified by their release manifest and bundled Help.

Archi Agent is available under the [MIT license](LICENSE). Bundled components retain their [third-party notices](vscode-extension/THIRD_PARTY_NOTICES.md) and [OCR notices](experiments/ux2-ocr/TRIAL_NOTICES.md).
