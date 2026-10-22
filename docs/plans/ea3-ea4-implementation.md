# EA3 / EA4 release implementation

Authorized scope: [owner brief](ea3-ea4-release-brief.md), including design, implementation,
independent review, commits, PR, CI and a GitHub prerelease; no merge to main.

## Starting point and preservation

The latest complete source is the 56-file uncommitted EAK2/EA2 increment in
`/private/tmp/archi-eak2-ea2`, based on `a820752`. No later EA3/EA4 implementation was found in
registered worktrees, branches or their plans. All 56 files were copied byte-for-byte to a
durable isolated checkout; their import hashes are in ignored `build/ea3-ea4/import-manifest.json`.
Commit `bf301e2` preserves that increment as WIP, with historical UI FAIL/NOT_RUN retained.
The active checkout is `build/ea3-ea4/integration` in the original project directory, branch
`release/ea3-ea4-release`. It has its own Git metadata because the linked worktree index was
read-only in this environment. Its ancestry already contains fetched `github/main`.
The old checkouts and the owner's manual r2 environment are preserved.

## Minimal shared catalog extension

Add strict enterprise/3, retaining enterprise/1 and enterprise/2 without implicit migration.
V3 extends the existing application records with optional `domainId`, `owner`, `lifecycle`
(`planned`, `active`, `retiring`, `retired`) and explicit `ratings` using existing scales.
Add `domains[]: {id,name,provenance}`, `valueStreams[]: {id,name,context,outcome?,stages[],provenance}`,
where each stage is `{id,name,outcome?,capabilityIds[],provenance}`. Array stage order is declared
source/user order; stage IDs are stable within a stream. Capabilities and stages remain distinct.
Add `valueStreamScope: {description,streams,relationships}` and `landscapeScope:
{description,domains,attributes}`, using existing complete/partial/not-provided coverage values.
All supplied business fields require provenance, including stage order (`/stages`). Validate
unique IDs, known references, safe labels, scale values and coverage consistency. Limits:
1 MiB input; 1,000 apps/capabilities/domains; 100 streams, 100 stages/stream; 4,000 mappings.
Canonical digests sort identity collections but retain stage order. Do not create assessments.

Implement fixed `get_enterprise_snapshot_v3` / contractVersion 3 with separate strict envelope,
source version domain and verified digest. V1/v2 tools retain strict schemas and reject v3 data
instead of dropping it. Extend source configuration to explicitly select 3; no error fallback.
Existing EA1/EA2 projections also accept v3 and preserve truthful versioned report identity.

## Deterministic views and hosts

Shared core projection/render functions and host-neutral runtime functions:
`generateValueStream` and `generateApplicationLandscape`. Selection binds catalog digest and
language. Value Stream selects one stream; Landscape selects explicit domain/application IDs
(or all) and `colorBy` none/explicit rating scale. Unknown domain is visible in whole portfolio;
unknown rating is visually distinct from 0. Views use generated aliases and a closed PlantUML
subset; no LLM, provider access, inference, includes or arbitrary model syntax.
Limits per view: 120 nodes, 240 relations, 256 KiB PlantUML, 1 MiB report, no truncation.
Strict reports include snapshot/projection digests, visible records with provenance and exact
JSON/MCP locators, ordered stages, scope, omitted identities and limitations. ART1 captures the
original diagram/report pair through the current envelope and exclusive writer.
CLI and function MCP share runtime, schemas and outcome validation. VS Code reuses the existing
Enterprise Architecture source picker, scope controls, result editors and ART1 save route.

## Reviewed input and guarded updates

Extend `EnterpriseChange` / `EnterpriseUpdateSession` and native review menu for domains,
application fields and streams/stages. Reuse diff, pending/accepted/rejected decisions, stable
IDs, review URN/digest and guarded native save. Manual guided inputs are the primary UX;
JSON editing is optional inspection. Model proposals use the existing provider/material capture,
conversion limits and a bounded strict proposal; source evidence and user decisions remain
separate. Do not send the full catalog to a model or invent citations/order. Unchanged v3
collections survive EAK2 updates. References block deletion until explicitly resolved.
Investigate historical LOW safe-conflict with saved evidence and targeted reproduction.

## Verification and publication

Targeted tests: strict versions, order/digests, references/deletion, rename/provenance, unknown
fields/ratings versus zero, ungrouped apps, explicit scopes, limits, deterministic output,
conflicts, lossless EAK2 update and host parity. Independent review in a separate read-only
context; close new HIGH/MEDIUM. One final appropriate full gauntlet: npm ci/audits root/OCR,
root/extension suites, both typechecks, build, sequential Core/Full/CLI package/verify,
PL/EN Help/documentation, exact packaged runtime outside repo, real stdio and Extension Host.
Attempt available visible UI; preserve infrastructural FAIL/NOT_RUN and provide owner smoke.
Live local model only if already available at no cost; no personal configuration changes.

Select a free next prerelease after inspecting tags. Update extension/CLI manifests, lockfile,
PL/EN docs and offline Help. Extend synthetic Retail and preserve Mission Control. Render
current diagrams from candidate data; screenshots must originate in real UI. Create fresh
clean demo ZIPs. Push the integration branch, create the appropriate PR, obtain Linux x64 and
macOS ARM64 CI for final sources, identify tested head/merge checkout. Publish a new prerelease
with Core/Full/CLI, two demos, PL/EN start instructions, SHA256SUMS and source/size/hash manifest.
Verify anonymous downloads byte-for-byte and links. Never overwrite old tags/assets or merge main.
Operational logs/reviews remain in ignored build. OWNER_SMOKE remains DEFERRED until owner input.

## Review refinements

The strict `enterpriseViewCandidatesSchema` has version 1, warnings, and at most 100 candidates:
`{key,change,basis,evidence}`. `change` is a closed union of domain, stream, application and scale
operations. `basis` covers every supplied business leaf/array using JSON pointers (including
`/stream/stages` for order); source-supported fields require exact captured evidence slices.
Extract mode rejects unsupported fields; proposal mode preserves them as model-proposal.
`ExtractEnterpriseCandidatesRequest.target` selects this schema without adding model calls.
The user binds each candidate through guided native forms to stable IDs and explicit references;
stream order has a separate modal confirmation. Companion review retains original basis/evidence
and the final accepted user operation separately. EAK2 `set-scale` defines 2–7 explicit ascending
levels (0–100), preserving proof for unchanged fields. No-op retains original provenance.
Review findings also require application patch/delete conflict detection and forbid raising
attribute coverage for an application rename. CRLF save plans preserve captured EOL; this is
separate from the historical LF safe-conflict whose root cause remains unknown.
