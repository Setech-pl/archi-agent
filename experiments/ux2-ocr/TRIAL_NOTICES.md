# UX2 OCR trial — third-party notices

This trial VSIX retains the published alpha.3 files and adds the packages below. The
alpha.3 `extension/THIRD_PARTY_NOTICES.md` already covers its bundled `unpdf` 1.7.0
and embedded PDF.js 5.6.205. Exact npm integrity values are in `package-lock.json`;
SHA-256 of every distributed resource is in `trial-manifest.json` beside the experiment;
the VSIX contains an identical copy for inspection.

The `pdfjs-dist` 4.10.38 legacy display module is modified by
`patches/pdfjs-dist-4.10.38-operator-list-error.patch` to propagate failed
operator-list streams to both public APIs and reject render after a confirmed
image decode failure for ordinary, repeated and shared images. An unresolved
image dependency remains pending. The matching PDF.js worker is unchanged.
The original, patch, modified module and worker SHA-256 values are in the external
manifest. The modification retains the upstream Apache-2.0 license and notice.

| Component | Version | License | Distributed license text |
| --- | --- | --- | --- |
| Official `pdfjs-dist` legacy build | 4.10.38 | Apache-2.0 | `node_modules/pdfjs-dist/LICENSE` |
| PDF.js standard fonts | 4.10.38 | Foxit and Liberation notices | `node_modules/pdfjs-dist/standard_fonts/LICENSE_FOXIT`, `LICENSE_LIBERATION` |
| `tesseract.js` | 6.0.1 | Apache-2.0 | `node_modules/tesseract.js/LICENSE.md` |
| `tesseract.js-core` | 6.1.2 | Apache-2.0 | `node_modules/tesseract.js-core/LICENSE` |
| `tessdata_fast` pol, eng | 4.1.0 | Apache-2.0 | `assets/lang/LICENSE-tessdata-fast` |
| `@napi-rs/canvas` and eight platform bindings | 0.1.97 | MIT | `node_modules/@napi-rs/canvas/LICENSE`; binding packages declare MIT in `package.json` |
| Skia in native canvas bindings | upstream Skia in canvas 0.1.97 | BSD-3-Clause | `licenses/SKIA-LICENSE` |
| `unpdf` | 1.7.0 | MIT | `node_modules/unpdf/LICENSE` |
| `bmp-js`, `is-url`, `node-fetch`, `regenerator-runtime`, `tr46`, `whatwg-url`, `zlibjs` | locked versions | MIT | license files or package metadata in their package directories |
| `idb-keyval`, `wasm-feature-detect` | locked versions | Apache-2.0 | license files or package metadata in their package directories |
| `webidl-conversions` | 3.0.1 | BSD-2-Clause | `node_modules/webidl-conversions/LICENSE.md` |

Sources: https://github.com/mozilla/pdf.js, https://github.com/naptha/tesseract.js,
https://github.com/naptha/tesseract.js-core,
https://github.com/tesseract-ocr/tessdata_fast,
https://github.com/Brooooooklyn/canvas, https://skia.org.
