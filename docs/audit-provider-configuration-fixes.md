# AUD-001 / AUD-002 — provider configuration consistency

Historical first repair: the subsequent independent review passed AUD-001 and
found an external ABA blocker in AUD-002. The current correction and verification
are in [the ABA repair report](audit-provider-configuration-aba-fix.md). The
[independent ABA re-review](audit-provider-configuration-aba-independent-review.md)
on 2026-10-13 gives **AUD-001 PASS / AUD-002 PASS**, closing both in the local
repair. Results below describe the earlier implementation/artifact.

Scope: independent audit of `20a1acb54e3ac40dff19194563846a3ded33c088`.
Implementation branch: `fix/audit-provider-configuration-consistency`.
At the first implementation handoff these findings were **PENDING INDEPENDENT
REVIEW**. The current status is recorded above. AUD-003–006 remain open;
M1 completion and release readiness are outside this change.

## Operation contract

Sequence and Component resolve the credential from the final model selection used
to build their request. Once established, this immutable operation configuration
survives subsequent setting changes and supplies both generation and review. An
initial configuration without a model can adopt a fresh, successful selection;
it cannot combine that selection with the initial provider's credential.
Document extraction follows the same final-selection rule. The model picker now
retains the caller's resource when reading project endpoint and timeout settings.

## Publication contract

`provider-configuration.ts` is a host-only guard shared by Select Model,
legacy model materialization, Select Provider and Configuration Apply. It captures
provider settings in all inspected scopes, workspace identity/trust and a host
publication counter. Long-running interactions verify this snapshot after secret
reads, listing and QuickPick. A completed or attempted publication invalidates
older interactions even when the final settings happen to equal their initial
values (ABA).

Only one participating writer can publish at a time. A competing publication is
rejected and must be explicitly retried. Every individual Global update compares
the expected scoped values before and after awaiting VS Code. Unexpected changes
stop subsequent writes. There is no compensating rollback over newer values.
The existing fail-closed binding order is retained, including activating an
explicit profile last when materializing legacy settings. `selected` requires
that the effective profile, model, endpoint and timeout match the chosen result.

The guard does not turn VS Code's multiple updates into a filesystem transaction.
A failed/cancelled publication can leave a partial, unbound model. It does not
provide CAS against arbitrary other extensions modifying the same settings while
a single VS Code update is in flight. It serializes this extension's writers and
detects observed external changes between updates; crash recovery is unchanged.

## Evidence and reproduction

Original audit evidence is read-only at
`/Users/marcinkrzetowski/Projects/archi-agent-audits/audit-20261012-20a1acb-independent/`.
Original file hashes and adapted reproductions are in
`build/audit-provider-config/run-20261012/`. The adapted script checks corrected
behavior for AUD-001/002 and omits AUD-003. It does not reinterpret the auditor's
bug-presence assertions as repair tests.

`test/vscode-extension/audit-provider-configuration.test.ts` exercises production
commands, resolver, SecretStorage adapter, runtime and cloud client transports:
all five starting profiles × three cloud destinations × Sequence/Component;
exact listing/generation/review endpoint, model and synthetic credential matching;
changes during generation with a stable reviewer; extraction configuration;
zero generation after cancelled or stale selection; scoped settings; legacy and
profile races, competing Apply/pickers, ABA, failure/cancellation and conflicts
after each individual update. Listing calls are counted separately.

`scripts/audit-provider-configuration-smoke.mjs` executes unchanged extracted
extension/runtime bundles outside the repository with the compiled VS Code test
adapter and controlled last cloud transport. It checks 30 provider/type combinations
and four stale/cancelled selection cases, including production Configuration Apply.
This is adapter evidence, not native UI or system SecretStorage evidence. The full
UX4-FU2 gauntlet supplies the separate real Extension Host and native UI checks.
Only synthetic credentials and synthetic knowledge/documents are used.

Verification results and exact VSIX identity are recorded in `docs/project-state.md`
and the local gauntlet manifest after completion. Manual smoke is deferred; no
historical smoke is attributed to the new artifact.

Historical first-repair status: **READY FOR INDEPENDENT REVIEW**. New regressions 90/90, final full
gauntlet 294/294 and unchanged extracted VSIX adapter regressions 34/34 PASS.
The exact artifact and evidence paths above are detailed in project-state. The
first gauntlet's native UI FAIL/NOT_RUN remain preserved; the final full run after
the null/undefined comparison correction passed all native UI without helper changes.
