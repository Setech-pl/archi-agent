# Archi Agent — EA3 + EA4 + publikacja GitHub
Pełne zlecenie właściciela — 2026-10-22
Zalecany model: GPT-6.1 Sol, effort high.

## 1. Obowiązujące zadanie i uprawnienia

Dokończ EA3 Value Stream i EA4 Application Landscape, zintegruj dotychczasowe lokalne przyrosty, zaktualizuj dokumentację PL/EN i opublikuj nowe GitHub prerelease z instalatorami i demonstracjami.

To zlecenie jest samowystarczalne. Zastępuje starsze skróty, STOP przed EA2 oraz zakazy push/tagów/publikacji w poprzednich zadaniach. Nie wymaga dostępu do wcześniejszej rozmowy.

Autoryzowane:
- plan techniczny, implementacja, naprawy, testy i niezależny review;
- lokalne commity, w tym jawnie opisany WIP zabezpieczający nieodebraną pracę;
- push nowej gałęzi integracyjnej, utworzenie/aktualizacja właściwego PR;
- uruchomienie wymaganych workflow CI;
- nowy tag i publikacja GitHub prerelease oraz jego assets;
- aktualizacja opisu PR i GitHub About, jeśli zakres tego wymaga.

Bez merge do main, force-push, przepisywania historii, usuwania gałęzi, nadpisywania istniejących tagów/assets, publikacji Marketplace/Open VSX/npm registry i płatnych wywołań LLM.

## 2. Najpierw znajdź właściwy front prac

Repo główne: ~/Projects/archground
GitHub: Setech-pl/archi-agent

Starsza zakończona baza:
a820752d655c8f1ef370ee2f22a1584d80ac34e7
fix/aud-fix2
/private/tmp/archi-aud-fix2
Zawiera EAU1/EAK1 i zamknięcie AUD-003/004.

Późniejsza implementacja:
feature/eak2-ea2
/private/tmp/archi-eak2-ea2

Ostatni znany stan EAK2/EA2:
- 56 zmian ponad a820752, jeszcze bez checkpointu odbiorowego;
- katalog enterprise/2 i get_enterprise_snapshot_v2;
- stare kontrakty v1 zachowane;
- aktualizacja katalogu, przegląd różnic, stabilne ID, provenance, konflikty i kontrolowany zapis;
- Capability–Application Map, VS Code/CLI/MCP i ART1;
- techniczne kontrole oraz review PASS;
- widoczne UI FAIL/NOT_RUN z powodu niedostępności automatyzacji;
- bez nowych HIGH/MEDIUM, jedna niewyjaśniona uwaga LOW dotycząca bezpiecznego konfliktu;
- owner smoke DEFERRED.

Dokumenty w worktree EAK2/EA2:
docs/plans/eak2-ea2-brief.md
docs/plans/eak2-ea2-implementation.md
build/eak2-ea2/acceptance-report.md

Dokładny Core common-r2:
build/eak2-ea2/common-r2/packages/archi-agent-core-0.3.0-alpha.7.vsix
SHA-256: 1966238ec34137b75273b0ad6a55bf785d0dddfbc7ae62fe137fec3da539da0a

Ręczny odbiór r2:
 /Users/marcinkrzetowski/Projects/archi-agent-audits/eak2-ea2-ui-closure-20261021-214035/manual-ui-r2/ODBIOR-UI.md

EA3/EA4 mogły zostać rozpoczęte później w innym worktree. Nie zakładaj, że powyższy stan jest najnowszy.

Odczytaj instrukcje repo, git worktree list, lokalne gałęzie i ostatnie commity oraz statusy właściwych checkoutów. Ustal, gdzie znajduje się kompletny najnowszy zakres. Jeżeli EA3/EA4 już istnieją, przejmij je i dokończ zamiast implementować ponownie.

Jeśli aktywna inna sesja wykonuje ten sam zakres, nie dubluj jej zmian: ustal jej worktree i przygotuj koordynację/handoff. Nie kończ ponownie raportem samego AUD-FIX2.

Zachowaj cudze zmiany, zajęte checkouty i istniejące środowisko ręcznych testów r2. Bez reset/stash/clean i samowolnego kasowania plików. Zabezpiecz źródła w trwałym miejscu, jeśli nadal są wyłącznie w /private/tmp.

Możesz utworzyć jawny lokalny WIP dla EAK2/EA2, jeśli jeszcze go nie ma. To zabezpieczenie pracy z zachowanym UI FAIL/NOT_RUN, nie deklaracja odbioru PASS.

## 3. Trwały brief i plan

Zachowaj pełną kopię tego dokumentu w najnowszym worktree:
docs/plans/ea3-ea4-release-brief.md

Opracuj lub uzupełnij:
docs/plans/ea3-ea4-implementation.md

Zapisz w project-state aktywną gałąź/worktree, bazę, postęp i następny krok. Plan ma określać konkretne typy/API, wersje, limity, UX, pliki i testy. Zatwierdzone są cele i granice tego zlecenia; szczegóły schematów zaprojektuj na podstawie repo. Nie wymagaj odszukiwania nieistniejącego wcześniejszego kontraktu.

Dalsze prace wykonuj w izolowanym worktree/gałęzi opartym na pełnym EAK2/EA2. Nie wracaj do starszego EA1b ani samego a820752 z pominięciem późniejszych funkcji.

## 4. EA3 — Value Stream

Modeluj:
- stabilne ID i nazwę strumienia;
- jawny kontekst lub odbiorcę wartości;
- uporządkowane etapy ze stabilnymi ID;
- oczekiwane rezultaty, jeśli podane;
- jawne powiązania etapów z capabilities;
- provenance i deklarowany zakres pokrycia.

Minimalny model jest strumieniem uporządkowanych etapów. Bez silnika BPMN, workflow wykonawczego i symulacji. Kolejność jest informacją źródłową lub decyzją użytkownika, nie przypadkowym porządkiem rekordów.

Etap i capability mają odrębne znaczenie i tożsamość. Dopuszczaj wiele zdolności na etap oraz wspólne zdolności dla etapów/strumieni. Brak relacji w częściowym źródle nie dowodzi braku zdolności w firmie.

Z gotowych danych deterministycznie generuj PlantUML i raport: etapy, kolejność, relacje, dowody, zakres i ograniczenia. Zero LLM podczas renderowania.

## 5. EA4 — Application Landscape

Reużyj aplikacje i tożsamości EA2. Nie twórz drugiego katalogu portfela.

Obsłuż:
- grupowanie według jawnej domeny biznesowej;
- filtrowanie zakresu;
- opcjonalnego właściciela;
- opcjonalny cykl życia;
- kolorowanie według jawnej, zdefiniowanej skali.

Pola opcjonalne mogą pozostać nieznane. Aplikacja bez domeny jest widoczna w widoku całego portfela. Brak oceny odróżnij od jawnego zera.

Nie zgaduj kosztów, technologii, ryzyka, właścicieli i ocen strategicznych. Wiele aplikacji w domenie nie oznacza automatycznie redundancji. Brak capability mapping nie oznacza bezużyteczności.

## 6. Dane, przegląd i kompatybilność

Nowe informacje wprowadza się świadomie przez istniejące wzorce EAK1/EAK2:
- ręczne dodanie/edycja;
- propozycje LLM z opisu, zaznaczenia lub wybranych materiałów;
- przegląd, poprawki i akceptacja;
- kontrolowany zapis.

Ręczna edycja JSON nie jest podstawowym UX. Nie buduj rozbudowanego nowego workbencha. Reużyj konfigurację providerów, credentiale, konwertery i limity.

Rozróżniaj fakt źródłowy, propozycję modelu i decyzję użytkownika. Nie wymyślaj evidence, lokalizacji, ocen, właścicieli i kolejności. Akceptacja propozycji nie tworzy cytatu w starym dokumencie.

Zbadaj rzeczywisty enterprise/2 i MCP v2. Zaprojektuj minimalne wspólne rozszerzenie EA3/EA4. Nowe pola w strict formacie wymagają jawnej wersji. Zachowaj:
- katalogi v1/v2;
- get_enterprise_snapshot v1;
- get_enterprise_snapshot_v2;
- get_knowledge_snapshot v1;
- EA1 i EA2.

Bez przymusowej migracji i cichego odrzucania danych. EAK2 zachowuje nowe kolekcje i referencje. Usunięcie powiązanego elementu wymaga jawnego rozstrzygnięcia zależności. Zachowaj stabilne ID po rename i guarded save z kontrolą wersji/digestu, bez obietnicy atomowego filesystem CAS.

## 7. Hosty i artefakty

Oba widoki udostępnij w VS Code Create Diagram → Enterprise Architecture, CLI i istniejącym function MCP. Dane lokalne i odpowiednio wersjonowane enterprise MCP.

Semantyka i walidacja pozostają we wspólnym runtime. Core bez zależności VS Code. Hosty cienkie. Bez nowych ogólnych frameworków źródeł, dowolnego tool-use modelu i zdalnego zapisu do źródła wiedzy.

Z gotowego katalogu:
- zero LLM i brak wymogu providera;
- bezpieczny deterministyczny PlantUML;
- snapshot/digesty, provenance, zakres i pominięcia w raporcie;
- zapis oryginalnej pary ART1;
- jawne limity węzłów, relacji i rozmiaru;
- przekroczenie wymaga zawężenia, bez cichego obcinania.

## 8. Demo, testy i review

Rozszerz syntetyczny Retail: od potrzeby zakupowej do otrzymania zamówienia, etapy i rezultaty, capability mappings, aplikacje w kilku domenach, lifecycle, oceny i brakujące informacje.

Podczas pracy testy celowane. Po obu milestones jeden wspólny odpowiedni gauntlet zgodnie z instrukcjami repo:
- wymagane instalacje/audity;
- root/extension tests;
- oba typechecki i build;
- sekwencyjne Core/Full/CLI package/verify;
- dokumentacja, Help PL/EN i diff-check;
- dokładne paczki poza repo;
- rzeczywiste MCP stdio i parytet hostów;
- regresje EAU1/EAK1/EAK2, EA1/EA2, SRC1, VER1, C4, ART1 i AUD-003/004;
- rzeczywisty Extension Host;
- dostępne widoczne UI;
- niezależny review w osobnym kontekście.

Przypadki: kolejność etapów, ID i referencje, rename, częściowe źródła, brak danych/ocen i jawne zero, aplikacja bez domeny, limity, deterministyczność, pochodzenie decyzji, konflikt zapisu i aktualizacja bez utraty danych.

Zamknij nowe HIGH/MEDIUM. Wyjaśnij istniejącą uwagę LOW o bezpiecznym konflikcie; jeśli okaże się błędem krytycznym lub utratą danych, napraw przed publikacją.

Nie powtarzaj niezmienionych pełnych kontroli bez powodu. Zmiany kodu wymagają adekwatnej ponownej weryfikacji. Stare PASS pozostają historyczne. Zachowaj FAIL.

UI nie zastępuj wywołaniem handlerów. Gdy automatyzacja nie działa, udokumentuj przyczynę, zachowaj FAIL/NOT_RUN i przygotuj zbiorczy test ręczny. Nie powtarzaj bez końca tej samej metody.

Żywy lokalny model tylko jeśli już dostępny bez kosztu i bez zmiany konfiguracji właściciela; inaczej NOT_RUN. Testy syntetyczne nie dowodzą jakości modelu.

## 9. Granica publikacji prerelease

Jawnie dopuszczam GitHub prerelease z OWNER_SMOKE: DEFERRED, brakiem live LLM i dodatkowych platform oraz UI NOT_RUN/FAIL wynikającym wyłącznie z udokumentowanej niedostępności infrastruktury automatyzacji.

To nie zwolnienie z naprawiania błędów produktu. Potwierdzone krytyczne błędy produktu i otwarte HIGH/MEDIUM blokują publikację. Nie zmieniaj statusów niewykonanych testów na PASS. Nie przedstawiaj dopuszczenia prerelease jako pełnego odbioru funkcjonalnego.

Nie publikuj niezaimplementowanych EA3/EA4 jako gotowych. Najpierw dokończ zakres. Zapisz krótko rzeczywiste ograniczenia w release notes i instrukcji testów.

## 10. Integracja z aktualnym GitHub

Sprawdź remote main, otwarte PR, tagi i wydania. Stan PR #13 nie jest z góry znany.

Przygotuj osobną gałąź integracyjną łączącą aktualny main z pełnym przyrostem:
EAU1/EAK1 → AUD-003/004 → EAK2/EA2 → EA3/EA4.

Zachowaj historię, gdzie to możliwe. Konflikty rozwiązuj treściowo. Zachowaj portfolio cleanup, dokładne .gitignore, obowiązujące instrukcje i aktualne media. Nie przywracaj usuniętych starych raportów/screenshotów.

Nie wykonuj ponownie porządków na wszystkich dawnych gałęziach. Nie zamykaj cudzych PR ani nie zmieniaj zajętych checkoutów.

## 11. Wersja, dokumentacja i media PL/EN

Wybierz kolejny wolny numer prerelease zgodny z polityką repo. Sprawdź manifesty, CLI, lockfile i nazwy paczek. Nie publikuj kolejnych różnych paczek jako alpha.7. Nie nadpisuj istniejącego DEMO1, tagów i assets.

README.md, README.pl.md, instalacja, konfiguracja, user guide, CLI/MCP, Help i kontrakty muszą odpowiadać kandydatowi.

Prowadź użytkownika przez korzyści i zastosowania, rzeczywiste wyniki, pobranie Core i gotowego demo oraz pierwszy rezultat.

Pokaż:
- weryfikację przepływów i istniejące diagramy;
- Structurizr i MCP;
- budowanie/aktualizację katalogu;
- Capability Map;
- Capability–Application Map;
- Value Stream;
- Application Landscape.

Najbardziej czytelne aktualne obrazy umieść wysoko w README. Diagramy renderuj z danych i kodu kandydata. Screenshoty wyłącznie z rzeczywistego UI. Render diagramu nie jest screenshotem aplikacji.

Bez milestone diaries, decyzji właściciela, hashów i liczników testów w marketingowych opisach. Zachowaj krótkie rzeczowe wymagania: własny provider dla LLM, zero providera dla widoków deterministycznych, zewnętrzny renderer podglądu jeśli nadal wymagany.

Raporty operacyjne w ignorowanym build lub poza repo. Aktualne kontrakty i instrukcje pozostają śledzone. Nie zamykaj AUD-005/006 wyłącznie zmianą statusu bez dowodów.

## 12. Dwa gotowe projekty demo

Sprawdź Retail i Mission Control z nowymi paczkami.

Retail: aktualne katalogi enterprise i ćwiczenia wszystkich nowych widoków oraz ich budowania/aktualizacji. Mission Control: zachowane działające ćwiczenia CLI/MCP i dokumentowe. Tutoriale PL/EN.

Przygotuj dwa nowe ZIP-y zgodne z tym wydaniem. Bez node_modules, sekretów, konfiguracji osobistej i logów operacyjnych.

VSIX ma działać bez repo/npm/osobnego Node. CLI podaje prawdziwe wymagania runtime. Nie podmieniaj starszych publicznych archiwów.

## 13. PR, CI i pochodzenie paczek

Wypchnij gałąź integracyjną i utwórz lub zaktualizuj właściwy PR. Opis zaczyna się od problemu użytkownika i nowych możliwości.

Uzyskaj PASS CI Linux x64 i macOS ARM64 dla aktualnego head. Rozróżnij head gałęzi i faktycznie testowany merge checkout. Po zmianach wersji sprawdź końcowe paczki.

Preferuj komplet artefaktów jednego wskazanego przebiegu CI, jeśli workflow je tworzy. Przy lokalnych paczkach wykaż zgodność z testowanymi źródłami i nie nazywaj ich artefaktami CI.

Tag wskazuje dokładny końcowy commit źródeł wydania. Jeśli CI testowało merge checkout, wykaż jego związek z tagowanym drzewem. Nie przypisuj starego CI nowym źródłom.

## 14. GitHub prerelease i assets

Utwórz nowe wydanie prerelease z gałęzi integracyjnej bez merge main. Pokaż ten stan w PR.

Dołącz:
- Core VSIX;
- Full VSIX;
- CLI/MCP TGZ;
- dwa ZIP-y demonstracyjne;
- SHA256SUMS;
- manifest z wersją, źródłowym SHA, nazwami, rozmiarami i hashami;
- krótką instrukcję wyboru paczki i uruchomienia PL/EN.

Checksumy dotyczą dokładnie publikowanych bajtów. Manifest nie zawiera sekretów i zbędnych lokalnych ścieżek.

Release notes: korzyści, nowe funkcje, pobranie, start i istotne ograniczenia. Bez historii sesji. Nie publikuj stable/production readiness.

Linki README/Help muszą wskazywać nowe assets. Bez niejawnej zmiany zależności dokumentacji na zewnętrzny dostęp; Help offline nadal działa.

## 15. Kontrola po publikacji i wynik

Sprawdź anonimowe pobranie wszystkich assets, rozmiary i SHA-256. Zweryfikuj linki README, tutoriali i Help. Zaktualizuj PR, project-state i GitHub About, jeżeli wymaga tego zakres.

Na końcu podaj:
- URL prerelease i PR;
- tag i dokładny źródłowy SHA;
- CI oraz testowany head/merge checkout;
- linki Core/Full/CLI i obu demo;
- manifest i checksumy;
- ukończone funkcje i prawdziwe ograniczenia;
- krótki zbiorczy owner smoke;
- stan Git oraz lokalizację trwałego briefu/planu.

Nie kończ raportem samego a820752. Wynikiem tego zadania jest nowy zakres EA3/EA4 i zweryfikowana publikacja albo konkretny pozostały rzeczywisty blocker.

STOP po publikacji i jej sprawdzeniu. Bez merge main i kolejnych features.
