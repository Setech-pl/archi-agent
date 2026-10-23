# Development

**English** · [Polski](../pl/development.md) · [Home](../../README.md)

## Checkout and prerequisites

Clone [Setech-pl/archi-agent](https://github.com/Setech-pl/archi-agent) into a development directory, then inspect Git before changing anything. The historical root package name remains `archground`. The root manifest requires Node.js `>=22.12.0`; use a supported installed Node/npm combination and the committed lockfiles. End users install a VSIX and do not run these commands.

Read [AGENTS.md](../../AGENTS.md), [project state](../project-state.md), [workflow](../development-workflow.md), [roadmap](../product-roadmap.md), and the relevant contracts. Do not merge report-only audit branches into the product. Local checkpoints require authorization; push/merge/tag/publication are separate authorized actions.

## Build and verification

```bash
npm ci
npm ci --prefix experiments/ux2-ocr
node scripts/prepare-ci-ocr.mjs
npm test
npm run typecheck
npm run extension:typecheck
npm run extension:test
npm run extension:build
npm run extension:package -- --profile core --out build/docs-pl-en/<unique-run>/candidate
npm run extension:verify -- build/docs-pl-en/<unique-run>/candidate/archi-agent-core-0.3.0-alpha.8.vsix
```

`prepare-ci-ocr.mjs` fetches and SRI-verifies all eight pinned canvas 0.1.97 platform tarballs and prepares Full resources, including the same-version ICU supplement. Run it before tests that package Full; the two npm installs alone do not supply these archives. [OCR build details](../../experiments/ux2-ocr/README.md).

Replace `<unique-run>` with a new run directory name; do not reuse candidate outputs. `npm ci` preserves locked optional platform bindings; avoid ordinary `npm install` in this repo. Packaging rebuilds the extension/runtime/converter bundles. Core is the default and needs only root dependencies; Full additionally requires the OCR dependency set and pinned assets. Use --profile full explicitly for that package. Packaging/gauntlets sharing OCR staging directories run sequentially. `extension:verify` checks the exact VSIX allowlist, bundle boundaries and resource hashes. Record size and SHA-256 with the source commit/tree and actual changes; package version alone is insufficient.

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

## MCP1

Run the complete local acceptance with Node 22.12.0: `npm run mcp1:verify -- build/mcp1/<unique-run>`. It includes fresh Core/Full packages and CLI tarball, independent bundle parity, actual Host/UI, OCR integrity and previous-version profile upgrades. The Full predecessor must be the exact locally verified alpha.6 identified in the plan. Each run preserves its own reports; failures are never overwritten. Owner smoke and real-model quality remain separate. [CLI/MCP instructions](cli-mcp.md).

## OCR preparation and ICU provenance

### Fresh clone with an empty cache

Use Node 22.12.0 (the CI version), npm, Git, `tar`, `zip`, `unzip` and a GNU-compatible
`patch` in PATH. Network access to GitHub and the npm registry is required for preparation.
Use a new directory and record the resolved source SHA; do not copy node_modules, tarballs
or build output from another checkout. The language models, licenses and patch are tracked
Git inputs. They arrive through the clone, not a previous OCR stage.

```bash
git clone https://github.com/Setech-pl/archi-agent.git archi-agent-clean
cd archi-agent-clean
git checkout --detach <source-sha>
mkdir -p build/clean-ocr/npm-cache
export npm_config_cache="$PWD/build/clean-ocr/npm-cache"
npm ci
npm ci --prefix experiments/ux2-ocr
node scripts/prepare-ci-ocr.mjs
npm run extension:build
npm run extension:package -- --profile core --out build/clean-ocr/core
npm run extension:verify -- build/clean-ocr/core/archi-agent-core-0.3.0-alpha.8.vsix
npm run extension:package -- --profile full --out build/clean-ocr/full
npm run extension:verify -- build/clean-ocr/full/archi-agent-full-0.3.0-alpha.8.vsix
```

Replace `<source-sha>` with the intended full commit. The cache directory must be empty
before the first install; the preparation script inherits this cache and downloads all eight
pinned platform archives. Execute packaging sequentially. Verification checks the resource
inventory and hashes; it does not execute OCR on every platform. Run the packaged-runtime
smoke below from the clone. It extracts the exact Full outside the checkout, creates synthetic
PL/EN scans and executes real OCR plus cancellation/resource-integrity checks. Fixture creation
uses development dependencies; conversion uses the extracted VSIX runtime and resources.

```bash
node scripts/mcp1-full-ocr-smoke.mjs build/clean-ocr/full/archi-agent-full-0.3.0-alpha.8.vsix build/clean-ocr/ocr-smoke
```

Inspect `build/clean-ocr/ocr-smoke/full-ocr.json`; preserve it with logs and package hashes.
This is a runtime test, not installed VS Code UI acceptance. The separate
[owner smoke](../testing/ea3-ea4-owner-smoke.md) remains deferred until actually performed.

Matching source, runtime bundles and individual resource hashes does not imply byte-identical
VSIX/ZIP files: archive metadata may differ. Compare extracted entries separately, and use
the release manifest/SHA256SUMS only to identify the immutable published archives.

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

## EA1 verification

The developer-only EA1 runner uses Node 22.12 and the existing local VS Code/macOS harnesses. Run modes sequentially on one unique output directory. `gates` runs clean installs/audits, suites, typechecks/build and sequential Core/Full package/verify; `runtime` extracts those exact files outside the repo with empty PATH/NODE_PATH; `host` runs the actual Extension Host with controlled editor responses. Visible UI is separate. The renderer helper and native UI helpers require the existing local tools described in scripts/docs/README.md. These scripts do not add enterprise commands to the product CLI.

```bash
node scripts/ea1-verify.mjs gates build/ea1/<unique-run>
node scripts/ea1-verify.mjs runtime build/ea1/<unique-run>
node scripts/ea1-verify.mjs host build/ea1/<unique-run>
node scripts/ea1-real-ui-smoke.mjs build/ea1/<unique-run>/core/archi-agent-core-0.3.0-alpha.8.vsix build/ea1/<unique-run>/ui
```
