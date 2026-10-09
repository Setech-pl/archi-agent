# UX4 configuration and review workbench

The local UX4 candidate starts at DOC1 `8375861582e64cd90e75843eb4c0fa66e50f7867`.
It is not a release. The earlier DOC1 owner smoke is incomplete and its observations do not
establish acceptance of this package. K4/MCP and release preparation are outside this task.

## Visible navigation

| Entry | Destination |
| --- | --- |
| Archi: Open → Create Diagram | Sequence / Component selection, then the existing reviewed generation |
| Archi: Create Diagram | Same type selection; Cancel makes no provider request or configuration change |
| Configuration / Archi: Configuration | Singleton editor panel: Knowledge Management / LLM Provider |
| Configure Knowledge Pack compatibility ID | Knowledge tab in that same panel; hidden from palette |
| Knowledge Browser | Native Explorer view, also reached by Browse Knowledge |
| Build Knowledge Pack from Active File | Captured active editor/preview input, same K2/K3 flow |
| Select Provider Profile / Select Model compatibility IDs | Provider tab in that same panel; hidden from palette |
| Build Knowledge Pack from Documents | Native document selection, one K2 extraction, linked review panel |
| Save Diagram and Report | Existing ART1 original-pair flow |
| Convert to Markdown | Existing standalone local conversion and OCR |
| Help | Packaged English user instructions |
| Check Provider Configuration compatibility ID | Existing OBS1 applied-configuration check in Provider tab; hidden from palette |

The old Sequence command ID is hidden and delegates to Create Diagram. The older runtime
compatibility API is retained internally. No C4 or MCP option is exposed.

## Knowledge Management

The screen shows selected project, effective absolute pack path, write scope and saved value,
effective configuration source, production-loader validation/recovery and actual counts for all
five tables. It opens the active files only after validating the host-owned path. Multi-root
requires an explicit project. Choose/Create use native folder pickers and UX3 activation;
first-run generation still uses the UX3 native onboarding flow. Workspace Trust remains enforced
by VS Code restricted configuration; the screen explains user-only effective settings when untrusted.

Document selection and cancellable conversion/OCR/extraction progress precede the review editor.
`KnowledgePackReviewSession` is the only decision/edit/preview/save engine. The editor shows each
row, status, immutable original proposal, explicit/inferred basis, reasoning, evidence/references,
source digests and conversion/OCR metadata. Checkboxes select a group; buttons apply accept,
reject or pending decisions. Row forms edit permitted fields only; entity reference fields use
candidate selection. IDs, evidence and basis remain immutable. Pending rows and unresolved
accepted dependencies block the five previews and Save. Every applied edit invalidates preview.

Validate and preview prepares the exact five files through the existing staged loader/byte checks.
Native destination selection supplies an existing parent and one new folder name. Save leaves
active configuration unchanged. Save and use saves first and activates the chosen project through
UX3's guarded scope path. Activation failure retains committed files. Collisions preserve existing
data and clear the destination with `Choose another new folder.`; the same session/preview can
save elsewhere without extraction. Cancel/closure before commit uses the existing cancellation
and conditional cleanup. Files become visible incrementally; multi-file save is not atomic.
No existing-pack update, merge, persistent draft or pack catalog is added.

## LLM Provider

Profile/model use existing machine-scoped User settings with `selectedModelProfile` binding.
LM Studio exposes the existing loopback URL; other profiles show their fixed endpoint. Timeout
uses the existing setting. Apply validates at the host, clears the prior binding, writes settings
sequentially and re-reads effective values. Discard restores applied values. Tab changes retain
unapplied edits; external changes are displayed and cause stale Apply to require Discard/re-entry.
Provider fields are disabled during Apply, while model listing still permits draft edits to invalidate
a delayed response. A partial settings failure reports actual state; several setting updates are not atomic.

Model refresh and Check use applied settings and at most one bounded model-list request. OBS1
classifies the result; connection/listing/generation readiness remain separate. No listing success
claims generation, billing, quota or credential verification. Explicit Create Diagram is the
existing generation test. No new retry, repair, fallback or request budget is added. Profile/draft,
settings, secret or panel changes invalidate diagnostic/model responses; stale replies are dropped.
No model is selected automatically.

Keys are entered using the existing native masked InputBox and stored only in SecretStorage.
Only required/present flags enter webview state; existing values never enter DOM, retained state,
messages or logs. Terminal key notifications do not hold the panel busy awaiting dismissal.

## Host / webview boundary and verification

Both webviews use locally bundled HTML/scripts, nonce CSP, no network resources and empty
localResourceRoots. A closed operation allowlist and bounded messages precede host validation;
row edits, indices, decisions, form settings and destination names are checked again at the host.
Messages cannot execute arbitrary commands or select arbitrary file paths. Panel lifetime and cancellation are checked after asynchronous state/credential reads before starting
operations; a closed panel cannot start a listing or destination picker. Source text and names
are assigned with textContent/value, never HTML. Tabs use ARIA roles and arrow/Home/End keyboard
navigation. VS Code theme variables provide light/dark/high contrast and focus styles; layouts wrap.

Required functional profile is the ART1 superset extended with UX4: clean root/OCR installs,
audits, root/extension tests, both typechecks, build/package/verify, demo and diff checks; exact
packaged K1/K2/K3/UX3/DOCX/ART1 runtime; real UX3/K3/ART1/UX4 Extension Host; native configuration,
review, pickers and ART1 UI. `npm run ux4:gauntlet` stores a unique `build/ux4/gauntlet-…/` with
source fingerprints, exact VSIX bytes/SHA, command logs, per-case results and screenshots.
Controlled Host messages are separate from native UI. Tests use synthetic sources/loopback
transports, which establish no live LLM quality or owner acceptance.

Independent read-only GPT-6.1 Sol/high review and no open HIGH/MEDIUM are required before the
local checkpoint. Required FAIL/NOT_RUN also block it. Owner cases remain NOT_RUN on a new
isolated exact-SHA installation until the owner reports results. OWNER_SMOKE: NOT_COMPLETED.

## Verified local candidate (2026-10-09)

Evidence: `build/ux4/gauntlet-2026-10-09T12-26-40-457Z-37727/`. Full gauntlet272/272 PASS without FAIL/NOT_RUN; root1670,
extension514, focused433, clean installs/audits0, both typechecks, build/package/verify531,
demo, packaged runtime regressions, real Host99 and native UI37. The exact candidate is
119869441 bytes, SHA-256 `358c31ffdd985b0612136b975cd80ea39b3d55304fc2ef2c3538003d2f573647`.
Independent read-only GPT-6.1 Sol/high review round3: no HIGH/MEDIUM remain. Earlier rounds
remain preserved and blocked; their Apply/lifetime findings are closed. Final manifest
records only status-documentation changes after the gauntlet and reconfirms bundle parity.
The new isolated owner handoff retains33 earlier cases and adds12 UX4, all NOT_RUN.
Owner smoke NOT_COMPLETED; no live model quality inferred. No release/version change.

## UX4-FU1 follow-up

Current navigation, draft-profile keys, active-file input and native knowledge tree: [owner findings and contract](ux4-owner-findings.md). The verified candidate above remains historical evidence for its original SHA. The follow-up uses a fresh artifact and owner handoff; no PASS is transferred.
