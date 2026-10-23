# OCR resources and developer tools

This directory contains active offline OCR dependencies, assets, pinned patches, licenses and
build/smoke tools. It is not an archive to remove. Product preparation uses
`build-trial.mjs --product-assets`; see [development EN](../../docs/en/development.md) /
[PL](../../docs/pl/development.md).

Historical measurement JSON and the external trial manifest are kept locally and in Git history.
They are not inputs to the current product build/tests. The trial builder writes trial-manifest.json
as an output when reconstructing the old trial from its exact alpha.3 baseline; the optional
verifier consumes an explicitly supplied external manifest. Neither needs a tracked historical
copy. Product assets use build/ux2-ocr/phase2/resource-manifest.json.

Retain TRIAL_NOTICES.md, licenses, patches, traineddata, all eight native platform archives and
locked dependencies. Preparation checks SRI and pinned PDF.js hashes, applies the patch with zero
fuzz, and rejects missing/corrupt resources. Inventory is not runtime acceptance on every platform.
The limits, cancellation and vector-text PDF handling are described in the
[document contract](../../docs/document-candidates.md) and [current state](../../docs/project-state.md).
