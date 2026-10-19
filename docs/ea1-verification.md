# EA1 — Capability Map verification

Local candidate on `docs/doc3-ea1`, base `d723af09dacc71746a82c0fddcad97beb2cece8e`.
DOC3 checkpoint: `ec3939cbcc9ca0ceaa9791c4378ae2f1c4fa6920`. EA1 is the separate commit
containing this report (resolve its exact SHA with Git). No push, merge, tags or publication;
existing public DEMO1 files and archives are unchanged.

## Result

Create Diagram → Enterprise Architecture → Capability Map → local enterprise.json → whole map
or L1 branch → L1–L3 detail → neutral or explicit rating scale → PlantUML and truthful provenance
report → ART1 original pair. No provider settings, keys, model listing or LLM calls.
[Contract](enterprise-catalog.md) · [Tutorial PL](pl/capability-map.md) / [EN](en/capability-map.md).

## Exact candidates

Both retain package version 0.3.0-alpha.7; these are new local files, identified by their hashes,
not replacements for the published same-version DEMO1 downloads.

| Profile | Repository-relative file | Bytes | SHA-256 |
| --- | --- | --- | --- |
| Core | `build/ea1/candidate-final-20261019/core/archi-agent-core-0.3.0-alpha.7.vsix` | 5518159 | `b43a230992f6c580c9c14875d2f3992e495979f597ebf344fc1e16e38643484b` |
| Full | `build/ea1/candidate-final-20261019/full/archi-agent-full-0.3.0-alpha.7.vsix` | 128944337 | `6072f3e539c8efb8af1dc6ee4e3b908a1e6ab9004f243a13933f0f94bc6489d9` |

The three executable bundles are byte-identical between Core and Full; the runtime bundle
SHA-256 is `dc40d057744620bb1f7b0cfa1b35b107e4c2bd6496b014e352c214af0528e45c`.
Code/manifest/Help fingerprints are in the local `tested-source-files.json`. They were captured
after packaging; source/compiled bundle parity is rechecked before checkpoint. Documentation-only
handoff edits do not rebuild or replace these tested packages.

## Current-session checks

Local evidence root: `build/ea1/candidate-final-20261019/`.

| Layer | Result | Evidence / practical boundary |
| --- | --- | --- |
| Clean npm ci root/OCR, audits root/OCR | PASS, no vulnerabilities | Initial `build/ea1/candidate-20261019/` logs; no lockfile changes, installs/audits reused after the small source fix |
| Root suite | PASS 2012/2012, 132 files | `root-tests.log`, Node 22.12.0 |
| Extension suite | PASS 745/745, 39 files | `extension-tests.log`, Node 22.12.0 |
| Root and extension typechecks; build | PASS | `typecheck.log`, `extension-typecheck.log`, `build.log` |
| OCR prep; sequential Core package/verify then Full package/verify | PASS | `gates-manifest.json`; 31/553 archive entries, pinned OCR hashes |
| Demo dry run | PASS | `demo-dry-run.log` |
| Docs Core/Full | PASS | `docs-core/`, `docs-full/`; Help parity, PL/EN, paths/anchors/licenses, converter/OCR parity against exact DOC3 packages |
| Demo document checker | PASS | `python3 scripts/check-demo-docs.py`, 26 documents / 28 VER1 contracts |
| Exact packaged runtime, outside repo | PASS Core 4/4 and Full 4/4 | Empty PATH/NODE_PATH, Node 22.12.0; `runtime-manifest.json`, `ea1-packaged-core.json`, `ea1-packaged-full.json` |
| Runtime regressions on exact Core | PASS SRC1 3/3; VER1/C4 5/5; ART1 14/14 | Source-confirmed Sequence/Component, two-call budgets, C4, Verify Flow, provenance, alias save, original bytes, exclusive writer/rollback/cancel |
| Actual Extension Host, Core | PASS 18/18 | `host-manifest.json`, single-folder/multi-root/global; VS Code 1.142.0, embedded Node 24.21.0; controlled native API responses, not visible UI |
| Visible EA1 UI, Core | PASS 5/5 | `ea1-ui/report.json` and real screenshots; native file picker/project/save/Cancel, no provider configured |
| Visible C4/Verify Flow regressions | PASS 7/7 | `ver1-c4-ui/report.json`, exact same Core; synthetic loopback model transport |
| Visible SRC1/Sequence/Component/ART1 regressions, Core | PASS 7/7 | `src1-ui/report.json`, same Core; synthetic loopback transport |
| Render/visual inspection | PASS four maps | `build/ea1/render-accepted/`; actual local PlantUML 1.2026.6/Smetana, small, three-level, long Polish and colored/missing ratings |
| Independent plan review | PASS | 0 HIGH; 2 MEDIUM closed: existing 1 MiB/token limit and required reference.version |
| Independent implementation review | PASS code/docs and final evidence | 0 open HIGH/MEDIUM; hashes, bundles, logs, Host/UI layers independently checked |
| git diff --check | PASS | Repeated after documentation and exact staging review |

## Review and initial failed attempts

Independent review used separate read-only contexts. Plan findings resolved the mismatch between
2 MiB in the draft and the existing 1 MiB/100,000-token parser, plus the existing SourceReference
requirement for a real version. Implementation findings resolved two MEDIUM issues: a missing-field
error now locates the actual parent object rather than a fabricated line 1; local bundled Help now
uses self-contained steps and explicit checkout paths instead of links to unpushed new documents.
A LOW reserved `endlegend` label issue was fixed by prefixing every dynamic legend line; an
independent regression passed. No old unrelated AUD-ID is closed by EA1.

Initial targeted run hit sandbox EPERM on two existing localhost HTTP tests; the authorized retry
outside the sandbox passed. Initial full root: 2010 passed, one old four-item picker assertion failed;
the assertion was updated for the authorized new group/type. The missing-field source fix justified
one new complete root run; that final run and the extension suite passed. Already passed installs/
audits were not repeated. The renderer's first metadata probe used Java -version without headless,
then exposed an unrelated incompatible Graphviz binary; final provenance reads the real JAR manifest
and all four images are actual successful Smetana renders. The initial full root failure log is retained in `build/ea1/candidate-20261019/`; the other diagnostic attempts are recorded here and in the tool session.

## Retail reference and owner smoke

Input: [enterprise.json](../examples/retail-checkout/architecture/enterprise.json).
Reference: [PlantUML](../examples/retail-checkout/assets/capability-map.puml),
[PNG](../examples/retail-checkout/assets/capability-map.png),
[render provenance](../examples/retail-checkout/assets/capability-map-provenance.json).
Current checkout only; the published DEMO1 ZIP has not been edited or redirected to EA1.

1. Install the exact **local Core VSIX above**, keep only one Core/Full profile enabled and reload.
2. Open this checkout's `examples/retail-checkout` folder. Leave provider/model/key settings empty.
3. Run Create Diagram → Enterprise Architecture → Capability Map and choose `architecture/enterprise.json`.
4. Choose Whole map, L1–L3 and Dojrzałość. Inspect the partial coverage, gray missing ratings,
   explicit zero, real hierarchy and report `modelCalls: 0` / semantic review `not-applicable`.
5. Save Diagram and Report, select the capability result and confirm. Check the original two files.
   Repeat a branch/L1–L2 view and Cancel a selection/save; expect explicit omissions and no partial writes.

OWNER_SMOKE: **DEFERRED**. Automated real UI is not owner smoke. Live LLM/cloud, Windows/Linux
UI/runtime execution and fresh clean-clone were **NOT_RUN** for EA1; synthetic regressions do not
prove live-model quality. EA1 makes zero model calls and does not require a live LLM gate.
Graphical preview remains a separate renderer. There is no catalog editor, CLI/MCP enterprise surface,
EA1b implementation, automatic rating aggregation, atomic two-file publication or crash recovery.
Existing AUD-003/004 and owner-only limitations remain open as recorded in [project state](project-state.md).

Checkpoint scope: own EA1 code/tests/docs/demo/harnesses only; final Git/staging status is reported
with the local commit. No subsequent milestone is started. Host/UI ran on Core; Full has package/verify, exact runtime smoke and executable-bundle parity.
