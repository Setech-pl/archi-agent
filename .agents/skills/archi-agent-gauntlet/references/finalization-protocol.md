# Finalization protocol

Require both an explicit owner report of milestone smoke **PASS** and a separate explicit instruction to finalize, commit and push. An invocation, a reviewer approval, or passing automated gates alone is insufficient. If smoke fails, return to implementation and review.

1. Confirm branch, base/expected parent, upstream, tracking and remote refs, status and staged state. Stop if the remote moved or preconditions changed; never repair history automatically.
2. Update final project documentation/status only for the approved milestone. Rerun final relevant gates sequentially and record exact results, warnings and narrow exceptions. Ensure final artifact evidence refers to the final build.
3. Stage only approved files. Inspect `git diff --cached --name-status`, the complete staged diff and `git diff --cached --check`; ensure no secrets or unrelated files are staged. Confirm the precommit HEAD is the intended direct parent.
4. Create only the authorized commit. Verify its single direct parent with `git rev-parse HEAD^` before publication. If it differs, stop; do not amend, reset, rebase or create a corrective commit without authorization.
5. Perform one ordinary, non-force push to the authorized remote branch. If rejected or the remote moved, stop without pull, merge, rebase, force or history-changing retry.
6. Read local HEAD, upstream tracking ref and remote branch ref anew; require equality. Check `git status --porcelain` and staged state are empty.

Report commit and parent hashes, branch/upstream/remote ref, full committed file list, exact gates and counts, final artifact path/bytes/SHA-256 and contents when relevant, reviewer outcome, owner-provided smoke result, warnings, exceptions and deferred work. Never claim the agent performed owner smoke. Never amend, rebase, merge, force push or make additional commits without explicit authorization.
