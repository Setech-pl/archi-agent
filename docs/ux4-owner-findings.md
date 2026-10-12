# UX4-FU1 reported findings and knowledge navigation

Base: `4dd62465a909020b415ae27698a0878508da438d`. Original manual-test observations apply only to
VSIX SHA-256 `358c31ffdd985b0612136b975cd80ea39b3d55304fc2ef2c3538003d2f573647` (119869441 bytes).
Original handoff: `build/owner-smoke/ux4-20261009T123358Z-8b7d/`. Its historical forms and evidence
remain unchanged. Manual-test reports map to B-01/UX4-10 (PDF location mismatch, MD timeout),
UX4-06/08 (provider/key switching), UX4-01/11 (competing palette entries); no unreported PASS.
MANUAL_SMOKE: NOT_COMPLETED.

## Reproductions and repairs

Synthetic source supplied by the original smoke manifest: `workspace/project-main/documents/architecture-scan.pdf`,
59751 bytes, SHA-256 `486020a312ab3dfbf09b7bd58aacd09938657d8dc9680edec95475c73df81dc7`.
The original isolated profile's persisted opened-file history contains this exact PDF URI (no other PDF in that history). The source picker selection itself was not persisted separately; the selected source is not independently confirmed.
MD: `architecture.md`, 306 bytes, SHA-256 `008f7d17108967907598c0ac5f758b20271369d06628ba2b9a5a7e16fa4254c2`.
Local baseline Ollama/gemma3:27b: MD 88.06s, PDF 54.89s; both rejected at evidence validation.
The MD timeout itself did not recur in that run. With the revised prompt, MD succeeded in 77.171s (generation 77.157s); PDF conversion/OCR took 0.706s and generation 82.926s. All PDF evidence locations passed, but a row with trailing whitespace was still rejected as `candidate-semantic-conflict`. Thus PDF extraction with this live model is not claimed as an end-to-end PASS. Raw synthetic request/response and frozen OCR text
are preserved under `build/ux4-fu1/run-20261009-owner-findings/`; never include private documents or credentials.

OCR output retains one-based Page headings and local coverage. Normalization removes one BOM,
normalizes newline/NFC and preserves Markdown escaping. Offsets count zero-based UTF-16 units in
that exact frozen text, including headings, backslashes and newlines. The observed model proposed
subquotes with numerically incorrect offsets, not a converter page remapping. The request now
supplies deterministic complete `evidenceSlices` with literal quotes/start/end positions and directs
the model to copy them. The verifier still checks digests, source identity and literal slice equality;
wrong locations are rejected. No fuzzy matching, guessed page, retry or hidden extraction.

The K2 extraction stage retains its 120s ceiling and the provider may time out sooner. Read 30s,
conversion 120s, OCR 300s, operation 360s and validation 10s are unchanged. Provider selection now
has its own stage under the absolute operation deadline; its UI wait no longer consumes the LLM
stage's 120s. Cancellable progress identifies each actual stage; failure displays stage/code and
explicit next action. A slow or noncompliant live model remains a controlled failure, not a mock PASS.

Profile description/key controls follow the draft. Effective configuration is labelled applied until
Apply succeeds. Cloud keys can be set before Apply and the message captures the displayed profile ID;
native input and SecretStorage retain all values. Public state contains presence per registered profile
only. Profile changes clear the draft model; old responses are invalidated. Apply clears old model
binding before sequential setting writes, reports partial failure, rereads actual settings; Discard
restores them. No atomic setting transaction or network check is claimed.

## Public commands and active editor input

Nine visible commands use category **Archi**: Open, Configuration, Knowledge Browser,
Build Knowledge Pack from Documents, Build Knowledge Pack from Active File, Create Diagram,
Save Diagram and Report, Convert to Markdown, Help. Legacy IDs remain hidden delegates; Configure
Knowledge Pack and Check Provider Configuration are accessed from Configuration. Open is a short hub.
Sequence/Component remain one type picker. Editor title exposes the active-file command.

MD/TXT captures exact editor text synchronously, including dirty and untitled buffers, before any
picker/yield. K2 accepts an explicit editor-buffer input with true URI and hashes the captured UTF-8
content separately from normalized extraction text. Review/save retains that origin and URI locally;
URI is omitted from extraction requests and subsequent diagram knowledge-context projections. No temporary file poses as the source and no editor save occurs.
Stable TabInputText/TabInputCustom URI supports local PDF/DOCX/XLSX preview files through existing
conversion/OCR. Other tabs fail explicitly, without using a different/stale editor. Installed preview
extensions vary; only a real local file URI is accepted. All paths use the same K2/K3 review and five-file save.

## Native Knowledge tree

Explorer view **Archi Agent — Knowledge** uses the production five-file loader and K1 snapshot.
Each workspace root has its own active pack; expanding it never changes settings or invokes a model.
Systems show aliases and flat incoming/outgoing relation references; Relations, Rules, Actors and
five Files retain native record/line locations. Sources/Evidence appear when K3 metadata is available.
The loaded contract does not retain original file paths or frozen source text for ordinary file sources;
those entries open local metadata/evidence details, without pretending to locate the original page. Editor-buffer entries can navigate their real local URI and evidence line only when the current normalized digest matches; changed or closed sources open frozen metadata details instead.
Configuration activation, workspace changes, pack-file saves and Refresh invalidate the tree.
Invalid/missing/unreadable packs replace old knowledge with an explicit state. No CRUD or merge.
Browse Knowledge on Knowledge Management reveals this same view.

## Verification

Required full profile: UX4/ART1 superset, `npm run ux4:gauntlet -- --fu1`, with additional native FU1
cases, focused buffer/OCR/provider/tree checks, all root/extension tests/typechecks, clean installs,
audits, demo, package/verify, byte parity, outside-repo runtime and real Extension Host. Build artifacts
are sequential and uniquely retained under `build/ux4-fu1/`. Independent GPT-6.1 Sol/high read-only
review and no required FAIL/NOT_RUN or HIGH/MEDIUM are required before the authorized local checkpoint.
Manual smoke remains a separate NOT_COMPLETED handoff on the final exact SHA. No release actions.

Final full-profile evidence: `build/ux4-fu1/final-20261009T1920Z/`, 289/289 PASS after complete ART1 and UX4/K3 native UI reruns on identical VSIX. Root1688, extension532, focused449; Host99; native ART1 9, UX4/K3 28, FU1 12. Earlier failures are preserved in the original report. VSIX119875273 bytes, SHA-256 `eae14988c3f8fc6ae9d8f985aaf00c9803a454db1d4c1b825822d8e85e917f4a`. Independent read-only GPT-6.1 Sol/high final review PASS with no HIGH/MEDIUM/LOW. Documentation and final source delta/parity checks PASS; authorized local checkpoint identity is recorded in final-manifest.json. Manual-test handoff has 57 fresh NOT_RUN cases.
