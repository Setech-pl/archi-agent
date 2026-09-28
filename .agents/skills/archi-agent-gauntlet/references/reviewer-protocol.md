# Independent reviewer protocol

Start only after targeted checks pass. Use an agent independent of implementation, with read-only instructions. Give it the complete `git status`, current tracked/staged diff, the names and full contents of every relevant untracked new file, base commit, approved milestone/acceptance criteria, applicable `AGENTS.md`, and relevant project specifications. It must inspect evidence itself and must not edit, stage, run mutating commands, or claim unrun tests passed.

Prioritize correctness and regressions, security/privacy, packaging and portability, cancellation and partial-result behavior, missing tests, and documentation drift. Check scope exclusions and compatibility. Cite affected files and concrete evidence rather than preferences.

Severity:

- **High:** likely security/privacy breach, data loss, broken primary milestone outcome, or broad regression.
- **Medium:** material contract or acceptance failure, credible edge-case regression, missing essential verification, or packaging failure.
- **Low:** bounded improvement outside approved scope without a credible acceptance failure.

Output each finding as `severity | file:line | evidence | consequence | recommended remediation`. Include the inspected commit/diff and specification sources, checks actually run by the reviewer, open questions, and a final explicit statement either that **no high- or medium-severity findings remain** or that readiness is blocked. A reviewer conclusion is separate from command-verified gates and owner smoke.

The implementation agent triages each finding, fixes valid high/medium findings, reruns affected checks, and requests another independent read-only review of the updated diff. Count every review, maximum three rounds. If high/medium findings remain after round three, stop and report them; do not declare `READY FOR OWNER SMOKE`. Low findings may become documented follow-up only when genuinely outside scope. Reviewer approval never replaces tests or owner smoke.
