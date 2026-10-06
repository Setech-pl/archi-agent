# Build a new Knowledge Pack from documents (K3)

The owner decision is **new packs in new folders only**. The folder can be inside the
current project or anywhere explicitly selected locally. A new project is not required.
Existing packs are never updated, merged or migrated. There are no persistent drafts,
acceptance history or automatic saves.

## User flow

Run **Archi Agent: Build Knowledge Pack from Documents** in the Command Palette, or use
**Archi Agent: Open → Knowledge Management → Build Knowledge Pack from Documents**.

1. Select local MD/TXT/PDF/DOCX/XLSX files in the native picker. No directory/workspace scan.
   For PDF, choose the existing none/auto/all OCR policy. K2 validates and freezes the bounded
   inputs before optional model selection and credentials. Select a model with the existing
   provider controls when needed; an existing Knowledge Pack is not required.
2. Wait for local conversion and one K2 extraction. Notification progress supports Cancel.
3. Review pending proposals. **Show review details** opens an untitled document with all
   rows, status, explicit/inferred basis, reasoning, evidence, locations and source limitations.
   **Accept selected**, **Reject selected**, and **Return selected to pending** use a multi-select
   QuickPick. **Accept all pending** and **Reject remaining pending** are explicit group actions.
   Technical validation does not establish semantic truth.
4. **Edit candidate** changes one existing row field. Entity IDs, basis, reasoning, quotes,
   source IDs, digests and evidence locations cannot be edited. Reference fields use candidate
   entity selection. Add/change an alias by editing an extracted alias row; this milestone
   does not create new proposals. Cancel an edit to leave that field unchanged.
5. **Validate and preview** uses KPB-A and the production loader. Every proposal must be
   accepted or rejected. Accepted relationships, aliases and rules need accepted endpoints;
   none are accepted or invented automatically. Conflicts, alias collisions and an empty or
   actor-only accepted set block saving. Invalid edits are rejected; cross-row conflicts are
   displayed and remain editable. Changing a row or decision invalidates the previous preview.
6. Select an existing parent directory with the native picker, then enter one new folder name.
   The preview shows the absolute destination and accepted/rejected counts. Open each of the
   five Markdown files or **Show summary and additions** for all additions and source limitations.
   The immutable preview is exactly what will be saved; untitled editor changes do not modify it.
7. **Save** creates the pack and leaves `knowledgePackPath` unchanged. **Save and use** saves
   and validates first, then uses UX3's scoped setting update. Single-root uses WorkspaceFolder,
   multi-root explicitly selects a project, and no workspace uses Global. A configuration failure
   says **saved, not activated** with the location; the valid saved pack is retained.

Escape/Cancel before confirmation writes no final pack and changes no pack setting. Review
never re-extracts: starting a new command is the explicit new extraction operation. One active
build session per Extension Host prevents mixed drafts and destinations. Independent runtime
sessions have their own state; exclusive creation arbitrates collisions at a shared destination.

## Runtime and request policy

`createArchiAgentRuntime().extractDocumentCandidates()` is the production K2 extractor.
`KnowledgePackReviewSession`, exported through `src/runtime/index.ts`, owns the existing
`KnowledgePackDraft` decisions in memory. `state`, `decide`, `edit`, `prepare`, and `save`
reuse KPB-A, K1 and the production Node loader. No new extraction engine or webview is used.
Native pickers, grouped QuickPicks, InputBox and untitled review/preview documents are sufficient.

Blocking input: **0** generational requests. Valid extraction: **1**. Review, edits, validation,
rendering, staging, preview, saving and activation: **0 additional** requests. No reviewer LLM,
retry, repair or fallback. Frozen K2 text verifies literal evidence; original files are never
reread for review. Editing a row retains the original candidate ID, entity ID, source digests,
evidence, inferred basis and `editedByUser`. Quotes support the original proposal, not a claim
that the edited row is stated verbatim in the source. OCR confidence is unavailable and
coverage remains partial after acceptance. No URL fetching, diagram, ART1 or MCP is involved.

## Provenance in the five-file format

The KPB-A table renderer is unchanged. Each generated file appends one trailing
`ArchiAgent-Provenance-v1: ` line containing percent-encoded canonical JSON. This prevents
quotes, newlines, pipes and Markdown directives from changing table structure. Metadata holds
version, bundle digest, relevant source declarations without full text, original/text digests,
conversion/OCR limitations, accepted row bindings, candidate IDs, basis/reasoning, verified quotes
and normalized-text offsets/lines, and the user-edit flag. No sixth file or evidence repository.

The production loader strips only this closed trailing section, validates its bounded schema,
exact bindings to table rows, source/digest references and cross-file consistency. When present,
all five files must carry it. Legacy packs without metadata retain their existing behavior.
The loaded pack and K1 snapshot preserve the metadata; the snapshot digest includes it, marks
generated coverage partial, and projects only metadata for selected records to diagram context.
Reload checks structure and consistency, not source authenticity: the original documents are
not embedded and a hand-edited pack is not a signed evidence archive.

Cells with pipes/backslashes round-trip through the existing renderer/parser escaping. Newlines,
controls, forbidden markup, invalid enums, references and values changed by parser trimming
are rejected rather than rewritten. The staging round trip compares actual loaded records with
accepted rows. Both staging and final load also compare the bytes to the immutable preview.

## Save, cancellation and cleanup

`prepare` writes five files to an isolated random staging location, loads them with the
production loader, checks records and cleans only owned resources. Staging cleanup failure
blocks preview. `save` uses the shared UX3 writer with K3's strict new-directory option.
Exclusive `mkdir` rejects any existing destination (including an empty directory created after
preview); five exclusive `wx+` file opens never replace existing files. A collision offers a
new review/location cycle without another K2 call.

Publication is a controlled operation transaction, **not an atomic directory rename**. Files
become visible incrementally. Success resolves only after final production load, byte checks,
identity/content checks and the final cancellation check. Cancel/errors before that point
attempt conditional rollback. After success, later Cancel or activation failure never removes
the pack. Files and VS Code settings are separate operations.

Cleanup checks recorded file identity, timestamps, expected bytes and owned directory identity.
It removes only unchanged owned resources and the same empty directories. Foreign edits,
replaced resources, unexpected files or uncertain ownership are preserved, with a recovery
message naming the chosen directory. Inspect preserved data before retrying; choose another
new folder when necessary. Partial/unprovable writes may be preserved conservatively.
Filesystem path checks and unlink are separate system calls; hostile concurrent replacement
between those calls cannot be made atomic with portable Node APIs. No native addon or durable
recovery system is claimed. The setting guard reuses UX3 serialization and snapshot checks;
VS Code has no compare-and-swap setting API. Failed updates do not unconditionally restore
settings over another writer's changes.

## Verification and owner smoke

`npm run k3:gauntlet` creates `build/k3/gauntlet-<UTC timestamp>-<pid>/` with clean installs,
audits, full root/extension tests, typechecks, demo, build/package/verify, focused regressions,
source/package byte matching, isolated packaged K3/K2/K1/UX3 runtime, real Extension Host and
visible K3 UI including native pickers. Controlled Host picker answers are separate from native
UI evidence. Manifest/report bind the base HEAD, sources, environment and exact VSIX SHA-256.
Independent read-only review remains a separate required gate. Owner smoke is **DEFERRED**,
never an automatic PASS. No push, main integration, tag or publication is authorized.

For a later combined owner smoke: install the exact candidate in an isolated profile, select
synthetic or approved documents, inspect source/OCR limitations, group-accept/reject, edit a
name/alias/reference, verify pending and dependency blocking, inspect all five previews, then
Save to a new folder. Repeat with Save and use in the intended scope; verify configuration and
load the pack. Also try an existing empty target, review/operation Cancel and activation failure.
Real-model proposal quality is outside controlled-transport automated evidence. Stop after K3;
ART1 needs its own authorized milestone loop.

Model selection receives the extraction cancellation signal. Listing and the model QuickPick
are cancelled with the parent operation; Cancel/deadline releases the operation even while
SecretStorage is pending. Late callback results cannot generate or start setting writes.
An already dispatched VS Code setting update is not a cancellable transaction.
