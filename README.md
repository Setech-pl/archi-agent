**English** · [Polski](README.pl.md)

# Archi Agent

Turn a flow description and your architecture knowledge into a Sequence or Component diagram with a report showing how names and relationships were grounded.

Archi Agent helps architects and analysts document service interactions, explain system dependencies and review proposed knowledge from documents inside VS Code. A shared catalog of names and aliases reduces repeated naming work; the report helps you inspect the evidence behind a diagram before sharing it.



## Download and run

[Download the test VSIX — 0.3.0-alpha.6](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.6/archi-agent-0.3.0-alpha.6.vsix) · [SHA-256](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.6/archi-agent-0.3.0-alpha.6.vsix.sha256) · [Release notes](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.6)

1. Download the VSIX and verify its checksum using the [Mac/Windows instructions](docs/testing/owner-smoke.md).
2. In desktop VS Code, choose **Extensions → … → Install from VSIX…**, select the file and reload if requested. Confirm the installed version in extension details.
3. Open a local project and run **Archi: Open**. Configure a provider/model and choose your Knowledge Pack through **Configuration**.

The package includes the runtime, local document conversion and offline PL/EN OCR. End users need no repository, npm or separate Node.js installation. Diagram generation and knowledge extraction require a model provider. This is a **test prerelease**; Mac/Windows owner smoke and Windows ARM64 runtime remain **NOT_RUN** until reported. [First-use help](docs/en/user-guide.md).

## What you can do today

- **Prepare Sequence and Component diagrams** from a flow file or a typed description. Inspect PlantUML text and its linked grounding report.
- **Use structured architecture knowledge**: systems, actors, relationships, aliases and rules in a local Markdown Knowledge Pack.
- **Keep names consistent** with canonical-name and alias matching, explicit ambiguity resolution and deliberate confirmation of new elements.
- **Trace grounding** through source references and a report that distinguishes source-confirmed relationships from relationships stated in your flow.
- **Review document proposals** with evidence, accept/reject decisions, row edits and five file previews before creating a new Knowledge Pack. This does not update an existing pack.
- **Save the original diagram/report pair** into a new project folder after confirming the destination.
- **Choose a local or cloud provider**: LM Studio, Ollama, Anthropic, OpenAI or OpenRouter. Cloud keys stay in VS Code SecretStorage; local models are prepared separately.
- **Convert documents and OCR locally**: PDF, DOCX and XLSX (plus MD/TXT input for knowledge extraction); PDF OCR uses bundled Polish/English models without a provider request.

## A short example

1. **Knowledge:** your pack identifies Alpha as a service, Beta as a database, and Alpha → Beta as the Writer interface.
2. **Flow:** enter `Alpha stores data in Beta.` and choose **Sequence** or **Component**.
3. **Diagram and report:** inspect the generated interactions/dependencies, evidence, warnings and validation result. A source quote or model review is not a guarantee of architectural truth.
4. **Save:** choose **Save Diagram and Report**. Confirm the destination; the extension creates `diagram.puml` and `report.json` together in a new result folder.

The [user guide](docs/en/user-guide.md#complete-synthetic-five-file-pack) includes the complete five-file synthetic pack for this example.

## See the workflow



Review proposed knowledge before accepting it.



Inspect the PlantUML and linked report side by side.



Confirm the original result and destination before saving. [Full gallery and capture provenance PL/EN](docs/assets/screenshots/README.md).

## Help

[English user guide](docs/en/user-guide.md) · [Polska instrukcja](docs/pl/user-guide.md) · [Mac/Windows test checklist PL/EN](docs/testing/owner-smoke.md)

Inside VS Code use **Archi: Help**. The same instructions and screenshots are included in the VSIX. Help follows VS Code's display language and its **English / Polski** links work offline. Most product controls use English labels.

## Limits and direction

Review generated facts and document evidence. Local validation covers a defined PlantUML subset; graphical preview requires separate PlantUML support. Knowledge saves create new folders, results are held in memory until saved, and pair saving has no atomic-publication/crash-recovery guarantee. Platform resources are bundled, but packaging coverage does not establish equivalent native runtime support. [Current limits and technical status](docs/project-state.md).

The next direction is verification against existing architecture models, followed by broader verification and MCP integration. **SRC1, VER1 and MCP1 are planned, not available features.** [Product roadmap](docs/product-roadmap.md). This prerelease does not establish M1 or production readiness.

## Technical information and license

[Architecture](docs/architecture.md) · [Development](docs/en/development.md) · [Knowledge Pack format](docs/knowledge-pack-format.md) · [CI evidence](https://github.com/Setech-pl/archi-agent/blob/8325c6904efe271012ab8cc07304fb700526daef/docs/ci-clean-clone-icu.md) · [Technical state](docs/project-state.md)

Archi Agent code is licensed under [MIT](LICENSE). Bundled components have their own [third-party notices](vscode-extension/THIRD_PARTY_NOTICES.md) and [OCR notices](experiments/ux2-ocr/TRIAL_NOTICES.md).
