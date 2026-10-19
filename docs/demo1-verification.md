# DEMO1 — standalone projects and public demonstration release

This task adds ready synthetic projects and tutorials without changes to product source, validators, dependencies or LLM policy. The published Mission screenshot shows the first deterministic verification; Retail shows a separately rendered original C4 Container. Both are unmodified captures. The external Smetana renderer clipped a long edge of Mission C4 Container; that render is not published as its project image, and the original PlantUML/report remain intact. The source baseline is `5b4031ea109c08b6cddfded6387303fa398d9235`; final publication identities are recorded in the release manifest and the final evidence section below.

## Feature → project → exercise → expected result → evidence

| Feature | Project | Exercise | Expected result | Evidence |
| --- | --- | --- | --- | --- |
| Ready SRC1, hierarchy, IDs and field provenance | Both | START-HERE §2; architecture/ | 1 actor, 6 systems, 6 relations; model/overlay evidence | Production loader, ZIP checker; real Configuration/Browser |
| First result without LLM | Both | §3, 01-good.puml PL/EN | conformant-within-scope; modelCalls 0; REST_API explicitly parsed | 28 VER1 cases + real UI |
| Direction | Both | §4, 02-direction | discrepancies; direction-mismatch and relationship-not-in-model | Exact finding set + real UI |
| Sync/async | Both | §4, 03-mode and 09-async-good | conflict for sync relation; conformance for EVENT async | Exact findings, interfaceType assertion + UI mode case |
| Unknown element | Both | §4, 04-unknown | needs-resolution/inconclusive; unknown-element | Exact finding set; no automatic mapping |
| Partial evaluation | Both | §4, 05-partial | known step evaluated, autonumber omitted, exit 2 | Runtime, real UI; CLI local/MCP |
| Sequence / Component / C4 Context / C4 Container | Both | §5, 08-generate.md PL/EN | validated plan/review on identical frozen snapshot | 16 runtime generations; 8 real UI generations/ART1 |
| Polish inflection and deliberate decision | Both | §6, 07-prose.txt | one interpretation; zero-call name continuation | Runtime + real picker |
| Persistent original-ID SRC1 alias | Both | §6, then 06-alias-after-save | native save; next operation conforms without LLM | Disposable-copy runtime plan + native editor/UI save |
| Original ART1 pair | Both | §7 | exact original diagram/report, provenance, no model calls during save | Byte comparison + 8 native confirmations |
| Knowledge MCP client → server | Mission | §8, mission-mcp | get_knowledge_snapshot from a real child process | CLI local/stdio parity + VSIX Configuration/Verify UI |
| Function MCP server ← external client | Mission | §8, call-functions.mjs | initialize/list/tools-call, verify_flow, nested knowledge process | Real stdio processes; meta.adapter=mcp |
| Standalone CLI | Mission | §8, good/direction/partial | exit 0 / 1 / 2, portable JSON | Empty PATH/NODE_PATH, local and MCP sources |
| Local adapter and own-adapter instructions | Mission | §8, adapter/ | bundled production adapter; explicit developer extension path | Production --check-source + read-only review |
| Documents, review, new pack | Mission | §9, notes PL/EN | pending proposals, review, five valid files in NEW folder; demo unchanged | Runtime K3 PL/EN + native document/destination pickers |
| Core without OCR | Mission | §10, scans PL/EN | ocr-unavailable, no partial extraction | Extracted Core runtime |
| Offline OCR Full | Mission | §10, scans PL/EN | real local OCR, markers, reviewed text; no provider | Extracted Full OCR + real conversion UI |
| Portable distribution | Both | setup.sh / setup.ps1, ZIP manifest | standalone data and absolute local paths | Fresh Unicode/spaced paths outside repo; no root dependencies |

All VER1 reports also include informational source-not-covered for Structurizr views outside the projection. It does not invalidate a conformant supported step. The negative examples isolate one additional problem. A missing relationship does not prove nonexistence.

## Reproduction

Build final archives from committed, versioned `examples/` sources:

```sh
python3 scripts/build-demo-archives.py --out build/demo1/archives
node scripts/demo1-verify.mjs CORE.vsix FULL.vsix CLI.tgz build/demo1/archives build/demo1/verification
node scripts/demo1-ui.mjs CORE.vsix RETAIL.zip /absolute/extracted/cli/package build/demo1/ui-retail
node scripts/demo1-ui.mjs CORE.vsix MISSION.zip /absolute/extracted/cli/package build/demo1/ui-mission
node scripts/demo1-ui.mjs FULL.vsix MISSION.zip /absolute/extracted/cli/package build/demo1/ui-full --ocr-only
```

Developer tools require Python 3/Git/zip extraction tools and Node 22.12+. UI capture additionally needs local macOS VS Code, Accessibility, Screen Recording, Swift and the documented separate PlantUML 1.2026.6 / Smetana renderer. These are verification tools, not end-user VSIX prerequisites. Windows setup uses standard PowerShell but its execution is NOT_RUN here.

The builder refuses to replace archives and records source SHA and each file SHA-256. Final mode excludes untracked/generated inputs and rejects dirty example sources. `--draft` exists only for precommit validation; no draft ZIP is a release asset. CI builds and tests the same five distributable packages and uploads package identities plus the demo acceptance report. It does not run the macOS visible UI harness.

## Validation history and limitations

Draft archive acceptance after correcting data and contract checks: **69/69 PASS**, Node 22.12.0/macOS ARM64, `build/demo1/check-7/report.json`. Real UI of the candidate: Retail **13/13**, Mission **15/15**, Full OCR **3/3**, all PASS; native source-line navigation also checked. These are draft/candidate results, superseded by the final ZIP checks in the release manifest. Earlier failures are preserved in build/demo1: sandbox denied loopback, the initial expected finding list omitted projection/direction findings, the inline-note partial example was unsupported as a whole, and the synthetic C4 verdict contained an extra field. Corrections changed examples/harness only, never product validation.

Independent read-only review found and resolved a MEDIUM issue: `(REST_API)` was only label text; VER1 recognizes `(REST API)`. The async examples also needed EVENT and actual event labels. The checker now asserts the parsed interface type. Independent current-source verification: **28/28 PASS**, no open HIGH/MEDIUM/LOW. This review is distinct from final archive and UI verification. Initial UI attempts exposed focus/notification-coordinate timing and one omitted harness condition; unsuccessful attempts are not passing evidence.

Owner smoke **DEFERRED**; live LLM / paid cloud / Windows ARM64 runtime / Windows PowerShell setup **NOT_RUN**. AUD-003–006 remain **OPEN**. Synthetic model transport proves technical integration, not model quality. No C5 rerun solely for documentation/examples, no product fixes, no M1/production/stable-1.0 claim. Source is synthetic, MIT; bundled product dependencies retain their notices. Alias save is separate from ART1. K3 creates new packs and does not update demo source. New-folder publication is guarded but not atomic across files or crash-recoverable.

## Final evidence

[Public prerelease](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1) · [Release manifest](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/release-manifest.json) · [SHA-256](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS) · [Package selection](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/DOWNLOADS.md).

The release manifest binds final source commit → tested CI merge checkout → the exact five distributables and their hashes. It records final outside-repository acceptance and real UI results. Release notes confirm the downloaded-asset/checksum check. These final identities must not be inferred from [draft evidence](evidence/demo1-prepublication.json) or earlier C5 hashes. Native UI and an independent review are separate evidence layers.
