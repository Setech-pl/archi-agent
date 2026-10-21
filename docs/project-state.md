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

## Lokalny checkpoint — EAU1 + EAK1

Worktree `/private/tmp/archi-eau1-eak1`, branch `feature/eau1-eak1`, baza
`4dffbf4e474a57a57d046f78917af8de58e67369`; SHA lokalnego checkpointu odczytaj z Git.
Zachowano 17 zastanych zmian EAU1,
bez reset/stash i bez przełączania innych checkoutów. PR #13 pozostaje nietknięty.

EAU1: jawny wybór aktywnego JSON, dirty/untitled, przechwycenie przed pierwszym pickerem,
pozycje i fingerprint przechwyconego tekstu oraz ART1 `in-memory-input`. Plik/MCP zachowane;
błędny JSON nie uruchamia modelu. Historyczne kontrole poprzedniej sesji: 128 testów celowanych,
99 regresji, oba typechecki/build i dokumentacja — nie są bramkami bieżącego kandydata.

EAK1: nowa komenda/menu tworzenia katalogu zdolności biznesowych, zaznaczenie/cały aktywny
dokument/opis/wskazane pliki, dwa jawne tryby extraction/proposal. Reużyty bounded bundle,
konwerter Core/Full, konfiguracja/model/sekrety i klient providera. Przewijalny podgląd tylko
do odczytu poprzedza zgodę na maksymalnie jedno wywołanie; chmura wymaga osobnej zgody na koszt.
Ścisły kontrakt capabilities, dowody względem przechwyconej treści, stabilne ID, edycja i decyzje
w panelu; odrzucenie rodzica wymaga jawnych decyzji o dzieciach. Produkcyjna walidacja i odczyt
zapisanych bajtów poprzedzają `saved`. Nowe `enterprise.json` i `enterprise.review.json` mają
provenance rzeczywistej sesji URN/digest, bez promowania propozycji/edycji do faktów źródłowych.
Pokrycie partial, brak zgadywania ocen; istniejąca ścieżka mapy po zapisie ma zero kolejnych LLM.

Bieżące dowody i zachowane FAIL: ignorowany `build/eau1-eak1/`. Wspólny gauntlet wykrył
brak aktywacji komendy, brak przygotowanych archiwów OCR oraz HIGH developerskiego Vite;
manifest i kolejność przygotowania poprawiono, audit lockfile daje zero podatności i zachowuje
26 opcjonalnych bindingów. Root 2110/2110 i extension 824/824, oba typechecki, build,
package/verify Core/Full/CLI i dokumentacja/Help PL/EN przeszły dla wcześniejszego kandydata.
Po wąskiej poprawce z review: 66/66 testów celowanych, oba typechecki, build,
sekwencyjne package/verify Core/Full/CLI oraz dokumentacja/Help PL/EN — PASS. Pełnych suites
2110/824 nie powtarzano po tej poprawce. Dokładne końcowe paczki `acceptance-r5/packages`
przeszły runtime poza repo: EAU1/EAK1, EA1/EA1b, SRC1, VER1/C4 i ART1. Rzeczywisty
Extension Host: Core 21/21 i Full 21/21; widoczne UI EAU1/EAK1 oraz EA1b: po 6/6.
Ostrzeżenia konwersji pochodzą z przechwyconych materiałów, wymagają potwierdzenia niezależnie
od ostrzeżeń modelu i pozostają w zapisanym raporcie. Etykiety edycji pokazują decyzję użytkownika.
Niezależny review w osobnym kontekście: EAK-REV-001 MEDIUM zamknięte w rundzie 2,
zero nowych otwartych HIGH/MEDIUM. Zachowano wcześniejsze FAIL produktu i harnessów;
ich poprawne retesty są odrębnymi dowodami, nie zastępują historii.

Mały rzeczywisty smoke lokalnego Ollama `qwen3-coder:30b`: pierwsza odpowiedź odrzucona
za niekompletne evidence; po doprecyzowaniu promptu osobny smoke PASS — jedno wywołanie,
przegląd, zapis i mapa bez kolejnego LLM. Brak dalszego live smoke po poprawce ostrzeżeń;
ten mały przypadek nie dowodzi ogólnej jakości modelu. Płatny cloud i inne platformy: NOT_RUN.

Indeks bramek, końcowe paczki/SHA-256, review i SHA checkpointu:
ignorowane `build/eau1-eak1/acceptance-final.json` oraz `progress.json`.
OWNER_SMOKE: DEFERRED. Bez push/merge/tagów/release/publikacji i bez rozpoczynania
AUD-003/004, aktualizacji katalogów lub EA2. Następny wykonawca porównuje zapis z Git.
