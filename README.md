# Archi Agent

**English** · [Polski](README.pl.md)

Archi Agent generates grounded **Sequence** and **Component** PlantUML diagrams in VS Code from a flow description and a local Architecture Knowledge Pack. Grounding resolves names, aliases and evidence locally. A model proposes a bounded plan; local validation and rendering precede a separate semantic review.

## Choose the right build

The published prerelease is [v0.3.0-alpha.4](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.4), released on 2026-10-03 from `31a6609cd0e8b083dbc09f3007a761e93a174b18`. Its [VSIX](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.4/archi-agent-0.3.0-alpha.4.vsix) and [checksum](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.4/archi-agent-0.3.0-alpha.4.sha256) contain UX2 OCR. The published VSIX SHA-256 is `4d30bb3b3b2108c8ecbba2748e7da537f5668460b717e2b3f2740060559e12b1` (119805952 bytes).

These guides describe the **local DOC1 candidate**, based on the FU-01 product checkpoint `a76b15ca822364810edb0298852db70437f73e9d`. It also contains OBS1 diagnostics, UX3 pack configuration, K1–K3 document extraction/review/save and ART1 original-result saving. Those additions are **not in the public download above**. The local package still says `0.3.0-alpha.4`; identify it by its exact SHA-256 and [candidate evidence](docs/assets/README.md), not the version alone. No DOC1 release has been published. Owner smoke of this candidate is deferred.

## Quick start — local candidate

1. Obtain the identified local VSIX and check its checksum. In VS Code use **Extensions → … → Install from VSIX…**. No repository, npm, separate Node.js or Archi Agent backend is needed.
2. Open a local project folder. Run **Archi Agent: Open** from the Command Palette.
3. Under **Configuration**, select **Select Provider Profile**, then **Select Model**. Prepare LM Studio or Ollama locally, or use Anthropic, OpenAI or OpenRouter with **Set/Update API Key**. Keys are held in VS Code SecretStorage. Use a model supporting structured JSON output.
4. Run **Configure Knowledge Pack**. **Choose Existing** selects the folder containing the five pack Markdown files; **Create Knowledge Pack** creates a small pack from one real system. The chosen pack is validated before activation.
5. Choose **Generate Diagram → Sequence** or **Component**. Supply a flow document or a description using the pack's canonical names; resolve ambiguities and confirm explicit `[NEW: Name]` elements when prompted.
6. Read the PlantUML editor and linked grounding-report editor. **Save Diagram and Report** saves the frozen original pair into a new project result folder. A rendered PlantUML preview requires separate editor support.

For a synthetic starting point use Alpha (service), Beta (database), and a synchronous DB relationship Alpha → Beta named Writer. Describe `Alpha stores data in Beta.` The [user guide](docs/en/user-guide.md) explains pack creation, the five-file format, review decisions, errors and safe saving without relying on videos.

## Guides and demonstrations

- [User guide](docs/en/user-guide.md) · [Architecture and five Mermaid diagrams](docs/en/architecture.md) · [Development](docs/en/development.md)
- [Three real UI demonstrations, previews and provenance](docs/assets/README.md)
- Stable technical references: [Knowledge Pack format](docs/knowledge-pack-format.md), [front matter](docs/front-matter.md), [reviewed generation](docs/reviewed-diagram-pipeline.md), [document extraction](docs/document-candidates.md), [pack review/save](docs/knowledge-pack-review.md), [ART1](docs/diagram-artifact-save.md)
- [Product roadmap](docs/product-roadmap.md) · [Project state](docs/project-state.md) · [Contributor workflow](docs/development-workflow.md)

Only bounded relevant context reaches the selected model. Document conversion and OCR are local. Extraction sends bounded selected document text; review/edit/save adds no model requests. Diagram generation uses at most one generator and one reviewer request, without retry, repair or fallback. Cloud requests can incur provider charges.

The 1.0 support target is Mac ARM. Current native UI evidence is macOS arm64; bundled binaries for other platforms do not establish equivalent end-to-end support. MCP, Enterprise Architect acquisition, VS Code Chat, C4/ArchiMate diagram generation and existing-pack merge/update are planned or excluded, not current features.

## License

Archi Agent's own code and documentation use the [MIT License](LICENSE), with the canonical English text from the [Open Source Initiative](https://opensource.org/license/mit). Bundled third-party code, OCR models, native libraries and WASM retain their own licenses: [third-party notices](vscode-extension/THIRD_PARTY_NOTICES.md) and [OCR notices](experiments/ux2-ocr/TRIAL_NOTICES.md).
