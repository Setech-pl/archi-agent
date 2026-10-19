# Development

**English** · [Polski](../pl/development.md) · [Home](../../README.md)

## Checkout and prerequisites

Clone [Setech-pl/archi-agent](https://github.com/Setech-pl/archi-agent) into a development directory, then inspect Git before changing anything. The historical root package name remains `archground`. The root manifest requires Node.js `>=22.12.0`; use a supported installed Node/npm combination and the committed lockfiles. End users install a VSIX and do not run these commands.

Read [AGENTS.md](../../AGENTS.md), [project state](../project-state.md), [workflow](../development-workflow.md), [roadmap](../product-roadmap.md), and the relevant contracts. Do not merge report-only audit branches into the product. Local checkpoints require authorization; push/merge/tag/publication are separate authorized actions.

## Build and verification

```bash
npm ci
npm ci --prefix experiments/ux2-ocr
npm test
npm run typecheck
npm run extension:typecheck
npm run extension:test
npm run extension:build
npm run extension:package -- --out build/docs-pl-en/<unique-run>/candidate
npm run extension:verify -- build/docs-pl-en/<unique-run>/candidate/archi-agent-0.3.0-alpha.4.vsix
```

Replace `<unique-run>` with a new run directory name; do not reuse candidate outputs. `npm ci` preserves locked optional platform bindings; avoid ordinary `npm install` in this repo. Packaging rebuilds the extension/runtime/converter bundles and offline OCR assets. The root and OCR dependency sets must be present. Packaging/gauntlets sharing OCR staging directories run sequentially. `extension:verify` checks the exact VSIX allowlist, bundle boundaries and resource hashes. Record size and SHA-256 with the source commit/tree and actual changes; package version alone is insufficient.

Use focused checks for routine changes. Product code needs relevant tests, typechecks and build; runtime/bundling changes also need package/verify. Functional checkpoints require the full applicable gates. Milestone commands `ux3:gauntlet`, `k1:gauntlet`, `k2:gauntlet`, `k3:gauntlet`, `art1:gauntlet`, `ux4:gauntlet` exist in the root manifest; run only those justified by the scope. DOC1 uses documentation checks, diagram/media validation, build/package/verify and exact-VSIX UI demonstrations, without repeating functional gauntlets or inheriting historical PASS counts. [Stable workflow](../development-workflow.md) owns the process.

## Documentation tools

The PL/EN entrypoints are README, user-guide, architecture and development; shared media live in `docs/assets`. Technical contracts, roadmap and project-state keep their original paths. Diagram source is Mermaid in the two architecture guides. [Local tooling instructions](../../scripts/docs/README.md) pin a separate render environment; its npm packages never enter runtime/VSIX. Render locally and inspect every diagram. [Capture reproduction and hashes](../assets/README.md) describe actual VS Code recording with synthetic responses. Raw frames/profiles stay outside tracked product files.

The extension includes complete standalone English/Polish README files, MIT and third-party notices. Its strict package allowlist excludes root guides, GIFs, raw frames and audit reports. Keep both license copies identical. SPDX MIT applies to own packages, not all bundled components. Lockfile changes for DOC1 affect only own license metadata.

## Boundaries and acceptance

Core imports neither Node I/O nor VS Code. Runtime/Node adapters remain host-neutral; the extension reaches them through `src/runtime/index.ts`. Follow KISS/BUZI and avoid future abstractions. No product behavior changes are part of DOC1. Synthetic fixtures contain no client data or credentials.

Before an authorized checkpoint check links/anchors, PL/EN scope and exact examples, UI names, public/local/planned distinctions, diagrams, recording provenance, licenses/notices and final package; run `git diff --check`. Independent read-only review is separate from the author. Required FAIL/NOT_RUN and open HIGH/MEDIUM block the checkpoint. `MANUAL_SMOKE: DEFERRED` is not PASS. Update project-state and stop at the authorized boundary. Offline demo: `npm run demo:dry-run`; live demos are optional and may call providers.

## CLI model demo

The developer demo accepts one positional model ID. With LM Studio prepared locally, use these commands; the dry run writes no files. This is a contributor tool; VSIX users follow the user guide.

```bash
npm run local:models
npm run demo:llm:dry-run -- qwen/qwen3-14b
npm run demo:llm -- qwen/qwen3-14b
```

## OCR preparation and ICU provenance

Install both committed lockfiles with npm ci. Prepare OCR before packaging Full (or the single
OCR profile on older branches). The preparation command below verifies all eight canvas 0.1.97
platform tarballs against lockfile SRI and creates product assets; it does not require old results
JSON or the historical external trial manifest. Missing resources fail closed.

```bash
node scripts/prepare-ci-ocr.mjs
```

Windows ARM64's missing icudtl.dat is supplied only from the SRI-verified Windows x64 canvas
0.1.97 tarball. Both ICU files must have identical bytes and SHA-256; canvasResourceSupplements
records donor/version/resolved/SRI/archive entry/paths/hashes. The upstream
[release script](https://github.com/Brooooooklyn/canvas/commit/e1a75d1aa888dcdf44467875829d58ea19c6cdd7)
uses the same ICU source for both architectures. No newer canvas or modified native binding is used.
The pinned PDF.js display patch applies with zero fuzz and full GNU-compatible context; the worker,
licenses and all platform resources keep their verified hashes. Packaging and verification are sequential.

## Release procedure

Use a fresh clone and explicit source SHA. Run the applicable tests, both typechecks, OCR preparation,
package and verify for each existing distribution profile; preserve logs, failed attempts and exact
artifact sizes/SHA-256 outside tracked documentation. Never reuse an earlier candidate directory.
Only an explicitly authorized release may create a tag/prerelease or upload assets. CI package
artifacts alone do not publish a release. Download published files and compare bytes/checksums with
the verified candidates; retain the release manifest/source identity separately from a merge commit.
Do not replace existing assets or infer owner smoke, live-model quality or platform execution from CI.
