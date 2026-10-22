# Project state

Porównuj stan z Git. [Roadmapa](product-roadmap.md) określa kierunek,
[workflow](development-workflow.md) proces, [architektura](architecture.md) kontrakty.

## EA3 + EA4 — prerelease published and verified (2026-10-22)

Full authorization: [release brief](plans/ea3-ea4-release-brief.md).
[Implementation plan](plans/ea3-ea4-implementation.md). Branch `release/ea3-ea4-release`,
durable isolated checkout `~/Projects/archground/build/ea3-ea4/integration`.
All 56 latest EAK2/EA2 source changes were preserved byte-for-byte in WIP `bf301e2`, then
extended with EA3/EA4. No newer EA3/EA4 work was found. Main `d91bbde` was already an ancestor.
Original worktrees and the manual r2 environment remain preserved. An initial linked worktree
at `build/ea3-ea4/worktree` has an unwritable index; the active independent checkout has writable Git.

Published [prerelease v0.3.0-alpha.8](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.8).
[PR #14](https://github.com/Setech-pl/archi-agent/pull/14) remains open, **not merged into main**.
PR #13 and previous releases/assets were not changed. Release source/tag target:
`a032a5dcedb1b6ddd53f1d637d2ae5cba3e18781`.
[Release CI 39743295041](https://github.com/Setech-pl/archi-agent/actions/runs/39743295041)
PASS on Linux x64 and macOS ARM64 for that branch head; actual tested merge checkout
`973e9ce13cb518d3d7160da0ece43a7b72b52c96`. Both trees equal
`6b729f819009a2fa7a4f2f1e98eb76a5332f9d84`.
The five package/demo files come from the single Linux artifact of that run. Release instructions
were assembled separately. The [manifest](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.8/release-manifest.json)
and [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.8/SHA256SUMS)
identify the exact bytes. Anonymous download of all ten assets, byte sizes, hashes and release
links in README/tutorials/packaged Help PASS. This final state update is documentation only;
its eventual branch HEAD is newer than the immutable package source. Check PR checks for that HEAD.

Implemented: strict enterprise/3 and fixed MCP v3 with v1/v2 compatibility; ordered stages,
explicit capability mappings/context/outcomes/provenance; EA2 application identities with domains,
optional owner/lifecycle and explicit scales (unknown differs from zero). Value Stream and
Application Landscape share deterministic, zero-provider runtime across VS Code, CLI and function
MCP, with source coverage/omissions/limits and original ART1 pairs. Guided forms, reviewed bounded
proposals, explicit identity binding, dependency checks and guarded saves preserve the v3 collections.
PL/EN documentation and offline Help, data-derived Retail renders and both new demo ZIPs are shipped.

Current-session gates: npm ci root/OCR, audits zero vulnerabilities, root 2186/2186 and extension
899/899, both typechecks/build and sequential Core/Full/CLI package/verify PASS. Vitest 5.0.5 retains
platform bindings. Exact-package regressions EAU1/EAK1/EAK2, EA1/EA2, SRC1, VER1/C4, ART1,
MCP stdio and AUD-003/004 (including real OCR) PASS. Two demo ZIPs: 69 checks; Retail local/MCP:
eight views PASS. Final downloaded CI Core/Full: ten new-view scenarios each PASS outside the repo
with empty PATH/NODE_PATH; one synthetic HTTP proposal call PASS, without claiming live model quality.
Real installed CI Extension Host Core/Full: nine scenarios each PASS, including both views and
LF/CRLF single/multi-root guarded saves. Controlled Host responses are not visible UI evidence.
Independent runtime review closed three MEDIUM; final docs review closed two MEDIUM. Final
package-byte parity and manifest/link review PASS; no open new HIGH/MEDIUM in the reviewed scope.
First failing suites/harnesses/CI runs remain recorded, not relabelled PASS.

Limits: local Code SIGABRT before Host and Computer Use denied Code access; local Host FAIL/NOT_RUN,
visible UI NOT_RUN. Local Ollama refused connection, live LLM NOT_RUN; paid providers untouched.
[Combined owner smoke](testing/ea3-ea4-owner-smoke.md): **DEFERRED**. Historical safe-conflict LOW
remains unresolved, with no evidence of data loss or false saved status; guarded save is not atomic
filesystem CAS. Additional native platforms are not claimed. AUD-005/006 remain OPEN. This is an
evaluation prerelease under the explicit publication exception, not full owner acceptance.

Operational evidence: ignored `build/ea3-ea4/acceptance-report.md`, `public-download-verification.json`,
`ci-payload-parity.json`, `ci-final-host/` and review reports in the active checkout. One historical
scratch report was inadvertently overwritten by a copied driver and regenerated from preserved old
bundles; its original byte identity cannot be asserted. See `acceptance/report-recovery.md`.
No source, package or manual r2 environment was changed by that incident.
STOP: publication and verification complete. No further feature or main merge is authorized here.
The following sections are historical records and do not override this release state.

## EAK2 + EA2 — code review PASS, odbiór BLOCKED (2026-10-21)

Worktree `/private/tmp/archi-eak2-ea2`, branch `feature/eak2-ea2`, baza i nadal HEAD
`a820752d655c8f1ef370ee2f22a1584d80ac34e7`. Pełny [brief](plans/eak2-ea2-brief.md)
zachowano jako pierwszą zmianę; [konkretny plan i API](plans/eak2-ea2-implementation.md).
Zmiany pozostają niezacommitowane, staging pusty. Bez push, merge, tagów i publikacji.

Zaimplementowano zamrożoną aktualizację lokalnego katalogu, jawne decyzje/diff/tożsamość,
provenance pól, kontrolę zależności i natywny zapis VS Code z produkcyjnym odczytem.
Enterprise/2 dodaje aplikacje/powiązania/pokrycie; v1 pozostaje bez migracji. EA2 działa
we wspólnym runtime, VS Code, CLI/function MCP i ART1, zero LLM dla renderowania. Nowy
stały `get_enterprise_snapshot_v2` / contractVersion 2; stare enterprise i knowledge v1 ścisłe.
Kontrakty, Retail i Help PL/EN uzupełnione. Bez EA3/EA4.

Pełny wspólny gauntlet r0: root 2165 PASS + 2 FAIL z 2167, extension 878 PASS + 2 FAIL
z 880 — nieaktualne oczekiwania menu po dodaniu funkcji. Poprawione; retest 56/56 PASS.
Instalacje/audity root/OCR (0 podatności), OCR, oba typechecki/build i package/verify PASS.
Po poprawce konfliktów ocen i 3 MEDIUM z niezależnego review: 145/145 celowanych,
oba typechecki/build, nowe sekwencyjne Core/Full/CLI package/verify i Help/docs/diff PASS.
Pełnych suites po tych wąskich poprawkach nie powtarzano. Druga niezależna runda zamknęła
wszystkie 3 MEDIUM; brak otwartych HIGH/MEDIUM w przejrzanym kodzie. Reviewer sam odtworzył
ostrzeżenia, legalne ID new/reject z dziećmi i blokadę drugiej ekstrakcji przed providerem.

Dokładne końcowe paczki `build/eak2-ea2/common-r2/packages/` mają odbiór
`build/eak2-ea2/acceptance-r2/`: runtime poza repo, stare/nowe procesy MCP stdio,
CLI/function MCP parity, EAU1/EAK1/EA1/EA1b/SRC1/VER1/C4/ART1 i realny OCR PASS;
nowy rzeczywisty Extension Host Core/Full po 12/12, dodatkowe poprawki review z paczek
po 4/4. Poprzednie r1 mają także pełne stare Hosty, w tym AUD-003/004; to osobne paczki.

**Blokada wymaganego widocznego UI nadal obowiązuje.** Próba domknięcia na dokładnym Core r2
użyła istniejącego runnera CDP i prawdziwych kontrolek Code, bez wywoływania testowanych handlerów
przez API. `files.simpleDialog.enable=true` udostępnia wybór pliku w Code, a `window.dialogStyle=custom`
potwierdzenie zapisu. Przeszły interakcje kontrolek, zapis/odczyt, ID/linki/provenance, konflikt
obcych bajtów, mapa z modelCalls 0 i oryginalna para ART1. Nie są pełnym dowodem widoczności:
renderer potrafił zgłaszać `visibilityState=hidden` mimo bringToFront/hasFocus. Dodatkowa aktywacja
konkretnego PID i kontrola visible przy wejściach również nie utrzymały widoczności całego przebiegu.
Wymagane kompletne scenariusze widocznego UI pozostają niewykonane; wcześniejsze FAIL zachowano.
Jeden początkowy niespodziewany conflict zachował dysk i poprawny bufor, ale jego przyczyna
pozostaje nierozstrzygnięta; późniejsze udane zapisy nie są dowodem naprawienia tej obserwacji.
Krótki niezależny review dowodów i instrukcji: brak nowych HIGH/MEDIUM w tym przekazaniu;
historyczny safe conflict pozostaje otwartą obserwacją LOW, wymagany UI nadal BLOCKED.

Przed próbami zabezpieczono wszystkie 56 zmienionych/nowych plików, patch, bazę i wybrane dowody
w `~/Projects/archi-agent-audits/eak2-ea2-ui-closure-20261021-214035`.
W tym katalogu **`manual-ui-r2/ODBIOR-UI.md`** zawiera gotowy krótki odbiór właściciela,
`Open isolated UI.command` uruchamia już zainstalowany dokładny Core w oddzielnym trwałym profilu
i projekcie z dwiema świeżymi kopiami syntetycznymi. Instalację porównano z 15 wpisami VSIX.
Instrukcja obejmuje wyłącznie brakujące widoczne scenariusze i anulowania; skrypty przygotowują
obce bajty i zbierają weryfikację dysku, nie poświadczają kliknięć. Nie zmieniano ustawień,
uprawnień ani źródeł właściciela. Izolowane okno automatyzacji zatrzymano.
Przygotowane osobne środowisko ręczne uruchomiono; jego kliknięć/obserwacji nie zaliczono.

Wszystkie 366 fingerprintów końcowego r2 nadal zgodne; kodu nie zmieniono, paczek nie przebudowano,
suites/gauntletu nie powtarzano. Staging pusty, bez commita. Zgodnie z workflow ta wymagana
bramka blokuje checkpoint; odrębny OWNER_SMOKE/MANUAL_SMOKE DEFERRED go nie blokuje.
Darmowy live provider, natywne Windows/Linux i CI NOT_RUN. AUD-005/006 nadal OPEN.

Kontynuacja: porównaj worktree i backup z Git. Zbierz brakujące obserwacje/screenshoty według
gotowej instrukcji na r2, bez powtarzania zakończonych kontroli. Po zaliczeniu wymaganej bramki
sprawdź raport, krótki review nowych dowodów i diff/staging, zaktualizuj stan, a następnie utwórz
autoryzowany lokalny checkpoint. Nie rozpoczynaj kolejnego milestone.
Pełny indeks komend, zachowane FAIL, review, SHA-256/rozmiary paczek i owner smoke:
ignorowane `build/eak2-ea2/acceptance-report.md` oraz `acceptance-final.json`.
Poniższe wcześniejsze sekcje opisują historyczne checkpointy, nie odbiór tych zmian.

## Dostępne w tej gałęzi

Sequence, Component, C4 Context/Container i Verify Flow Sequence/proza; Markdown, Structurizr JSON + overlay i MCP; dokumenty, OCR, review/nowy pack, ART1, Browser i Help PL/EN. CLI/function MCP współdzielą runtime. Kandydat EA1/EA1b dodaje Capability Map z lokalnego katalogu lub MCP, zero LLM i ART1.

## Dystrybucja — historyczny DEMO1

Publiczne [DEMO1 v0.3.0-alpha.7-demo.1](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1): Core, Full, CLI i dwa ZIP-y demo.
Źródła paczek: `83747d3815806f09554298ce9c4e487881932d59`; tożsamość określają publiczne
[manifest](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/release-manifest.json)
i [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS).
Main po PR #10 zawiera funkcje DEMO1, lecz ma inne SHA niż paczki. Kandydat integracji EA1/EA1b
pozostaje poza publicznym wydaniem; publiczne ZIP-y nie zawierają katalogu enterprise. Nie deklarujemy stable/Marketplace.

## Otwarte ustalenia i granice dowodów

- **AUD-003 CLOSED w lokalnym AUD-FIX2:** potwierdzony NEW przechodzi reviewed Sequence,
  renderer i zapis ART1 z `user-confirmed`; niepotwierdzony/odrzucony NEW nadal blokuje.
- **AUD-004 CLOSED w lokalnym AUD-FIX2:** wektorowy tekst trafia do lokalnego OCR Full
  w auto/all. Biały render, obrazy i wynik OCR mają oddzielne znaczenie; pusty wynik OCR
  nie potwierdza pustej strony. Publiczne paczki DEMO1 nadal pochodzą ze starszych źródeł.
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
- AUD-001/002 zamknięto w naprawie ABA; AUD-003/004 w lokalnym AUD-FIX2.
  AUD-005/006 pozostają OPEN; brak deklaracji M1/production readiness.
  Dowody natywne dotyczą głównie macOS ARM64; inventory zasobów nie jest testem innych platform.

## AUD-FIX2 — lokalny odbiór, STOP przed aktualizacjami katalogów i EA2

Worktree `/private/tmp/archi-aud-fix2`, branch `fix/aud-fix2`, baza
`7e0352d03b3cb981fd49cc196276f82a303d4b1e` — kompletny lokalny checkpoint EAU1/EAK1.
SHA checkpointu AUD-FIX2 odczytaj z Git. Nie przełączano innych checkoutów ani nie zmieniano
ich stagingu; bez push, merge, tagów, release i publikacji.

Preflight potwierdził istniejący checkpoint EAU1/EAK1, 45 fingerprintów zmienionych plików,
702 fingerprinty przed tamtym review z siedmioma jawnymi późniejszymi zmianami oraz SHA
wszystkich trzech paczek acceptance-r5. Świeży build bazy odpowiada bajtowo trzem bundlom r5,
a trzy źródła procesu OCR odpowiadają Full r5. Tamten odbiór i niezależny review były domknięte;
nie tworzono zbędnego kolejnego commita ani nie powtarzano całego starego odbioru.

AUD-003: naprawiono odrzucanie lokalnie potwierdzonego NEW, niedozwolone znaki w lokalnym
ID oraz deklarację renderera. ID pochodzi z istniejącej alokacji aliasów z kontrolą kolizji;
walidator nadal wymaga endpointu ze snapshotu. Snapshot, bezpośredni raport i zapisany oryginał
ART1 zachowują `user-confirmed`; interakcje są `user-stated` i wymagają dokładnego review.
Brak potwierdzenia, Cancel, odrzucenie, kolizje nazw/aliasów i wymyślony endpoint modelu nadal
blokują. Bez zapisu NEW do Structurizr/packa, bez dodatkowych wywołań lub pętli repair/retry.

AUD-004: brak wyekstrahowanego tekstu i obrazów rastrowych nie stanowi już warunku blank.
Full sprawdza wyrenderowaną stronę; widoczne kształty wektorowe trafiają do OCR auto/all.
Coverage/provenance zachowują numery stron, `imageCount`, `ocrText` recognized/empty i
`blankAssessment: rendered-white`. Ostrzeżenia odróżniają pusty wynik OCR od białego renderu;
Core zachowuje uczciwe `requires-ocr`/`ocr-unavailable`. Nie jest to dowód bezbłędnej klasyfikacji
wszystkich PDF. Istniejące limity, offline PL/EN i anulowanie pozostają.

Bieżące bramki: root 2125/2125 i extension 838/838, instalacje/audity root/OCR (0 podatności),
przygotowanie OCR, oba typechecki/build i sekwencyjne package/verify Core/Full/CLI PASS.
Po znalezieniu utraty `origin` w allowliście ART1: 148/148 testów celowanych, oba typechecki,
build i nowe package/verify PASS; pełnych suites ponownie nie uruchamiano. Niezależnie potwierdzono,
że ostatnia zmiana bundle to wyłącznie to pole allowlisty, pozostałe bundle/OCR są identyczne.

Dokładne końcowe paczki `build/aud-fix2/common-r1/packages/` przeszły świeży odbiór
`build/aud-fix2/acceptance-r3/`: EAU1/EAK1, EA1/EA1b, SRC1, VER1/C4, ART1 i stare MCP knowledge
v1/CLI/function MCP poza repo; Help PL/EN i dokumentacja przeciw niezależnie zbudowanym paczkom.
Rzeczywisty Host: EAU/EAK Core i Full po 21, EA1 18, EA1b 19, K3 33; nowe naprawy Core 12/12,
Full 15/15. Widoczny UI EAU/EAK i EA1b po 6/6; nowe naprawy Core 4/4 i Full 5/5.
PDF 19/19 używa rzeczywistego konwertera i OCR dokładnego Full; dodatkowe 3/3 potwierdzają
NEW i zapis provenance PDF w EAK1. Nie zastępowano Host/UI dublerem.
Końcowy niezależny read-only review: PASS, zero otwartych HIGH/MEDIUM i nowych LOW;
reviewer sam odtworzył obie reprodukcje przed/po oraz rzeczywisty zapis pochodzenia ART1.

Obie reprodukcje wykonawca i niezależny reviewer powtórzyli na dokładnych r5: NEW
`unknown-endpoint` po jednym żądaniu (nazwa ze spacją: schema-violation), wektorowy PDF auto/all
błędnie blank. Po zmianie: potwierdzony NEW success przy dwóch wywołaniach, a Full odczytuje
`VECTOR TEXT CONTENT`. Wcześniejsze reprodukcje z katalogu `pr6d7R` okazały się oparte na starszym
kandydacie EAU/EAK; są zachowane wyłącznie jako historyczne. Oryginalny zewnętrzny katalog audytu
2026-10-12 nie istnieje pod zapisaną ścieżką; nie odtworzono jego plików ani usuniętych dokumentów.

Indeks komend, dokładne SHA-256, review, historia FAIL i krótki owner smoke:
`build/aud-fix2/acceptance-report.md` i `build/aud-fix2/acceptance-final.json`.
OWNER_SMOKE: DEFERRED. Żywy LLM/płatny cloud, natywne Windows/Linux i remote CI: NOT_RUN w tym
zadaniu; syntetyczne transporty nie dowodzą jakości modelu. Nie rozpoczęto aktualizacji katalogów,
EA2–EA4, nowych diagramów ani integracji.

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
OWNER_SMOKE EAU1/EAK1: DEFERRED. Powyższa sekcja opisuje historyczny checkpoint przed
AUD-FIX2; nie obejmował on AUD-003/004, aktualizacji katalogów ani EA2. Następny wykonawca
porównuje bieżący stan z Git i aktualnym odbiorem AUD-FIX2.
