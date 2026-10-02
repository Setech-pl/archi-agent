# UX2 phase 1 — local OCR feasibility trial

Phase 2 now packages the reviewed OCR assets and process backend into the public
`Archi Agent: Convert to Markdown` command. The trial history below remains evidence
for phase 1. The phase 2 artifact, verification and owner smoke are recorded
in `docs/project-state.md` and `docs/vscode-extension.md`. The owner confirmed the
exact phase 2 candidate's Mac ARM smoke as PASS on 2026-10-02. Building the product VSIX
requires the experiment's pinned `npm ci` dependencies and the seven platform tarballs
described below; installed VSIX users need neither npm nor those build inputs.

This is a separate, non-product prototype. It does not add a VS Code command, UX2 public
contract or production OCR path. `build-trial.mjs` copies the published alpha.3 VSIX and
appends `extension/ux2-trial/`; SHA-256 confirms that every original file is retained byte for byte.

## First trial artifact (preserved)

| Item | Value |
| --- | --- |
| Published alpha.3 | `vscode-extension/build/cl1-final-alpha.3/archi-agent-0.3.0-alpha.3.vsix`, 970287 B, SHA-256 `7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056` before and after |
| Trial | `build/ux2-ocr/archi-agent-0.3.0-alpha.3-ux2-trial.vsix`, 95181539 B (90.77 MiB), SHA-256 `acdb4a4af6aefd88ae623d1d4e72bf68258e90732826f16a953383a02391c0dc` |
| Difference | +94211252 B; 98.10 times the released VSIX size |
| Resource inventory | 512 files, 229428478 B uncompressed; SHA-256 for each file and each retained alpha.3 entry in `extension/ux2-trial/resource-manifest.json` |

Two consecutive trial builds produced the same size and SHA-256. The builder fixes the
timestamps of added files and excludes ZIP extra metadata.

To rebuild the current review-findings candidate, place the published alpha.3
VSIX at the path above and verify its hash.
From the repository root, run `npm ci`; then run `npm ci` in `experiments/ux2-ocr`.
The two traineddata files and their license are retained under `assets/lang`.
Create `build/ux2-ocr/platform-tarballs` and use `npm pack` for
`@napi-rs/canvas-{darwin-x64,linux-x64-gnu,linux-arm64-gnu,linux-x64-musl,linux-arm64-musl,win32-x64-msvc,win32-arm64-msvc}@0.1.97`
with `--pack-destination build/ux2-ocr/platform-tarballs`. Then run
`node experiments/ux2-ocr/make-fixtures.mjs build/fixtures` and
`node experiments/ux2-ocr/build-trial.mjs`. Finally run
`npm run extension:verify -- --ux2-trial build/ux2-ocr/review-findings/archi-agent-0.3.0-alpha.3-ux2-review-findings.vsix --manifest experiments/ux2-ocr/trial-manifest.json`.
The full measurement JSON of this session is retained locally at
`build/ux2-ocr/measurements-final-reviewed.json` (ignored by Git).

The trial includes `pdfjs-dist` **4.10.38** (`legacy/build/pdf.mjs` and matching worker),
`tesseract.js` **6.0.1**, `tesseract.js-core` **6.1.2**, `@napi-rs/canvas` **0.1.97**,
`unpdf` **1.7.0**, and `tessdata_fast` **4.1.0** `pol` and `eng`. The npm lockfile pins
transitive versions and registry integrity. The models came from
`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/{pol,eng}.traineddata`:

| Model | Bytes | SHA-256 |
| --- | ---: | --- |
| `pol` | 4765518 | `c4476cdbc0e33d898d32345122b7be1cbf85ace15f920f06c7714756e1ef79b2` |
| `eng` | 4113088 | `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2` |

The declared native platforms in this single VSIX are macOS arm64/x64, Linux arm64/x64
glibc, and Windows arm64/x64. The six native binaries total 177671198 B uncompressed.
The trial manifest records each binary hash; `extension:verify -- --ux2-trial` checks them.
Linux musl, ARMv7, RISC-V and Android are not declared. Windows and Linux were checked by
inventory and hash only; no runtime smoke was performed there. Licenses and provenance are
in `TRIAL_NOTICES.md`, copied into the VSIX with the source license files, including
Foxit/Liberation fonts, Skia and tessdata_fast.

## Runtime and design

An isolated official VS Code **1.91.0** Extension Host reported `node 20.9.0`,
`electron 29.4.0`, `arm64`, macOS. The installed VS Code 1.139.1 host reported
`node 24.20.0`, `electron 43.6.0`, `arm64`. A separate Node 20.9.0 run and an actual
VS Code 1.91.0 Extension Host smoke both converted the PDF from resources extracted
from the exact trial VSIX. The Mac canvas binding loaded; no root `node_modules` was
available. The standalone smoke also used an empty HOME and a network tripwire inherited
by the Tesseract worker.

`pdfjs-dist` 5.6.205 requires Node `>=20.19.0 || >=22.13.0 || >=24` and therefore
cannot be the renderer at VS Code 1.91's minimum. Official `pdfjs-dist` 4.10.38
declares Node `>=20`; its legacy build ran on the actual minimum host. Node 20.9 lacks
`process.getBuiltinModule`, so the trial passes a local `CanvasFactory`, CMap reader
and standard-font reader at render-document creation. The render document is created
lazily and separately from the unchanged-style `unpdf` text path using
`maxImageSize: 1`; canvas and the official PDF.js module are loaded only when a page
needs render. A text-only PDF succeeded even with the native canvas binding absent.
The trial clears the two PDF.js builds' conflicting fake-worker global before
constructing the render document. It renders one page at a time.
Tesseract uses one worker per conversion and rejects a second concurrent conversion
with `ocr-busy`; it has explicit local `workerPath`, `corePath`,
`langPath`, `cacheMethod: none`, and verified local model hashes. No conversion resource
uses an HTTP URL.

## Measurements from the exact trial VSIX

Synthetic letter-size scans contain the same short PL or EN reference text at each
resolution. CER normalizes NFC and whitespace; the Polish-diacritic count is based on
edit alignment. Values below are PL/EN; peak RSS is the higher result of the pair.
Wall time includes process startup, text extraction, render, OCR and observed worker exit.

| DPI | Scan | Wall PL/EN (ms) | Mean CPU cores PL/EN | Peak RSS (MiB) | CER PL/EN | PL diacritic errors |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 200 | clean | 630/629 | 1.54/1.54 | 388 | 0/0 | 0 |
| 200 | JPEG compressed | 621/638 | 1.55/1.53 | 393 | 0/0 | 0 |
| 200 | noise | 832/838 | 1.42/1.42 | 389 | 0/0 | 0 |
| 200 | slight skew | 625/652 | 1.54/1.55 | 383 | 0/0 | 0 |
| 300 | clean | 949/946 | 1.38/1.38 | 556 | 0/0 | 0 |
| 300 | JPEG compressed | 947/946 | 1.38/1.38 | 557 | 0/0 | 0 |
| 300 | noise | 1270/1263 | 1.29/1.29 | 578 | 0/0 | 0 |
| 300 | slight skew | 948/954 | 1.38/1.38 | 563 | 0/0 | 0 |

All 16 scans were recognized exactly in this small, high-contrast synthetic sample.
This does not establish accuracy on real documents. Several 200 DPI cases exceeded
the 1.5-core evaluation threshold slightly; no RSS case exceeded
768 MiB. The same image at 300 DPI used roughly 170–190 MiB more peak RSS and gave
no CER gain here. A 20-page OCR PDF completed in 5286 ms at 200 DPI with 577 MiB
peak RSS. Page 21 was rejected before OCR. The mixed text/scan/blank PDF preserved
page numbers and `text`/`ocr`/`blank` provenance. Explicit full-page OCR recognized
its text-only page. A PDF soft mask rendered and OCRed successfully.

## Four review gates

For the resource recheck, the stability criterion was recorded before running the
300-conversion series: after diagnostic GC and a 25 ms settle, every sample must have
zero live worker async resources; the RSS and external/arrayBuffers rise from
conversion 200 to 300 must each be at most 32 MiB; and the final RSS values of the
two fresh OCR processes must differ by at most 64 MiB. A rising final 100-conversion
window or retained workers fails the criterion even if RSS stays below 768 MiB.

| Gate | Result |
| --- | --- |
| A — runtime | PASS on macOS: actual VS Code 1.91.0 Extension Host `node 20.9.0` / `arm64`, and OCR from the extracted exact VSIX. Other platforms have no runtime claim. |
| B — image errors | **BLOCKED**: corrupt-only and good-plus-corrupt pages were rejected by checking resolved image objects after render. But a synthetic 25 MP embedded image exceeded `maxImageSize: 16 MP`, disappeared from PDF.js's operator list, and was incorrectly reported as `blank`. `stopAtErrors: true` did not make this detectable. Thus the required no-false-blank guarantee and 16 MP ceiling are unproved. |
| C — closing | **INCOMPLETE**: Tesseract worker `exit` was observed after success and after an error following earlier successful OCR; three repeated outer-worker terminations during render/init/recognition ended the worker and process. Late Cancel after success produced one success. But in the final package, 100 sequential conversions in disposable outer workers left post-GC parent RSS at 364, 424, 430 and 452 MiB after runs 25, 50, 75 and 100. An earlier same-process 300-run trial reached 604 MiB. The continuing rise prevents a no-persistent-growth claim. |
| D — time budgets | PASS for measured harness behavior: the packaged alpha.3 no-OCR runtime timed out a spinning worker in 120002 ms. A separate OCR deadline harness timed out in 300008 ms from initial start despite page events at 150023 and 260023 ms; that 300-second test used a staged synthetic child, not a real 300-second OCR document. Production CL1 limits were not changed. |

An 800×1000 pt page at 300 DPI exceeded 10 MP and was rejected with `canvas-limit`.
The 16 MP image test failed as described. A missing Polish model failed before worker
startup with `ocr-model-unavailable`; the first trial's missing native binding raised
the package's import error. The recheck candidate maps that error to a controlled code.

## Decision for review

Do not start UX2 phase 2. The recheck below establishes the first divergence in
PDF.js's public error propagation. A compatible official PDF.js release or an
upstream correction to that propagation should be evaluated before an architectural
alternative. Do not silently treat an empty operator list as a true blank page.
Separately, profile the native RSS growth; process isolation would require an
architecture decision.
Retain the trial ceilings of 20 OCR pages, 10 MP canvas and 16 MP embedded image as
targets, not proven enforceable limits. Prefer 200 DPI by default if the blocker is
resolved; offer 300 DPI only when a real-quality study shows benefit.

## Phase 1 recheck (2026-10-01)

The original trial VSIX above and published alpha.3 remain byte-identical. The
separate candidate is `build/ux2-ocr/recheck/archi-agent-0.3.0-alpha.3-ux2-recheck.vsix`:
119802465 B, SHA-256
`b4c4b0c83aa7f81efda24182f4edf1d27e1232ce335ae99847f1f24f246e995d`.
It adds the Linux musl x64 and arm64 bindings, and maps a missing Mac binding to
`canvas-binding-unavailable`. `build-trial.mjs` now writes only to this separate
recheck path. Its manifest has 518 added resources totaling 287101368 B unpacked;
the verifier accepts the preserved six-platform trial and the eight-platform recheck.

### B — exact first-trial reproduction and first divergence

`diagnose-b.mjs` loads the **unchanged first trial** extracted outside the repo.
Its official legacy display module reports version 4.10.38, 801811 B, SHA-256
`081d3b6f426d38a8029766f8839f505e9cbf2c81a71d62c26eada142e6c21ae4`;
the matching worker is 2346450 B, SHA-256
`5e9f76bd5e65fbd1602b29fc50e50490aeeacd34a715b2282b73f7e8029242e0`.
Both match the first VSIX resource manifest. `unpdf`'s `getDocumentProxy` creates
only the text document with `maxImageSize: 1`. The converter creates a **separate**
official `getDocument` directly for render, with `stopAtErrors: true`,
`maxImageSize: 16000000`, a local CanvasFactory, CMap and standard-font factories,
and local worker path. There is no helper-created second render proxy.

In a direct reproduction, `stopAtErrors: false` returned three operators for
the synthetic 25 MP image. With `stopAtErrors: true`, the worker's
`GetOperatorList` stream rejected `reader.read()` with `UnknownErrorException:
Image exceeded maximum allowed size and was removed.` This is the expected
evaluator behavior. PDF.js 4.10.38's display-layer `_pumpOperatorList` then sets
`operatorList.lastChunk = true` and calls `operatorListChanged()`, which resolves
the public `getOperatorList()` promise with **zero operators** before its attempt
to reject the same promise. `page.render().promise` also resolved. This is the
first observed error-propagation divergence; neither the prototype's document
options nor a version mismatch caused the false blank.

`recheck-regressions.mjs` on the exact recheck candidate: **5/8 pass, 3/8 fail**.
An image at exactly 16 MP OCRed; 16 MP + 4000 pixels and 25 MP returned false
`blank` instead of rejection. A text page followed by a 25 MP image returned
`text` plus false `blank`, so a caller could publish partial Markdown. A true
blank page remained `blank`; corrupt-only and good-plus-corrupt pages rejected
with `image-decode-failed`; the mask page OCRed. No OCR started for the oversized
images. The boundary fixtures vary PDF image dictionary dimensions while reusing
one synthetic JPEG; they test the declared-dimension limit, not OCR quality of
a true 16 MP capture. The required rejection regression remains a failing gate.
This
public API behavior cannot be made safe by treating every empty list as an error,
because a truly blank page also has an empty list. The diagnostic script
temporarily observes the private message stream to locate the lost error;
the converter and VSIX contain no private PDF.js hook, independent parser,
PDF.js patch or new renderer.

### C — resource diagnosis

Criterion recorded above **before** these series. `resource-series.mjs` keeps
only small memory samples and one conversion's result at a time; it does not
retain documents, images or OCR output across iterations. Fresh Node 20.9.0
processes converted the same PL 200 DPI PDF 300 times each. A third fresh process
converted the same two-page text PDF 300 times. Diagnostic GC and a 25 ms settle
preceded samples; neither is part of conversion runtime.

| Fresh process | Run | RSS MiB | heapUsed MiB | heapTotal MiB | external MiB | arrayBuffers MiB | Live worker async resources |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| OCR 1 | 0 / 1 / 200 / 300 | 46.0 / 274.8 / 584.7 / 624.1 | 3.2 / 19.4 / 21.0 / 21.0 | 6.0 / 37.5 / 56.3 / 56.5 | 1.6 / 32.1 / 27.6 / 43.1 | 0 / 21.8 / 21.7 / 32.7 | 0 throughout |
| OCR 2 | 0 / 1 / 200 / 300 | 44.5 / 288.8 / 610.0 / 654.3 | 3.2 / 19.4 / 20.9 / 21.0 | 6.0 / 37.5 / 56.3 / 56.5 | 1.6 / 32.1 / 27.6 / 43.1 | 0 / 25.7 / 11.0 / 32.7 | 0 throughout |
| Text | 0 / 1 / 200 / 300 | 44.1 / 64.8 / 83.9 / 88.6 | 3.2 / 9.5 / 10.7 / 10.7 | 6.0 / 18.5 / 28.3 / 44.3 | 1.6 / 1.9 / 2.0 / 2.0 | 0 / 0.2 / 0.2 / 0.2 | 0 throughout |

From conversion 200 to 300, OCR RSS rose **39.4** and **44.3 MiB**. Both exceed
the predeclared 32 MiB stability ceiling, despite zero live workers and nearly
flat V8 heap. The final RSS values differ by 30.2 MiB, inside that separate
64 MiB criterion. `external` and `arrayBuffers` fluctuate without the same
consistent slope. The text path rose 4.7 MiB in its final hundred conversions.
The converter awaits document destruction and Tesseract worker `exit`, calls
`page.cleanup()`, and resets the canvas to zero dimensions. No retained JS
document or worker was identified; native allocation or allocator retention is
an inference, not a proven root cause.

A separate 50-run cancellation series covered ten each at `text-init`, `render`,
`ocr-init`, `recognize`, and a 15 ms diagnostic deadline timeout. All 50 outer workers exited with
code 1; the parent saw zero live worker async resources after each exit. Parent
RSS rose from 35.6 to 335.9 MiB, while heapUsed was 3.4 to 4.6 MiB and
`external`/`arrayBuffers` stayed about 1.4/0 MiB. Hard termination cannot run
the outer worker's JavaScript `finally`; the nested Tesseract thread's exit was
not independently observed on those cancelled runs. C therefore remains
**INCOMPLETE**. The 768 MiB threshold alone is not a PASS criterion.

### Platform binding inventory in the recheck VSIX

Paths below are relative to `extension/ux2-trial/`; every SHA-256 is checked by
`resource-manifest.json`. The original six-binding trial omitted Linux musl.
The recheck adds both musl variants rather than narrowing the planned Linux
coverage. Only macOS arm64 has runtime smoke; other entries have manifest/hash
verification only.

| Target | Binding file | SHA-256 | Smoke |
| --- | --- | --- | --- |
| macOS arm64 | `node_modules/@napi-rs/canvas-darwin-arm64/skia.darwin-arm64.node` | `954f804117723e1af99760daf7fb0a255e02711cf12337df3a9e27a97e6e3e15` | PASS |
| macOS x64 | `node_modules/@napi-rs/canvas-darwin-x64/skia.darwin-x64.node` | `fe745800997b0cec4a9f4571fcef7cd1d7e5d960c6d73be9f3de9cf258e570aa` | not run |
| Windows x64 | `node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node` | `2f73f296e1aacec88e4600d97182d8cf13cfbfe8a0e5c27c6e60b7b33918158d` | not run |
| Windows arm64 | `node_modules/@napi-rs/canvas-win32-arm64-msvc/skia.win32-arm64-msvc.node` | `486fb8657071f7503b926545a2bbe40a108f51938577010902f0a202da6155f7` | not run |
| Linux x64 glibc | `node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node` | `8af96229a864c193df54f9c3eefb489ce8fab0867dfab9ed8c694b53034cfb60` | not run |
| Linux arm64 glibc | `node_modules/@napi-rs/canvas-linux-arm64-gnu/skia.linux-arm64-gnu.node` | `f73816f4127eb358ed9acd35e5b1dd5a9d454a0687a00accbc74f18a832551d8` | not run |
| Linux x64 musl | `node_modules/@napi-rs/canvas-linux-x64-musl/skia.linux-x64-musl.node` | `a732b2126725a16822f3e0639fec0719dfe14dbc99889ad86b2dbd14eceba109` | not run |
| Linux arm64 musl | `node_modules/@napi-rs/canvas-linux-arm64-musl/skia.linux-arm64-musl.node` | `1634ebff76bcc5bb6cb0039f1f5123e79e1aad50cc9fd9cbf018b371a291ae87` | not run |

The exact recheck VSIX converted text, scan and mixed PDFs from its extracted
resources outside the repo under an empty HOME and a network-blocking tripwire,
with Node 20.9.0 and no root `node_modules`. Temporarily hiding the Mac binding
returned controlled `canvas-binding-unavailable`; hiding `pol.traineddata`
returned controlled `ocr-model-unavailable`. In both cases conversion returned
no pages. The extracted files were restored afterward.
The previously used VS Code app directory had auto-updated to a Node 24.21.0 host;
its failed attempt was discarded. A fresh extraction of the hash-checked official
VS Code 1.91.0 archive with updates disabled reported Node 20.9.0/Electron 29.4.0
and successfully ran full-page OCR of the exact recheck VSIX's mixed PDF.

The no-OCR 120-second and staged 300-second OCR budget checks, as well as the
unchanged synthetic quality matrix, were not rerun: this recheck did not alter
their timing or recognition mechanism. B and C remain blockers; phase 2 and OBS1
were not started.

Current-session root gates ran sequentially: `npm ci`, `npm test` (1316), root and
extension typechecks, `extension:test` (198), `extension:build`,
`extension:package`, and `extension:verify` with explicit paths for both the
recheck VSIX and a normal packaged VSIX all passed. The recheck VSIX rebuilt
twice to the same size and hash. The expected-failure B regression (5/8) is
reported separately and is not counted as a passing gate.

## Phase 1 patch and process isolation (2026-10-01)

This section supersedes the recheck's B/C status. Phase 2 and product UI integration
have not started. The final candidate is
`build/ux2-ocr/patch-process-gated/archi-agent-0.3.0-alpha.3-ux2-patch-process.vsix`,
**119970748 B**, SHA-256
`c03ecb658b56099dff5d8b09c446afbc115c2b4b9848b5e9ba35478943a252b5`.
It is separate from the released alpha.3, first trial and recheck. Their SHA-256
values remained respectively `7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056`,
`acdb4a4af6aefd88ae623d1d4e72bf68258e90732826f16a953383a02391c0dc`, and
`b4c4b0c83aa7f81efda24182f4edf1d27e1232ce335ae99847f1f24f246e995d`.

**Review status: BLOCKED despite automated B/C PASS.** The final independent
read-only review found two medium issues below. The deadline issue leaves a
specified OCR case unproven; no limit was raised and no further candidate was
built after this finding.

### Patch, APIs, and process

`patches/pdfjs-dist-4.10.38-operator-list-error.patch` changes only the display
module's failed `GetOperatorList` stream branch. It rejects the separate
`getOperatorList()` and render readiness states, cancels active render tasks with
the original reason, and only then marks the stream finished. The builder checks
PDF.js version 4.10.38 and the original display/worker hashes, applies the patch
to a copied resource with zero fuzz, and stops on mismatch. No runtime patching
occurs. Hashes: original module
`081d3b6f426d38a8029766f8839f505e9cbf2c81a71d62c26eada142e6c21ae4`,
patch `aea49b4883d25c3e99b4d02a7fc8bf7691b7f0077a44e32e7cccac6a744de53d`,
patched module `0de48fe863426529dbc511445c733973fb03cbc482cfa9303606db30b53dce58`,
unchanged worker `5e9f76bd5e65fbd1602b29fc50e50490aeeacd34a715b2282b73f7e8029242e0`.

The experiment keeps unpdf 1.7.0 helpers. Before the first helper call it selects
the pinned local legacy PDF.js through public `definePDFJSModule()`, without its
serverless bundle or `navigator` changes. Text extraction keeps `maxImageSize: 1`;
the canvas constructors and factory are configured before opening a separate lazy
render document. Each page awaits `getOperatorList()` before rendering. An error
rejects the complete result; neither pages nor Markdown are sent through IPC.

`ocr-parent.mjs` owns one fresh child per PDF conversion, launched with the actual
Extension Host `process.execPath` and `ELECTRON_RUN_AS_NODE=1` under Electron.
Only the child imports PDF.js, canvas and Tesseract. The parent accepts an absolute
local path, explicit mode/DPI, bounded stage and RSS samples, then one final
success or closed error code. Markdown is checked against 8 MiB before IPC; the
envelope is capped at 9 MiB and log bytes at 64 KiB. Success waits for result,
exit code 0, `exit`, `close`, and IPC `disconnect`. Cancel/timeout sends a stop
request, sends `SIGKILL` after 500 ms, and allows another 2000 ms for confirmed
closure; missing closure is `cleanup-unconfirmed`. The child exits on IPC loss.
The parent rejects worker-thread use before spawning a child, so a hard-killed
temporary worker cannot leave a child it does not control. A 250 ms heartbeat
adds a 5 s liveness guard. The 120 s no-OCR and 300 s OCR deadlines are both
measured from task start; `ocr-needed` changes the absolute deadline without
resetting it. A truly blank page does not trigger the OCR deadline.

The limits remain 50 MiB input, 8 MiB Markdown, 300 PDF pages, 20 OCR pages,
200 DPI initial, 10 MP canvas, 16 MP embedded image, one conversion process and
one Tesseract worker. The 768 MiB RSS and mean 1.5-core targets are measurement
criteria, not hard native-memory guards. The existing `page.objs` lookup for
post-render corrupt-image detection remains an internal PDF.js dependency of
the experiment; no hook was added to the converter. The independent review
flagged this as a maintenance risk and a possible conflict with the instruction
against private converter hooks. It requires removal or an explicit scope
decision before declaring the implementation gate closed.

In `auto`, a textless page is classified as OCR only after `getOperatorList()`
finds image operations. Until then the parent enforces the 120 s no-OCR
deadline. If building that operator list takes more than 120 s, a scan may time
out before it can receive the 300 s OCR deadline, even though the 300 s clock
would still run from task start. Extending the deadline before classification
would also extend it for a genuinely blank page. This conflict between the
two deadlines needs an explicit decision or another bounded way to classify
the page; the present short regressions do not prove that case.

### B and compatibility

With resources extracted from the exact candidate outside the repository,
`recheck-regressions.mjs` passed **8/8**. Its rejection predicates now require
the expected stage and error code and absence of a result; a wrong `text-init`
cause demonstrably fails. Direct public API tests passed **6/6**: both
`getOperatorList()` and `render().promise` reject an oversized image, including
after a valid image on the same page; a valid page still resolves. A true blank
page, image mask, corrupted image, 16 MP exactly, 16 MP plus 4000 pixels, a
real synthetic 4000×4001 image, and text preceding a failing page were checked.

The process regressions passed **24/24** on Node 20.9, covering 20 OCR pages and
rejection of 21, one active process, missing binding/model, success, controlled
errors, four Cancel stages, timeout, hard child kill/reap, late Cancel, and
source SHA-256 before/after. The same extracted resources passed a network
tripwire from outside the repository without root `node_modules`.
`compare-text.mjs` compared the released alpha.3 runtime with this candidate on
the same four-page synthetic PL/EN PDF containing an empty page, line breaks and
Markdown punctuation. Markdown matched byte for byte at SHA-256
`1f0c26cb96bc825bb174b3100a2332f9e02f44baf5c33cacbc6cdab70d72469b`;
the input SHA-256 was unchanged. A separate text PDF smoke through the **issued,
unmodified alpha.3** on the current Extension Host passed; its Markdown was
`## Page 1 / TEXT LAYER FIRST / ## Page 2 / TEXT LAYER SECOND` with the expected
newlines. No CL1 compatibility regression was observed in this case.

Fresh official VS Code 1.91.0 Extension Hosts reported Node 20.9.0,
Electron 29.4.0 and arm64. The current VS Code 1.140.0 Extension Host reported
Node 24.21.0, Electron 43.7.3 and arm64. Both actual Hosts passed final
`getOperatorList()`/`render().promise`, text-only, mixed OCR, oversized-image
error, and alpha.3 text smokes using the exact extracted trial resources. These
are Extension Host values, not terminal Node versions.

### C — actual Extension Host series

The six raw reports are in [`results/`](results/). Each of the four 300-run
series used a fresh isolated Extension Host and the same synthetic PL 200 DPI
PDF. Each conversion had a fresh child and held no page result past that run.
The harness sampled parent `rss`, `heapUsed`, `heapTotal`, `external` and
`arrayBuffers` after a 25 ms settle at runs 0, 1 and every 25 through 300,
matching the recheck points. No forced GC was used in these Host runs. Child
RSS was sent every 50 ms; the reported peak is the maximum of *simultaneously*
sampled parent-plus-child RSS, not a sum of separate peaks. CPU is process
`cpuUsage` for parent and child, divided by series wall time. Startup is from
task start to the first child stage; processing and resource-close times are
reported separately. The actual Hosts, their native children, and earlier
isolated diagnostic Node processes are distinguished in each raw report.

| Host / fresh series | RSS 200→300 MiB | external 200→300 MiB | arrayBuffers 200→300 MiB | Final RSS MiB | Combined peak MiB | Wall s | Mean cores | Startup / processing / close mean ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1.91 / 1 | +0.656 | -0.0004 | 0 | 103.70 | 439.98 | 181.24 | 1.23 | 55.0 / 595.3 / 7.3 |
| 1.91 / 2 | +0.656 | -0.0011 | 0 | 91.53 | 415.14 | 210.17 | 1.23 | 67.1 / 689.6 / 9.6 |
| 1.140 / 1 | +0.719 | -0.0022 | 0 | 145.64 | 517.63 | 165.41 | 1.22 | 43.7 / 541.7 / 8.4 |
| 1.140 / 2 | +0.625 | +0.0024 | 0 | 144.00 | 513.33 | 164.44 | 1.22 | 43.3 / 538.7 / 8.2 |

The final RSS difference was **12.17 MiB** at 1.91 and **1.64 MiB** at 1.140.
All growth indicators were within 32 MiB, both end differences within 64 MiB,
and no OCR child remained after any sample. Each Host also completed 50
Cancel/timeout cases (40 Cancel, 10 timeout), with zero children after every
case: [`1.91 raw`](results/min-host-cancel-50.json) and
[`1.140 raw`](results/current-host-cancel-50.json). Their parent RSS changed
from 92.06 to 112.84 MiB and 144.14 to 161.41 MiB respectively; those are
diagnostic values, not the 200→300 stability criterion. The 20/21-page test
passed separately. The unchanged 200/300 DPI quality matrix was not repeated.

### Package, review and owner smoke

The external [`trial-manifest.json`](trial-manifest.json) records versions, all
521 added resource hashes, the original/patched PDF.js module, patch and
unchanged worker. `extension:verify -- --ux2-trial <VSIX> --manifest <external>`
compares the package with this outside manifest. All eight canvas bindings are
present by inventory/hash; Windows, Linux and macOS x64 have **no runtime PASS**.
`TRIAL_NOTICES.md` labels the modified Apache-2.0 PDF.js module and preserves
its required license texts. The ordinary eight-entry VSIX was packaged into
`build/ux2-ocr/patch-process-gated/package-gate/` and verified separately;
the released alpha.3 was not overwritten. Root `npm ci`, 1316 tests, both
typechecks, 198 extension tests, build, package and both verifications passed
sequentially. Independent read-only review found the deadline and concurrency
issues initially reported, which were fixed before the final candidate. Its
final pass then identified the two medium issues described above. The issued
alpha.3 also passed ordinary `extension:verify`. Owner smoke has **not** been
reported PASS.

Owner smoke for the exact VSIX SHA-256 above:

1. Verify the SHA-256 and install it into a fresh VS Code profile; the trial
   intentionally adds no OCR command or UI.
2. Extract that exact VSIX outside the repo, generate only synthetic fixtures,
   and run `ocr-parent.mjs` in the Extension Host on `text-only.pdf`, `mixed.pdf`
   and `image-over-16mp.pdf`. Expect ordered text/OCR/blank provenance and
   a controlled `embedded-image-limit` with no partial Markdown.
3. Trigger Cancel during OCR; confirm termination of the child and no opened
   result. Report the exact VSIX hash and observed outcomes before phase 2.

## Phase 1 review findings closure (2026-10-01)

This section supersedes the BLOCKED review status above for the two medium
findings. It remains an experiment without a product command or UX2 phase 2.
The separate candidate is
`build/ux2-ocr/review-findings/archi-agent-0.3.0-alpha.3-ux2-review-findings.vsix`:
**119970751 B**, SHA-256
`79b941bdae8da2cc9962db195808dad78866d7bc13e57b3ca5d1cf69e69fa541`.
The published alpha.3 and the first, recheck, and patch-process trials retained
their original SHA-256 values, respectively
`7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056`,
`acdb4a4af6aefd88ae623d1d4e72bf68258e90732826f16a953383a02391c0dc`,
`b4c4b0c83aa7f81efda24182f4edf1d27e1232ce335ae99847f1f24f246e995d`,
and `c03ecb658b56099dff5d8b09c446afbc115c2b4b9848b5e9ba35478943a252b5`.

### Deadline and image error contract

The task start T0 is recorded before validation and spawning. Explicit full-page
OCR starts with the absolute T0 + 300 s deadline. In auto mode, the first page
whose extracted text is empty sends `ocr-candidate` before
`getOperatorList()`; it sets the absolute T0 + 300 s deadline once. This also
applies when that page later proves truly blank. A document with nonempty text
on every page keeps T0 + 120 s. Later candidate stages never add 300 s or reset
the timer. A resolved timeout or Cancel cannot be reversed. Candidate status
does not increment the OCR page counter: only a page actually sent to Tesseract
counts against 20. A true blank page still returns `blank` without initializing
Tesseract.

The pinned PDF.js 4.10.38 worker catches failed image decoding and sends a
resolved `null` object. Its display renderer previously treated that `null`
like an image still pending and silently returned from `paintImageXObject` or
`paintImageXObjectRepeat`. The updated versioned display patch adds one
resolved-object check for page-local and `g_` shared objects; a confirmed
`null` throws `image-decode-failed` from `render().promise`. A resource
that has not yet been delivered remains pending. The earlier operator-stream
error propagation fix is retained. The converter uses only public
`getOperatorList()` and `render()` for image validation; it does not read
`page.objs`, `commonObjs` or another internal store. A render or operator
error rejects the complete conversion before any pages or Markdown cross IPC.
The PDF.js worker is byte-identical to upstream, and patching occurs only at
build time.

The builder requires PDF.js version 4.10.38, original display SHA-256
`081d3b6f426d38a8029766f8839f505e9cbf2c81a71d62c26eada142e6c21ae4`
and worker SHA-256
`5e9f76bd5e65fbd1602b29fc50e50490aeeacd34a715b2282b73f7e8029242e0`,
then applies the exact patch with zero fuzz. The new patch SHA-256 is
`6a9c947bd44f8d9fa049271fef3a0e3f81f3c175fa8a860221b4651cf4e6907f`;
the patched display module SHA-256 is
`e68d6587c64fde70d1a9e324b8c4823e2be11a756b0771841807758797e163b7`.
The external `trial-manifest.json` records these values and all 521 resource
hashes. `TRIAL_NOTICES.md` records the expanded Apache-2.0 display
modification; all eight canvas binding variants remain present.

### Verification of this exact candidate

Short gates passed before packaging on Node 20.9.0 and the Electron 43.7.3
Node 24.21.0 executable: 14/14 scaled-deadline tests, the previous 8/8 B
regressions plus five new cases (13/13), 11 direct public API render/operator
checks, and 30/30 process checks. The deadline harness scripts a slow operator
stage, blank and scan paths, absolute expiry, multiple pages, Cancel and
result/timeout races. It is separate from measured production-time budgets.
The B predicates reject a wrong stage or error cause. Tests include corrupt-only,
good-plus-corrupt, text before corruption, repeated and shared image references,
a true blank page, mask, full transparency, 16 MP exactly and actual 4000×4001
pixel overrun, no partial output, source SHA stability and 20/21 OCR pages.

The exact VSIX has 530 ZIP entries: eight baseline entries, one trial manifest
and 521 trial resources, verified against the external manifest by exact path, size and
SHA-256. Its extracted resources were tested outside the repository without
root `node_modules`; the Node 20 smoke inherited a network tripwire and the
full Node 24 B/Deadline/Markdown run was repeated under macOS `sandbox-exec`
with `deny network*`. Full B,
deadline, public API and process checks passed separately on both Node 20.9
and Node 24.21, including **30/30 process checks on Node 24**. The four-page
text-path Markdown was byte-identical to alpha.3 at SHA-256
`1f0c26cb96bc825bb174b3100a2332f9e02f44baf5c33cacbc6cdab70d72469b`.
Fresh actual Extension Hosts on VS Code 1.91.0/Node 20.9.0/Electron 29.4.0
and VS Code 1.140.0/Node 24.21.0/Electron 43.7.3, both arm64, passed
text-only, scan and mixed PDF smoke plus controlled corrupt and oversized-image
errors. These are actual Host checks; the direct Node executable B checks are
reported separately.

### C on final artifact

The six new raw reports are in `results/review-findings-*.json`. Each
300-conversion series used a fresh actual Extension Host and a new child per
conversion. Every sampled run confirmed zero remaining OCR children. Samples
at 0, 1 and every 25 through 300 followed a 25 ms settle; no GC was forced.
The combined peak is the maximum simultaneous parent plus child RSS sample,
not a sum of their separate peaks. Mean cores divide total parent and child
CPU time by series wall time. `startupMs` measures task start to first child
stage; `processingMs` measures task start through the final child result and
therefore **includes startup**; `cleanupMs` measures from result to confirmed
child close. These three reported means are not three disjoint segments.

| Host / fresh series | RSS 200→300 MiB | external 200→300 MiB | arrayBuffers 200→300 MiB | Final RSS MiB | Combined peak MiB | Wall s | Mean cores | Mean startup / processing / close ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1.91 / 1 | +0.672 | +0.005 | 0 | 102.48 | 446.16 | 182.56 | 1.23 | 55.4 / 599.7 / 7.3 |
| 1.91 / 2 | +0.703 | +0.001 | 0 | 89.91 | 426.67 | 180.63 | 1.23 | 55.1 / 593.3 / 7.3 |
| 1.140 / 1 | +0.578 | -0.004 | 0 | 137.36 | 506.95 | 162.08 | 1.22 | 43.2 / 531.0 / 8.0 |
| 1.140 / 2 | +0.656 | -0.006 | 0 | 138.08 | 507.23 | 167.35 | 1.21 | 44.2 / 548.4 / 8.2 |

The final RSS difference between fresh series is 12.57 MiB on 1.91 and
0.72 MiB on 1.140, below the 64 MiB criterion. RSS, external and
arrayBuffers growth from 200 to 300 is below 32 MiB in all series. The separate
50-case series on each Host completed ten each at `text-init`, `render`,
`ocr-init`, `recognize` and timeout, with zero children after every case.
Parent RSS changed from 90.50 to 111.72 MiB on 1.91 and 144.02 to 155.56 MiB
on 1.140. The 768 MiB and 1.5-core figures remain evaluation thresholds,
not enforced native-memory/CPU limits. A first 1.91 measurement attempt ended
after 1/300 when its VS Code window closed; it is excluded from these series.
The unchanged 200/300 DPI quality matrix was not repeated.

The sequential gauntlet passed after the local-loopback test suite was run
outside the restricted sandbox: `npm ci`, 1316 root tests, both typechecks,
198 extension tests, build, package, verify, demo dry run, whitespace checks,
and audit with zero vulnerabilities. The first sandbox attempt had 72
`listen EPERM` failures and is not counted as PASS. Separate verification of
the exact new VSIX against the external manifest and of the unchanged
published alpha.3 passed. Independent read-only review explicitly closed
both prior medium findings and reported no high/medium findings. The reviewer
checked the final package hash, manifest, code, gates and raw C reports
without rerunning B/C; two documentation inconsistencies found during review
were corrected before the READY verdict. Owner smoke of this exact new VSIX
remains pending. Windows, Linux and macOS x64 have hash inventory but no runtime
smoke. Owner smoke: verify the VSIX SHA-256 above, install in a fresh profile,
extract that exact package outside the repo, run text-only/mixed/oversize
synthetic PDFs through `ocr-parent.mjs` in the Extension Host, and trigger
Cancel during OCR. Expect ordered provenance, `embedded-image-limit` without
partial Markdown, terminated child, and no opened result. Report the exact
VSIX hash and observations.
