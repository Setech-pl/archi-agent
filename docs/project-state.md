# Project state

Operacyjny stan Archi Agent. Porównuj z Git; kierunek produktu: [roadmapa](product-roadmap.md), reguły: [AGENTS.md](../AGENTS.md), proces: [development-workflow.md](development-workflow.md). [Historia do 2026-10-11](project-state-history.md) zachowuje raporty, checkpointy, wyniki i pierwotne formularze.

## Snapshot — 2026-10-12

- Dokumentacja i pomoc PL/EN opublikowane na `fix/ux4-model-selection`; [PR #5](https://github.com/Setech-pl/archi-agent/pull/5) do main pozostaje draftem. Następny etap: niezależny audyt architektury i kodu oraz ocena jego wyników. Dalsza implementacja, scalenie i wydanie są odrębnymi etapami.
- Gałąź: `fix/ux4-model-selection`. Baza dokumentacyjnego checkpointu: `6863a303800d9f81d2eb0e1ef11aa1a8fa7161ef`; rodzic FU2: `d5fb95a4d060ef501566792d80b346e0fe1a79cb`. Praca w istniejącym worktree FU2; starsze worktree zachowane. Preflight: clean, staging empty. Tożsamość finalnego commita ustal w Git/PR, bez samoodwołującego się SHA w pliku.
- Implementacja: Configuration z draft/applied Apply/Discard, Available models + jeden Selected model, Knowledge Browser, build z dokumentów i aktywnego bufora, K3 review i nowe packi, Sequence/Component i kontrolowany zapis oryginalnej pary ART1. Help otwiera bundlowany README PL dla języka VS Code pl, EN w pozostałych przypadkach; oba pliki mają przełączające odnośniki offline.
- Publiczne alpha.4 z `31a6609` to wcześniejsze UX2. Numer wersji branch VSIX pozostaje `0.3.0-alpha.4`; nie utworzono nowego wydania.

## Istniejące dowody techniczne

Manifest lokalny `build/ux4-fu2/final-20261011-models-42d9/final-manifest.json` w głównym repo wiąże checkpoint `6863a303800d9f81d2eb0e1ef11aa1a8fa7161ef` z gauntletem **294/294 PASS**, root1702/extension546/focused509, typecheckami, instalacjami/audytami0, pakowaniem, runtime poza repo, Host99 i UI9+12+4+28. Niezależny review bazowego kandydata PASS0 HIGH/MEDIUM/LOW. Przed checkpointem f03a2b3 porównano źródła/runtime/testy/OCR z fingerprintami manifestu: zgodność PASS. To wyniki historyczne.

Bazowy VSIX: **119876944 B**, SHA256 `80d45ce387b8b2e78779806303940fcb9318b96f58a0a4b747aa082ec1fb3235`. Zmiana kodu w checkpointcie f03a2b3 obejmowała wybór języka Help. Pełny gauntlet nie jest powtarzany dla tekstów; runtime/worker/OCR finalnego pakietu porównano bajtowo do tej bazy: zgodność PASS. Nowe kontrole pomocy i dokumentacji raportowane są osobno poniżej.

## Weryfikacja checkpointu f03a2b3 — wyniki historyczne

Kontrole wykonane dla checkpointu f03a2b3 w worktree `fix/ux4-model-selection`, po ponownym preflight i zastosowaniu zgodnego fingerprintem zestawu zmian:

- `npm run typecheck` oraz `npm run extension:typecheck`: **PASS**.
- `npx vitest run test/vscode-extension/extension-command.test.ts test/vscode-extension/ux1-commands.test.ts test/vscode-extension/packaging.test.ts`: **88/88 PASS** (74 komenda/menu +14 pakowanie). Pakowanie wykonano sekwencyjnie.
- `npm run extension:package -- --out <candidate>` i `npm run extension:verify -- <VSIX>`: **PASS**, **531 wpisów**, obie instrukcje offline w pakiecie. Linki/kotwice, identyczne przykłady PL/EN w repo i pakiecie, topologia Mermaid, nazwy ustawień, licencje/notices oraz **523 wpisy runtime/worker/OCR** zgodne bajtowo z bazą FU2: **PASS**.
- Rzeczywisty Extension Host z finalnego VSIX: komenda Help otworzyła preview EN; bundlowana instrukcja PL otworzyła się w tym samym hoście: **2/2 PASS**. Automatyczny wybór PL/PL-regional/EN/innego języka: testy komendy **4/4 PASS**. Ten Extension-test Host zgłasza en mimo --locale=pl i polskiego language packa; automatyczny wybór PL w rzeczywistym hoście pozostaje **NOT_CONFIRMED**.
- **10 diagramów Mermaid** wyrenderowano lokalnie do SVG/PNG w przygotowanym snapshotcie; finalne opisy A/B ponownie wyrenderowano (4/4). Kontrola wizualna diagramów komponentów/przepływu; źródła Mermaid są zgodne z plikami finalnego worktree. Historia trzech dokumentów zachowana w całości, odnośniki archiwum **PASS**.
- Kontrola wzorców credentiali całego zakresu względem main: **PASS**, brak ustaleń. `git diff --check`: **PASS**; finalną kontrolę staging i commita zapisano w lokalnym manifeście publikacji.
- Finalny VSIX: wersja **0.3.0-alpha.4**, **119881879 B**, SHA256 `905c9df0da2ba8d796c6835928e8049ebd41cc73ff4c8860c66ad4b89bd861f1`. Lokalizacja w głównym repo: `build/docs-help/run-20261012-publication/candidate/archi-agent-0.3.0-alpha.4.vsix`. Dowody: `build/docs-help/run-20261012-publication/`; wcześniejsze próby zachowane w `/private/tmp/archi-doc-validation/build/docs-help-20261012/`.
- Robocze wcześniejsze próby nie są finalnym PASS: równoległe pakowanie kolidowało ze staging OCR, dubler wymagał Uri.joinPath, sandbox blokował loopback, a próby --locale=pl nie zmieniły rzeczywistego języka hosta. Poprawne sekwencyjne reruny i ich granice podano wyżej; historycznych FAIL nie nadpisano.
- Pełny gauntlet294/294 i niezależny review bazowy pozostają historyczne; ich zastosowanie potwierdzono fingerprintami i bajtami runtime/worker/OCR. Dodatkowego niezależnego audytu nie wykonano: zgodnie z zadaniem następuje po push w osobnej sesji.

Publikowany zakres względem main obejmuje całą zachowaną historię od OBS1 do UX4-FU2 oraz ten checkpoint dokumentacji/pomocy. Gałąź GitHub: [fix/ux4-model-selection](https://github.com/Setech-pl/archi-agent/tree/fix/ux4-model-selection). Dokładny SHA znajduje się w Git i PR; metadane checkpointu f03a2b3 są w lokalnym `publication-manifest.json`; brak tagu, nowego release i scalenia PR.

## Aktualna korekta dokumentacji — 2026-10-12

Dokumentacja i pomoc PL/EN opisują projekt bez osobowych deklaracji akceptacji. Notatki historyczne rozróżniają testy ręczne i automatyczne; wyniki, SHA oraz identyfikatory dowodów zachowują swoje znaczenie. Metadane demonstracji i ich generator używają etykiety MANUAL_SMOKE.

Kontrole: odnośniki wszystkich41 dokumentów, zgodność przykładów PL/EN, składnia generatora metadanych i `git diff --check` — PASS. Build/package/verify — PASS, 531 wpisów VSIX. **529 wpisów** są identyczne bajtowo z pakietem checkpointu f03a2b3, w tym wszystkie trzy bundle wykonywalne i OCR. Zmiana pakietu obejmuje wyłącznie oba README pomocy; testy funkcjonalne i Extension Host nie były ponawiane dla korekty tekstów.

Pakiet: `build/docs-help/run-20261012-impersonal/candidate/archi-agent-0.3.0-alpha.4.vsix`, **119881711 B**, SHA256 `20b54b401edf8983a17d1a3d6b7d2c463368345501c0599a19f9fcd00534d644`. Dowody: `build/docs-help/run-20261012-impersonal/` w głównym repo. Pełny gauntlet i poprzednie testy pozostają opisane wyżej jako wyniki historyczne. Kod produktu i zasady generowania nie zmieniły się.

## Ograniczenia i zakres audytu

Audyt rozpocznij od opublikowanego HEAD i diffu względem github/main. Zakres całej gałęzi: OBS1 → UX3 → K1–K3 → ART1 i naprawy → DOC1 → UX4/FU1/FU2 → ta dokumentacja/help. Kontrakty: [architektura](architecture.md), [reviewed pipeline](reviewed-diagram-pipeline.md), [dokumenty](document-candidates.md), [review/save](knowledge-pack-review.md), [ART1](diagram-artifact-save.md), [Configuration](configuration-workbench.md), [FU1](ux4-owner-findings.md), [FU2](ux4-model-selection.md).

Sprawdź granice host/runtime/core/Node, limity/anulowanie, SecretStorage i granice webview, wiązanie modelu, provenance i nieufne wyniki, oryginalną parę ART1 oraz pakowanie. Dowody bazowe są lokalne w build i nie trafiają do VSIX; [historia](project-state-history.md) zawiera ich identyfikatory. Bieżący checkpoint nie zastępuje niezależnego audytu.

Znane ograniczenia: Mac ARM jest platformą z dowodami natywnymi; brak potwierdzenia równoważnego E2E pozostałych platform, wcześniejszy pełny live build ze skanu niepotwierdzony, pierwotny MD timeout niezreprodukowany, automatyczny keyboard wybór modelu niepotwierdzony. Brak trwałych draftów/historii, merge/update packów, atomowego zapisu/crash recovery, pełnego przełącznika języka aplikacji, MCP/Chat/C4/ArchiMate. Graficzny PlantUML preview wymaga osobnej obsługi.
