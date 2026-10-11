# UX4-FU2 model listing and selection

Base checkpoint: `d5fb95a4d060ef501566792d80b346e0fe1a79cb`.
Owner FAIL applies only to VSIX `eae14988c3f8fc6ae9d8f985aaf00c9803a454db1d4c1b825822d8e85e917f4a` (119875273 bytes).
The owner reported five successful GET /v1/models requests and inability to choose a model. The original response bodies/control state are unknown; successful HTTP alone is not considered a populated list.
Append-only observations and reproductions: `build/ux4-fu2/run-20261010-model-selection/`. Earlier owner profiles/forms/artifacts are unchanged. OWNER_SMOKE: NOT_COMPLETED.

## Observed reproduction

On the exact original VSIX in a fresh native VS Code profile:

- Ollama draft: Refresh Models disabled because the form is dirty.
- Ollama Apply → Refresh: model input enabled, datalist empty, loading complete, diagnostic `duplicate-model-id`.
- Closing/reopening: Ollama restored; explicit Refresh again yields the same empty list and safe failure code.

The currently available local Ollama HTTP200 response has five records, including two identical `gemma3:27b` entries; there are four exact distinct IDs. The local parser previously rejected the entire list for that duplicate. It is not claimed that the owner's unrecorded earlier responses were identical. Native baseline3 screenshots/state and captured response establish the present reproduction; baseline1 premature assertion and baseline2 CDP startup failure remain preserved.

## Updated contract

Every local list entry still passes the existing safe-ID check. Raw response size, entry count, content type, UTF-8, JSON, timeout, cancellation, redirects and literal-loopback validation remain unchanged. Repeated exact safe local IDs become one sorted choice; no trimming, aliasing, skipped unsafe entry or new model identity. Cloud parsers are unchanged.

Refresh Models captures the visible form's profile, endpoint and timeout without writing configuration. Fixed provider endpoints remain fixed. SecretStorage credentials are captured for that profile only; no values enter webview/state/logs. Check Provider Configuration retains applied settings and requires Apply/Discard when dirty. No generation, retry/fallback or implicit refresh.

Available models is a visible select with exact IDs and an explicit empty placeholder; Selected model retains manual exact-ID entry. A selection updates only the draft; Apply persists the existing selectedModel/selectedModelProfile binding. No automatic model choice. Discard/reopen/restart use saved settings. Model-only edits retain the catalog; profile/endpoint/timeout/settings/key/panel changes cancel/invalidate it. Publication sequence is separate from semantic request invalidation, so an unrelated state publication does not discard a current response. Loading ends on success, empty, invalid and failed response; recovery is explicit Refresh. New list-status messages are provided in English and Polish, without raw provider responses.

## Language status

There is no persistent EN | PL application switch in this checkpoint. Configuration HTML defaults to English (`lang=en`); new list-status text contains both EN and PL. That is not a language-switch implementation. Persistence of a selected language is NOT_IMPLEMENTED. User requested a factual status check; broader language implementation remains a separate scope unless explicitly added.

## Verification and remaining limits

Focused102/102 regression PASS, including four pre-dispatch cancellation cases added after independent source review. Full required UX4/ART1 + FU1 + FU2 profile `npm run ux4:gauntlet -- --fu2`: **294/294 PASS**, all15 commands exit0; root1702, extension546, focused509, both typechecks, build/package/verify, root/OCR audits0, demo and docs checks. Actual Extension Host99; native ART1 9, FU1 12, UX4/K3 28 and live FU2 4. Required final cases have no FAIL/NOT_RUN. Independent source review resolved one MEDIUM pre-dispatch race; final evidence verdict is recorded in final-manifest.json.

Final artifact: `build/ux4-fu2/final-20261011-models-42d9/archi-agent-0.3.0-alpha.4.vsix`,119876944 bytes, SHA-256 `80d45ce387b8b2e78779806303940fcb9318b96f58a0a4b747aa082ec1fb3235`. `gauntlet-final/fu2-live/` contains actual GET body, native installed-control observations, selection-before-Apply screenshot, saved binding, reopen/Discard and restart. Native automation chooses the exact installed SELECT option by its normal DOM input/change events, not the extension service. Unsuccessful CDP keyboard diagnostics remain preserved; they are not reported as successful native keyboard use. All earlier full/harness failures are retained in `earlier-attempts/`, and no old report was overwritten.

Post-gate changes are limited to unpackaged documentation status; final manifest records their hashes/delta. Source-package runtime byte parity remains identical. Local checkpoint identity and independent final review live beside that manifest. New owner environment `build/owner-smoke/ux4-fu2-20261011-models-42d9/` has65 initially NOT_RUN cases and a fresh profile. Configuration acceptance: Ollama draft → Refresh → Available models exact ID → Apply → reopen → actual restart. Results remain owner-controlled; automated PASS does not mean OWNER_SMOKE PASS.

Live scanned-PDF knowledge extraction still has no confirmed full PASS. FU1's updated live PDF evidence locations passed, but a malformed model row was strictly rejected; the earlier owner MD timeout was not reproduced. FU2 does not claim to fix or retest those generations. No models downloaded, Ollama server started or paid cloud requests made.
