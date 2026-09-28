# Report templates

Use concise entries; omit irrelevant fields rather than claiming work happened. Label **Commands**, **Reviewer**, **Owner report**, **Warnings/exceptions**, and **Deferred** separately.

## Preflight failure

`PREFLIGHT FAILED — <task>`

- Commands: branch/HEAD/upstream/tracking/remote/status/staging and exact expected-versus-actual mismatch.
- Action: stopped before edits; no repair attempted.
- Owner input needed: specific precondition resolution.

## Implementation and review progress

`IMPLEMENTATION/REVIEW — <milestone>`

- Commands: base commit, changed files, targeted checks with exact outcomes/counts.
- Reviewer: round N/3, findings by severity and disposition; next review required if high/medium were fixed.
- Scope: accepted criteria completed; remaining work and deferred out-of-scope items.
- Warnings/exceptions: exact file/format and reason, or none.

## Blocked after three rounds

`REVIEW BLOCKED — <milestone>`

- Commands: latest tested commit/diff and check results.
- Reviewer: rounds 1–3; unresolved high/medium finding, evidence, affected file and remediation.
- Status: readiness and finalization blocked; owner smoke not requested.
- Deferred/Warnings: bounded observations separately.

## Ready for owner smoke

`READY FOR OWNER SMOKE — <milestone>`

- Commands: base, changed files, exact full sequential gates/counts, artifact path/bytes/SHA-256 and contents if applicable; test gaps and narrow exceptions.
- Reviewer: round count and explicit no high/medium conclusion.
- Owner steps: numbered, milestone-specific UI actions and expected observations using the final artifact.
- Status: awaiting owner result; no commit, push, or completion claim.
- Deferred/Warnings: separate from verified facts.

## Owner-smoke failure

`OWNER SMOKE FAILED — <milestone>`

- Owner report: exact failed step, environment and observation as provided, without calling it an agent test.
- Commands: any independent reproduction actually run.
- Action: resume approved implementation and review; no finalization.
- Open question/Deferred/Warnings: separate.

## Finalized and pushed

`FINALIZED AND PUSHED — <milestone>`

- Owner report: explicit smoke PASS and finalization authorization.
- Commands: final gates/counts; artifact path/bytes/SHA-256/contents where relevant; staged diff check; commit and direct parent; branch/upstream/remote equality; clean status; complete committed file list.
- Reviewer: final round and no high/medium conclusion.
- Warnings/exceptions and Deferred: separate, exact and bounded.
