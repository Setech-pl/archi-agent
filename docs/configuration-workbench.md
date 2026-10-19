# UX4 configuration and review workbench

Implemented configuration and review behavior. Distribution and unresolved quality limits: [project state](project-state.md).

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
| Help | Bundled PL/EN instructions selected by VS Code display language; language links work offline |
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

## Model catalog and explicit selection


Every local list entry still passes the existing safe-ID check. Raw response size, entry count, content type, UTF-8, JSON, timeout, cancellation, redirects and literal-loopback validation remain unchanged. Repeated exact safe local IDs become one sorted choice; no trimming, aliasing, skipped unsafe entry or new model identity. Cloud parsers are unchanged.

Refresh Models captures the visible form's profile, endpoint and timeout without writing configuration. Fixed provider endpoints remain fixed. SecretStorage credentials are captured for that profile only; no values enter webview/state/logs. Check Provider Configuration retains applied settings and requires Apply/Discard when dirty. No generation, retry/fallback or implicit refresh.

Available models is a visible select with exact IDs and an explicit empty placeholder; Selected model retains manual exact-ID entry. A selection updates only the draft; Apply persists the existing selectedModel/selectedModelProfile binding. No automatic model choice. Discard/reopen/restart use saved settings. Model-only edits retain the catalog; profile/endpoint/timeout/settings/key/panel changes cancel/invalidate it. Publication sequence is separate from semantic request invalidation, so an unrelated state publication does not discard a current response. Loading ends on success, empty, invalid and failed response; recovery is explicit Refresh. New list-status messages are provided in English and Polish, without raw provider responses.



## Public commands and active editor input

Nine visible commands use category **Archi**: Open, Configuration, Knowledge Browser,
Build Knowledge Pack from Documents, Build Knowledge Pack from Active File, Create Diagram,
Save Diagram and Report, Convert to Markdown, Help. Legacy IDs remain hidden delegates; Configure
Knowledge Pack and Check Provider Configuration are accessed from Configuration. Open is a short hub.
Sequence/Component remain one type picker. Editor title exposes the active-file command.

MD/TXT captures exact editor text synchronously, including dirty and untitled buffers, before any
picker/yield. K2 accepts an explicit editor-buffer input with true URI and hashes the captured UTF-8
content separately from normalized extraction text. Review/save retains that origin and URI locally;
URI is omitted from extraction requests and subsequent diagram knowledge-context projections. No temporary file poses as the source and no editor save occurs.
Stable TabInputText/TabInputCustom URI supports local PDF/DOCX/XLSX preview files through existing
conversion/OCR. Other tabs fail explicitly, without using a different/stale editor. Installed preview
extensions vary; only a real local file URI is accepted. All paths use the same K2/K3 review and five-file save.



## Native Knowledge tree

Explorer view **Archi Agent — Knowledge** uses the production five-file loader and K1 snapshot.
Each workspace root has its own active pack; expanding it never changes settings or invokes a model.
Systems show aliases and flat incoming/outgoing relation references; Relations, Rules, Actors and
five Files retain native record/line locations. Sources/Evidence appear when K3 metadata is available.
The loaded contract does not retain original file paths or frozen source text for ordinary file sources;
those entries open local metadata/evidence details, without pretending to locate the original page. Editor-buffer entries can navigate their real local URI and evidence line only when the current normalized digest matches; changed or closed sources open frozen metadata details instead.
Configuration activation, workspace changes, pack-file saves and Refresh invalidate the tree.
Invalid/missing/unreadable packs replace old knowledge with an explicit state. No CRUD or merge.
Browse Knowledge on Knowledge Management reveals this same view.
