# Configuration and review workbench

Host contract for settings, native knowledge navigation and the review webview. User instructions: [English](en/user-guide.md) · [Polski](pl/user-guide.md).

## Visible navigation

| Entry | Destination |
| --- | --- |
| Archi: Open → Create Diagram | Sequence / Component / C4 Context / C4 Container selection, then the existing reviewed generation |
| Archi: Create Diagram | Same type selection; Cancel makes no provider request or configuration change |
| Configuration / Archi: Configuration | Singleton editor panel: Knowledge Management / LLM Provider |
| Configure Knowledge Pack compatibility ID | Knowledge tab in that same panel; hidden from palette |
| Knowledge Browser | Native Explorer view, also reached by Browse Knowledge |
| Build Knowledge Pack from Active File | Captured active editor/preview input, same K2/K3 flow |
| Select Provider Profile / Select Model compatibility IDs | Provider tab in that same panel; hidden from palette |
| Build Knowledge Pack from Documents | Native document selection, one K2 extraction, linked review panel |
| Save Diagram and Report | Existing ART1 original-pair flow |
| Convert to Markdown | Existing standalone local conversion and OCR |
| Help | Bundled PL/EN instructions selected by VS Code display language; language links work offline |
| Check Provider Configuration compatibility ID | Existing OBS1 applied-configuration check in Provider tab; hidden from palette |

The old Sequence command ID is hidden and delegates to Create Diagram. The older runtime
compatibility API is retained internally. C4 selection uses the source-bound hierarchy. MCP knowledge is configured through User settings; see [CLI/MCP](en/cli-mcp.md).

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

Model refresh reads the visible draft profile, endpoint and timeout without saving settings. Check uses applied settings and requires Apply/Discard for dirty edits. Each uses at most one bounded model-list request. OBS1
classifies the result; connection/listing/generation readiness remain separate. No listing success
claims generation, billing, quota or credential verification. Explicit Create Diagram is the
existing generation test. No new retry, repair, fallback or request budget is added. Profile/endpoint/timeout,
settings, secret or panel changes invalidate diagnostic/model responses; model-only selection and unrelated state publication preserve the current catalog; stale replies are dropped.
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
transports, which establish no live LLM quality or acceptance review.

Independent read-only GPT-6.1 Sol/high review and no open HIGH/MEDIUM are required before the
local checkpoint. Required FAIL/NOT_RUN also block it. Historical test forms retain their original NOT_RUN observations.

## Model-list contract

Every local list entry still passes the existing safe-ID check. Raw response size, entry count, content type, UTF-8, JSON, timeout, cancellation, redirects and literal-loopback validation remain unchanged. Repeated exact safe local IDs become one sorted choice; no trimming, aliasing, skipped unsafe entry or new model identity. Cloud parsers are unchanged.

Refresh Models captures the visible form's profile, endpoint and timeout without writing configuration. Fixed provider endpoints remain fixed. SecretStorage credentials are captured for that profile only; no values enter webview/state/logs. Check Provider Configuration retains applied settings and requires Apply/Discard when dirty. No generation, retry/fallback or implicit refresh.

Available models is a visible select with exact IDs and an explicit empty placeholder; Selected model retains manual exact-ID entry. A selection updates only the draft; Apply persists the existing selectedModel/selectedModelProfile binding. No automatic model choice. Discard/reopen/restart use saved settings. Model-only edits retain the catalog; profile/endpoint/timeout/settings/key/panel changes cancel/invalidate it. Publication sequence is separate from semantic request invalidation, so an unrelated state publication does not discard a current response. Loading ends on success, empty, invalid and failed response; recovery is explicit Refresh. New list-status messages are provided in English and Polish, without raw provider responses.

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

The current guard also observes relevant external configuration events monotonically, so A→B→A cannot revive a stale interaction. See the [ABA correction](audit-provider-configuration-aba-fix.md) and [independent re-review](audit-provider-configuration-aba-independent-review.md).

## Active input and native knowledge navigation

MD/TXT captures exact editor text synchronously, including dirty and untitled buffers, before any
picker/yield. K2 accepts an explicit editor-buffer input with true URI and hashes the captured UTF-8
content separately from normalized extraction text. Review/save retains that origin and URI locally;
URI is omitted from extraction requests and subsequent diagram knowledge-context projections. No temporary file poses as the source and no editor save occurs.
Stable TabInputText/TabInputCustom URI supports local PDF/DOCX/XLSX preview files through existing
conversion/OCR. Other tabs fail explicitly, without using a different/stale editor. Installed preview
extensions vary; only a real local file URI is accepted. All paths use the same K2/K3 review and five-file save.

## Native Knowledge tree

Explorer view **Archi Agent — Knowledge** uses production source inspection and the K1 snapshot.
The selected source can be a five-file pack, Structurizr JSON + overlay or MCP knowledge. Each
workspace root has its own source selection; expanding it never changes settings or invokes a model.
Source scope, omissions and actual provenance remain visible; missing local locators stay explicit.
Systems show aliases and flat incoming/outgoing relation references; Relations, Rules, Actors and
five Files retain native record/line locations. Sources/Evidence appear when K3 metadata is available.
The loaded contract does not retain original file paths or frozen source text for ordinary file sources;
those entries open local metadata/evidence details, without pretending to locate the original page. Editor-buffer entries can navigate their real local URI and evidence line only when the current normalized digest matches; changed or closed sources open frozen metadata details instead.
Configuration activation, workspace changes, pack-file saves and Refresh invalidate the tree.
Invalid/missing/unreadable packs replace old knowledge with an explicit state. No CRUD or merge.
Browse Knowledge on Knowledge Management reveals this same view.

## Language and observed limits

Help selects bundled PL/EN instructions from the VS Code display language. Configuration defaults to English; bilingual list-status text does not implement a persistent application language switch. Live scanned-PDF knowledge extraction has no confirmed full end-to-end PASS: evidence locations passed, but a malformed model row was rejected. The earlier Markdown timeout was not reproduced. Selecting a model by native keyboard automation remains unconfirmed. These limits are retained in [project state](project-state.md).
