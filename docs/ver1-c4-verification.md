# VER1 / D3 / D4 — lokalny raport weryfikacji

Baza: `3e33a6a93811d723b21696618eba193ed6eb54e2`, branch `feature/ver1-c4-diagrams`.
Preflight: oczekiwany branch/HEAD, working tree clean, staging empty. Utworzono nową gałąź bez
cofania repo. Wspólny checkpoint całego przyrostu odczytaj z Git; jego SHA i tree wiąże
`build/ver1-c4/candidate-3/acceptance.json`. Nie wykonano push, merge, tagu ani publikacji.

| Etap | Wynik |
| --- | --- |
| VER1 | PASS — Sequence parser 0 LLM; proza 1 interpretacja; deterministyczna ocena K1, decyzje, provenance i alias SRC1 |
| D3 | PASS — C4 Context, jawny system i bezpośrednie otoczenie, bez kontenerów/zwijania relacji |
| D4 | PASS — C4 Container, źródłowa granica i przynależność, technologie/opisy i provenance |

Kontrakty: [VER1](ver1-flow-verification.md), [C4](c4-diagrams.md).
[Osobne review read-only](ver1-c4-independent-review.md): oba PASS, brak otwartych HIGH/MEDIUM.
Ustalenia naprawiono z regresjami; testów kolejnych re-review nie sumuje się z pełnymi bramkami.

## Wyniki tej sesji

Node 22.12.0, macOS ARM64. Runner: `scripts/ver1-c4-verify.mjs`; pełne bramki kandydata-3
z wykorzystaniem instalacji/audytów/OCR poprzedniego zaliczonego przebiegu po kontroli wersji
Node i fingerprintów niezmienionych wejść zależności. Oba lockfile'y bez zmian.

| Bramka | Wynik |
| --- | --- |
| npm ci root/OCR, oba audity i przygotowanie OCR | PASS; audity 0 podatności; dowody ponownie wykorzystane, nie ponownie wykonane |
| Oba typechecki | PASS |
| npm test -- --no-file-parallelism | 1893/1893, 119 plików PASS |
| npm run extension:test -- --no-file-parallelism | 696/696, 31 plików PASS |
| extension:build / extension:package / extension:verify | PASS |
| demo:dry-run, dokumentacja/PL-EN/online-offline/licencje, diff-check | PASS |
| Spakowany runtime poza repo, PATH/NODE_PATH puste | SRC1 3/3, K1 16/16, K3 15/15, ART1 14/14, VER1/C4 5/5 PASS |
| Rzeczywisty Extension Host | SRC1 13/13 + VER1/C4 17/17 PASS; single-folder/multi-root/global |
| Widoczne nowe UI, ui-final | 7/7 PASS; oba C4, natywny ART1, dobry/zły PlantUML, polski alias z natywnym zapisem i następna operacja |
| Regresja widocznego UI SRC1, src1-ui | 7/7 PASS; konfiguracja, Browser, Sequence/Component, ART1 i błędne źródło |
| Świeży build trzech bundle vs dokładny VSIX | Identyczne bajty, PASS |
| Oba lokalne rendery C4 | Obejrzane, czytelne, PASS |

Root i extension częściowo się nakładają. Warstwy Host, UI i runtime są osobnymi dowodami.
Host ma kontrolowane wybory edytora, lecz rzeczywiste dokumenty/zapis. UI steruje widocznymi
kontrolkami przez CDP oraz natywnym potwierdzeniem macOS. Transport LLM jest syntetyczny:
nowe UI wykonało dokładnie 4 żądania C4 i 1 interpretacji prozy; PlantUML, decyzje i zapisy
nie wykonały żądań LLM. To nie jest dowód jakości żywego modelu.

## Dokładny VSIX i obrazy

`build/ver1-c4/candidate-3/archi-agent-0.3.0-alpha.6.vsix`

- Rozmiar: **127259553 B**.
- SHA256: **`95728ca525ad4f93eaa69cee3d06886b7c0ac3214ed320a500836678ad06d207`**.
- extension.js: `6d8c1dac0cae5ab253fa25c2f4311115090c67eddfc2e31c6a8a2e111bc2cf8c`.
- runtime: `1cfc42a629485e99956a53477dd9acc9133d92193f870519bf0c3db5e332e896`.
- worker: `6883e1ca32aef7c66507d15f4f65d0d242eed6c4605fad5aa3b63f9645f0eef5`.

To nieopublikowany lokalny kandydat z dotychczasowym numerem manifestu; publiczne alpha.6
pozostaje wcześniejszą paczką. Pakiet nie zawiera fixture'ów, narzędzi testowych ani silnika
podglądu graficznego. Nie dodano zależności C4, zdalnych include ani zewnętrznych obrazów.

Rzeczywiste zrzuty VS Code: [Context](../build/ver1-c4/candidate-3/ui-final/context-editor.png),
[Container](../build/ver1-c4/candidate-3/ui-final/container-editor.png),
[natywny alias](../build/ver1-c4/candidate-3/ui-final/native-alias-saved.png).
Rendery dokładnego tekstu pochodzącego z VSIX: [Context](../build/ver1-c4/candidate-3/c4-context.png)
i [Container](../build/ver1-c4/candidate-3/c4-container.png). Zapisano hashe i rozmiary w
`visual-provenance.json`. Obrazy nie są generowane przez model ani odrysowywane.

Lokalny Graphviz miał niezgodny typ CPU; obrazy wyrenderowano istniejącym PlantUML z CLI
`-Playout=smetana`, bez zmiany plików PlantUML. To narzędzie odbioru, nie runtime fallback.
Context ma 4 elementy i 3 relacje. Container ma 5 kontenerów wewnątrz jawnej granicy oraz
osobę i dwa systemy zewnętrzne. Hierarchia i metadane pozostają dowodami źródła/nakładki.

## Zachowane nieudane próby i spójność

Nie nadpisywano wcześniejszych FAIL. Kandydat-1 zatrzymał się na starej asercji komunikatu
ART1 (1891/1892); po jej dostosowaniu kandydat-2 zaliczył testy 1892/1892 i 695/695.
Jego UI zatrzymał helper przeznaczony wyłącznie dla natywnego okna ART1. Zrzut ujawnił też
mnożenie grup edytorów w VER1; poprawiono zachowanie fokusu i dodano końcowe kontrole sesji.

Kandydat-3 ma końcowe pełne testy 1893/1893 i 696/696 oraz dokładny VSIX powyżej. Pierwsze
UI zachowuje FAIL helpera/synchronizacji; ui-retry-1 — nietrwałego toastu; ui-retry-2 —
animowanego położenia akcji. Osobny celowany ui-alias-only-1 dał 2/2 PASS. Po poprawie
harnessu końcowe ui-final dało całe 7/7 PASS na tym samym VSIX. Bez zmiany produktu po
pełnych testach; zmieniono wyłącznie dwa pliki harnessu UI, następnie dokumenty operacyjne.

`acceptance.json` łączy ważne pełne bramki, końcowe UI/regresje, review, fingerprinty oraz
bajtową zgodność świeżego buildu z VSIX. Oryginalny manifest z FAIL pozostaje zachowany.
Nie przypisuje się historycznego CI SRC1 ani wcześniejszych wydań nowemu kodowi.

## Granice odbioru

**OWNER_SMOKE DEFERRED; REMOTE CI VER1/D3/D4 NOT_RUN; WINDOWS ARM64 RUNTIME NOT_RUN.**
AUD-003–006 pozostają OPEN. Brak deklaracji M1 lub gotowości produkcyjnej. Zapis aliasu przez
natywny edytor ma kontrolę wersji/dirty/conflict i walidację przed `saved`; nie jest atomową
transakcją modelu i nakładki wobec dowolnych zewnętrznych writerów. Brak trwałych sesji po
reloadzie. Samodzielne packi mają aliasy sesyjne i nie dostarczają wymaganej hierarchii C4.

## Zbiorczy owner smoke

1. Zainstaluj dokładny VSIX po sprawdzeniu hash/rozmiaru. Skopiuj kompletny fixture Big Bank
   poza repo i ustaw model/nakładkę według [SRC1 owner smoke](src1-structurizr-source.md#owner-smoke--big-bank).
   Jawnie wybierz provider/model; zanotuj OS/architekturę i VS Code.
2. Create Diagram → C4 Context → Internet Banking System: sprawdź system, klienta, Mainframe
   i E-mail, brak wewnętrznych kontenerów. Container dla tego samego systemu: 5 kontenerów
   wewnątrz granicy, otoczenie poza nią, źródłowe relacje/technologie i raport hierarchii.
3. Zapisz oryginalną parę ART1, także po edycji preview; zapis nie powinien wywołać LLM.
   Sprawdź kontrolowany brak danych dla samodzielnego packa i brak kontenerów dla ATM.
4. Verify Flow: sprawdź zgodny Sequence z legendą Archi Agent, następnie zmień tryb/kierunek.
   Oczekuj ustaleń bez LLM. Nieobsługiwana składnia nie może dać pełnej zgodności. VER1 nie
   weryfikuje C4.
5. Wpisz `Banking API synchronicznie wywołuje Bazę Płatności.`. Potwierdź odmienioną nazwę jako
   Internet Banking System / Database, obejrzyj interpretację i provenance, zapisz alias
   natywnie i sprawdź następną operację. Zmień źródło przy oczekującym potwierdzeniu: bez
   automatycznego przeniesienia decyzji. Dirty/conflict ma zachować cudze zmiany.
6. Sprawdź generowanie Sequence/Component, Browser i K3 na samodzielnym packu. Zapisz osobny
   wynik właściciela z hashem VSIX i obserwacjami; syntetyczne testy agenta go nie zastępują.
