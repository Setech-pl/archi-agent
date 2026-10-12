# DOC1 local tooling

English / Polski: these contributor tools check documentation and record actual UI. / Narzędzia wykonawcy sprawdzają dokumentację i nagrywają prawdziwe UI.

Render dependencies are pinned in `render/package.json` and `render/package-lock.json`. They are outside the root/extension dependency sets and never shipped in the VSIX. Four low-severity npm advisories were reported by the isolated render-tool install; no audit fix or runtime dependency change was made. / Zależności renderowania są osobne; instalacja zgłosiła cztery advisory LOW. Nie zmieniono zależności runtime ani nie wykonano audit fix.

Use a new temporary tool folder, copy these two manifest files there, then install the lock with `PUPPETEER_SKIP_DOWNLOAD=1 npm ci --ignore-scripts`. Use local Chrome; no diagram or project source is sent to a rendering service. / Skopiuj oba manifesty do nowego folderu tymczasowego, instaluj lock i używaj lokalnego Chrome. Kod/diagramy nie trafiają do serwisu renderującego.

From the repo root / z root repo:

```bash
python3 scripts/docs/render-diagrams.py /private/tmp/doc1-render-tools/node_modules/.bin/mmdc build/docs-pl-en/<unique-run>/diagrams
node scripts/docs/record-ui.mjs build/docs-pl-en/<unique-run>/candidate/archi-agent-0.3.0-alpha.4.vsix /private/tmp/doc1-record-<unique-run>
python3 scripts/docs/encode-media.py /private/tmp/doc1-record-<unique-run> docs/assets build/docs-pl-en/<unique-run>/media
node scripts/docs/check-docs.mjs build/docs-pl-en/<unique-run> build/docs-pl-en/<unique-run>/candidate/archi-agent-0.3.0-alpha.4.vsix
```

Replace placeholder directory names. Do not overwrite an earlier candidate or capture. Encoding intentionally replaces the three named final media only after a successful capture. / Zastąp nazwy placeholderów. Nie nadpisuj wcześniejszych kandydatów/nagrań. Kodowanie zastępuje nazwane media finalne tylko po poprawnym nagraniu.

Recording needs macOS ScreenCaptureKit (macOS 14+ for SCScreenshotManager), VS Code at `/Applications/Visual Studio Code.app`, `code` in PATH, Xcode Command Line Tools/Swift, Accessibility and Screen Recording permission for the harness launcher, plus ffmpeg/ffprobe for encoding. macOS 14+ is a recorder requirement, not a new product support declaration. GUI tools need execution outside the filesystem sandbox. It installs the exact VSIX using existing `prepareVscode`, verifies installed bytes, then uses existing CDP input and native Accessibility picker/confirmation helpers. Only a new `/private/tmp/ux3-*` user/extension profile and synthetic project are changed. ScreenCaptureKit filters windows by that process PID and keeps that isolated app foreground while recording; no personal VS Code settings change. Do not run another GUI harness or Chrome renderer during capture.

Nagrywanie wymaga powyższych lokalnych narzędzi oraz zgód macOS Accessibility/Screen Recording. macOS 14+ dotyczy nagrywarki, nie nowej deklaracji wsparcia produktu. GUI działa poza sandboxem. Używa istniejących helperów CDP/Accessibility oraz nowego profilu/projektu w `/private/tmp`. Capture filtruje okna według PID i utrzymuje izolowane okno na pierwszym planie. Nie uruchamiaj równocześnie innego harnessu GUI ani renderera Chrome.

`record-ui.mjs` sends actual UI input; the loopback server alone supplies synthetic StructuredChat responses. It asserts two Sequence requests, one extraction request, zero additional ART1/review/edit/save requests, actual file counts/digests and setting scope. Raw PNG frames preserve measured capture times; encoding keeps order/timing, with 1 fps output and a 96-color palette. Inspect decoded first/middle/last images and all native dialog transitions. No drawn UI, AI-generated animation, live-model quality claim or manual smoke is involved. / Skrypt steruje rzeczywistym UI; tylko transport odpowiada syntetycznie. Sprawdza liczbę żądań, pliki, hashe i scope. Surowe PNG mają czasy przechwycenia; kolejność i czas są zachowane. Sprawdź klatki i dialogi; nie jest to dowód jakości LLM ani manual smoke.

`check-docs.mjs` checks current entrypoint links/anchors, exact PL/EN fenced examples, diagram topology, settings, packaged links/licenses/notices and unchanged runtime/OCR bytes against FU-01's preserved candidate. It does not replace human semantic/translation/media review or functional product tests. The packaged English README is normalized by vsce to `readme.md`; the Polish packaged language switch intentionally uses that spelling. / Checker nie zastępuje review treści, tłumaczeń, mediów ani testów produktu. vsce normalizuje nazwę README EN do `readme.md`; polski przełącznik pakietu używa tej nazwy.

Native picker frames are cropped to their actual content and action buttons, excluding the system sidebar with personal home/network labels. The crop uses local macOS Vision only to identify picker frames; no UI is redrawn and no OCR text is saved. Full owned-window capture is used for other frames. / Klatki natywnych pickerów są kadrowane do rzeczywistej zawartości i przycisków, bez systemowego paska z osobistymi etykietami katalogu domowego/sieci. Lokalny Vision tylko rozpoznaje klatki pickera; UI nie jest odrysowywane i tekst OCR nie jest zapisywany. Pozostałe klatki pokazują własne okno.

The recorder reactivates only an inactive owned app. ScreenCaptureKit error -3811 is retried at most three consecutive times against the same owned window; other errors stop capture. Failed samples are never invented; frame timestamps retain actual gaps. / Nagrywarka aktywuje tylko nieaktywne własne okno. Błąd ScreenCaptureKit -3811 ponawia najwyżej trzy razy pod rząd na tym samym oknie; inne błędy przerywają capture. Nie tworzy brakujących klatek, a znaczniki czasu zachowują rzeczywiste przerwy.

Cropping also covers two adjacent raw samples around detected pickers, so translucent presentation/dismissal frames exclude the personal sidebar too. / Kadrowanie obejmuje też po dwie sąsiednie surowe klatki wokół rozpoznanych pickerów, aby wyłączyć osobisty sidebar podczas półprzezroczystego otwierania/zamykania okna.

For a help-only checkpoint, use `node scripts/docs/check-docs.mjs <output-directory> <candidate.vsix> --help <baseline.vsix>`. Supply the exact technically verified baseline: this checks runtime, worker and OCR byte parity while allowing the localized Help change in the extension bundle. It also checks bundled PL/EN examples against repository guides. The original DOC1 default baseline remains unchanged.
