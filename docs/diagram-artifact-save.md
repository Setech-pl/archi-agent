# Controlled diagram and report save (ART1)

ART1 adds **Save Diagram and Report** to a completed generation notification, **Archi:
Save Diagram and Report** to the Command Palette, and the same leaf to **Archi: Open**.
The palette/menu selects an original completed Sequence or Component result identified by type,
UTC creation time and result UUID. These in-memory choices belong to open result previews; closing
both diagram and report removes that choice. There is no persistent run history or reload/import.
Changing a preview's language does not close the result: VS Code's language-change close event
has `isClosed: false` and is ignored. Actual document closure still removes the choice after
both previews close.

The action always saves the original final generation bytes, including the terminal newline.
Manual buffer edits, the active editor, subsequent generations, changed settings and changed packs
cannot replace those bytes or their linked report. Failed/unverified results and older doubles
without a linked completed artifact cannot be saved. Existing warnings and review status remain;
ART1 does not reassess quality. Save makes no generation, review, model-list, provider-diagnostic,
conversion, secret-storage or source-refresh request and never changes settings.

## Destination and confirmation

One local workspace folder supplies the project. Multi-root requires an explicit project selection.
Without a project, open a folder first. The native modal displays the original result identity,
the full proposed new folder and both filenames before mutation:

```text
<project>/archi-agent-results/<UTC-time>-<bundle-UUID>/
  diagram.puml
  report.json
```

Names derive only from local UTC time and UUIDs. Cancel before save creates no files. Success
reports the location and offers **Open Diagram** / **Open Report**. Another explicit save creates
a new bundle UUID; the result UUID and creation time still identify the original generation.
Existing destinations, including empty folders, are rejected without overwrite or merging.

## Format and metadata

`diagram.puml` is the exact final PlantUML encoded as UTF-8. `report.json` is the ART1 version-1
boundary envelope (`format: archi-agent-artifact`). `generationReport` contains the existing
report contract unchanged for normal production results; consumers of the in-memory report are
unchanged. Provider metadata uses a field allowlist; unknown transport fields are omitted.
There is no third manifest and no cyclic report digest.

The envelope carries bundle/result identifiers, available diagnostic run ID, actual save time,
result creation time, diagram type, available extension version and report/knowledge contract
versions. No independent runtime version or versioned runtime-interface contract exists today:
these fields are explicitly `null`. Missing run IDs and source file-byte digests are also `null`,
not hashes reconstructed from current files.

`diagram` records relative filename `diagram.puml`, UTF-8 byte count and SHA-256 computed from
exact written bytes. `knowledge` captures the full K1 knowledge snapshot digest and the generation
snapshot/grounding digest (also present in the existing report), source logical IDs/kinds and
available document provenance original/text digests. Evidence and warnings remain in the report
and safe runtime warning projection. No full knowledge snapshot or extra source document copy is
written. Captured local source locations become project-relative references where possible;
outside-project sources use logical basenames with explicit availability. In-memory flows have
no physical source reference.

`configuration.projection` captures diagram type/path, generator kind, profile/model, effective
timeout, ambiguity selections and confirmed new participants from the original request. Provider
endpoint is explicitly omitted for privacy. No credentials, SecretStorage, headers, raw provider
errors, prompts or transport responses are serialized. Unsafe model identifiers are represented
as `null`.
The model identifier follows the shared core `isSafeModelId` contract, including `@` and `+`;
the provider profile identifier retains its separate contract. Safe model identifiers remain in
`generator`, `reviewer`, `modelGeneration` when present and in the configuration projection.
Different model variants therefore have different configuration digests.
Its deterministic SHA-256 uses the existing canonical JSON serializer: recursively
sort object keys by UTF-16 code units, preserve array order and Unicode, use JSON scalar encoding,
encode UTF-8, and add neither whitespace nor trailing LF. Unsupported values are rejected.
This is a safe configuration projection, not a configuration capable of replaying a run.

## Write, verification and rollback boundaries

The runtime accepts only its frozen, completed in-memory artifacts and locally created bundle
plans. It uses the K3 exclusive writer with two fixed names, canonical project containment,
link-free destination checks, exclusive `mkdir` and `wx+` files (mode 0600). Existing ancestor
identities and new directory/file identities are checked throughout. Both files' exact expected
bytes, sizes, digests and ownership proofs are verified before success; report diagram digest
therefore binds to the written diagram. Concurrent same-target saves have one winner.

This is a controlled operation transaction, **not atomic two-file publication**. Other readers
can see a new directory or one file while the write proceeds. There is no directory rename,
filesystem lock, descriptor-relative traversal API, crash recovery or fsync durability guarantee.
Portable Node path checks do not provide a race-free defence against a hostile process changing
paths between individual syscalls. Ordinary symlink/traversal attempts and observed replacements
fail closed. External edits after the final check are outside the completion boundary.

Cancel is checked before mutation, between writes and at final completion. An abort observed
before the final check fails the operation and invokes conditional cleanup. Returning the
verified receipt is the commit point; a later Cancel does not undo or relabel success.
Rollback deletes only this attempt's files whose inode/device, timestamps, size and digest still
match a proven state, and removes only unchanged empty created directories. Existing project
ancestors are guards, never cleanup targets. Partial writes without a content proof, foreign
files, replacements or edits are retained. Failure reports the exact proposed destination and
instructs the user to inspect retained data, keep edits and move preserved files or choose a new
location. No unconditional recursive destination deletion is used.
Retaining only a shared ancestor occupied by another completed bundle after this attempt's
destination was successfully removed is not incomplete cleanup. Retained files, edits, uncertain
ownership and cleanup errors still require inspection. Path failures identify symbolic links,
missing directories, non-directory parents or containment violations and give a concrete action
instead of advising a new bundle for an unchanged path problem.

## Evidence

`npm run art1:gauntlet` runs the local milestone gates sequentially in a unique `build/art1/`
directory, preserves earlier VSIX, checks source/package bytes and OCR assets, and exercises
runtime from the exact VSIX outside the repo with empty PATH/NODE_PATH. Real Extension Host
uses controlled picker answers and synthetic transport; native Mac ARM UI separately exercises
visible QuickPick, native flow-file dialog, confirmation/Cancel, both diagram types, open-report,
existing-target protection and repeated save. Synthetic transport confirms integration and call
counts; it is no evidence of live-model quality. Independent review and owner smoke are separate
statuses. Owner smoke remains DEFERRED until the owner reports it.
`ART1_AUDIT_FIXES=1 npm run art1:gauntlet` preserves the same required gates in a new
`build/art1-audit-fixes/` directory, uses the audited product checkpoint as its base and adds
model-identity assertions in both exact-VSIX diagram paths, shared-writer regressions and real
Extension Host language-change/actual-close scenarios in all three workspace modes.
