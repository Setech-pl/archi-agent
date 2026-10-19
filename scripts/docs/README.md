# Documentation tools / Narzędzia dokumentacji

Edit docs/en/user-guide.md and docs/pl/user-guide.md as the single instruction source per language.
Synchronize the extension README files before packaging:

```bash
node scripts/docs/sync-help.mjs
```

Package and verify sequentially, using the scripts/profiles that exist in this branch's package.json.
Keep a baseline from the exact original branch sources and provide it explicitly to the checker:

```bash
node scripts/docs/check-docs.mjs <new-output-directory> <candidate.vsix> --help <baseline.vsix>
```

The checker validates links/anchors, PL/EN examples and diagram topology, offline language links,
packaged images/licenses and unchanged runtime/worker/OCR bytes. --help permits the changed Help
inside the extension bundle; the complete runtime and converter must remain byte-identical.
It does not replace semantic/translation review, owner smoke or functional tests.

Use render-diagrams.py with the separately locked render/package.json and package-lock.json;
install that tool environment with npm ci in a new folder. It is not a product dependency.
Capture scripts use real isolated VS Code windows, synthetic projects and the exact supplied VSIX.
macOS ScreenCaptureKit, Swift, Accessibility/Screen Recording and existing native picker helpers
are capture prerequisites; they do not change the product support claim. Never run GUI harnesses
concurrently or capture personal profiles. Current images keep original hashes and provenance.

Historical DOC1 GIF encoding/recording tools remain available for reproduction; their output is
local and ignored. Do not add the retired media back to product instructions. Keep new evidence,
raw frames, earlier failures, packages and report matrices outside tracked documentation.
