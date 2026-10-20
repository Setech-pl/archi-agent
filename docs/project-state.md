# Project state

Porównuj stan z Git. [Roadmapa](product-roadmap.md) określa kierunek,
[workflow](development-workflow.md) proces, [architektura](architecture.md) kontrakty.

## Dostępne w tej gałęzi

Sequence, Component, C4 Context/Container i Verify Flow Sequence/proza; Markdown, Structurizr JSON + overlay i MCP; dokumenty, OCR, review/nowy pack, ART1, Browser i Help PL/EN. CLI/function MCP współdzielą runtime. Kandydat EA1/EA1b dodaje Capability Map z lokalnego katalogu lub MCP, zero LLM i ART1.

## Dystrybucja

Publiczne [DEMO1 v0.3.0-alpha.7-demo.1](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1): Core, Full, CLI i dwa ZIP-y demo.
Źródła paczek: `83747d3815806f09554298ce9c4e487881932d59`; tożsamość określają publiczne
[manifest](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/release-manifest.json)
i [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS).
Main po PR #10 zawiera funkcje DEMO1, lecz ma inne SHA niż paczki. Kandydat integracji EA1/EA1b
pozostaje poza publicznym wydaniem; publiczne ZIP-y nie zawierają katalogu enterprise. Nie deklarujemy stable/Marketplace.

## Otwarte ustalenia i granice dowodów

- **AUD-003 OPEN (medium):** potwierdzony NEW w reviewed Sequence może dać
  `unknown-endpoint` po jednym żądaniu. Dokumentacja nie naprawia tego błędu.
- **AUD-004 OPEN (medium):** wektorowy tekst PDF może zostać uznany za blank bez OCR,
  również w trybie all; ryzyko utraty treści pozostaje.
- **AUD-005 OPEN (low):** nieaktualne opisy publikacji wymagają niezależnego closure/retest.
- **AUD-006 OPEN (low):** przygotowanie archiwów OCR wymaga kompletnej procedury i odbioru
  świeżego klonu. Sama korekta instrukcji nie zamyka ustalenia.
- Owner smoke dokładnych aktualnych paczek: **DEFERRED**. Żywy LLM/płatny cloud,
  Windows ARM64 runtime i wykonanie setup PowerShell: **NOT_RUN** w odbiorze DEMO1.
  Wyniki syntetyczne nie potwierdzają jakości modelu; stare PASS nie są testem tego commita.
- Pełny live build packa ze skanu i natywny wybór modelu klawiaturą pozostają
  niepotwierdzone. Dawnego timeoutu MD nie odtworzono. **Q-04**: korelacja wyników
  w pickerze ART1 nadal wymaga owner smoke.
- Brak update/merge istniejących packów, trwałych draftów, atomowego zapisu wielu plików,
  crash recovery/fsync i trwałego przełącznika języka aplikacji. ART1 zapisuje oryginał.
  Graficzny podgląd PlantUML wymaga osobnej obsługi. Natywny picker może zwrócić
  symboliczne `/tmp`; wybierz zwykły folder zamiast obchodzenia walidacji.
- AUD-001/002 zamknięto w naprawie ABA; nie zamyka to AUD-003–006 ani M1.
  Dowody natywne dotyczą głównie macOS ARM64; inventory zasobów nie jest testem innych platform.

## Aktywne zadanie — EA-INTEGRATION1

Integracja w izolowanym worktree `/private/tmp/archi-ea-integration1`, gałąź
`feature/ea1-ea1b-integration`, baza `d91bbdebcfbdf0414d64b18343147eb4b6f60278`.
Zachowana historia DOC3/EA1/EA1b do `7efa83f5fbe3c3c3da637676ff6316f831b9177f`;
dokumentacja łączy nowe instrukcje z porządkami main. Wycofane raporty i media nie wracają.
Kod produktu identyczny z kandydatem `2ddcf21367ce5834097859331641be48ce19ff86`.
Po pierwszym CI PR #13 zmieniono wyłącznie trzy pliki testowe: canonical tmpdir zamiast
macOS-only /private/tmp oraz 30 s dla wieloprocesowego testu parytetu (asercje i limity
produktu bez zmian). Bieżący head i testowany merge checkout są identyfikowane w CI PR.
Dowody integracji i kopie historycznych raportów pozostają w ignorowanym `build/ea-integration1/`.
Bramki z 19.10 oraz późniejszy review EA1b są historyczne; nie są wynikiem nowego merge.
Bieżąca weryfikacja integracji: oba typechecki, 255 testów celowanych, build, sekwencyjne
package/verify Core/Full/CLI, dokumentacja obu VSIX i Help PL/EN PASS. Dokładne paczki poza
repo: parytet lokalne/MCP/CLI/funkcje, EA1 Core/Full, Structurizr, VER1/C4 i ART1 PASS;
osobny stary protokół wiedzy v1 PASS. Rzeczywisty Host 37/37, Help 2/2, widoczny UI
map lokalnych/MCP 11/11 PASS; zapisane oryginały mają identyczny PlantUML i semantykę raportu,
modelCalls=0. Potwierdzone 178 odcisków per-file; runtime i OCR zgodne z dawnym kandydatem.
Pełnych lokalnych suites EA1b nie ponawiano wyłącznie z powodu merge SHA. Historia UI
pozostaje przy poprzednich paczkach; bieżące dowody mają nowe SHA paczek. Dwie uwagi
niezależnego review zamknięto w pełnej konfiguracji Help offline i opisie providera PL.
Końcowy niezależny review dowodów PASS: 0 otwartych nowych HIGH/MEDIUM/LOW. PR/CI do main
są osobnymi kontrolami; stan oraz tożsamość head/merge checkout są w raporcie poza repo i w PR.
OWNER_SMOKE: DEFERRED. Nie deklarujemy sprawdzenia importu EA ani COM.
PR [#13](https://github.com/Setech-pl/archi-agent/pull/13) jest otwarty. Pierwszy run CI
wykazał te problemy testów; jego FAIL jest zachowany osobno od następnego przebiegu.
Po sprawdzeniu CI aktualnego head STOP; bez merge/release, AUD-003/004 i EA2.
