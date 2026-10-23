# EAK2 + EA2 — implementation and continuation plan

Approved scope: [complete brief](eak2-ea2-brief.md). Base `a820752d655c8f1ef370ee2f22a1584d80ac34e7`, branch `feature/eak2-ea2`, worktree `/private/tmp/archi-eak2-ea2`. No publication or work on EA3/EA4. Operational evidence belongs in ignored `build/eak2-ea2/`.

## Data and compatibility

Keep strict `enterpriseCatalogSchema` for enterprise/1; add strict enterprise/2 and a discriminated read union. V2 keeps source/scales/capabilities unchanged and adds `applications: {id,name,description?,provenance}[]`, `supports: {applicationId,capabilityId,provenance}[]`, and `supportScope: {description,applications,relationships}` (coverage enum complete/partial/not-provided). Application and capability IDs are separate namespaces. Support identity is the ordered endpoint pair; duplicate pairs and missing endpoints fail. Provenance covers every supplied business field. V1 remains readable/writable without migration; no applications/coverage are invented on read. Explicit application entry upgrades a reviewed copy to v2 with partial coverage. Version-specific digest domains include all v2 collections, normalized by stable IDs and pair identity. No review metadata in the strict catalog.

Keep `get_knowledge_snapshot` and `get_enterprise_snapshot` v1 exactly. Add fixed `get_enterprise_snapshot_v2` with strict `contractVersion:2` and snapshot envelope /2, accepting only enterprise/2. Source config explicitly chooses enterprise contractVersion 2, default absent = 1; EA2 requests version 2 deterministically before connecting. No fallback after failure. V1 tool rejects a v2 catalog rather than removing fields. Test old client/server, new client/server, mismatches, tampered digests and local/MCP parity.

## EAK2 runtime and review

Add `EnterpriseUpdateSession` over a frozen production snapshot, exact source text/path and byte fingerprint. Every proposal has its own stable operation ID, origin and pending/accepted/rejected decision. Operations: add, patch name/description/parent/explicit rating, delete, no-op, unresolved identity/conflict. Never infer deletion from omission. Reuse EAK1 material capture, provider selection, bounded extraction and its exact evidence checks (one call, no base catalog sent to LLM). Imported EAK1 candidates must explicitly bind to a specific existing ID or explicitly become a new capability; a name match is only a suggestion. Review shows before/after, affected fields, original proposal/evidence, decisions, children and support references. Conflicting accepted field writes block until one is rejected. No automatic dependency removal. Production validation checks hierarchy, ratings, labels, IDs and provenance after accepted changes are composed. Untouched fields keep old provenance; changed fields point to a real immutable companion review report, recording original evidence and user decisions. Coverage never rises due to extraction completion.

API: `captureEnterpriseUpdate(path, signal)` returns session; `propose(EnterpriseChange)`, `importProposal`, `bindCandidate(candidateId, EnterpriseCandidateBinding)`, `decide`, `state`, `prepareSave`, `checkBase`, `confirmSave`. Bindings use tagged existing/new/reject actions; stored rejected decisions never share a namespace with legal IDs. New imported warnings invalidate prior acknowledgments. One successful proposal import disables further extraction before provider access. Application entry uses the same session (`propose` with add-application/add-support and explicit deletion variants). `prepareSave` produces immutable expected/proposed text plus a review report in `enterprise-updates/<sessionId>/<revision>/enterprise.review.json`; native host confirms and uses the VER1 editor-edit/save pattern. Create companion report exclusively before applying, keep it on uncertain outcomes. Check path/source identity, base bytes/digest, dirty state and document version before edit and immediately before native save; post-save read uses production loader plus exact byte comparison. Distinguish prepared, cancelled, conflict, stale-source, failed and saved. No rollback of foreign edits, no filesystem transaction/CAS claim. A fresh new-file copy may use existing exclusive creation rather than overwrite.

## EA2 projection and hosts

Add `capability-application-map` discriminated diagram input. Selection `{capabilityIds:[], includeDescendants:boolean, language, expectedCatalogDigest?}`; [] is the whole catalog, concrete IDs choose any capability/domain. Show selected capabilities plus directly supporting applications; whole view also shows unlinked apps. No inherited support. Record omitted capabilities/apps/relationships with explicit reasons. Limit 120 total nodes, 240 explicit edges, 256 KiB PlantUML, 1 MiB report; exceeding fails with request to narrow scope, never truncates.

Core produces deterministic projection and a safe closed rectangle/component/arrow grammar with generated aliases and IDs in labels. Report declares `modelCalls:0`, snapshot/source/projection digests, selection, original records/provenance and actual local JSON locations or MCP pointers, coverage and unknown-support warnings. Several links are a count, never redundancy/investment advice. V1 input returns support-data-unavailable. Existing Capability Map accepts v2 locally/explicit MCP v2 via a new report version while preserving report v1/v2 for v1 inputs. ART1 gets a separate strict capture for EA2, preserving envelope/writer/original pair.

VS Code: Create Diagram routes before provider requirements, reuses source/scope QuickPick and original-result registry. Update Catalog command captures the base before material selection, reuses EAK1 sources and bounded preview. Review and application/support entry reuse native QuickPick and diff editors; no JSON editing required. CLI and function MCP add discriminated inputs, readRoots unchanged, no catalog writes. Runtime remains independent of vscode.

## Expected files

- `src/core/enterprise/enterprise-catalog.ts`, `enterprise-transfer.ts`, `capability-map-report.ts`; new capability/application projection/report.
- `src/node/enterprise-json-source.ts`, `mcp-knowledge-source.ts`; `src/knowledge-server/server.ts`.
- New `src/runtime/enterprise-update.ts`, `capability-application-map.ts`; runtime exports/artifact capture and existing Capability Map compatibility.
- `src/hosts/local/{schemas,operations,config,results}.ts`, `src/runtime/host-results.ts`, CLI/MCP dispatch.
- VS Code update/save command, source/diagram picker, contributions/manifest/activation/navigation and Help PL/EN.
- Core/runtime/host/VS Code focused tests; synthetic Retail v2 alongside unchanged v1 fixture; contracts, bilingual instructions and project-state.

## Work sequence and DoD

1. Preserve brief, write plan and project-state (first changes), inspect API and targeted tests.
2. Implement strict v2/read/identity/provenance and protocol compatibility with focused tests.
3. Implement frozen update session, native save checks and proposal/material/application UX; exercise add/rename/no-op/ambiguous/conflict/delete/cycle/ratings/provenance and preservation of v2.
4. Implement deterministic EA2, ART1 and thin VS Code/CLI/MCP hosts; validate partial coverage, no inheritance, duplicate labels, scope/limits, deterministic parity and old contracts.
5. Extend Retail, contracts, instructions and offline Help. Run focused tests during implementation; avoid repeated full suites.
6. One common gauntlet: npm ci root/OCR, audits, OCR assets, root and extension suites, both typechecks/build, sequential Core/Full/CLI package/verify; Help/docs/diff checks; exact packages outside repo, real stdio old/new MCP, EAU1/EAK1/EA1/EA1b/SRC1/VER1/C4/ART1 and AUD-003/004 including real OCR; actual Extension Host and visible native UI. Preserve failed attempts and required NOT_RUN.
7. Independent read-only review in separate context AFTER gauntlet, fix HIGH/MEDIUM with appropriate narrow checks/repackage and re-review (max three rounds). Review includes data loss, conflicts, unknown support/provenance and exact artifact identity.
8. Update project-state and ignored acceptance report, record artifact paths/bytes/SHA256 and owner smoke DEFERRED. Local commit only after required gates and review pass; no push/merge/tag/publication. STOP.

## Continuation

This plan is an implementation specification, not proof of completion. Current progress and exact unrun gates are in project-state and ignored acceptance evidence; compare both against Git at every continuation. Historic AUD-FIX2 PASS does not certify new packages. AUD-005/006 remain OPEN. Local free-provider smoke only with existing configuration and no changes to owner settings; otherwise NOT_RUN.


## Current handoff — 2026-10-21

Implementation and two independent code-review rounds are complete. All three round-1 MEDIUM
findings are closed. Final candidate: `build/eak2-ea2/common-r2/packages/`; command/artifact evidence:
`build/eak2-ea2/acceptance-report.md` and `acceptance-final.json` (ignored). Final narrow checks
145/145, typechecks/build/package/verify, package runtime/stdio/OCR/new actual Hosts and docs PASS.
Full suites were run earlier in the common loop, with two menu expectations subsequently fixed and
retested; do not claim a full suite on final r2. Required visible native UI is blocked by the local
macOS AX/CUA environment (earlier FAIL, final NOT_RUN). No functional checkpoint is authorized by
passing code review alone while that gate is missing. Working changes are intentionally retained,
staging empty, HEAD still the base. Next session should reuse this worktree, verify Git/evidence and
run the remaining actual UI on exact r2; code changes require only appropriate reruns/re-review.
No push/merge/publication or EA3/EA4.

UI closure follow-up (same date): exact Core r2 was reused without code/package changes;
all 366 final source fingerprints still match. Real CDP workbench controls, native save/readback,
conflict, EA2 and ART1 control-level checks passed, but renderer visibility was not reliable.
A native-PID/visible-guarded attempt also stopped before completing the full sequence. These
results do not close required visible UI. Earlier FAIL remain, including one unexplained safe
conflict; later successful saves do not establish its cause. No staging or checkpoint.

Durable initial source/evidence backup and ready isolated manual environment:
`~/Projects/archi-agent-audits/eak2-ea2-ui-closure-20261021-214035`.
Use `manual-ui-r2/ODBIOR-UI.md` and `Open isolated UI.command`; exact Core is installed and
verified against all 15 VSIX entries. Only owner-visible clicks/observations and screenshots
remain; disk preparation/collection scripts are supplied. Do not repeat suites/gauntlet or
rebuild unchanged r2. Detailed failure classification: ignored `build/eak2-ea2/ui-closure/closure-report.md`.
