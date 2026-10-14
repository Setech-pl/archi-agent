# Test-release publication and PL/EN documentation — 2026-10-14

[README EN](../README.md) · [README PL](../README.pl.md) · [Owner checklist PL/EN](testing/owner-smoke.md) · [Gallery and per-image provenance](assets/screenshots/README.md)

## Artifacts

| Version | Release | Commit | Bytes | SHA256 |
| --- | --- | --- | --- | --- |
| 0.3.0-alpha.5 | [v0.3.0-alpha.5](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.5) | `6b96ff629c33cf6deea65a329cf2b36b54a6539d` | 124478869 | `69ff84de019fcda4c9b539e22a743fcab9fcb3fb606e218a1724b6592442810c` |
| 0.3.0-alpha.6 | [v0.3.0-alpha.6](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.6) | Exact release commit is recorded by the annotated tag and release notes. | 127228325 | `460336177f814c17418def98a228628a24fc7bc43586b8e2805f9a880c84107a` |

Alpha.5 was published first, before the documentation work. Downloaded VSIX and checksum were compared byte-for-byte with the locally verified files: PASS. Its manifest/tag identify the release commit; its local full clean-clone evidence belongs to `d9370b6fa719785cc8e3ef1d177b89206a9d3c01`, as detailed in [the original report](ci-clean-clone-icu.md). The following documentation checkpoint changed only three documents. Publication did not rerun that full local gate.

Alpha.6 updates help/documentation and packaging metadata; no diagram, grounding, provider, conversion or OCR runtime behavior changes. Historical alpha.4 descriptions and release assets remain intact. Both lockfiles and all eight canvas 0.1.97 platforms are unchanged.

## Current local validation

Node 22.12.0 for typechecks, targeted tests and packaging; macOS 26.6.2 ARM64. Actual VS Code 1.141.0 for captures and Help.

| Check | Result |
| --- | --- |
| Targeted helper/packaging tests | 22/22 PASS |
| Help locale tests (`pl`, `pl-PL`, `en`, `de`) | 4/4 PASS, 57 unrelated tests skipped |
| Root and extension typechecks | Both PASS |
| Final package / verify | PASS, 546 archive entries |
| Documentation checker against exact alpha.5 VSIX | PASS: links/anchors, PL/EN examples, online/offline instruction equivalence, license/notices, packaged image bytes, provenance hashes |
| Three executable bundles | Exact byte parity with alpha.5 PASS |
| OCR resources | Exact byte parity except source patch hash metadata; resulting patched PDF.js still `e68d6587c64fde70d1a9e324b8c4823e2be11a756b0771841807758797e163b7` |
| GNU patch portability | Old patch reproduces two failed hunks; full three-line context applies with `--fuzz=0`, identical resulting PDF.js bytes; complete OCR preparation PASS |
| Actual Extension Host, final VSIX | English Help command and Polish bundled preview PASS |
| Actual Help UI | Local EN→PL→EN links and all 13 images per language PASS; zero provider/list requests |
| Owner smoke, Mac/Windows | NOT_RUN |
| Windows ARM64 runtime | NOT_RUN |

The Extension-test Host reports `en` even with `--locale=pl`. Automatic Polish dispatch is covered by the four unit cases; both localized previews and actual language links are exercised separately. The instruction body, local language switch, license/notices and images are bundled; supplementary GitHub links need a network. No new documentation framework or runtime network dependency was added.

Final package parity differences: version manifests, `[Content_Types].xml` (PNG content type), two localized Help files, 14 added PNGs, and `pdfjsPatch.patchSha256` in the OCR resource manifest. No archive entries were removed. The PDF.js source patch gained balanced context for GNU patch; its resulting PDF.js bytes and all original tarballs/native bindings remain unchanged. Detailed parity/check JSON and candidate are retained under `build/publication/alpha6-final/`; earlier candidates remain under `alpha5/` and `alpha6-preview1/`.

## GitHub CI and integration

[PR #6](https://github.com/Setech-pl/archi-agent/pull/6): [Linux x64 FAIL](https://github.com/Setech-pl/archi-agent/actions/runs/38531151198/job/115743084321) in OCR preparation, [macOS ARM64 PASS](https://github.com/Setech-pl/archi-agent/actions/runs/38531151198/job/115743083910). The Setech-pl account merged it during the interrupted session to `640a336022ba66998fc71e1b5d970d7f1d6169e0`; the agent did not perform that merge. [That main run](https://github.com/Setech-pl/archi-agent/actions/runs/38532682679) also failed. No history was reverted.

[PR #7](https://github.com/Setech-pl/archi-agent/pull/7) continues from that main and fixes patch portability. Intermediate `2ae190fccb8ac3d008277050773b88f645a8fa5d`: [Linux x64 PASS](https://github.com/Setech-pl/archi-agent/actions/runs/38551088484/job/115808935967), [macOS ARM64 PASS](https://github.com/Setech-pl/archi-agent/actions/runs/38551088484/job/115808935747). Head `2bc6cd8680055dad2fa72bbcad1dab37f9e8fc91` then failed on both platforms: root 1823/1824, one documentation-example test still reading the old README CLI location. Examples moved into both development guides; the existing test includes both guides and README languages without reducing its ≥4 requirement or parser assertions. Extension/package/verify steps were skipped in that failed CI run. These are intermediate results; final-candidate and integrated-main results are recorded separately in [project state](project-state.md) and the release notes. Workflow `contents: read` is preserved; releases use local gh.

## Screenshots and observed limits

14 PNGs show actual installed UI. The gallery covers Open, provider/model, Knowledge Management/Browser, candidate review/edit/preview, both diagram/report types, native pair-save confirmation, conversion/OCR and Help EN/PL. Every final image was visually inspected. No UI was generated or redrawn. Profiles and projects are isolated and synthetic; loopback model/list replies do not establish live-model quality. Actual original-pair save checks two files and the diagram digest; actual OCR uses the installed resources. Pack preview is cancelled in the final capture.

Some acquisition attempts failed after usable screenshots. Their actual status remains in per-image provenance. Non-Help images come from released alpha.5 and are applicable through final runtime byte parity. Help images come from the explicitly hashed, unpublished alpha6-preview1 with captured documentation working-tree content; provenance names the build-base commit and both bundled Help hashes rather than claiming a clean tagged source. Final exact-VSIX Host/UI checks are recorded separately. Raw attempts/logs remain under `/private/tmp/archi-current-*` and `/private/tmp/archi-alpha6-*`.

Observed macOS limit: native folder picker can return `/tmp` instead of `/private/tmp`; controlled pack saving rejects this symbolic path. Choose a regular local parent outside that alias. This was not bypassed or repaired as part of documentation. The generic native picker helper gained only the existing **Convert to Markdown** confirmation label. One OCR capture's text assertion timed out because Monaco displays nonbreaking spaces; inspecting the real result and adjusting the assertion to both expected page texts resolved it.

AUD-003–006 and SRC1 ENTRY GATE remain OPEN. No M1/production-readiness or Marketplace publication claim. Knowledge saves create new folders only; results are in memory until saved; saves have no atomic multi-file publication/crash-recovery guarantee. Local validation is a PlantUML subset; graphical preview needs separate support. See [current state](project-state.md), [roadmap](product-roadmap.md) and [owner tests](testing/owner-smoke.md).
