# Project state

Porównuj stan z Git. [Roadmapa](product-roadmap.md) określa kierunek,
[workflow](development-workflow.md) proces, [architektura](architecture.md) kontrakty.

## Dostępne w tej gałęzi

Sequence, Component; Markdown; dokumenty, OCR, review/nowy pack, ART1, Browser i Help PL/EN. Ta historyczna gałąź nie zawiera późniejszych SRC1/VER1/C4/MCP1.

## Dystrybucja

Historyczna gałąź dokumentacji/testowego wydania alpha.5/alpha.6. Jej zakres funkcji określa
własny kod, a dokładne publiczne paczki i źródła wskazują [wydania](https://github.com/Setech-pl/archi-agent/releases).
Nie przenosimy tu funkcji aktualnego main. Publikacja nie jest odbiorem produkcyjnym.

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

## Aktywne zadanie

PORTFOLIO-CLEANUP: konsolidacja dokumentacji bez zmian zachowania produktu.
Wycofane materiały są zachowane lokalnie poza repo i w historii Git; nie należy
synchronizować innych checkoutów bez zabezpieczenia ich własnych kopii.
Wyniki bieżących kontroli i macierz gałęzi pozostają w raporcie poza repo.
Dalsze zmiany funkcjonalne wymagają osobnego zatwierdzonego zadania.
