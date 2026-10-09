# Archi Agent

**English** · [Polski](README.pl.md)

Archi Agent generates grounded **Sequence** and **Component** PlantUML diagrams in VS Code from a flow description and a local Architecture Knowledge Pack. Grounding resolves names, aliases and evidence locally. A model proposes a bounded plan; local validation and rendering precede a separate semantic review.

## Choose the right build

The published prerelease is [v0.3.0-alpha.4](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.4), released on 2026-10-03 from `31a6609cd0e8b083dbc09f3007a761e93a174b18`. Its [VSIX](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.4/archi-agent-0.3.0-alpha.4.vsix) and [checksum](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.4/archi-agent-0.3.0-alpha.4.sha256) contain UX2 OCR. The published VSIX SHA-256 is `4d30bb3b3b2108c8ecbba2748e7da537f5668460b717e2b3f2740060559e12b1` (119805952 bytes).

These guides describe the **local UX4 candidate**, based on DOC1 `8375861582e64cd90e75843eb4c0fa66e50f7867`. It includes OBS1/UX3/K1–K3/ART1 and the Configuration/Review workbench. These additions are not in the public UX2 download above. The version stays `0.3.0-alpha.4`; identify the exact package by its supplied SHA-256. UX4 is unpublished and owner smoke is **NOT_COMPLETED**. [UX4 behavior and verification](docs/configuration-workbench.md) describe the current screen; [DOC1 media](docs/assets/README.md) show historical navigation.

## Quick start — local candidate

1. Obtain the identified local VSIX and check its checksum. In VS Code use **Extensions → … → Install from VSIX…**. No repository, npm, separate Node.js or Archi Agent backend is needed.
2. Open a local project folder. Run **Archi Agent: Open** from the Command Palette.
3. Open **Archi: Configuration → LLM Provider**. Choose a profile, Apply, Refresh Models, select a model and Apply again. Prepare LM Studio or Ollama locally, or use Anthropic, OpenAI or OpenRouter with **Set / Replace Key**. Keys are held in VS Code SecretStorage. Use a model supporting structured JSON output.
4. Open **Knowledge Management**. **Choose Existing Knowledge Pack** selects the folder containing the five pack Markdown files; **Create Knowledge Pack** creates a small pack from one real system. The chosen pack is validated before activation.
5. Choose **Create Diagram → Sequence** or **Component**. Supply a flow document or a description using the pack's canonical names; resolve ambiguities and confirm explicit `[NEW: Name]` elements when prompted.
6. Read the PlantUML editor and linked grounding-report editor. **Save Diagram and Report** saves the frozen original pair into a new project result folder. A rendered PlantUML preview requires separate editor support.

For a synthetic starting point use Alpha (service), Beta (database), and a synchronous DB relationship Alpha → Beta named Writer. Describe `Alpha stores data in Beta.` The [user guide](docs/en/user-guide.md) explains pack creation, the five-file format, review decisions, errors and safe saving without relying on videos.

## Guides and demonstrations

- [User guide](docs/en/user-guide.md) · [Architecture and five Mermaid diagrams](docs/en/architecture.md) · [Development](docs/en/development.md)
- [Three real UI demonstrations, previews and provenance](docs/assets/README.md)
- Stable technical references: [Knowledge Pack format](docs/knowledge-pack-format.md), [front matter](docs/front-matter.md), [reviewed generation](docs/reviewed-diagram-pipeline.md), [document extraction](docs/document-candidates.md), [pack review/save](docs/knowledge-pack-review.md), [ART1](docs/diagram-artifact-save.md)
- [Product roadmap](docs/product-roadmap.md) · [Project state](docs/project-state.md) · [Contributor workflow](docs/development-workflow.md)

Only bounded relevant context reaches the selected model. Document conversion and OCR are local. Extraction sends bounded selected document text; review/edit/save adds no model requests. Diagram generation uses at most one generator and one reviewer request, without retry, repair or fallback. Cloud requests can incur provider charges.

The 1.0 support target is Mac ARM. Current native UI evidence is macOS arm64; bundled binaries for other platforms do not establish equivalent end-to-end support. MCP, Enterprise Architect acquisition, VS Code Chat, C4/ArchiMate diagram generation and existing-pack merge/update are planned or excluded, not current features.

## Repository development

For the existing local-model CLI, use a model identifier reported by `npm run local:models`:

```sh
npm run demo:llm:dry-run -- "<model-id>"
npm run demo:llm -- "<model-id>"
```

The second command performs live generation. See [local-model CLI](docs/local-model.md) for prerequisites and [development](docs/en/development.md) for checks.

## License

Archi Agent's own code and documentation use the [MIT License](LICENSE), with the canonical English text from the [Open Source Initiative](https://opensource.org/license/mit). Bundled third-party code, OCR models, native libraries and WASM retain their own licenses: [third-party notices](vscode-extension/THIRD_PARTY_NOTICES.md) and [OCR notices](experiments/ux2-ocr/TRIAL_NOTICES.md).
