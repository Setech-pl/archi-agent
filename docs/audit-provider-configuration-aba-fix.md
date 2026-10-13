# AUD-002 — external configuration ABA correction

Status: **AUD-002 PASS / CLOSED IN LOCAL REPAIR**, following the
[independent ABA re-review](audit-provider-configuration-aba-independent-review.md)
on 2026-10-13. AUD-001 retains its independent PASS and is also closed in this
local repair. AUD-003–006 remain open and outside this correction. M1 is not
closed. The original [independent review](audit-provider-configuration-independent-review.md)
and [first repair report](audit-provider-configuration-fixes.md) are historical evidence.

The old guard advanced its publication counter only for participating writers.
An external A→B→A restored the captured values without advancing that counter, so
the old picker could overwrite the newer intent. Both review interleavings were
added as failing tests before changing production code: 90 existing cases passed;
the two new listing/QuickPick cases returned `selected` instead of `cancelled`.
The original review records three stale writes and `stale-picker-model` in both.

The existing snapshot now subscribes synchronously to VS Code configuration events
before the first interaction await. Every relevant event advances its observation
revision monotonically; returning to A cannot undo invalidation. The subscription
checks the six provider keys in the interaction's resource scope. An explicit
unscoped configuration scope avoids treating changes confined to another resource
as global changes. Scoped values, workspace identity/trust and the shared writer
counter remain additional checks.

During publication, only one notification for the expected changed key and exact
expected scoped state can be consumed as the operation's own update. No-op updates
receive no such allowance. Other events invalidate the operation, including ABA
between writes. The publisher returns the expected published snapshot with the
original observation, allowing the caller to recheck its revision after await
and before reporting success. Model/provider commands and Configuration Apply
dispose observations in `finally`, including early returns, failures and closure.
The guard retains fail-closed binding order, cancellation, partial-write detection
and no rollback over newer values. Multiple VS Code updates remain non-atomic;
this is not CAS against arbitrary writers during one in-flight update.

## Implementation evidence (2026-10-12)

All paths below are relative to `build/audit-provider-config/aba-20261012/`.

- `before-tests.json`: 90/92 PASS, both external ABA cases FAIL on the original code.
- `root-tests-final.json`: **1816/1816 PASS**, including **110 audit cases** (90 existing
  +20 new), **660 runtime/extension cases**. Both ABA cases now cancel, perform
  zero stale writes and preserve profile/model/binding A. Positive controls cover
  unchanged configuration, unrelated settings/resources, own notifications and
  legacy publication. Regressions cover ABA during credentials, after each write,
  after publication await, no-op notifications and subscription disposal.
- Both typechecks: `typecheck-publication.log`, `extension-typecheck-publication.log`.
  Build/package/verify: `build-final.log`, `package-final.log`, `verify.log` (531 entries).
- `real-host-verified/host-report.json`: **9/9 PASS**, real VS Code **1.141.0**, Node
  **24.21.0**, real controlled settings updates/events; production source picker/guard,
  controlled listing and QuickPick. Listing/QuickPick ABA each cancel with zero
  operation writes and preserve A; publication/workspace ABA, unchanged settings,
  unrelated settings/other resources and legacy publication also pass. No manual
  revision injection. All observation subscriptions are disposed. Provider endpoint
  has window scope, so native checks use Workspace; the resource control uses the
  resource-scoped Knowledge Pack setting. Exact provider-resource filtering also
  has a unit control. This is not native UI or system SecretStorage evidence.
- `packaged-report.json`: **36/36 PASS** on unchanged extracted VSIX bundles outside
  the repository, empty PATH/NODE_PATH, including both external ABA cases and the
  AUD-001 profile/type matrix. Anthropic→OpenAI uses the OpenAI synthetic credential
  for listing, generation and review; generation/review share endpoint and model.
  `packaged-manifest.json` records extraction path, actual package manifest and all
  three bundle hashes, identical to the fresh build.
- `source-fingerprint.json`: 403 executable/test/build inputs; SHA-256
  `992422d8234651258f6bf3405e359d6cd53c0a493c448c6ef6c46f8950d8d0cf`.
  `manifest.json` binds source, documentation, checks and artifact identity.

Final artifact: `candidate/archi-agent-0.3.0-alpha.4.vsix`, **119882805 bytes**,
SHA-256 `2a8c4ef7b3b325e333393a0428bbb3d06f82f3ac494fb3af8734942e8056908f`.

Sandbox loopback EPERM, a packaging/OCR collision and two initial Host harness
failures are preserved in the earlier reports/logs; they are not PASS. The final
root test and package runs were sequential. The Host harness was corrected to
wrap the frozen configuration API safely and use supported setting scopes.
Only test harness/reporting changed after the final unit tests and VSIX; production
sources stayed identical. No full gauntlet, owner smoke, paid calls or real keys.
Previous gauntlet/VSIX and original audit evidence remain unchanged, verified in
`original-evidence-verification.json`; their PASS belongs to the historical code.
The implementation session made no commit, push, merge, tag or publication and
left staging empty. The subsequent independent re-review authorizes the requested
local checkpoint of the reviewed code/tests and updated documentation. Its current
checks and limitations are recorded separately in the re-review report.
