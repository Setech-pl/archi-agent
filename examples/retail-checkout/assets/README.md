# Image provenance / Pochodzenie obrazów

`project.png`: actual isolated installed Archi Agent 0.3.0-alpha.7 on this synthetic project, macOS ARM64, ScreenCaptureKit capture of its owned VS Code window; no image editing. The displayed PNG is the original ART1 PlantUML rendered separately by local PlantUML 1.2026.6 / Smetana, then opened in VS Code. Model responses are controlled synthetic transport, not live-model quality evidence.

`architecture.png`: rendered from the adjacent `architecture.mmd`, a source-authored explanatory diagram of the supplied model; it is not a product screenshot. Mission Control also includes `mcp-directions.png` from `mcp-directions.mmd`.

`18-verify-flow.png`, `19-knowledge-browser.png`, `20-configuration.png`: unchanged DOC2 screenshots of public Big Bank, for the matching controls. Their counts belong to Big Bank, not this demo. Upstream model is structurizr/structurizr (Apache-2.0); capture/provenance is documented in the repository's docs/assets/screenshots/README.md and provenance-doc2.json.

`project.png` to rzeczywisty, nieedytowany ekran tego projektu. PNG diagramu wyrenderowano osobno z oryginalnego PlantUML ART1; produkt otwiera tekst PlantUML. `architecture.png` i diagram kierunków MCP są ilustracjami objaśniającymi. Obrazy DOC2 pozostają z Big Bank i pokazują aktualne kontrolki. Wszystkie nowe obrazy i rendery zostały obejrzane; hashe i kontekst capture zapisuje provenance.json.

## Capability Map — local EA1

`capability-map.puml` is the deterministic output from the current `architecture/enterprise.json`;
`capability-map.png` is a real local PlantUML render. `capability-map-provenance.json` records input,
semantic/projection and output hashes, the exact renderer JAR hash and its manifest version.
The current catalog is synthetic, partially covered and includes explicit zero plus missing ratings.
These files are new checkout assets, not modifications to the published DEMO1 ZIP or screenshots.

Reproduce after `npm run extension:build` with
`node scripts/ea1-render-reference.mjs <java> <plantuml.jar> <new-output-directory>` from the repo root.
Java and PlantUML are documentation render tools, not requirements for running the VSIX.
The script emits four maps and updates only these named EA1 reference assets. It never uses a
remote rendering service. Read the JAR manifest for version provenance; `-version` may probe an
unrelated local Graphviz binary even though these maps use the bundled Smetana layout.
