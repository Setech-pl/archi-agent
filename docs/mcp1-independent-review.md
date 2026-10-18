# MCP1 / MCP1-KNOW — niezależny review

Osobny kontekst: `mcp1_plan_review`. Przeglądy planu i implementacji wykonano read-only;
jedyną później autoryzowaną edycją reviewera jest ten raport. Nie zmieniano implementacji,
stagingu ani historii Git. Data: 2026-10-18.

**Status końcowy: PASS w zweryfikowanym zakresie lokalnym kandydata C5.**
Niezależnie odczytano kod poprawek, fingerprint, komplet 44 bramek oraz raporty dokładnych
paczek. Brak otwartych ustaleń blokujących lokalny checkpoint MCP1/MCP1-KNOW.
Brak otwartych HIGH/MEDIUM.
Owner smoke pozostaje DEFERRED; żywy LLM, remote CI i Windows ARM64 pozostają NOT_RUN.
Nie jest to wynik publikacji ani akceptacja właściciela.

Baza: `ea3df0a73067f66a7e5fe8d2b8053c6059a8861d`.
Gałąź przeglądanego working tree: `feature/mcp1-cli-mcp-core-full`. Staging podczas
kontroli przed końcową edycją raportu był pusty; implementacja pozostawała niezacommitowana.

## Review planu

Przeczytano [AGENTS.md](../AGENTS.md), [workflow](development-workflow.md),
[ADR 0002](adr/0002-deterministic-diagram-plan-renderers.md), roadmapę i architekturę,
pełny [plan MCP1](plans/mcp1-cli-mcp-core-full.md) oraz kontrakty SRC1, VER1 i C4.
Następnie osobno oceniono uzupełnienie `MCP1-KNOW` przed jego implementacją.

| Waga | Ustalenie | Uzgodniona korekta |
| --- | --- | --- |
| HIGH | Guard `activate` nie rozwiązuje statycznych kolizji Core/Full ani dynamicznego włączenia drugiego ID | Współinstalacja z jednym włączonym profilem. Oba włączone: jawny konflikt, blokada operacji, anulowanie bieżącej pracy, ręczna decyzja użytkownika i reload. Bez automatycznego wyłączania, kopiowania sekretów ani twierdzenia o bezkolizyjnej współaktywacji. |
| MEDIUM | Zamknięty `HostResultV1` nie wyjaśniał położenia MCP `continuation` | Ścisła koperta transportu; kontynuacja tylko dla `flow.verify/needs-resolution`, ta sama treść w structured output i kopii tekstowej. |
| MEDIUM | Istniejący bounded reader nie przypinał sam uprawnień procesu do readRoots | Niezmienna polityka z tożsamościami rootów, egzekwowana przy rzeczywistych odczytach i ponownych odczytach sesji, także dla modelu i overlay. |
| MEDIUM | Normalized MCP wymaga również kontroli odwołań i konfliktów po projekcji do packa | Reużycie K1, `crossFileIssues` i istniejących indeksów; bez osobnego resolvera lub oceny. |
| MEDIUM | Wersja contributions i odtworzenie lokatorów mogły rozjechać lokalne/MCP źródło | Wspólna kanoniczna wersja, rzeczywiste contributions z produkcyjnego mappera SRC1, bez zgadywania `record.location` z pierwszego provenance. |
| MEDIUM | Domyślne ustawienia SDK nie spełniały limitu, poufności stderr i dowodu cleanup | Jawny limit ramki, brak przekazywania stderr dziecka, potwierdzenie jego faktycznego zamknięcia. |
| MEDIUM | Sam zakres manifestu nie egzekwuje User-only konfiguracji executable | Odczyt `inspect(...).globalValue`, zamrożona konfiguracja w sesji i kontrola jej zmiany przed kontynuacją. |

Podstawą ustalenia o statycznych deklaracjach był także kod lokalnego VS Code **1.142.0**:
handler commands ponownie dodaje metadane tego samego ID i zgłasza duplikat; handler views
odrzuca drugie ID; rejestracja configuration odrzuca późniejszą property. Deklaracje są
obsługiwane przed aktywacją rozszerzenia. `getExtension` korzysta z registry Extension Host;
kod workbench usuwa z niego wyłączone rozszerzenia. Nie zastępuje to rzeczywistych testów
obu ID, obu kolejności instalacji i dynamicznej zmiany enablement.

Werdykt obu review planu: do implementacji po wskazanych rutynowych doprecyzowaniach.
Nie stwierdzono potrzeby dodatkowej decyzji produktowej ani nowej warstwy architektury
poza jawnym zleceniem właściciela. Opcjonalny prawdziwy lokator i referencja źródła
domykają istniejący kontrakt wymiennego źródła; nie uzasadniają fikcyjnego `remote.md:1`.

## Ustalenia implementacyjne

Poniższe błędy zgłaszano wykonawcy podczas pracy. Poprawki wykonał wykonawca. Status
„poprawione w kodzie” opisuje odczyt aktualnych źródeł. Końcowe dowody C5 poniżej
zamykają wcześniejsze wymagania ponownej weryfikacji.

| ID | Waga | Dowód problemu | Stan po poprawce |
| --- | --- | --- | --- |
| MCP1-R01 | HIGH | `knowledge-transfer.ts` scalał pack przez klucz wartości bez location/provenance. Dwie relacje o równych wartościach i różnych oryginalnych ID/liniach dawały jedną deklarację po MCP, mimo identycznego snapshotu K1. | Poprawione. Projekcja zachowuje deklaracje i kolejność; K1 osobno scala fakty. Bezpośrednio potwierdzono dwie pozycje packa oraz jeden fact snapshotu. |
| MCP1-R02 | HIGH | `sameSource` porównywał provenance przez `JSON.stringify`. Różna kolejność kluczy po walidacji Zod powodowała `systems.0 element-mismatch` dla poprawnego źródła bez location z externalId/reference. | Poprawione przez kanoniczne porównanie. Bezpośrednio potwierdzono `grounded` dla takiego źródła. |
| MCP1-R03 | HIGH | Puste `interfaceName` pozostawało w packu jako `""`, podczas gdy K1 normalizował je do braku wartości. Potwierdzono `conformant-within-scope` i krok `conformant` z pustym `factIds`. | Poprawione przez odrzucenie pustej wartości w normalized kontrakcie. Bezpośrednio potwierdzono odmowę. |
| MCP1-R04 | MEDIUM | VSIX Verify Flow uruchamiał źródło MCP w onboarding, runtime i ponownej inspekcji katalogu; dodatkowe odczyty nie miały sygnału konfliktu. | Poprawione w kodzie: onboarding MCP sprawdza konfigurację, katalog pochodzi z frozen raportu, kontynuacje dostają sygnał. Test liczby fetch w dokładnej paczce pozostaje wymagany. |
| MCP1-R05 | MEDIUM | Konflikt profili podczas asynchronicznego przygotowania aliasu mógł dopuścić `editor.edit`, a blokadę zastosować dopiero przed `doc.save`. | Poprawione w kodzie: guard bezpośrednio przed native edit i sygnały kontynuacji. Wymagany test zerowej liczby edycji po konflikcie. |
| MCP1-R06 | MEDIUM | URI z query `?api_key=SECRET_CANARY` przechodziło walidację i mogło wejść do provenance/raportu. | Poprawione w kodzie: URI odrzuca userinfo/query/hash; fragment jest osobnym polem. Klient dodatkowo odrzuca odpowiedź zawierającą przekazany sekret środowiskowy. Wymagany canary test finalnej dystrybucji. |
| MCP1-R07 | MEDIUM | Publiczna inspekcja lokalnego SRC1 i jego transportu MCP zwracała różne sourceFingerprint, mimo jednakowych contributions i snapshotu. | Poprawione w kodzie: publiczny fingerprint korzysta ze wspólnej sourceVersion. Wewnętrzny byte fingerprint lokalnej sesji zachowano. |
| MCP1-R08 | MEDIUM | Timer mógł zostać skasowany po długiej synchronicznej walidacji, zanim event loop obsłużył przekroczony deadline. | Poprawione w kodzie: absolutny deadline i ponowna kontrola po walidacji oraz w adapterach operacji. |
| MCP1-R09 | MEDIUM | Zamknięcie stdout dostarczonego CLI przed `--version` powodowało exit 1 i surowy stack trace Node z EPIPE. | Poprawione w kodzie: wspólny zapis i obsługa błędu stdout. Ponowne uruchomienie świeżej binarki i serwerów stdio pozostaje wymagane. |
| MCP1-R10 | MEDIUM | `ARCHI_AGENT_CLI_TEST=1` pomijało wykonanie dostarczonej binarki, pozostawiając kod 0 bez weryfikacji i wyniku. | Guard środowiskowy usunięto; potwierdzono odczytem entrypointu. Wykonawca dodał canary do harnessu dostarczanej paczki; jego końcowy wynik pozostaje do odbioru. |
| MCP1-R11 | MEDIUM | Prawidłowy Full był odrzucany, ponieważ inventory zawiera legalne, hashowane pliki pomocnicze `.gitkeep` o rozmiarze zero. | Poprawione w kodzie: ogólne entries dopuszczają `bytes >= 0`, wymagane zasoby OCR nadal wymagają `bytes > 0`. Rozmiar, typ pliku, containment, tożsamość i SHA-256 nadal podlegają kontroli. Dodano regresję pustego pliku pomocniczego. |

## Ponowny przegląd przed pełnym runnerem

Po R11 odczytano zmieniony guard Full i jego test, osobne buildy CLI w hookach testów
oraz nowe skrypty clean-Core, packaged parity, Full OCR, profili, UI i zbiorczego odbioru.
Testy CLI/MCP/klienta wiedzy budują bundle w swoich katalogach tymczasowych; nie polegają
już na zastanym `build/mcp1/cli`. Poprawka pustych plików pomocniczych nie osłabia kontroli
wymaganych zasobów ani nie zmienia resource manifestu i modeli OCR.

Przeczytano także deweloperskie raporty wykonawcy:

| Dowód | Wynik zapisany przez wykonawcę | Granica dowodu |
| --- | --- | --- |
| `build/mcp1/clean-core-dev/clean-core.json` | PASS: root `npm ci`, build i verify Core bez katalogu experiments | Osobna kopia źródeł; nie finalna paczka odbioru. |
| `build/mcp1/full-ocr-dev/full-ocr.json` | FAIL: inventory poprawnego Full odrzucone przed OCR | Zachowany pierwotny błąd R11; nie zastępować go wynikiem późniejszego kandydata. |
| `build/mcp1/profile-dev/profile-smoke.json` | FAIL dla pierwszego Full/Host | Zachowany przebieg sprzed poprawki; osobny od następnych prób. |
| `build/mcp1/full-ocr-dev2/full-ocr.json` | PASS: 7 scenariuszy, realny lokalny OCR PL/EN, text/all, cancel i dwa uszkodzenia Full | macOS ARM64; prawdziwe PDF.js/canvas/Tesseract na syntetycznych skanach, bez LLM. |
| `build/mcp1/packaged-dev3/packaged-smoke.json` | PASS: 13 scenariuszy parity, budżetów wywołań, Core, sygnałów, EPIPE i MCP busy/cancel/recovery | Porównanie packaged runtime/CLI/MCP z kontrolowanym transportem modelu. |
| `build/mcp1/profile-dev3/profile-smoke.json` | PASS: instalacja/reinstall, przejście Full/Core, wspólne ustawienia, osobne trwałe SecretStorage i konflikt aktywacji | Rzeczywisty Extension Host z kontrolowanymi odpowiedziami UI; nie zastępuje dowodu faktycznego upgrade wersji ani dynamicznego konfliktu. |
| `build/mcp1/ui-dev-core/report.json` | Cztery scenariusze PASS: User-only MCP, awaria/naprawa źródła, PDF controls/text i Core OCR unavailable | Rzeczywisty widoczny UI Core; Full i finalne paczki wymagają osobnego odbioru. |

Raporty `full-ocr-dev2`, `packaged-dev3`, `profile-dev3` i `ui-dev-core` odnoszą się do
deweloperskiego Full SHA-256
`2ec5c9b2c7dfb2c703f9ed751a09eb09f93dd81412fdd292f376c26324fe38f1`
lub Core SHA-256
`3ba5a52078f365774063c374e4ae9fee16251f753006c269c7e391d967b72122`.
Raport packaged podaje dodatkowo CLI SHA-256
`50c44aa1b02de5cfbdd47e1bfd864c14dd93893260cde1f0f09782f027b7243b`.
To identyfikatory dowodów deweloperskich, nie finalny fingerprint odbioru.

W review skryptów zgłoszono dwie **MEDIUM luki dowodowe**. Poniższy opis zachowuje stan
z chwili zgłoszenia; obie zamknięto dowodami C5 opisanymi niżej:

- **MCP1-R12 — rzeczywista aktualizacja wersji.** Obecny scenariusz instaluje ponownie tę
  samą alpha.7 dla każdego ID. Potwierdza reinstall i izolację ID, lecz nie aktualizację
  istniejącego Full alpha.6 do kandydata z zachowaniem sekretów. Uzupełnić prawdziwe przejście
  Full między wersjami; poprzednik nowego Core może być jawnie syntetycznym pakietem tego
  samego ID o wcześniejszej wersji.
- **MCP1-R13 — rzeczywisty eksport VSIX w parity.** Packaged harness porównuje CLI/MCP
  z runtime wyjętym z VSIX. Host odczytuje JSON komendy rozszerzenia, ale porównuje tylko
  assessment i liczbę wywołań. Plan wymaga głębokiego porównania rzeczywistego eksportu
  portable z edytora VSIX z CLI/MCP, przy identycznych bajtach, logicznej nazwie, firstLine,
  odpowiedzi syntetycznej i decyzjach; nie wystarcza wyłącznie porównanie wspólnego runtime.

W tej kontroli nie uruchamiano równoległego runnera ani ponownego pakowania. Wówczas
werdykt pozostawał wstrzymany do dowodów i zamrożonego kandydata.

Odrębne deklaracje relacji mogą być przez istniejący walidator GroundedContext blokowane
jako `duplicate-relationship` także lokalnie. Nie osłabiać tego walidatora dla testu parity.
Regresja R01 powinna zachować pack/counts i równoważny wynik obu źródeł, a nie wymuszać
nowy sukces generowania dla wejścia blokowanego na dotychczasowej ścieżce.

## Zakres sprawdzonej konstrukcji

Odczytano ścieżki CLI, czterech narzędzi serwera MCP, klienta wiedzy i przykładowego serwera,
konfigurację procesu i User scope, politykę plików, transfer K1/provenance, serializer,
opcjonalne lokatory oraz możliwości OCR, guardy profili i pakowanie.

CLI/MCP wywołują wspólny runtime. Klient wiedzy używa jednego stałego toola i tego samego
SDK; mapper przykładu pozostaje produkcyjnym SRC1. Nie znaleziono drugiego mechanizmu
dopasowania ani oceny relacji. Serwer, źródło i executable nie pochodzą z argumentów toola.
Brak lokatora jest reprezentowany przez prawdziwe provenance, bez fikcyjnego wiersza.
Guardy Core/Full rozróżniają brak OCR od uszkodzonego Full; nie uruchamiają pobierania.
Te obserwacje kodu nie zastępują scenariuszy wykonania wymienionych niżej.

## Własne reprodukcje i granice review

Reviewer wykonywał bezpośrednie reprodukcje na istniejącym bundle runtime/CLI oraz na
aktualnych modułach bundlowanych w pamięci przez esbuild z `write:false`. Nie zapisywał
diagnostycznego kodu do repo. Reprodukcje wykazały R01/R02/R03/R06/R09 oraz R14; ponowne próby
aktualnych źródeł potwierdziły poprawki R01/R02/R03/R14. To syntetyczne kontrole deterministyczne,
bez rzeczywistego LLM. `git diff --check` podczas review: PASS.

Nie uruchamiano w tym kontekście pełnego root/extension profilu, finalnej dystrybucji,
rzeczywistego Extension Host/UI ani żywego providera. Wyniki wykonawcy należy powiązać
z dokładnym fingerprintem kandydata i trzema finalnymi paczkami; nie przenosić wyników
starszego builda na nowszy kod.

Końcowy odbiór obejmował następującą listę wymagań:

- pełne bramki z planu, testy licencji/dokumentacji i dokładnych paczek;
- głęboka parity outcome/evidence VSIX/CLI/MCP z jawną listą dozwolonych metadanych;
- lokalne SRC1 i MCP, wiele pochodzeń oraz źródło bez lokatora;
- budżety zero/one/two-call, błędy, częściowe pokrycie, sesje, deadline i anulowanie;
- canary sekretów, stdout/EPIPE, limity ramek i potwierdzony cleanup dziecka;
- clean Core, poprawny/uszkodzony Full oraz instalacja, aktualizacja i zmiana profilu;
- współinstalacja obu ID i dynamiczny konflikt bez późniejszej edycji lub zapisu;
- regresje SRC1/VER1/K1/K3, czterech diagramów i ART1 oraz uruchomienie poza repo.

## Domknięcie R12–R15

| ID | Waga | Dowód i poprawka | Końcowy stan |
| --- | --- | --- | --- |
| MCP1-R12 | MEDIUM | Reinstall tej samej wersji zastąpiono rzeczywistym upgrade Full alpha.6 → alpha.7. Poprzednik Full ma SHA-256 `95728ca525ad4f93eaa69cee3d06886b7c0ac3214ed320a500836678ad06d207`. Poprzednik nowego Core jest jawnie syntetyczny: te same bajty kandydata, wcześniejsza wersja manifestu. | CLOSED: C5 `profiles/profile-smoke.json` PASS. Trwałe osobne SecretStorage i wspólne ustawienia sprawdzono przed/po upgrade i powrocie; aktualizacja jednego ID zachowuje instalację drugiego. Obie kolejności instalacji oraz prawdziwe statyczne diagnostyki command/settings/views potwierdzono w Extension Host. |
| MCP1-R13 | MEDIUM | Test Host porównuje pełny JSON rzeczywiście utworzonego edytora VSIX z CLI/MCP: zgodność PlantUML, rozbieżność i proza z jawnym potwierdzeniem nazwy, w global/single-folder/multi-root. | CLOSED: C5 `host-core/mcp1-export-results.json` oraz `host-full/mcp1-export-results.json`: razem 18/18 PASS. `assert.deepEqual` obejmuje całe portable report i evidence, bez usuwania pól domenowych. |
| MCP1-R14 | HIGH | Na runtime C2 reviewer odtworzył odbicie syntetycznego klucza z nagłówka przez poprawny JSON providera: label prozy, label Sequence, model ID listy i zapisany modelId mogły ujawnić klucz w wyniku. | CLOSED: wspólny prosty `containsCredential` sprawdza decoded string values i klucze JSON; remote klienci blokują modelId przed metadanymi oraz completion/model IDs przed zwrotem. Klient MCP korzysta z tego samego helpera. Własna kontrola 12 przypadków potwierdziła odmowę dla trzech chmur, Unicode escapes i credentiala z quote/backslash. C5 packaged scenariusz trzech chmur PASS; zero dodatkowego retry/repair/LLM call, błędy bez raw danych. |
| MCP1-R15 | MEDIUM | Configuration i wybór systemu C4 wykonywały inspekcję źródła bez sygnału profilu; konflikt mógł pozostawić pracujący proces MCP mimo unieważnienia widoku. | CLOSED: oba wywołania przekazują `withProfileCancellation()`. Odczytano dwa testy regresyjne obserwujące zmianę sygnału podczas inspekcji; Configuration nie publikuje sukcesu, C4 nie rozpoczyna generowania. Testy są objęte C5 root/extension PASS. |

Guard sekretów odrzuca nieufny wynik zamiast publikować jego zmodyfikowaną wersję.
Obejmuje dokładną przekazaną wartość credentiala; nie stanowi ogólnego wykrywacza
dowolnie przekształconych sekretów. Nie odczytuje VS Code SecretStorage w CLI/MCP.

## Końcowy kandydat C5 i odbiór lokalny

Źródło dowodów: `build/mcp1/candidate-5/manifest.json`, Node **v22.12.0**,
`status=PASS`, **44/44 bramki PASS**, `sourceFilesUnchanged=true`.
W pierwszej kontroli po bramkach, przed uzupełnianiem raportów, reviewer niezależnie
porównał wszystkie zapisane hashe źródeł z working tree: brak różnic. Niezależnie
przeliczono SHA-256 trzech archiwów: zgodne z manifestem i `artifact-inventory.json`.
Po bramkach dopuszczono wyłącznie pięć dokumentów operacyjnych: ten review,
`docs/mcp1-verification.md`, `docs/testing/mcp1-owner-smoke.md`, `docs/project-state.md`
i `docs/product-roadmap.md`. Produkt, testy i konfiguracja muszą nadal odpowiadać C5;
finalny acceptance wiąże jawne wyjątki dokumentacyjne z niezmienionymi paczkami.

| Dowód C5 | Odczytany wynik wykonawcy |
| --- | --- |
| `root-tests.log`, `extension-tests.log` | 1954/1954 w 129 plikach oraz 730/730 w 37 plikach PASS; oba typecheck, buildy i demo PASS. |
| clean-Core, package/verify Core/Full/CLI, świeże buildy i docs obu profili | PASS. Pięć bramek install/audit/prepare OCR jawnie reużywa C4 po porównaniu niezmienionych wejść zależności; nie przedstawiać ich jako nowego `npm ci` w C5. |
| `packaged/packaged-smoke.json` | 15/15 PASS, identyczne bajty runtime Core/Full/CLI, pełne outcome parity, PlantUML zero LLM, proza jedno wywołanie i kontynuacja zero, generowanie w obecnym budżecie dwóch wywołań, sekrety, Core, EPIPE, sygnały i MCP busy/cancel/EOF/recovery. |
| `Full-OCR/full-ocr.json` | 7/7 PASS: rzeczywisty lokalny OCR PL/EN, poprawny Full i dwa uszkodzenia, text/all oraz anulowanie. |
| SRC1/K1/K3/ART1 i VER1/C4 packaged | PASS poza repo, z pustymi PATH/NODE_PATH, na syntetycznych fixture'ach. |
| `profiles/profile-smoke.json` | 23/23 PASS, upgrade/switch/coinstall/reverse oraz rzeczywiste statyczne diagnostyki; oba włączone pozostają świadomie blokowanym stanem. |
| SRC1, VER1/C4 i actual-export Host | 6 bramek PASS: 13+17+9 scenariuszy na każdy profil; actual-export 18/18 łącznie. |
| MCP1, SRC1 i VER1/C4 UI × Core/Full | Wszystkie 6 bramek PASS na dokładnych archiwach C5. MCP UI potwierdza User-only executable, błąd bez fallbacku, wyczyszczenie starego sukcesu i odzyskanie źródła; usunięty tymczasowo plik wykonywalny jest przywracany z kontrolą hasha. |
| `diff-check` | PASS. |

W parity nie pominięto żadnych pól domenowych. CLI/MCP porównują całe `outcome`,
raport generowania jest jedynie parsowany z JSON przed porównaniem. Tożsamości
`meta.adapter`, `operation` i `schemaVersion` podlegają oddzielnym asercjom; adapter
nie jest traktowany jako losowa metadana. Jawna lista pomijanych różnic transportowych:
`meta.runId`, `meta.startedAt`, `meta.elapsedMs`, `continuation.sessionId`,
`continuation.expiresAt`. Actual-export Host porównuje całe portable report/evidence bez
wycinania pól. Dodatkowe testy klienta obejmują lokalne/MCP SRC1, wiele pochodzeń i brak
lokatora; reużywany jest wspólny mapper, K1, grounding i VER1.

| Paczka C5 | Bajty archiwum | Pliki / bajty po rozpakowaniu | OCR |
| --- | ---: | ---: | --- |
| `core/archi-agent-core-0.3.0-alpha.7.vsix` | 3 933 117 | 25 / 7 557 449 | 0 plików, 0 bajtów |
| `full/archi-agent-full-0.3.0-alpha.7.vsix` | 127 359 392 | 547 / 305 236 441 | 522 pliki, 297 679 045 bajtów |
| `cli/archi-agent-cli-0.3.0-alpha.7.tgz` | 888 813 | 10 / 5 109 543 | 0 plików, 0 bajtów |

Ścieżki względem `build/mcp1/candidate-5/`; pełny skład znajduje się w
`artifact-inventory.json`. Oba VSIX zawierają klienta MCP, bez przykładowego serwera;
tarball zawiera CLI, serwer czterech narzędzi, przykładowy serwer wiedzy i wspólny runtime.

SHA-256 Core: `96715aeb6e5583337af178fc337644b8d61ce868795a554b9f559eac444739bb`.

SHA-256 Full: `14e092acbd12ac610e4e5258de679e3597a089acf80250163388de92a0a7fd98`.

SHA-256 CLI/MCP: `e6dcfc335517eca7e0f187c2d631a9f192b10ce53775124769b1954c84d391e0`.

Zachowano wcześniejsze nieudane przebiegi: `full-ocr-dev` i `profile-dev` sprzed R11;
`candidate-1/manifest.json` FAIL na SRC1 UI native picker; `candidate-3/manifest.json`
FAIL na wyścigu User configuration watcher w MCP UI; `candidate-4/manifest.json` FAIL
na SRC1 UI native picker. C2 ma własny manifest PASS dla starszego kodu, ale nie obejmuje
późniejszych poprawek R14/R15 i nie zastępuje C5. C3 UI resume na tych samych paczkach
pozostaje osobnym dowodem; końcowy werdykt opiera się na kompletnym świeżym C5.

Wyniki runnera, Host i UI są dowodami wykonawcy odczytanymi przez reviewera; reviewer
nie uruchamiał ich powtórnie. Własne reprodukcje i kontrole hashy opisano osobno.
LLM był zastępowany kontrolowanym transportem lub syntetycznym serwerem HTTP;
realny OCR nie jest testem rzeczywistego LLM.

**Werdykt: PASS w zakresie lokalnym MCP1/MCP1-KNOW; brak otwartych blokerów checkpointu.**
**MANUAL_SMOKE: DEFERRED.** Real LLM, remote CI i Windows ARM64 runtime: **NOT_RUN**.
AUD-003–006 pozostają **OPEN**. Owner smoke i jakość żywego modelu wymagają osobnego
wyniku właściciela; tego raportu nie należy przedstawiać jako ich PASS.
