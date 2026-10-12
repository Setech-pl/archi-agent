# ART1 audit fixes — verification (2026-10-07)

Branch: `fix/art1-audit-findings`. Product base:
`6c31fd46c5b1a2762e108c0ea5fa783a13da1420`.
Initial audit branch: `audit/repo-20261007-1321-6c31fd4`, reports HEAD
`cd743631c0ca5550d68d6ef44b8107ccc3aa7653`, clean working tree and empty staging.
The reports commit has the product checkpoint as its direct parent and changes only `audits/`.
The source branch points to the product base; the fix branch was created there. Audit commits
were neither merged nor cherry-picked. The original Claude report remains unchanged on its branch:
`git show cd743631:audits/2026-10-07-6c31fd4-claude-opus-art1/report.md` reads it without switching.

## Findings and closure evidence

| ID | Cause | Fix | Current evidence |
| --- | --- | --- | --- |
| ART1-01 MEDIUM | ART1's model predicate rejected safe `@`/`+` IDs and collapsed variant digests. | Reuse core `isSafeModelId` for model IDs; preserve the separate provider-profile contract. | Reviewed Sequence/Component and compatibility Sequence regressions preserve all model fields and the full semantic report; variant digests differ, bytes/call counts match. Exact-VSIX runtime validates both reviewed paths with three IDs each. Unsafe IDs and projection/secret guards still pass. |
| ART1-02 LOW | LocalPathError was flattened to invalid-location with futile Retry advice. | Map symbolic-link, not-found, not-a-directory, containment-violation and invalid-path to controlled, actionable messages. | Real filesystem adapter tests cover linked roots/results parents, missing/file roots and blocked result parents; no artifacts, no futile Retry. Controlled containment and unknown-error tests expose no raw exception. |
| ART1-03 LOW | Non-empty shared parent was counted as retained A data after removing A. | Only suppress ENOTEMPTY/EEXIST for a proven removed destination and no retained paths; keep uncertainty conservative. Recovery now conditionally identifies possible data under the destination or parent. | Deterministic A/B interleaving preserves complete B, removes A and reports complete A cleanup. Five-file writer tests cover UX3/K3 modes; edits, partial content, ownership controls and EACCES remain protected. Adapter tests verify true cleanup and conditional warning even when the uncertain destination is absent. |

Audit reproductions ran before branch creation: **7/7 PASS assertions of defects**, not of fixes.
Preflight and before-fix Host evidence: `build/art1-audit-fixes/preflight-20261007-1344/`.
Targeted attempts and explanations: `build/art1-audit-fixes/focused-20261007-1349/`.
Failed setup/type-mock attempts are preserved alongside later successful checks.

## Q-02

Confirmed on the old exact VSIX: changing diagram language to Markdown kept Save available;
changing report language to plain text then lost the still-open result. Both tabs were confirmed
open in actual VS Code. Language-change close events had `isClosed=false`, unlike actual closure.
The adapter ignores those events and still removes the choice after both real documents close.
The final VSIX passes **15/15** checks across single-folder, multi-root and no-project profiles:
generation opens both previews; one and both language changes preserve the registered palette
Save command; closing one preserves it; closing both removes it. Folder modes actually write
bundles. No-project mode retains the choice and gives the existing project instruction.
All scenarios make two generation/review requests and no Save requests.

Host: VS Code 1.140.0, Node24.21.0, macOS arm64; harness Node26.10.0. Language changes and tab
closure use actual VS Code APIs. Command invocation and picker answers are controlled Host
integration evidence; separate native UI exercises visible palette/menu controls and macOS pickers.

## Final gates and candidate

| Gate | Current result |
| --- | --- |
| Full root / extension | PASS1627/1627 (106 files) / PASS471/471 (22 files) |
| Focused ART1 + shared writer + K1/K2/K3/UX3 regressions | PASS389/389 |
| Both typechecks, build, package, verify | PASS; 529 verified entries |
| Audits root / OCR, demo dry run, diff checks | PASS; both audits 0 vulnerabilities |
| Exact-VSIX runtime outside repo, empty PATH/NODE_PATH | ART114/14, K315/15, K217/17, K116/16, UX327/27, DOCX source/package5/5 PASS |
| Actual Extension Host | UX312/12, K315/15, ART121/21, Q-02 15/15 PASS |
| Native Mac ARM UI | ART19/9 and K39/9 PASS in complete suite reruns on the exact candidate |
| Source/package bytes and earlier artifacts | Three bundles and 521 OCR assets match; earlier VSIX preserved |
| Effective required gates | **213/213 PASS**, no required FAIL/NOT_RUN/N/A |
| Independent technical review | PASS round1; separate read-only GPT-6.1 Sol/high reviewer; no open HIGH/MEDIUM |

Exact candidate, version unchanged:
`build/art1-audit-fixes/gauntlet-2026-10-07T12-13-56-397Z-43506/archi-agent-0.3.0-alpha.4.vsix`.
Measured size **119846838 B**, SHA-256 **`02b70bba8ef43ec2123f2ba9db4728d48f58e53f2d8b48c72d180c3c16b55f16`**.
This is a local candidate, not a published alpha.4 artifact.

Evidence directory: `build/art1-audit-fixes/gauntlet-2026-10-07T12-13-56-397Z-43506/`.
`report.json` preserves the original final-run native UI failures: ART1 notification observation
and K3's second native picker. `ui-rerun-2026-10-07T12-27-08-652Z/` contains ART1 PASS9/9 and
K3's later invalid-file picker failure. `k3-ui-rerun-2026-10-07T12-30-56-143Z/` contains complete
K3 PASS9/9. Product, harness assertions and candidate stayed unchanged during these narrow reruns.
`effective-report.json` maps each final UI gate to its complete-suite evidence with original status;
`final-manifest.json` binds final sources, Git base, commands, results, measured artifact and review.
`final-report.json` / `final-report.txt` carry the final status; `checkpoint-diff.patch` carries the diff.

The first all-PASS run (`gauntlet-2026-10-07T12-07-06-703Z-39831/`) was superseded after correcting
the uncertain-cleanup message; its different VSIX evidence is not assigned to this candidate.
The previous product candidate `build/art1/gauntlet-2026-10-07T10-00-28-814Z-27274/` remains
unchanged. Its results are historical and separate from these current checks.

## Review, checkpoint and handoff

Independent review round1 PASS, with no open HIGH/MEDIUM or new findings requiring correction.
`independent-review-final.md` in the evidence directory contains the reviewer’s full report and
actual read-only checks; test results remain evidence of the implementer’s runs.
All required gates and review have passed; the authorized local checkpoint closes this loop;
its exact commit/tree and clean working tree/staging are recorded in the final manifest after commit.
The commit scope is the fixes, regressions, necessary evidence harness changes and documentation.
For Claude Code: read the new checkpoint and `checkpoint-diff.patch`, map ART1-01/02/03 to the table
above, inspect Q-02 before/after Host evidence and the final manifest's exact VSIX/source binding.
This technical report does not replace Claude Code's later independent closure audit.

Generation policy/call count, grounding, snapshots, exclusive creation, symlink rejection,
foreign-data protection, operation atomicity and frozen-original Save semantics remain unchanged.
Synthetic transport proves integration and request counts, not live-provider/model quality.
Host and UI were verified on macOS arm64 only. Existing no-crash-recovery/fsync and non-race-free
portable path-check limitations remain. Q-04 stays in manual smoke; other audit questions/suggestions
are not new scope. No history, run catalog, label additions or K4 work.

MANUAL_SMOKE: DEFERRED. PUSH: NOT_REQUESTED. MAIN_INTEGRATION: NOT_REQUESTED.
TAG: NOT_REQUESTED. PUBLICATION: NOT_REQUESTED. Remain on fix branch; STOP after local checkpoint.
