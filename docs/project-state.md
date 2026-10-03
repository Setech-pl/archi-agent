# Project state

Operacyjny stan projektu Archi Agent. Aktualizuje go wykonawca po istotnej zmianie
(zob. [`development-workflow.md`](development-workflow.md)). Kierunek produktu i status etapów:
[`product-roadmap.md`](product-roadmap.md). Zasady stałe: [`AGENTS.md`](../AGENTS.md).

**Zapis może być nieaktualny — zawsze porównaj go z `git log` i `git status`.**

## Snapshot

| Pole | Wartość |
| --- | --- |
| Data aktualizacji | 2026-10-03 |
| Stan Git | UX2 zintegrowano do `main` na `456ad46cddc95c726e4554c0eba94b9c9b8c1119`. Kandydat alpha.4 powstał na osobnej gałęzi `release/v0.3.0-alpha.4`; bieżący commit, remote i drzewo zawsze sprawdzaj w Git. |
| Stan B1 | Implemented and verified; neutralny `StructuredChatClient`, lokalny adapter node i cienki generator sequence. Pełne bramki automatyczne B1 przeszły. |
| Stan P1 | Implemented and verified; automatyczne bramki PASS oraz owner smoke Ollamy PASS na commit `50d7f47`. Profile LM Studio i Ollama, wspólny transport OpenAI-compatible oraz machine-scoped wybór profilu/modelu z trwałym bindingiem. |
| Stan P2 | Implemented; Anthropic, OpenAI i OpenRouter przez stałą allowlistę HTTPS, klucze wyłącznie w VS Code `SecretStorage`, bounded model listing i dokładnie jeden request generacyjny bez retry/repair/fallbacku. Bieżące wyniki bramek są w sekcji „Weryfikacja”. |
| Stan D1 | Eksperymentalny checkpoint automatycznie zweryfikowany; dwa owner smoke Ollamy `qwen3:30b` nie przeszły. Ledger i diagnoza zachowane na `checkpoint/d1-ledger-pipeline` (`973b604694ad06181deaa56989b9361f4b4ba52e`). To nie jest gotowy produkt. |
| Stan R1 | Completed — ADR, architektura reviewed pipeline i KISS/BUZI zapisane na aktywnym branchu. |
| Stan D1.1 | Implemented and automatically verified, lecz S1 FAIL; historyczna ścieżka `{ plantUml }` zachowana na `checkpoint/d1-final-plantuml-reviewed`, superseded jako aktywny kierunek. |
| Stan R2 | Completed — właściciel zatwierdził DiagramPlan, lokalną walidację i deterministyczne renderery per typ; ADR 0002 i checkpoint D1.1. |
| Stan D1.2 | Ukończone: Wire Plan v3, deterministyczny renderer sequence, minimalny reviewer, safe diagnostics i unverified candidate UX. |
| Stan UX1 | Completed — owner smoke PASS 2026-09-23 na samowystarczalnym VSIX w świeżym, izolowanym profilu VS Code. |
| Stan D2 | Completed — automatyczne bramki PASS, niezależny review 3/3 bez high/medium, owner smoke PASS 2026-09-28 na pakowanym VSIX. |
| Stan CL1 | Opublikowany w `v0.3.0-alpha.3`: lokalna konwersja PDF/DOCX/XLSX z limitem wejścia 50 MiB i pozostałymi limitami podanymi niżej. Owner smoke PASS dotyczył dokładnego VSIX o SHA-256 `7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056`; właściciel nie wyszczególnił przypadków UI dla Cancel ani przekroczenia limitu. |
| Stan UX2 | Zaimplementowany; automatyczne bramki PASS, niezależny review bez pozostałych high/medium, owner smoke dokładnego VSIX na Mac ARM PASS 2026-10-02. Szczegóły niżej. |
| Następny etap | OBS1 — osobny etap diagnostyki providerów; nie został rozpoczęty. |
| Bramka S1 | PASS — owner smoke 2026-09-23 na samowystarczalnym VSIX poza repozytorium; verified outcome, bez modalu unverified. Szczegóły w sekcji „Owner smoke S1”. |
| Kolejność | R2 → D1.2 → S1 → UX1 → D2 → CL1 → UX2 → OBS1 → M1 (MCP) → C1 → D3 → D4 → D5 → K2 → K3 → REL. |
| Checkpoint produktu | `v0.2.0-alpha.1` — implemented, automatically verified, owner smoke accepted (zob. „Checkpoint VSIX v0.2.0-alpha.1”) |
| Wydanie | `v0.3.0-alpha.3` opublikowane po CL1; istniejący tag wskazuje `0192e8afd8fa850cfbc0679ce19c08df980e71fb`. Dla `v0.3.0-alpha.4` właściciel zaakceptował próbę smoke i polecił publikację; szczegóły dowodów niżej. |

## v0.3.0-alpha.4 — dowody wydania po UX2 (2026-10-03)

Zatwierdzony UX2 został wypchnięty zwykłym fast-forward do właściwego remote
`github` (`Setech-pl/archi-agent`): bezpośredni `git ls-remote` potwierdził
`github/main` na `456ad46cddc95c726e4554c0eba94b9c9b8c1119`. Tag
`v0.3.0-alpha.3` nadal rozwiązuje się do `0192e8afd8fa850cfbc0679ce19c08df980e71fb`.
Osobna gałąź wydania `release/v0.3.0-alpha.4` zmienia wersję rozszerzenia,
asercję pakowania i dokumentację. Root `package.json` i `package-lock.json`
zachowują wersję prywatnego pakietu narzędziowego `0.1.0-private.0`; nie jest to
wersja VSIX. Kod funkcjonalny i OBS1 pozostają bez zmian.

Kandydat: `build/release/alpha.4/archi-agent-0.3.0-alpha.4.vsix`,
**119805952 B**, SHA-256
`4d30bb3b3b2108c8ecbba2748e7da537f5668460b717e2b3f2740060559e12b1`.
Pełny gauntlet przygotowania kandydata PASS: `npm ci`, `npm test` (1320), oba typechecki,
`extension:test` (202), build, package, verify, demo dry run, kontrole whitespace
i `npm audit` (0 podatności). Osobny verify zachowanego VSIX PASS: 529 wpisów,
w tym hashe kompletu zasobów OCR. Wobec owner-smoked kandydata UX2 alpha.3
lista 529 ścieżek jest identyczna. Zmieniły się wyłącznie dwa manifesty
(tylko numer wersji) i pakowany README; pozostałe 526 wpisów, w tym cały runtime
i zasoby OCR, są bajtowo identyczne. Nowe archiwum jest większe o 204 B.

Właściciel wykonał ręczną próbę alpha.4 i zgłosił „poszło”. Konwersję `twenty.pdf`
zatrzymał limit stron; właściciel następnie polecił „idziemy dalej” i zaakceptował
publikację. Raport nie podaje osobnych wyników pozostałych scenariuszy, parametrów
hosta ani potwierdzenia Cancel na alpha.4. Historyczny owner smoke Mac ARM PASS,
w tym Cancel bez częściowego dokumentu i konwersja po Cancel, dotyczy tylko
poprzedniego SHA `b80c861deaf233343ceaa105969ba5c3e7a625f0b5be040c94d6e21a57c9ef4b`.
Identyczność 526 wpisów payloadu wspiera przeniesienie dowodu runtime, ale nie jest
osobnym ręcznym PASS Cancel na alpha.4. Release notes:
[`releases/v0.3.0-alpha.4.md`](releases/v0.3.0-alpha.4.md). Windows, Linux i
macOS x64 mają wyłącznie spakowane, zweryfikowane zasoby, bez runtime smoke.

## Bieżący stan po publikacji `v0.3.0-alpha.3` (2026-09-30)

CL1 i `v0.3.0-alpha.3` są opublikowane. Owner smoke PASS zgłoszony przez właściciela
dotyczył dokładnego finalnego VSIX o SHA-256
`7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056`.
Właściciel nie podał osobnych wyników UI dla Cancel ani przekroczenia limitu;
te przypadki sprawdzono w automatycznym smoke runtime opisanym niżej.
Bieżące limity CL1: wejście 50 MiB, wynik Markdown 8 MiB, czas 120 s,
PDF 300 stron, Office ZIP 1000 wpisów / 100 MiB łącznie / 25 MiB na wpis / 100:1,
XLSX 40 arkuszy / 20000 wierszy / 150 kolumn / 250000 komórek.

Decyzja właściciela wyznaczyła UX2 — lokalny OCR skanowanych PDF, a po nim
OBS1 — diagnostykę providerów. UX2 jest zaimplementowany i przeszedł owner smoke;
OBS1 i dalsze etapy pozostają osobnymi zadaniami.
Walidacja PUML utworzonych lub poprawionych przez użytkownika, wizualizacja wiedzy
i ST1 pozostają osobnymi przyszłymi zadaniami.

## UX2 — faza 1, próba lokalnego OCR PDF (2026-10-01)

Na `feature/ux2-ocr-feasibility` przygotowano osobny prototyp, syntetyczne fixture'y,
harness i próbny VSIX bez UI oraz bez zmian produkcyjnych kontraktów UX2 lub limitów CL1.
Pełne wyniki, wersje, hashe zasobów, licencje i instrukcje odtworzenia są w
[`experiments/ux2-ocr/README.md`](../experiments/ux2-ocr/README.md). Próba zachowała
wydany `alpha.3` (970287 B, SHA-256 `7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056`)
bajtowo przed i po pracy. Próbny `build/ux2-ocr/archi-agent-0.3.0-alpha.3-ux2-trial.vsix`
ma 95181539 B i SHA-256 `acdb4a4af6aefd88ae623d1d4e72bf68258e90732826f16a953383a02391c0dc`.

- **Runtime:** oficjalny VS Code 1.91.0 Extension Host na Mac ARM podał Node 20.9.0 i
  Electron 29.4.0. OCR z dokładnego rozpakowanego próbnego VSIX przeszedł także w tym
  hoście. Tekstowa ścieżka `unpdf` zachowuje `maxImageSize: 1`; render używa osobnego,
  leniwego dokumentu oficjalnego PDF.js 4.10.38 `legacy`, lokalnego canvas oraz
  lokalnych fontów, CMap, WASM i modeli PL/EN. PDF wyłącznie tekstowy działał bez
  natywnego bindingu canvas.
- **Obrazy — blocker:** uszkodzony skan oraz strona z poprawnym i uszkodzonym obrazem
  zostały odrzucone. Obraz osadzony 25 MP przekraczający próbny limit 16 MP został jednak
  usunięty przez PDF.js z listy operacji, a prototyp zwrócił pozorną pustą stronę.
  `stopAtErrors: true` tego nie naprawił. Nie wolno uznać bramki błędów obrazów ani
  egzekwowania limitu 16 MP za PASS.
- **Zamykanie — niepełna bramka:** zaobserwowano `exit` Tesseract po sukcesie i błędzie na późniejszej
  stronie. Cancel podczas renderowania, inicjalizacji i rozpoznawania, trzy powtórzone
  żądania Cancel oraz wyścig z sukcesem sprawdzono na zewnętrznym workerze próby.
  Mimo zakończenia 100 kolejnych zewnętrznych workerów RSS procesu nadrzędnego po GC
  wzrosło z 364 MiB przy 25. do 452 MiB przy 100. próbie. Wcześniejsza próba 300
  konwersji w jednym procesie doszła do 604 MiB. Brak trwałego narastania zasobów
  nie został dowiedziony.
- **Czas:** dokładny spakowany runtime bez OCR zakończył zawieszony worker po 120002 ms.
  Harness OCR zakończył próbę po 300008 ms od początku mimo zdarzeń stron w 150. i
  260. sekundzie; była to próba syntetycznego, etapowego procesu, nie rzeczywisty
  300-sekundowy dokument OCR.
- **Pomiary:** 16 krótkich skanów PL/EN, 200/300 DPI, clean/JPEG compressed/noise/skew
  dało CER 0 i 0 błędów polskich znaków. 200 DPI: 621–838 ms i do 393 MiB RSS;
  300 DPI: 946–1270 ms i do 578 MiB RSS. Kilka skanów
  200 DPI miało ponad 1,5 średniego rdzenia. Dokument 20-stronicowy przeszedł
  w 5286 ms przy 577 MiB RSS; 21 stron odrzucono. Maski i puste strony sprawdzono.
- **Pakowanie:** pojedynczy VSIX ma sześć deklarowanych bindingów Mac/Windows/Linux;
  Windows i Linux zweryfikowano po manifeście i hashach, bez runtime smoke. Izolowany
  smoke poza repo, bez root `node_modules`, cache języków i sieci przeszedł na Macu.
  W tej sesji `npm ci`, `npm test` (1316), oba typechecki, `extension:test` (198),
  build, package i `extension:verify -- --ux2-trial <VSIX>` przeszły.

Faza 2 czeka na review. Wstępna hipoteza o potrzebie niezależnej inwentaryzacji
obrazów została zastąpiona dokładniejszą diagnozą z rechecku poniżej; nie dodano
parsera PDF. Wzrost RSS wymaga dalszej oceny. Zmiana renderera, izolacja procesowa
lub inna zmiana architektury wymaga decyzji właściciela. OBS1 pozostaje osobnym
etapem.

### UX2 — recheck fazy 1 (2026-10-01)

Preflight potwierdził `feature/ux2-ocr-feasibility`, ten sam HEAD
`0192e8afd8fa850cfbc0679ce19c08df980e71fb`, pusty staging oraz zachowane
zmiany fazy 1 i zastane dokumenty. Alpha.3 i pierwszy trial pozostały bajtowo
niezmienione. Osobny kandydat to
`build/ux2-ocr/recheck/archi-agent-0.3.0-alpha.3-ux2-recheck.vsix`,
119802465 B, SHA-256 `b4c4b0c83aa7f81efda24182f4edf1d27e1232ce335ae99847f1f24f246e995d`.
Pełny zapis diagnozy, macierz bindingów i dane serii są w
[`experiments/ux2-ocr/README.md`](../experiments/ux2-ocr/README.md).

- **B — przyczyna potwierdzona:** dokładny pierwszy trial zawiera zgodne moduł i worker
  PDF.js 4.10.38 o hashach z manifestu. Prototyp tworzy render document bezpośrednio
  z `stopAtErrors: true` i limitem 16 MP; `unpdf` tworzy tylko osobny dokument tekstowy.
  Worker odrzuca strumień `GetOperatorList` po przekroczeniu rozmiaru, lecz display
  API rozwiązuje publiczne `getOperatorList()` pustą listą przed próbą odrzucenia.
  `render()` także rozwiązuje się. Regresje dokładnego nowego pakietu: 5/8 PASS,
  3/8 FAIL — obrazy ponad 16 MP oraz tekst przed takim obrazem nadal zwracają
  pozorny sukces. 16 MP równo przechodzi; prawdziwa pusta strona, uszkodzone obrazy
  i maska zachowują oczekiwane wyniki. Nie dodano prywatnego hooka, parsera ani
  patcha PDF.js. Bramka B pozostaje BLOCKED.
- **C — pomiary według kryterium zapisanego przed próbą:** dwa świeże procesy po
  300 identycznych OCR zakończyły z RSS 624.1 i 654.3 MiB, a od próby 200 do 300
  wzrosły o 39.4 i 44.3 MiB wobec sufitu stabilizacji 32 MiB. `heapUsed` pozostał
  około 21 MiB, liczba żywych workerów po każdej próbce wyniosła zero. Świeży
  proces tekstowy po 300 konwersjach miał 88.6 MiB RSS, wzrost końcowej setki
  4.7 MiB. Osobna seria 50 Cancel/timeout zakończyła wszystkie zewnętrzne workery,
  lecz RSS procesu nadrzędnego wzrosło z 35.6 do 335.9 MiB. Natywnej retencji
  nie wyjaśniono; C pozostaje INCOMPLETE. GC był tylko narzędziem diagnozy.
- **Pakiet i runtime:** nowy VSIX dodaje dwie wersje Linux musl do wcześniejszych
  sześciu bindingów; wszystkich osiem ma manifest i hash. Smoke macOS ARM z
  dokładnego pakietu, poza repo, bez root `node_modules`, sieci i cache języków
  przeszedł z Node 20.9.0. Świeży, izolowany VS Code 1.91.0 Extension Host zgłosił
  Node 20.9.0/Electron 29.4.0 i przeszedł OCR dokumentu mieszanego. Pozostałe
  siedem wariantów nie ma smoke. Brak bindingu daje kontrolowane
  `canvas-binding-unavailable`, brak modelu `ocr-model-unavailable`, bez stron wyniku.
- **Weryfikacja bieżącej sesji:** sekwencyjnie PASS: root `npm ci`, `npm test`
  (1316), `npm run typecheck`, `npm run extension:typecheck`,
  `npm run extension:test` (198), `npm run extension:build`,
  `npm run extension:package`, `npm run extension:verify` z jawną ścieżką
  próbnego VSIX i osobno z jawną ścieżką zwykłego pakietu. Regresja B celowo
  pozostaje FAIL 3/8; nie jest liczona jako PASS. `git diff --check` przeszedł.

Faza 2 i OBS1 nie zostały rozpoczęte. Czas 120/300 s i niezmieniona macierz jakości
nie były ponawiane, ponieważ recheck nie zmienił ich mechanizmu.

### UX2 — patch PDF.js i izolacja procesu, dalsza faza 1 (2026-10-01)

Na tym samym branchu i HEAD, przy pustym stagingu, zatwierdzony wariant wdrożono
wyłącznie w `experiments/ux2-ocr/` oraz w weryfikatorze próbnego VSIX. Zastany diff
roadmapy pozostawiono bez dalszych zmian. Nowy artefakt:
`build/ux2-ocr/patch-process-gated/archi-agent-0.3.0-alpha.3-ux2-patch-process.vsix`,
119970748 B, SHA-256
`c03ecb658b56099dff5d8b09c446afbc115c2b4b9848b5e9ba35478943a252b5`.
Wydany alpha.3, pierwszy trial i recheck zachowały odpowiednio hashe
`7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056`,
`acdb4a4af6aefd88ae623d1d4e72bf68258e90732826f16a953383a02391c0dc` i
`b4c4b0c83aa7f81efda24182f4edf1d27e1232ce335ae99847f1f24f246e995d`.

Patch jednego fragmentu PDF.js 4.10.38 odrzuca osobne stany publicznych
`getOperatorList()` i `render().promise` przy błędzie strumienia. Build sprawdza
wersję i hashe oryginalnego modułu oraz workera, stosuje patch do kopii i
zapisuje hashe zasobów w zewnętrznym manifeście. Publiczne API
`definePDFJSModule()` kieruje helpery unpdf 1.7.0 do tego modułu. Rodzic
konwersji uruchamia jeden proces z `process.execPath` Extension Hosta;
zasoby PDF.js/canvas/Tesseract są tylko w dziecku. Deadline 120 s bez OCR i
300 s z OCR liczą się od początku zadania. Granice wejścia, wyniku, stron,
obrazu, płótna i DPI pozostały bez podniesienia.

B: 8/8 regresji, 6/6 bezpośrednich prób obu API PDF.js i 24/24 prób procesu
na Node 20.9 PASS; rzeczywisty obraz 4000×4001, 16 MP równo, uszkodzenia,
pusta strona, maska, tekst przed błędem i 20/21 stron OCR zostały sprawdzone.
Markdown tekstowego PL/EN PDF z czterema stronami jest bajtowo zgodny z
niezmienionym alpha.3, SHA-256 obu wyników
`1f0c26cb96bc825bb174b3100a2332f9e02f44baf5c33cacbc6cdab70d72469b`.
Osobny smoke tekstowego PDF przez wydany alpha.3 na obecnym Extension Hoście
przeszedł; w tym przypadku nie potwierdzono regresji CL1. Końcowy smoke
dokładnych rozpakowanych zasobów przeszedł na rzeczywistym VS Code 1.91.0
(Node 20.9.0/Electron 29.4.0) i 1.140.0 (Node 24.21.0/Electron 43.7.3),
Mac ARM. Windows, Linux i macOS x64 nie mają runtime PASS.

C: na każdym Hoście wykonano dwie świeże serie po 300 OCR i serię 50
Cancel/timeout. Wzrost RSS 200→300 to odpowiednio 0.656/0.656 MiB dla 1.91
oraz 0.719/0.625 MiB dla 1.140; `external` i `arrayBuffers` także pozostały
poniżej 32 MiB. Różnica końcowego RSS dwóch serii wyniosła 12.17 MiB i 1.64 MiB
(próg 64 MiB). Każda próbka potwierdziła zero żywych dzieci OCR. Maksimum
jednoczesnej sumy RSS rodzica i dziecka wyniosło 439.98/415.14 MiB na 1.91 i
517.63/513.33 MiB na 1.140. Średnie CPU to 1.22–1.23 rdzenia; 768 MiB i
1.5 rdzenia pozostają progami oceny, nie twardą ochroną pamięci natywnej.
Surowe dane i dokładna metoda są w
[`experiments/ux2-ocr/results/`](../experiments/ux2-ocr/results/), opis w
[`README.md`](../experiments/ux2-ocr/README.md). GC nie był wymuszany.
Nie powtarzano niezmienionej macierzy jakości 200/300 DPI.

Sekwencyjny gauntlet bieżącej sesji PASS: `npm ci`, `npm test` (1316), oba
typechecki, `extension:test` (198), build, package i weryfikacja z jawnymi
ścieżkami nowego trial oraz zwykłego VSIX. Dodatkowo wydany, niezmieniony alpha.3
przeszedł zwykłe `extension:verify`. Niezależny review read-only wykrył wyścig
startów i deadline pustej strony; oba naprawiono przed końcowym artefaktem.
Końcowy przegląd pozostawił jednak dwa ustalenia medium:

- `auto` rozpoznaje obraz dopiero po `getOperatorList()`. Gdy ten etap trwa ponad
  120 s, skan może wygasnąć przed przejściem na budżet OCR 300 s. Wydłużenie
  terminu przed rozpoznaniem obrazu wydłużyłoby go także dla prawdziwie pustej
  strony. Zatwierdzony kontrakt obu terminów nie jest dowiedziony w tej granicy.
- Wykrywanie uszkodzonego obrazu nadal czyta wewnętrzne `page.objs` PDF.js,
  przejęte z rechecku. Nie dodano nowego hooka, ale niezależny review uznał tę
  zależność za ryzyko utrzymania i możliwą kolizję z zakazem prywatnych hooków.

**Status całej fazy: BLOCKED** mimo automatycznych B/C PASS. Potrzebna jest
poprawka i ponowna weryfikacja albo jawna decyzja właściciela o interpretacji
tych granic. Owner smoke dokładnego nowego VSIX **nie ma PASS**. Faza 2 i OBS1
nie zostały rozpoczęte.

### UX2 — domknięcie dwóch ustaleń medium, dalsza faza 1 (2026-10-01)

Właściciel doprecyzował kontrakt: w `auto` pierwsza strona bez niepustego
tekstu staje się kandydatem OCR **przed** `getOperatorList()` i przełącza
absolutny termin z T0+120 s na T0+300 s. Termin obejmuje także stronę, która
później okaże się naprawdę pusta; nie liczy się 300 s od zdarzenia. Dokument
cały tekstowy zachowuje T0+120 s, `all` od początku ma T0+300 s. Potwierdzony
timeout i Cancel nie są odwracane. Kandydat nie zwiększa licznika stron OCR;
prawdziwa pusta strona nadal nie uruchamia Tesseract.

W PDF.js 4.10.38 worker po błędzie dekodowania wysyła `null`; moduł display
wcześniej pomijał taki obraz jako oczekujący. Rozszerzono tylko istniejący
patch display: dostarczony `null` dla zwykłego, powtarzanego lub współdzielonego
obrazu odrzuca `render().promise` z `image-decode-failed`. Niedostarczony
zasób pozostaje stanem oczekiwania. Poprzednia naprawa błędu strumienia
operatorów pozostaje, worker jest bajtowo niezmieniony. Konwerter nie odczytuje
`page.objs`, `commonObjs` ani innych wewnętrznych magazynów; używa
publicznych `getOperatorList()` i `render()`. Błąd odrzuca całą konwersję bez
stron lub Markdown.

Nowy osobny artefakt:
`build/ux2-ocr/review-findings/archi-agent-0.3.0-alpha.3-ux2-review-findings.vsix`,
119970751 B, SHA-256
`79b941bdae8da2cc9962db195808dad78866d7bc13e57b3ca5d1cf69e69fa541`.
Oryginalny moduł PDF.js: `081d3b6f426d38a8029766f8839f505e9cbf2c81a71d62c26eada142e6c21ae4`,
worker: `5e9f76bd5e65fbd1602b29fc50e50490aeeacd34a715b2282b73f7e8029242e0`,
patch: `6a9c947bd44f8d9fa049271fef3a0e3f81f3c175fa8a860221b4651cf4e6907f`,
moduł po patchu: `e68d6587c64fde70d1a9e324b8c4823e2be11a756b0771841807758797e163b7`.
Build wymaga wersji, hashy oryginałów i patcha bez fuzz; zewnętrzny manifest
potwierdza 521 zasobów, w tym wszystkie osiem wariantów bindingów canvas.
Wydany alpha.3 i trzy wcześniejsze triale zachowały hashe podane powyżej.

Krótkie bramki przed pakowaniem oraz pełne testy zasobów rozpakowanych z
dokładnego nowego VSIX, poza repo i bez root `node_modules`, przeszły oddzielnie
na Node 20.9.0 i Node 24.21.0: 14/14 regresji deadline, 13/13 B
(dotychczasowe 8/8 oraz pięć nowych), 11 bezpośrednich prób publicznych API
oraz 30/30 prób procesu na **każdym** runtime. Node 20 używał blokady sieci
w preloadzie, a pełny zestaw Node 24
powtórzono pod systemowym `sandbox-exec` z `deny network*`.
Tekstowy Markdown jest bajtowo
zgodny z alpha.3 (SHA-256
`1f0c26cb96bc825bb174b3100a2332f9e02f44baf5c33cacbc6cdab70d72469b`).
Rzeczywiste Extension Hosty VS Code 1.91.0/Node 20.9.0/Electron 29.4.0 oraz
1.140.0/Node 24.21.0/Electron 43.7.3, oba arm64, przeszły smoke tekstu,
skanu, PDF mieszanego, uszkodzeń i przekroczenia 16 MP.

C na finalnym artefakcie: po dwie świeże serie 300/300 na każdym Hoście.
RSS 200→300 wzrosło o 0.672/0.703 MiB na 1.91 i 0.578/0.656 MiB na 1.140;
`external` i `arrayBuffers` także pozostały poniżej 32 MiB. Różnica
końcowego RSS serii to 12.57 i 0.72 MiB (próg 64 MiB).
Jednoczesne maksima sumy RSS rodzica i dziecka wyniosły
446.16/426.67 MiB i 506.95/507.23 MiB. Średnie CPU 1.21–1.23 rdzenia.
Po każdej próbce zero żywych dzieci OCR. Osobne serie 50 Cancel/timeout na
obu Hostach zakończyły wszystkie dzieci. GC nie wymuszano. Średnia
`processingMs` obejmuje średni `startupMs`; `cleanupMs` zaczyna się po
końcowym wyniku. Jedna niepełna próba Hosta 1.91 po 1/300 została odrzucona,
ponieważ zamknęło się okno; nie jest wynikiem C. Surowe dane i metodologia są
w [`README.md`](../experiments/ux2-ocr/README.md) oraz
[`results/`](../experiments/ux2-ocr/results/).

Sekwencyjny gauntlet tej sesji PASS po uruchomieniu poza sandboxem:
`npm ci`, `npm test` (1316), oba typechecki, `extension:test` (198),
build, package, verify, `demo:dry-run`, kontrola whitespace i `npm audit`
(0 podatności). Pierwsza próba w sandboxie nie przeszła: 72 testy lokalnego
HTTP nie mogły nasłuchiwać na `127.0.0.1` (`EPERM`); nie jest liczona jako
PASS. Osobna `extension:verify` ze ścieżką dokładnego nowego VSIX i
zewnętrznym manifestem potwierdziła 530 wpisów oraz hashe; wydany alpha.3
również przeszedł zwykły verifier. Niezależny końcowy review read-only
sprawdził obie wcześniejsze uwagi medium, kod, manifest, hash VSIX, zachowane
artefakty, logi bramek i surowe C; werdykt **READY, bez high/medium**.
Reviewer wskazał dwie niespójności dokumentacji (ścieżka komendy odtworzenia
i nieaktualny następny etap); poprawiono je przed tym werdyktem. Reviewer nie
uruchamiał ponownie B/C.

Macierz jakości 200/300 DPI nie była ponawiana. Owner smoke dokładnego nowego
VSIX **nie ma PASS**. Windows, Linux i macOS x64 mają inwentaryzację i hashe,
lecz nie mają runtime smoke. Faza 2 i OBS1 pozostają nierozpoczęte.

### UX2 — faza 2, integracja produktowa (2026-10-02)

Na `feature/ux2-ocr-feasibility`, HEAD `0192e8afd8fa850cfbc0679ce19c08df980e71fb`,
zintegrowano backend fazy 1 z publiczną komendą `Archi Agent: Convert to Markdown`
(`archiAgent.convertToMarkdown`). PDF daje wybór Auto OCR / No OCR / OCR all pages;
DOCX i XLSX nie pytają o OCR. Runtime używa dotychczasowego workera dla trybu
bez OCR i formatów Office, a dla OCR uruchamia istniejącego rodzica/dziecko z
zasobami spakowanymi obok bundla. Postęp i Cancel są w standardowym anulowalnym
powiadomieniu. Wynik pojawia się dopiero po zamknięciu procesu OCR; strony OCR
i puste są oznaczone w Markdown. Błędy mają zamknięte, bezpieczne komunikaty.
Nie dodano chmury ani LLM.

Kandydat: `build/ux2-ocr/phase2/candidate/archi-agent-0.3.0-alpha.3.vsix`,
**119805748 B**, SHA-256
`b80c861deaf233343ceaa105969ba5c3e7a625f0b5be040c94d6e21a57c9ef4b`.
To **165003 B mniej** niż poprzedni kandydat fazy 1 `review-findings`
(119970751 B, SHA-256
`79b941bdae8da2cc9962db195808dad78866d7bc13e57b3ca5d1cf69e69fa541`).
Poprzedni artefakt zachowano. Jego owner smoke 5/5 PASS na Mac ARM,
VS Code 1.140.0/Node 24.21.0/Electron 43.7.3 oraz późniejsze potwierdzenie
ręcznego Cancel dotyczą tylko tamtego SHA. Poniższe potwierdzenie dotyczy nowego VSIX.

Sekwencyjny gauntlet poza sandboxem PASS: `npm ci`, `npm test` (1319), oba
typechecki, `extension:test` (201), build, package, verify, `demo:dry-run`,
whitespace i `npm audit` (0 podatności). Pierwsza próba w sandboxie nie przeszła
z powodu EPERM nasłuchu lokalnego HTTP oraz starej asercji pakowania; nie jest
liczona jako PASS. Po poprawce testu negatywnego weryfikatora 32/32 testy celowane
PASS. Dokładny nowy VSIX przeszedł osobny verify 529 wpisów z hashami patcha
PDF.js, modeli, WASM i ośmiu bindingów canvas. Smoke automatyczny z tego
rozpakowanego VSIX poza repo przeszedł: tekst PDF, PL/EN OCR, mieszany z
oznaczeniami OCR/blank, all, blank, limit 16 MP, Cancel, ponowna konwersja
oraz DOCX/XLSX. Trzy rundy niezależnego review read-only zakończyły się bez
pozostałych high/medium. Zasoby
Windows, Linux i macOS x64 mają manifest/hash, lecz nie mają runtime smoke.

**Owner smoke 2026-10-02 — PASS, potwierdzenie właściciela.** Właściciel zgłosił
„wszystko na zielono” po ręcznym użyciu zwykłej komendy **Archi Agent: Convert to
Markdown** w czystym profilu VS Code na Mac ARM. Potwierdzenie obejmuje przekazane
scenariusze PDF: tekst bez OCR, polski i angielski skan z Auto OCR, dokument mieszany
z Auto OCR i OCR all pages, pustą stronę, przekroczenie limitu obrazu oraz kolejność
i oznaczenia stron; obejmuje też Cancel, brak częściowego dokumentu, konwersję po
Cancel i regresję DOCX/XLSX bez pytania o OCR. Dotyczy wyłącznie kandydata o ścieżce,
rozmiarze i SHA-256 podanych wyżej. To ręczne potwierdzenie właściciela, odrębne od
automatycznego smoke rozpakowanego VSIX. Nie zgłoszono wersji VS Code, Node ani
Electron użytych w tym owner smoke. Windows, Linux i macOS x64 nadal nie mają runtime
smoke. Nowe wydanie nie zostało opublikowane; istniejący tag i release assets
`v0.3.0-alpha.3` pozostają bez zmian.

## CL1 — decyzja backlogowa i faza planowania (2026-09-29)

Właściciel wyznaczył CL1 jako następne zadanie po opublikowanym `v0.3.0-alpha.1`, przed
M1. Cel: zwiększenie limitów lokalnej konwersji PDF, DOCX i XLSX do Markdown. Zatwierdzony
maksymalny rozmiar pliku wejściowego to 50 MiB. Limity wyniku Markdown, czasu, stron PDF,
archiwum Office, arkuszy, wierszy i komórek wymagają propozycji opartej na kodzie, bezpieczeństwie
zasobów i testach oraz przeglądu planu. Walidacja PUML utworzonych lub poprawionych przez
użytkownika i wizualizacja wiedzy są osobnymi przyszłymi zadaniami.

Faza A: aktualizacja backlogu i planowanie, bez implementacji kodu lub testów. Lokalny preflight:
`main`, HEAD `110737205e898815307e2d648991e91500347d5d`, lokalny `github/main` i tag
`v0.3.0-alpha.1` wskazywały ten sam commit; working tree i staging były czyste. Utworzono
`feature/cl1-conversion-limits`. Historyczne raporty UX1 i przygotowania wydania poniżej zachowują
limity i stan z czasu ich powstania. Plan CL1 znajduje się w raporcie fazy A i wymaga osobnego
zatwierdzenia przed promptem IMPLEMENTACJA.

## CL1 — implementacja i automatyczna weryfikacja (2026-09-29)

Na `feature/cl1-conversion-limits` od HEAD `1107372` wdrożono plan CL1. Limity wejścia
PDF/DOCX/XLSX wynoszą 50 MiB; wyniku Markdown 8 MiB, czasu 120 s, PDF 300 stron,
Office ZIP 1000 wpisów / 100 MiB łącznie / 25 MiB na wpis / 100:1, XLSX 40 arkuszy /
20000 wierszy / 150 kolumn / 250000 komórek. Przed `read-excel-file` parser strumieniowy
`saxen` sprawdza relacje arkuszy, adresy komórek, indeksy wierszy, rozmiar siatek i limity
XML (24 MiB na arkusz, 64 MiB łącznie, 16 MiB shared strings, 8 MiB styles). Formuły bez
cache są normalizowane wyłącznie w zidentyfikowanych arkuszach. Worker ma limity sterty
512/64 MiB. Test odrzucenia rzadkiej siatki potwierdza brak wywołania `read-excel-file`.

Automatyczne bramki wykonane sekwencyjnie w tej sesji: `npm test` 1313/1313,
`npm run typecheck`, `npm run extension:typecheck`, `npm run extension:test` 198/198,
`npm run extension:build`, pakowanie do `vscode-extension/build/cl1-candidate/`,
`npm run extension:verify` z jawną ścieżką VSIX i `git diff --check` — PASS.
Izolowany smoke granicznego syntetycznego XLSX zwrócił `archive-limit`, zachował bajty
wejściowe, nie uległ awarii i zanotował peak RSS 185 MiB (próg 768 MiB).
Runtime wyjęty z dokładnego kandydata VSIX, poza repo i bez `node_modules`, przekonwertował
syntetyczne wejścia PDF/DOCX/XLSX powyżej dawnych 10 MiB; odrzucił PDF 50 MiB + 1 bajt,
obsłużył Cancel i zachował bajty wszystkich źródeł.
Kandydat: `vscode-extension/build/cl1-candidate/archi-agent-0.3.0-alpha.2.vsix`,
SHA-256 `0120f2c0d3e69f3852af6e330573c1d0566c9ed74121ee46cad92e3144fdf1c9`;
manifest `setech-pl.archi-agent` / `0.3.0-alpha.2`, osiem wpisów. Zachowany
owner-smoked `alpha.1` przed i po bramkach zachował SHA-256
`e3b3fef6f2ec86265c7a74676361dad32fca8da9634e2b2202165c74635345fa`.
Dokładny VSIX `alpha.2` zainstalowano przez CLI w świeżym katalogu profilu i rozszerzeń;
`code --list-extensions --show-versions` pokazał `setech-pl.archi-agent@0.3.0-alpha.2`.
Właściciel zgłosił **PASS** owner smoke dokładnego VSIX `alpha.2` o powyższym SHA-256.
W UI sprawdził konwersję dużego PDF, XLSX i dokumentu Word; wszystkie trzy działały.
Jest to raport właściciela; agent nie wykonywał testów UI. Właściciel nie podał tu
osobnych wyników UI dla przekroczenia limitu, Cancel, liczby otwartych edytorów ani
checksumów źródeł. Po PASS wykonano `npm ci`
(0 podatności), ponownie 1316/1316 testów, oba typechecki, 198/198 testów rozszerzenia,
build, weryfikację dokładnego VSIX, izolowane smoke oraz `git diff --check` — PASS.
Trzy bundlowane pliki w zachowanym VSIX są bajtowo identyczne z bieżącym build.

Końcowy przegląd diffu wykazał rozbieżność publikacyjną: dołączony do
zaakceptowanego VSIX `alpha.2` README nadal opisywał `0.3.0-alpha.1` i stare limity.
Właściciel polecił podbić wersję alpha, poprawić dokumentację i wykonać commit.
Wersja robocza to teraz `0.3.0-alpha.3`; nowy kandydat powstał w osobnym katalogu
`vscode-extension/build/cl1-candidate-alpha.3/archi-agent-0.3.0-alpha.3.vsix`,
SHA-256 `f679bd823224cca1cf08e6374de7b2cd0f2191f9192fc1c962dc2f5578dd74d5`.
Manifest i dołączony README mają wersję `alpha.3` oraz limity CL1. Trzy executable
bundles są bajtowo identyczne z owner-smoked `alpha.2`. `npm test` 1316/1316,
oba typechecki, `extension:test` 198/198, build, package, jawna weryfikacja VSIX,
smoke runtime z dokładnego VSIX i RSS 185 MiB — PASS. `alpha.2` i zachowany
`alpha.1` pozostały nietknięte. Owner smoke `alpha.3` jest wymagany przed publikacją;
raport PASS właściciela dotyczył `alpha.2`. Implementację i dokumentację CL1 zapisano
w commicie `9d7db56062527d989e646c89bc505992d9964846` na feature. Bez push,
merge, tagu i publikacji.

Po korekcie kolejności przez właściciela wykonano świeży `git ls-remote` i `git fetch`
zdalnego `github/main`: `110737205e898815307e2d648991e91500347d5d` jest przodkiem
feature, więc integracja nie wymagała merge. Pełny diff względem `github/main`
przejrzano, a bramki uruchomiono sekwencyjnie: `npm test` 1316/1316,
`npm run typecheck`, `npm run extension:typecheck`, `npm run extension:test` 198/198,
`npm run extension:build`, pakowanie do nowego katalogu, jawne `extension:verify`
i `git diff --check` — PASS. Smoke runtime z dokładnego finalnego VSIX potwierdził
konwersję syntetycznych PDF/DOCX/XLSX powyżej 10 MiB, odrzucenie PDF 50 MiB + 1 bajt,
Cancel i niezmienność źródeł. Izolowany XLSX: `archive-limit`, peak RSS 186 MiB
(próg 768 MiB), źródło niezmienione. Finalny plik do owner smoke:
`vscode-extension/build/cl1-final-alpha.3/archi-agent-0.3.0-alpha.3.vsix`,
SHA-256 `7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056`;
obok zachowano plik `.sha256`. Manifest ma `0.3.0-alpha.3`, 8 wpisów i poprawiony
README. Właściciel potwierdził **PASS** owner smoke tego dokładnego finalnego VSIX
`alpha.3` o powyższym SHA-256. Nie wyszczególnił przypadków UI sprawdzonych w tym
przebiegu. Raport UI dla `alpha.2` obejmuje wyłącznie duże PDF, XLSX i Word; nie
obejmuje Cancel ani limitu. Wyniki Cancel i limitu opisane wyżej są automatycznym
smoke runtime, nie ręcznym testem właściciela.

## Integracja `github/main` i nowy kandydat (2026-09-29)

Właściciel wskazał `12af6b09af9c5114b10fa105202d4e7e154c4004` jako dokładny
commit `github/main` do integracji z `feature/reviewed-diagram-pipeline`.
Poprzedni niedokończony merge z `1a9c6d8` wycofano; jego patch diagnostyczny
pozostał poza repo. Po potwierdzeniu
czystego drzewa pobrano i sprawdzono zdalny `github/main`; merge `12af6b0`
uruchomiono bez automatycznego commita. Git nie zgłosił konfliktów i nie zmienił
drzewa feature, ponieważ merge commit na `main` ma tę samą treść co wspólny
przodek `4dbc65a`; feature zawiera już pracę D1/P2 oraz D2, konwerter i wydanie.

Poprzedni VSIX (SHA-256 `ac818833faec4332e13e62d0b1518e57e8524007bae4a85906206ac87a814fa1`)
ma owner smoke PASS, ale nie stanowi dowodu dla nowego kandydata. Wyniki gauntlet
i VSIX z niedokończonej integracji `1a9c6d8` również są historyczne.

Nowy pełny gauntlet po merge: `npm ci`, `npm test` 1309/1309, oba typechecki,
`extension:test` 198/198, build, package, verify, demo dry run, kontrole diff
i `npm audit` (0 podatności) — PASS. Pierwszy przebieg sandboxowy zatrzymał
`listen EPERM` na loopback; pełny przebieg z dostępem do loopback przeszedł.
Niezależny read-only review przed bramkami: runda 1/3, bez high/medium.

Nowy zachowany VSIX:
`vscode-extension/build/release/integration-12af6b0/archi-agent-0.3.0-alpha.1.vsix`,
966290 B, SHA-256 `e3b3fef6f2ec86265c7a74676361dad32fca8da9634e2b2202165c74635345fa`.
Obok znajduje się `archi-agent-0.3.0-alpha.1.sha256`. Dokładny zachowany plik
przeszedł weryfikację ośmiu dozwolonych wpisów, manifestu
`setech-pl.archi-agent` / `0.3.0-alpha.1` i wybrany skan sekretów, lokalnych
ścieżek, sentineli oraz treści fixture. Jego runtime i worker uruchomiono poza
repo bez `node_modules` i PATH: konwersja syntetycznych PDF/DOCX/XLSX, niezmienność
źródeł, anulowanie bez częściowego wyniku i odrzucenie nieobsługiwanego typu — PASS.
Właściciel zgłosił **PASS** owner smoke tego dokładnego VSIX: instalacja w świeżym
profilu, wersja, cztery sekcje Open, konwersja PDF/DOCX/XLSX bez zmian źródeł,
Sequence i compatibility command, Component z grounding report, anulowanie bez
częściowych rezultatów, wybór providera i modelu, obsługa klucza chmurowego w UI
bez płatnego wywołania oraz instalacja według README bez repo i npm. Jest to
raport właściciela, nie test UI wykonany przez agenta. Właściciel autoryzował
commit integracyjny i zwykły push wyłącznie feature. VSIX i checksum pozostają
poza historią Git. Tag i publikacja prerelease oczekują na późniejszą decyzję
oraz potwierdzenie, że `main` wskazuje zweryfikowany commit.

## v0.3.0-alpha.1 — owner smoke PASS, release preparation (2026-09-28)

Decyzja właściciela: prerelease `v0.3.0-alpha.1` po D2, bez włączania M1, C1, D3–D5,
K2 ani K3 do tego wydania. Zmieniono tylko dokumentację wydania, metadane wersji
rozszerzenia i oczekiwaną nazwę pakietu w teście; root `archground` i lockfile pozostają
na `0.1.0-private.0`, ponieważ nie opisują wersji rozszerzenia. Remote nie ma jeszcze tagów.
Release notes: [`releases/v0.3.0-alpha.1.md`](releases/v0.3.0-alpha.1.md).

Niezależny read-only review: 3 rundy, jedno trafne medium w pierwszej (nazwa pozycji
Knowledge Pack), poprawione; po trzeciej brak high/medium. Pełny sekwencyjny gauntlet:
`npm ci`, `npm test` 1309/1309, oba typechecki, `extension:test` 198/198,
`extension:build`, `extension:package`, `extension:verify`, `demo:dry-run`, kontrole
whitespace i `npm audit` (0 podatności) — PASS. Pierwszy przebieg sandboxowy
zatrzymało `listen EPERM` na loopback; po korekcie przykładu komend w README cały
runner przeszedł z dostępem do loopback.

Zachowany artefakt: `vscode-extension/build/release/archi-agent-0.3.0-alpha.1.vsix`,
966231 B, SHA-256 `ac818833faec4332e13e62d0b1518e57e8524007bae4a85906206ac87a814fa1`.
Plik kontrolny obok: `archi-agent-0.3.0-alpha.1.sha256`. Osiem dozwolonych wpisów;
manifest ma `setech-pl.archi-agent` w wersji `0.3.0-alpha.1`. Skan nie znalazł
wzorców credentiali, ścieżki lokalnej, sentinela ani treści fixture. Runtime wyjęty
z dokładnie tego VSIX uruchomił się poza repo bez `node_modules` i PATH; smoke potwierdził
anulowanie konwersji i wczesne odrzucenie nieobsługiwanego typu. Test pakowania obejmuje
również generowanie Sequence z rozpakowanego VSIX. Dokładny kandydat nie był ponownie budowany.

Właściciel zgłosił **PASS** wszystkich dziewięciu żądanych kontroli owner smoke
na dokładnie zachowanym VSIX i osobno autoryzował commit oraz zwykły push
przygotowania wydania. Jest to raport właściciela, nie test UI wykonany przez agenta.
Tag, merge do `main` i GitHub Release pozostają poza tą finalizacją. Bieżący
stan commit/push należy sprawdzić w Git.

## D2 — Component completed, owner smoke PASS (2026-09-28)

Implementacja na bazie `cfca4266511b59d05d70f495558ab8514170d606` dodaje Component do
istniejącej komendy `Generate Diagram`. Osobny, ograniczony snapshot D2 ma digest obejmujący
pełne zadanie, wybrane elementy, pozycje rozstrzygniętych aliasów, relacje, reguły i wiersze flow.
Generator zwraca zamknięty plan zależności z odwołaniami do lokalnego katalogu, a renderer
emituje wyłącznie deterministyczny podzbiór PlantUML component. Lokalna walidacja i jeden
niezależny reviewer utrzymują limit 0/1/2 wywołań. Report v2 zawiera pochodzenie faktów,
kind i ownership elementów oraz fizyczne linie. Sequence i osobna komenda compatibility
pozostają osobnymi ścieżkami. M1, C1, D3–D5, K2 i K3 nie były implementowane.

Test-first RED: nowy test nie znalazł modułu `component-snapshot`. Po implementacji testy
celowane: 90/90. Niezależny review read-only: trzy rundy; poprawiono mapowanie aliasów,
pełne zadanie i digest, diagnostykę review, raport external provenance oraz dowody testowe;
końcowy werdykt: brak high/medium. Pełne bramki po review: `npm test` 1309/1309,
`typecheck`, `extension:typecheck`, `extension:test` 198/198, `extension:build`,
`extension:package`, `extension:verify`, `demo:dry-run`, kontrole whitespace i `npm audit`
(0 podatności) — PASS. Pierwszy przebieg w sandboxie nie mógł otworzyć loopback (`listen EPERM`),
więc cały runner powtórzono z dostępem do loopback; ten przebieg przeszedł.

VSIX przed owner smoke: `vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix`, 966881 B,
SHA-256 `deb84d8ee2d49b265a38892bab2cb00b342a6a6c6b46489cb2116b79f95bb3e4`.
Osiem wpisów zgodnych z allowlistą. Rozpakowany z ówczesnego VSIX runtime D2 przeszedł smoke
poza repo i bez `node_modules`/PATH: sukces 2 call, lokalne odrzucenie 1 call,
niepoprawny verdict 2 call z kandydatem unverified, Cancel 0/1 call bez częściowego wyniku;
syntetyczne źródła pozostały bajtowo niezmienione. Skan trzech bundle nie znalazł
testowego sentinela, wzorców credentiali, lokalnej ścieżki repo ani tekstu fixture'ów.
Właściciel zgłosił owner smoke PASS na pakowanym VSIX: `Generate Diagram → Component`
otworzył zweryfikowany PlantUML i report v2. Kierunki relacji, Command API oraz klasyfikacja
Orbital Relay jako external były poprawne. Nie pojawił się modal unverified candidate;
Cancel nie otworzył częściowego diagramu ani raportu. Poprawiony dokument smoke zawierał
jedynie `diagram_name`, `flow_name` i `author`. Wcześniejsza instrukcja smoke zawierała
`language: en`; przykład w `docs/front-matter.md` uproszczono do tych trzech pól.
Parser repo nadal przyjmuje opcjonalne `language` (`en` albo `pl`), więc dokumentacja kluczy
zachowuje ten kontrakt. Ręcznego smoke nie powtarzano w sesji finalizacji.

Finalizacja po owner smoke: `npm ci`, `npm test` (1309/1309), oba typechecki,
`extension:test` (198/198), `extension:build`, `extension:package`, `extension:verify`,
`demo:dry-run`, `npm audit` (0 podatności) i `git diff --check` — PASS.
Odbudowany VSIX ma 8 dozwolonych wpisów, 966881 B i SHA-256
`3a83dc28606dbc35a66c28a205998e7915691df348c59789c63eb0f59ccc4f7d`.
Archiwum tworzone jest ponownie z bieżącymi znacznikami czasu; jego hash różni się od
artefaktu użytego w owner smoke. Test pakowania uruchomił runtime z wyjętego VSIX poza
repo, bez `node_modules`, npm i PATH. Owner smoke dotyczył wcześniejszego pakowania
tej samej implementacji.

Następny krok produktowy: M1 (MCP), potem C1.

## UX1 — completed, owner smoke PASS (2026-09-23)

UX1 implementuje `Archi Agent: Open` z czterema sekcjami QuickPick i samodzielne
`Convert to Markdown`. Konwersja PDF z warstwą tekstową, DOCX i XLSX działa lokalnie
w jednorazowym workerze; otwiera jeden niezapisany dokument Markdown dopiero po sukcesie.
DOC, XLS, OCR, obrazy, D2, M1/MCP i C1 pozostają poza UX1. Limity: wejście 10 MiB,
wynik 2 MiB, PDF 100 stron, ZIP 1000 wpisów/50 MiB łącznie/10 MiB na wpis/100:1,
XLSX 20 arkuszy/5000 wierszy/100 kolumn/100 000 komórek, timeout 30 s.

Trzy rundy niezależnego review zakończyły się bez otwartych high/medium. Po korekcie
testu rozróżniającego URI przestrzeni nazw OOXML od adresów sieciowych pełne bramki
`npm ci`, `npm test` (1292/1292), `typecheck`, `extension:typecheck`,
`extension:test` (189/189), `extension:build`, `extension:package`,
`extension:verify` i `demo:dry-run` przeszły. `npm audit` zgłosił 0 podatności
dla lockfile. Osobno oceniono advisory PDF.js dotyczące skryptów w viewerze:
UX1 nie uruchamia viewera ani API skryptów, wyłącznie ekstrakcję tekstu.
Rozpakowany runtime i worker z VSIX przeszły smoke PDF/DOCX/XLSX oraz
Cancel na Node 20.9.0 poza repo i bez `node_modules`; źródła pozostały bajtowo
niezmienione. Skan ośmiu wpisów VSIX i trzech bundle nie znalazł testowego sentinela,
credentiali, ścieżek ani treści fixture'ów.

Owner smoke: **PASS**. Instalacja samowystarczalnego VSIX w świeżym, izolowanym
profilu VS Code: PASS. `Archi Agent: Open`: PASS; cztery sekcje to Generate Diagram,
Configuration, Knowledge Management i Convert to Markdown. Lokalna konwersja PDF,
DOCX i XLSX: PASS; wynik otwiera się jako niezapisany dokument Markdown, bez zmiany
źródła. Konwersja nie wymaga providera, modelu, API key ani Knowledge Pack i nie używa
LLM, sieci ani `SecretStorage`. PDF działa bez OCR; DOC i XLS pozostają odłożone.
Generate Diagram → Sequence i compatibility command pozostały funkcjonalne.
D1.2 i S1 pozostają PASS. Następny milestone: D2, potem M1 (MCP).

## Historia na `main`

- `b759bb9` — merge fundamentu rozszerzenia VS Code (`feature/vscode-extension-foundation`,
  checkpoint `v0.2.0-alpha.1`) oraz dokumentów documentation governance do `main`.
- Po merge priorytet zmieniono z EA XML na **Knowledge Pack Builder**. EA XML jest odłożone, bo nie
  ma bezpiecznego, publicznego fixture reprezentującego rzeczywiste dane EA.
- 2026-09-19 — wcześniejsza decyzja o priorytetach (demonstracja vibe coding i AI SDLC),
  następnie zastąpiona R1 z 2026-09-21 i R2 z 2026-09-22. Ówczesna kolejność:
  R2 → D1.2 → S1 → M1 → D2 → C1 → D3 → D4 → D5 → K2 → K3 → REL; zob.
  [`product-roadmap.md`](product-roadmap.md).

## Implementacja B1

- `src/core/llm/structured-chat-client.ts` — neutralne kontrakty wiadomości, requestu, wyniku i
  klienta structured chat; wspólne model generation metadata, limit `maxTokens` 1..16384 i
  bezpieczny `safeErrorCode`.
- `src/node/llm/openai-compatible-local-chat-client.ts` — wydzielony lokalny transport HTTP,
  mapowanie OpenAI-compatible, limity, timeout/cancellation, ścisłe parsowanie `content` i lokalny
  compatibility fallback `reasoning_content`.
- `OpenAiCompatibleLocalGenerator` zachowuje publiczny konstruktor i zachowanie, ale jest cienką
  warstwą budującą dotychczasowy prompt/schema i delegującą dokładnie jedno `complete()`.
- Runtime, rozszerzenie, ustawienia, bundler, format raportu, PlantUML i golden outputs nie zostały
  zmienione. Brak nowych zależności i zmian `package.json`/`package-lock.json`.

## Implementacja P1

- `src/core/llm/provider-profile.ts` i `provider-registry.ts` — neutralne, niemutowalne profile,
  walidacja i deterministyczne sortowanie; kontrolowane kody `duplicate-profile-id` i
  `unknown-provider-profile`. Core nie zna nazw lokalnych produktów, endpointów ani transportu.
- `src/node/llm/local-provider-profiles.ts` — LM Studio (`local-lm-studio`, port 1234) i Ollama
  (`local-ollama`, port 11434), oba z capability model listing + structured chat i oba przez
  istniejący transport OpenAI-compatible (`GET /v1/models`, `POST /v1/chat/completions`). Brak
  natywnego API Ollamy, kluczy, retry, repair i fallbacku.
- Runtime zachowuje `listLocalModels`, `kind: openai-compatible-local` i publiczne adaptery, a dodaje
  `listProviderProfiles`, `listProviderModels` i profilowy wariant konfiguracji generatora. Nieznany
  profil lub brak capability kończy się kontrolowanym błędem przed requestem modelowym.
- Rozszerzenie dodaje komendy wyboru lokalnego profilu i modelu. `localModel.profile`,
  `localModel.selectedModel` oraz zarządzany przez rozszerzenie binding
  `localModel.selectedModelProfile` mają scope `machine` i są zapisywane globalnie, więc nie
  podlegają Settings Sync ani override workspace. Model jest aktywny tylko przy bindingu zgodnym z
  profilem. Zmiana profilu komendą czyści model i binding przed zapisem profilu; sam wybór profilu
  nie wykonuje sieci, a wybór modelu wykonuje jeden jawny GET.
- Migracja jest bezobsługowa wyłącznie przy braku jawnej globalnej wartości profilu: wtedy działa
  legacy LM Studio z efektywnymi `localModel.baseUrl` i `localModel.model`. Każda istniejąca, ale
  nieznana lub niepoprawna jawna wartość kończy się `unknown-provider-profile` przed siecią, bez
  legacy fallbacku. Po jawnym wyborze model pochodzi wyłącznie z globalnego `selectedModel` ze
  zgodnym bindingiem. Ręczna zmiana profilu pozostawia stary model nieaktywny; Ollama ignoruje legacy
  URL/model, a istniejące ustawienia nie są usuwane.

## Implementacja P2

- Profile `cloud-anthropic`, `cloud-openai` i `cloud-openrouter` rozszerzają ten sam neutralny
  `ProviderRegistry`. Każdy deklaruje wymaganie `api-key`; profile lokalne deklarują `none` i ich
  zachowanie, generator type (`openai-compatible-local`) oraz metadane 0/42 pozostają bez zmian.
- `src/node/llm/remote-json-transport.ts` jest transportem HTTPS-only z zamkniętą allowlistą sześciu
  kombinacji host/metoda/ścieżka. Odrzuca redirecty, ogranicza request/response, timeout i listę
  modeli, obsługuje cancellation i zwraca wyłącznie bezpieczne kody. Nie przyjmuje URL od użytkownika.
  Granica produkcyjnego `NodeHttpsJsonTransport` jest testowana przez wąski double `https.request`:
  dokładne opcje i nagłówki, bajtowy `Content-Length`, statusy i błędy socket/TLS, limity, ucięcie,
  timeout/cancellation z `destroy()` oraz brak retry.
- Anthropic ma osobny adapter natywnego Messages API. Używa stabilnego `output_config.format`, bez
  beta headera, temperature i thinking; parser wymaga dokładnie jednego text block oraz
  `stop_reason=end_turn`. Wire schema jest niemutującą projekcją pełnego generated-model schema;
  lokalna walidacja Zod i cały pipeline pozostają bez zmian. Listing dopuszcza wyłącznie rekordy z
  `capabilities.structured_outputs.supported === true`; kolejne początkowe system messages są łączone
  przez `\n\n`, a system message po pierwszej roli niesystemowej jest odrzucana przed I/O.
- OpenAI i OpenRouter współdzielą wyłącznie zdalny adapter OpenAI-compatible. OpenAI mapuje
  `maxTokens` do `max_completion_tokens`; OpenRouter do `max_tokens` i zawsze wysyła
  `provider.allow_fallbacks=false`, `provider.require_parameters=true`, bez pola `models`. Oba
  adaptery wymagają dokładnie `finish_reason=stop`, bez zmiany lokalnej kompatybilności parsera.
- Model listing jest osobno parsowany per provider. OpenRouter używa dokładnie
  `/api/v1/models?supported_parameters=response_format&limit=1000`, ponownie sprawdza
  `supported_parameters`, nie paginuje i odrzuca uciętą stronę. Identyfikatory są walidowane,
  deduplikowane i sortowane deterministycznie.
- VS Code udostępnia generyczne komendy wyboru profilu/modelu oraz ustawienia/usunięcia klucza.
  Trzy stałe identyfikatory sekretów żyją wyłącznie w `SecretStorage`; input ma `password: true`,
  wspólna neutralna walidacja wymaga 1–1024 znaków bez brzegowego whitespace i znaków kontrolnych,
  a brak klucza blokuje provider I/O. Picker profilu nie odczytuje sekretów ani nie pokazuje ich
  statusu; klucz jest odczytywany dopiero bezpośrednio przed jawnym listingiem lub generowaniem.
  Aktywacja, wybór profilu i set/delete key nie wykonują sieci. Stare command IDs P1 są ukrytymi aliasami.
- Profil i model/binding nadal są machine-scoped i zachowują się po restarcie; klucz nie trafia do
  settings/globalState/logów/błędów/raportów/artefaktów/VSIX. Szczegóły i ręczne smoke flows:
  [`cloud-models.md`](cloud-models.md).
- Kontrakt anulowania rozróżnia wcześniejsze pickery od pickera modelu: anulowanie profilu lub
  źródła flow następuje przed odczytem sekretu i I/O, natomiast cloud model picker może powstać
  dopiero po jednym `SecretStorage.get` i jednym GET listy modeli. Jego anulowanie nie zapisuje
  modelu/bindingu i nie uruchamia generacyjnego POST ani generowania. Generate z już wybranym
  modelem pomija listing i czyta sekret bezpośrednio przed generowaniem; profile lokalne nie czytają
  `SecretStorage`.

## Knowledge Pack Builder — etap A

Knowledge Pack Builder — **wyłącznie etap A: deterministyczny rdzeń** (bez LLM, bez dostępu do plików
użytkownika, bez runtime API, UI i zapisu na dysk). Zaakceptowany przez właściciela po przeglądzie
obejmującym dwie korekty zakresu (granica decyzji/basis, jednoznaczność aliasów).

- `src/core/knowledge-pack/builder/knowledge-pack-candidate.ts` — model kandydata (tabela, wiersz
  w formacie kolumn istniejącej tabeli, `basis` `explicit`/`inferred`, co najmniej jeden dowód
  `sourceId` + `excerpt` z opcjonalnym zakresem linii), wpis draftu z decyzją
  `pending`/`accepted`/`rejected`, schematy koperty i limity. `isIncludedInPack` zależy wyłącznie
  od decyzji (`accepted` → wchodzi, `rejected`/`pending` → nie wchodzi); `basis` nie decyduje
  o włączeniu — LLM przedstawia kandydatów, ale nie decyduje, co staje się zaufanym katalogiem
  architektury; `basis` służy wyłącznie prezentacji i review.
- `src/core/knowledge-pack/builder/knowledge-pack-renderer.ts` — deterministyczny renderer dokładnie
  pięciu plików (stała kolejność plików i kolumn, wiersze sortowane po komórkach, LF, escaping `\`
  i `|`, pusta tabela = nagłówek + separator); odmawia wartości z kontrolnymi znakami i zabronionym
  markupem.
- `src/core/knowledge-pack/builder/knowledge-pack-builder.ts` — `buildKnowledgePack`: walidacja
  koperty i decyzji (kandydat `pending`, niezależnie od `basis`, blokuje build jednym kodem błędu
  `candidate-decision-pending`, bez wycieku row/evidence w issue); kolizje po
  `normalizeGroundingReference` (canonical names systemów/aktorów; dla aliasów —
  **jeden znormalizowany alias wskazuje dokładnie jeden target**: każdy drugi zaakceptowany rekord
  dla tego samego znormalizowanego aliasu jest błędem `alias-collision`, niezależnie od dosłownej
  pisowni i niezależnie od tego, czy target jest taki sam, czy różny; wyjątek — dokładnie ten sam
  wiersz, ta sama pisownia i ten sam target, powtórzony dwa razy, nie generuje osobnego
  `alias-collision` z buildera, łapie go istniejący `duplicate-record` loadera). To granica
  wyłącznie buildera; kontrakt loadera dla ręcznie pisanych paczek nadal dopuszcza jawną
  niejednoznaczność tej samej pisowni aliasu dla wielu celów — patrz `docs/knowledge-pack-format.md`,
  sekcja `aliases.md`, i istniejące testy `knowledge-pack-loader.test.ts`. Render →
  `InMemoryKnowledgePackSource` → `loadKnowledgePack` jako końcowa walidacja (schematy, duplikaty,
  referencje, reguły), porównanie round-trip. Issues wskazują wpis draftu, tabelę i pole, bez
  wartości i dowodów.
- `src/core/knowledge-pack/in-memory-knowledge-pack-source.ts` — źródło w pamięci zgodne z portem.
- Puste tabele: jawna opcja `allowEmpty` w `parseMarkdownTable` / `parseKnowledgePackTable`
  (domyślnie `false`); loader przekazuje ją per plik — `systems.md` nadal wymaga rekordu,
  pozostałe cztery pliki mogą być puste. Opisane w `docs/knowledge-pack-format.md`.
- Testy: `test/unit/knowledge-pack/builder/*`, `test/unit/knowledge-pack/in-memory-knowledge-pack-source.test.ts`
  — macierz `basis` × `decision` (accepted/rejected/pending dla explicit i inferred), brak wycieku
  row/evidence w issue dla `pending`, niezależność wyniku od kolejności wpisów draftu, kolizje
  aliasu (identyczna pisownia + różne cele; różna wielkość liter + różne cele; myślnik vs. spacja
  + ten sam cel; pojedynczy alias — poprawny) bez wycieku aliasu/targetu/evidence w issue, regresje
  pustych tabel w testach parsera i loadera.

## Potwierdzone w kodzie

- Markdown Knowledge Pack, deterministyczny grounding, minimalny kontekst, digest.
- Pipeline sequence z walidacją deterministyczną i rendererem PlantUML (compatibility path).
- Lokalny adapter OpenAI-compatible (loopback, jedno żądanie, bez retry/repair), demo offline,
  profile LM Studio i Ollama.
- Zdalne adaptery Anthropic/OpenAI/OpenRouter (fixed HTTPS allowlist, bounded I/O, strict parsing,
  jedno żądanie, bez retry/repair/fallbacku) i credential boundary w VS Code `SecretStorage`.
- Rozszerzenie VS Code: komendy generowania, wyboru profilu/modelu i zarządzania cloud keys, dwa bundle,
  skrypty `extension:package` i `extension:verify`.
- Knowledge Pack Builder, etap A: model kandydatów i dowodów, walidacja draftu, deterministyczny
  renderer pięciu plików, round-trip in-memory przez loader (tylko core, bez runtime i UI).

## Częściowe

- VSIX `v0.2.0-alpha.1`: brak zapisu artefaktów z rozszerzenia, konfiguracja tylko przez ustawienia,
  jeden katalog Knowledge Pack. Historia akceptacji checkpointu — patrz „Checkpoint VSIX
  v0.2.0-alpha.1” poniżej.
- Kontrakt źródeł architektury: unia `KnowledgePackSourceConfig` ma jeden wariant
  (`local-directory`), port `KnowledgePackSource` jest związany z pięcioma plikami Markdown.
- Branding: rozszerzenie i README używają „Archi Agent”; root `package.json` i część `docs/`
  nadal „ArchGround”.

## Checkpoint VSIX v0.2.0-alpha.1

A. Fundament samowystarczalnego VSIX `v0.2.0-alpha.1` jest zaimplementowany (zob. „Potwierdzone
w kodzie”).

B. Wcześniejszy handoff właściciela odnotował historyczny ręczny smoke test obejmujący:
instalację VSIX, aktywację rozszerzenia, działanie poza repozytorium, współpracę z LM Studio,
wygenerowanie PlantUML i grounding report, z wynikiem PASS. Jest to wynik zgłoszony przez
właściciela w poprzedniej sesji (owner-reported PASS), a nie test wykonany w bieżącej sesji.

C. W tej sesji (2026-09-17, weryfikacja checkpointu) wykonano na HEAD `d4de130` pełną automatyczną
weryfikację: `npm ci` (bez zmian w `package-lock.json`), `npm test` (64/64 plików, 963/963 testów,
PASS), `npm run typecheck` (PASS), `npm run extension:typecheck` (PASS), `npm run extension:test`
(6/6 plików, 79/79 testów, PASS), `npm run extension:build` (PASS), `npm run extension:package`
(PASS) i `npm run extension:verify` (PASS). Nowy artefakt:

| Pole | Wartość |
| --- | --- |
| Plik | `vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix` |
| Czas modyfikacji | 2026-09-17 08:29:52 |
| Rozmiar | 180 305 B (176,08 KB wg raportu pakowania) |
| SHA-256 | `44345daabd77b6e86b319e3f6e00df52ae7bedff5a05f39e6c1d400519b05744` |
| `extension:verify` | OK — dokładnie 6 wpisów, wyłącznie dozwolone pliki |

Ten artefakt został zbudowany w bieżącej sesji z HEAD `d4de130` i odpowiada aktualnemu kodowi —
w odróżnieniu od wcześniejszego, ignorowanego przez Git pliku, który mógł pochodzić sprzed
commitów `927734b` i `d4de130`.

D. Ręczny smoke test właściciela wykonany 2026-09-17 na tym artefakcie (świeżo zbudowanym w tej
sesji, HEAD `d4de130790726f09819bd3821cc78ef0b0d22d4e`, rozmiar 180305 B, SHA-256
`44345daabd77b6e86b319e3f6e00df52ae7bedff5a05f39e6c1d400519b05744`):

| Kontrola | Wynik |
| --- | --- |
| OWNER SMOKE | PASS |
| LLM requests | 1 |
| PlantUML | PASS |
| Grounding report | PASS |
| Instalacja VSIX | unikalny, czysty profil VS Code |
| Flow i Knowledge Pack | skopiowane do katalogu pod `%TEMP%`, poza repozytorium |
| LM Studio | działało przez lokalny endpoint |
| Zależność od repo | rozszerzenie nie wymagało root `node_modules` ani uruchomionego procesu z repozytorium |

Status ręcznego testu: **PASS**. Checkpoint `v0.2.0-alpha.1` jest implemented, automatically
verified i owner smoke accepted.

## Kierunek dalszych prac

Właściciel zatwierdził R2: generator oddaje DiagramPlan, lokalny kod waliduje plan i renderuje
PlantUML per typ, a niezależny reviewer zwraca wyłącznie werdykt i referencje. D1.2
(`sequence`) jest ukończone; owner smoke S1 z Ollamą `qwen3:30b` przeszedł 2026-09-23.
UX1 dodał nawigację i lokalną konwersję PDF/DOCX/XLSX do niezapisanego Markdown;
owner smoke przeszedł 2026-09-23. Obowiązuje UX1 → D2 → M1 (MCP) → C1 → D3 → D4 → D5 → K2 → K3 → REL.
Szczegóły: [ADR 0002](adr/0002-deterministic-diagram-plan-renderers.md) i
[roadmapa](product-roadmap.md). D1.1 jest zachowane historycznie i na
`checkpoint/d1-final-plantuml-reviewed`.

Później (bez zobowiązującej kolejności): bounded repair, quality modes, document
sources (PDF, DOCX; Confluence/Jira preferencyjnie przez MCP), EA API, Prolaborate, zewnętrzni
dostawcy artefaktów. **EA XML pozostaje odłożone (deferred), brak implementacji** — brak
bezpiecznego, publicznego fixture; w repo nie ma parsera, fixture'ów ani testów EA XML.
Parsery OOXML użyte przez niezależny konwerter UX1 nie obsługują EA.

## Weryfikacja

### Korekta kontraktu anulowania cloud model pickera (2026-09-21)

Bez zmian kodu produkcyjnego dodano regresje zarejestrowanych komend VS Code dla **Select Model**
oraz **Generate** bez wybranego modelu. Obie potwierdzają: dokładnie jeden odczyt
`SecretStorage`, jeden GET listy modeli wymagany przed pokazaniem pickera, zero zapisów
modelu/bindingu, zero generacyjnych POST i zero uruchomień generowania po anulowaniu pickera.
Osobny test potwierdza, że anulowanie wyboru źródła flow następuje przed odczytem sekretu i przed
provider I/O. Bieżące wyniki: celowany `extension-command.test.ts` — PASS, 40/40;
`npm run extension:typecheck` — PASS; `npm run extension:test` — PASS, 8/8 plików i 139/139 testów.

### P2 (2026-09-20)

`npm ci` przeszło bez zmiany root `package.json` ani `package-lock.json`. Testy providerów używają
wyłącznie syntetycznych danych oraz doubles `https.request`/transportu; żaden test nie kontaktuje się
z Anthropic, OpenAI ani OpenRouter. Produkcyjna logika `NodeHttpsJsonTransport` jest wykonywana przez
testy primitive, a nie zastępowana double na poziomie `exchange()`.

| Kontrola | Wynik |
| --- | --- |
| Testy celowane P2, transportu, runtime, VS Code i pakowania | PASS — 13/13 plików, 210/210 testów |
| `npm test` | PASS — 80/80 plików, 1187/1187 testów |
| `npm run typecheck` | PASS |
| `npm run extension:typecheck` | PASS |
| `npm run extension:test` | PASS — 8/8 plików, 137/137 testów; powtórzone poza sandboxem po środowiskowym `listen EPERM` dla loopback |
| `npm run extension:build` | PASS |
| `npm run extension:package` | PASS — dokładnie 6 plików, 185,42 KB |
| `npm run extension:verify` | PASS — wyłącznie 6 dozwolonych wpisów, kontrola sekretów aktywna |
| Samowystarczalny runtime/VSIX poza repo | PASS — 1/1 plik, 12/12 testów; pusty katalog bez repo, `node_modules`, npm i dostępnego `PATH` |
| Sentinel secret | PASS — nieobecny w runtime bundle, extension bundle, VSIX, artefaktach, komunikatach i błędach |
| Root `package.json` / `package-lock.json` | Bez zmian; brak nowych zależności |

Końcowy automatycznie zweryfikowany artefakt lokalny:
`vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix`, 190346 B, SHA-256
`750ff9bdd99221f4451e9091faec7b63e8c86bb7960793fc80bd89cc3f9264ea`. Test pakowania uruchomił
runtime z pustego katalogu bez repozytorium, `node_modules`, npm i dostępnego `PATH`.

Owner smoke Anthropic/OpenAI/OpenRouter nie był wykonywany: wymaga prawdziwych kluczy, wykonuje
płatne requesty i zgodnie z DoD pozostaje oddzielnym, opcjonalnym krokiem właściciela. Minimalne
przepływy i ostrzeżenia kosztowe są w [`cloud-models.md`](cloud-models.md).

### P1 (2026-09-20)

Pełna sekwencja bramek P1 przeszła: instalacja przez `npm ci` bez zmiany `package-lock.json`, build
rozszerzenia, celowana macierz testów P1, pełne `npm test`, oba typechecki, `extension:test`, ponowny
build, pakowanie i kontrola VSIX. Testy loopback potwierdzają wspólny transport, pojedynczy GET listy
modeli i pojedynczy POST generowania; testy VS Code potwierdzają fail-closed dla nieznanego jawnego
profilu, migrację legacy tylko przy braku globalnego profilu, binding model–profil, błędy częściowych
zapisów, precedencję, zapis machine/global oraz izolację symulowanych instalacji Windows/Mac.

Końcowe regresje P1 uzupełniono o trzy osobne awarie atomowego wyboru modelu dla jawnego profilu,
odczyt każdego stanu po symulowanym restarcie, ręczne usunięcie profilu i rzeczywistą zarejestrowaną
komendę Generate po zmianie profilu. Bieżące wyniki: celowana macierz VS Code — 3/3 pliki,
67/67 testów; `npm test` — 71/71 plików, 1067/1067 testów; oba typechecki — PASS;
`extension:test` — 6/6 plików, 115/115 testów. Kod produkcyjny, manifest i pakowanie nie zmieniły
się, dlatego wcześniejsze wyniki `extension:build`, `extension:package` i `extension:verify`
pozostają aktualne.

Owner smoke Ollamy wykonano 2026-09-20 na commit
`50d7f4704383509506b9959de6742ec16d7f28c7`, niezależnie od historycznego smoke LM Studio z
checkpointu opisanego wyżej. Użyto zainstalowanego VSIX Archi Agent `0.2.0-alpha.1` o rozmiarze
183551 B (około 179,25 KB); `extension:verify` potwierdził dokładnie 6 dozwolonych wpisów. Środowisko:
VS Code 1.138.0 arm64, macOS na Apple M5 Pro z 48 GB unified memory oraz Ollama 0.34.0.

| Kontrola owner smoke Ollamy | Wynik |
| --- | --- |
| Profil i model końcowego udanego testu | `local-ollama`, `qwen3:30b` |
| Lista modeli | PASS — `GET http://127.0.0.1:11434/v1/models`, format OpenAI-compatible; identyfikator z dwukropkiem zachowany bez transformacji |
| Generowanie | PASS — dokładnie jeden `POST http://127.0.0.1:11434/v1/chat/completions`, bez retry rozszerzenia |
| Parametry i metadata | `modelGeneration.attemptCount: 1`, `structuredOutput: true`, `temperature: 0`, `seed: 42` |
| PlantUML i grounding report | PASS; 7 znanych uczestników, 0 nowych, wszystkie wiadomości grounded |
| Trwałość ustawień | PASS po zamknięciu i ponownym uruchomieniu tego samego czystego profilu; Ollama oznaczona jako Current profile, model `qwen3:30b` zachowany |
| Anulowanie pickera | Brak generowania i brak zmiany ustawień |
| Izolacja | Workspace, Knowledge Pack, flow i artefakty w katalogu tymczasowym poza repozytorium; repozytorium pozostało czyste |
| Dane uwierzytelniające | API key nie podano; `SecretStorage` nie użyto |
| Samowystarczalność VSIX | Użytkownik zainstalowanego VSIX nie potrzebował npm, root `node_modules` ani osobnej instalacji Node.js |
| Wynik końcowy | **PASS** |

Próba z `qwen3-coder:30b` potwierdziła poprawne połączenie przez Ollamę, ale odpowiedź została
deterministycznie odrzucona kodem `response-mode-invalid`, ponieważ model oznaczył wiadomość w
niedozwolony sposób. Było to oczekiwane zachowanie fail-closed, bez transportowego fallbacku i bez
retry; ten model nie przeszedł generowania. Końcowy udany smoke wykonano modelem `qwen3:30b`.

Log Ollamy potwierdził binding do `127.0.0.1:11434`, użycie Metal, dokładnie jeden zewnętrzny
`POST /v1/chat/completions` dla udanej generacji i brak retry rozszerzenia. Request trwał łącznie
około 1 min 49 s, a końcowa odpowiedź była generowana z szybkością około 65,7 tokena/s. Logu ani
artefaktów smoke nie zapisano w repozytorium.

Opcjonalny podgląd PlantUML początkowo nie działał z powodu braku Java Runtime wymaganego przez
zewnętrzne rozszerzenie renderujące. Nie był to błąd Archi Agent ani niezaliczony warunek smoke:
Archi Agent poprawnie wygenerował PlantUML i grounding report bez Javy.

### B1 (2026-09-19)

| Kontrola | Wynik |
| --- | --- |
| Test celowany generatora | PASS — 1/1 plików, 46/46 testów |
| `npm test` | PASS — 69/69 plików, 1022/1022 testów |
| `npm run typecheck` | PASS |
| `npm run extension:typecheck` | PASS |
| `npm run extension:test` | PASS — 6/6 plików, 79/79 testów |
| `npm run extension:build` | PASS |
| `npm run extension:package` | PASS — 6 plików, 176,03 KB |
| `npm run extension:verify` | PASS — wyłącznie 6 dozwolonych wpisów |

Pełne bramki automatyczne B1 przeszły. Testy używają syntetycznych doubles; nie wymagają
uruchomionego LM Studio ani dostępu do sieci zewnętrznej. Ręcznego smoke testu z LM Studio nie
wykonywano.

### Historyczne (2026-09-17, weryfikacja checkpointu na HEAD `d4de130`)

`npm ci`, `npm test` (64/64 plików, 963/963 testów), `npm run typecheck`, `extension:typecheck`,
`extension:test` (6/6 plików, 79/79 testów), `extension:build`, `extension:package`,
`extension:verify` — wszystkie PASS. Szczegóły artefaktu — „Checkpoint VSIX v0.2.0-alpha.1”.

## Następny krok

**M1 (MCP)** zgodnie z aktualną roadmapą, następnie C1. D1.2, S1, UX1 i D2 mają
owner smoke PASS.

## Implementacja D1

Baza etapu: `00c8b9d62e73fff2cdb154113f15a42756f25b07`. Nowe `generateDiagram` przyjmuje
identyfikator typu. W D1 wykonuje wyłącznie `sequence`; pozostałe cztery typy kończą się
`diagram-type-unsupported` przed odczytem plików i kontaktem z providerem. Model dostaje minimalny
grounded context i zwraca finalny PlantUML w ścisłej kopercie `{ plantUml, messages }` przez
dokładnie jedno `StructuredChatClient.complete()`. Wspólny walidator sprawdza granice dokumentu;
zamknięty parser sequence weryfikuje deklaracje, aliasy, wiadomości, fragmenty, zgodność z ledgerem
i grounded relationships. Walidacja nie modyfikuje finalnego PlantUML. Raport używa dotychczasowego
formatu, oznaczając normalizację jako `not-applicable`. Dotychczasowe API sequence, komenda, CLI,
raporty i golden outputs pozostają ścieżką zgodności. Brak retry, repair, fallbacku i dodatkowych
wywołań modelu.

### Weryfikacja D1 (2026-09-21)

Celowane testy D1, `npm ci`, kontrola niezmienności root `package.json` i `package-lock.json`,
`npm test` (82 pliki, 1245 testów), `npm run typecheck`, `npm run extension:typecheck`,
`npm run extension:test` (9 plików, 181 testów), `npm run extension:build`,
`npm run extension:package`, `npm run extension:verify` i `npm run demo:dry-run` — PASS.
Osobny smoke test runtime wyjętego z VSIX, z pustego katalogu poza repo (stara i nowa ścieżka) — PASS.
`git diff --check` — PASS; root manifest i lockfile bez zmian.

Korekta po review D1: ledger wymaga `lineNumber` zgodnego z fizyczną linią strzałki oraz
`interfaceName: string | null` w każdym wpisie. Pełna koperta odpowiedzi ma limit w core przed
walidacją Zod. Odpowiedź jest powiązana wyłącznie z wcześniejszym synchronicznym żądaniem o tych
samych końcach, typie i nazwie interfejsu. Picker D1 oferuje tylko Sequence; pozostałe
identyfikatory pozostają w runtime jako punkty rozszerzenia.

## R1 — handoff zatwierdzonej architektury (2026-09-21)

Nowa praca bazuje na czystym commicie
`4dbc65a2a698ea1ed7e3d00160c4a802c9a8083b` na branchu
`feature/reviewed-diagram-pipeline`. Eksperymentalna implementacja D1 z ledgerem, dopuszczenie
braku końcowego LF, szczegółowa diagnostyka i testy odpowiedzi Ollamy zostały zachowane osobno
na `checkpoint/d1-ledger-pipeline` w commicie
`973b604694ad06181deaa56989b9361f4b4ba52e`. Checkpoint jest archiwalny: jego
implementacja nie została przeniesiona na nowy branch. Bazowy commit D1 nie jest usunięty z
historii Git.

Pierwszy owner smoke nowej komendy z Ollamą `qwen3:30b` wykrył brak końcowego LF i deklaracje
uczestników bez kanonicznej nazwy; drugi wykrył `sequence-arrow-ledger-mismatch` w fizycznej
linii 6. Na tym samym syntetycznym fixture kontrolowana diagnoza wskazała brak adnotacji
`interfaceType`/`interfaceName` w PlantUML przy zgodnym `order`, `lineNumber`, końcach i typie
strzałki. Oba przebiegi owner smoke wykonały po jednym wywołaniu bez retry/fallbacku; żaden
nie dał diagramu. **D1 owner smoke nie jest PASS**. Automatyczna weryfikacja D1 nie zastępuje
akceptacji produktu.

Właściciel zatwierdził zastąpienie ledgeru ścieżką: jeden minimalny `ArchitectureSnapshot` →
generator zwracający wyłącznie `{ plantUml }` → lokalny parser i deterministyczna walidacja →
niezależny semantic reviewer → lokalna decyzja. Udany przebieg D1.1 ma dokładnie dwa wywołania
modelu, odrzucenie deterministyczne po generatorze jedno, a błędny kontekst lub nieobsługiwany
typ zero. Bez retry, repair i fallbacku. Szczegóły są w
[`ADR 0001`](adr/0001-reviewed-diagram-generation.md) i
[`reviewed-diagram-pipeline.md`](reviewed-diagram-pipeline.md). R1 utrwaliło dokumenty,
a osobne zadanie D1.1 zaimplementowało ten przepływ bez przenoszenia ledger checkpointu.

KISS/BUZI w `AGENTS.md` i `CLAUDE.md` jest obowiązującą zasadą: najprostszy działający pionowy
przepływ, bez spekulacyjnej złożoności; odstępstwo architektoniczne wymaga zatrzymania pracy i
jawnej decyzji właściciela. Wtedy obowiązywała kolejność
R1 → D1.1 → S1 → D2 → C1 → M1 → D3/D4 → D5 → K2 → K3 → REL;
R2 zastąpiło ją kolejnością podaną w aktualnym Snapshot i roadmapie.
R1 jest zmianą dokumentacji; testy, typecheck, build i pakowanie nie są jego bramkami.

## D1.1 — reviewed sequence (2026-09-21)

Aktywna komenda **Generate Diagram → Sequence** używa jednego niemutowalnego snapshotu z
istniejącego Knowledge Pack/groundingu. Generator zwraca wyłącznie ścisłe `{ plantUml }`.
Zamknięty parser wyprowadza uczestników, strzałki, adnotacje, identyfikatory faktów i fizyczne
numery linii bez ledgeru modelu. Walidacja dokumentu, składni, aliasów, groundingu,
potwierdzonych relacji i jawnych zakazów zatrzymuje błędny diagram po pierwszym wywołaniu.
Gdy nie ma pasującej relacji w packu, fakt trafia do reviewera z identyfikatorem dowodu
niepustego fizycznego wiersza flow. Reviewer potwierdza semantykę, a lokalna decyzja sprawdza
kompletność i integralność referencji bez interpretowania tekstu.
Po jej przejściu osobny request tym samym profilem i modelem daje ścisły werdykt semantic
reviewera; lokalna decyzja akceptuje lub odrzuca, bez repair/fallbacku. Sukces wykonuje dwa
wywołania, odrzucenie deterministyczne jedno, błędny kontekst albo typ zero. Raport nowej
ścieżki ma `reportSchemaVersion: 2`; zaakceptowany PlantUML pozostaje bez zmian.

Korekta po review D1.1: OpenAI/OpenRouter projektują provider-compatible wire schema na granicy
adaptera, przy zachowaniu pełnej lokalnej walidacji Zod. Jeden snapshot zasila oba prompty i
adapter istniejących lokalnych walidatorów. Każdy zaakceptowany fakt w raporcie v2 wskazuje
source-confirmed albo reviewer-confirmed user-stated evidence; mapa dowodów podaje klasę,
logiczny plik i fizyczną linię. Zwykły tekst `ARCHGROUND_` w flow nie jest blokowany.

Stara komenda **Generate Sequence Diagram**, CLI, renderer, raport v1 i golden outputs pozostają
niezmienione. `component`, `c4-context`, `c4-container` i `archimate-hld` nadal kończą się przed
I/O. Testy adapterów lokalnych i chmurowych używają wyłącznie syntetycznych doubles, bez
płatnych połączeń. Automatyczne bramki D1.1: `npm ci`, testy celowane, `npm test`, oba typechecki,
`extension:test`, `extension:build`, `extension:package`, `extension:verify`, `demo:dry-run` oraz
runtime wyjęty z VSIX i uruchomiony poza repo — PASS. Dokładne liczby testów i artefaktu
należy weryfikować na bieżąco w repo. **Na 2026-09-21 S1 owner smoke nie był jeszcze wykonany;
D2 pozostawało zablokowane.**

Korekta końcowego review D1.1: digest powstaje z jednego kanonicznego payloadu snapshotu
zawierającego także logiczny plik flow, tekst i fizyczne linie flow evidence oraz pliki i linie
źródłowe uczestników, relacji i reguł. Regresje sprawdzają stabilność digestu, zmianę każdej
lokalizacji źródłowej i zgodność digestu w obu requestach oraz raporcie v2. W bieżącej sesji:
testy celowane 59/59, `npm test` 1265/1265, oba typechecki, `extension:test` 194/194,
`extension:build`, `extension:package`, `extension:verify` (6 wpisów), `demo:dry-run` i osobny
test runtime wyjętego z VSIX poza repo — PASS. S1 owner smoke pozostaje jedyną bramką produktu.

### Korekta po pierwszej próbie S1 (2026-09-22)

Pierwsza próba owner smoke S1 pozostaje **FAIL**. Zapisany model output użył legalnych wariantów
PlantUML: `alias as "Canonical Name"` oraz cytowanych etykiet bez spacji przed dwukropkiem.
Parser D1.1 akceptuje teraz obie kolejności nazwy i aliasu oraz bezpieczne etykiety cytowane i
niecytowane z opcjonalnymi spacjami przy dwukropku. Zaakceptowany PlantUML pozostaje bajt w bajt
niezmieniony. Prompt preferuje `"Canonical Name" as alias` i niecytowaną etykietę oraz podaje
jawny kontrakt strzałek i dozwoloną strzałkę dla każdej source-confirmed relacji.

Ten sam output miał błędne tryby: linie 7 i 10 użyły asynchronicznego `->>` wobec relacji
source-confirmed o trybie synchronous; odpowiedzi w liniach 8 i 11 nie miały wcześniejszego
pasującego synchronicznego requestu. Lokalna walidacja zwraca odpowiednio
`interaction-mode-mismatch` i `response-without-request` przed reviewerem. Sprzeczność z
source-confirmed relacją nie przechodzi do review jako user-stated; dopiero brak relacji
source-confirmed dla pary uczestników może trafić do niezależnego review, a jawny zakaz nadal
blokuje pipeline.
Linia 13 zapisanego diagramu jest kandydatem user-stated, nie automatycznym potwierdzeniem.

Walidacja offline zapisanego `generator-diagnostic.puml`: dokument i parser PASS; produkcyjny
pipeline odrzuca semantycznie linie 7, 8, 10 i 11 po jednym syntetycznym wywołaniu generatora,
bez wywołania reviewera ani Ollamy.

Końcowa korekta kontraktu source-confirmed D1.1: relacja tej samej pary i kierunku z innym
typem interfejsu daje lokalny `interface-type-mismatch`, zamiast przejść jako user-stated.
Dowód wymaga pełnej zgodności typu, trybu i nazwy interfejsu; pominięta lub błędna nazwa
przy nazwanej relacji daje `interface-name-mismatch`. Przy wielu relacjach wybór następuje
po pełnym dopasowaniu, bez wildcardu dla `null`. Stary `generateSequenceDiagram` zachowuje
dotychczasową politykę nazw. W D1.1 wyłącznie `relationship.mode` wyznacza strzałkę:
`synchronous` → `->` z możliwą odpowiedzią `-->`, `asynchronous` → `->>` bez odpowiedzi,
również dla EVENT. Prompt i projekcja snapshotu podają ten sam kontrakt. Sprzeczności są
odrzucane po jednym wywołaniu generatora, przed reviewerem; poprawny wynik przechodzi przez
dwa wywołania, a błąd kontekstu zatrzymuje się przed modelem.

Wyniki poprzedniej sesji: testy celowane 190/190, `npm ci` bez zmiany lockfile, `npm test` 1295/1295,
oba typechecki, `extension:test` 201/201, `extension:build`, `extension:package`,
`extension:verify` (6 wpisów), `demo:dry-run` oraz osobny test runtime wyjętego z VSIX
poza repo (1/1) — PASS. Nowy VSIX: `vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix`,
199212 B, SHA-256 `d5ce1c3ff7206a36e1f0b0ee3ac703d53fa408db07551becb0ca42ecf9030cdf`.
**Ponowny owner smoke S1 na nowym VSIX nie został jeszcze wykonany; D2 pozostaje zablokowane
do S1 PASS.**

Finalizacja korekty (2026-09-22): `npm ci --offline` bez zmiany lockfile, testy celowane
149/149, `npm test` 1296/1296, `extension:test` 202/202, oba typechecki, build, package,
verify, `demo:dry-run` i runtime wyjęty z VSIX poza repo (1/1) — PASS. Bieżący lokalny VSIX
ma 6 wpisów, 199212 B i SHA-256
`9e503a2dd540dcc6c2bc1819acbe2b82b7d271768fb3318dc5ecb52b3f47d2b3`.
Pierwsza próba S1 pozostaje FAIL; ponowny owner smoke nie został wykonany.

### Punktowa korekta promptu po drugiej próbie S1 (2026-09-22)

Drugi owner smoke S1 zakończył się **FAIL** z `plantuml-structure` w fizycznej linii 4.
Odpowiedź nie została zachowana w dozwolonych logach/artefaktach; osobna reprodukcja na tym
samym syntetycznym flow, Knowledge Pack i lokalnym `qwen3:30b` odtworzyła błąd: model zadeklarował
znaną bazę jako `participant`, choć snapshot wymagał `database`. Po korekcie rodzaju elementu
walidacja offline wykazała brak wymaganych dokładnych nazw interfejsów w czterech
source-confirmed requestach/odpowiedziach. Reprodukcja nie jest bajtowo identycznym zapisem
odpowiedzi owner smoke; jej artefakty pozostają poza repo.

Generator D1.1 otrzymuje teraz jedną projekcję snapshotu z dokładnymi deklaracjami uczestników
oraz literalnymi prefiksami i sufiksami dozwolonych requestów i odpowiedzi source-confirmed.
Sufiks zachowuje typ oraz dokładną nazwę interfejsu; `relationship.mode` wyznacza strzałkę,
także dla EVENT. Odpowiedź jest oferowana wyłącznie dla relacji synchronicznych.
Model wstawia tylko etykietę wiadomości pomiędzy prefiks i sufiks. User-stated pozostaje
kandydatem wymagającym dotychczasowej walidacji i niezależnego evidence reviewera. Parser,
walidatory, liczba wywołań i compatibility path nie zostały zmienione.

Bieżąca weryfikacja: `npm ci` bez zmiany lockfile; celowane testy 152/152; `npm test`
1299/1299; `npm run typecheck`, `npm run extension:typecheck`, `npm run extension:test`
203/203, `extension:build`, `extension:package`, `extension:verify`, `demo:dry-run` — PASS.
Test runtime wyjętego z VSIX poza repo: 1/1 PASS. Niezależny przegląd read-only: PASS;
po przywróceniu oryginalnej stałej parsera celowane regresje 103/103 PASS. Finalny VSIX ma
6 dozwolonych wpisów, 199723 B i SHA-256
`74a3c85f42f137f0187ddb37d8cf8337dd9d7bbf9fce3c7a88fd843798e9f9c3`.
Nowy owner smoke nie został wykonany. S1 nadal nie jest PASS; D2, M1 i gauntlet pozostają
zablokowane do S1 PASS.

## R2 — zatwierdzona zmiana architektury (2026-09-22)

Właściciel zatwierdził zmianę po powtarzalnych niepowodzeniach S1 na realnym Ollama
`qwen3:30b`: nawet literalne deklaracje i sygnatury w prompcie nie zapewniły jednocześnie
poprawnej składni PlantUML i zgodności ze snapshotem. S1 pozostaje **FAIL/not passed**.
D1.1 wraz z kolejnymi próbami smoke pozostaje opisane powyżej; dokładny stan kodu jest
zachowany na `checkpoint/d1-final-plantuml-reviewed` przy
`0abafa853bd10df3b2e87070197eb063a3e99233`. ADR 0001 jest historyczny.

Aktywny kierunek to ArchitectureSnapshot → LLM DiagramPlan → lokalna walidacja planu →
deterministyczny renderer typu → reviewer → lokalna decyzja → wynik. Generator odpowiada
za semantykę, lokalny kod za zapis PlantUML. Reviewer dostaje ten sam snapshot/digest, plan,
dowody i wyrenderowanego kandydata; zwraca tylko ścisły werdykt i referencje, bez repair.
Polityka 0/1/2 wywołań, report v2 i compatibility path `generateSequenceDiagram` pozostają.
Nie ma retry, repair, fallbacku ani trzeciego wywołania. Osobne kontrakty, walidatory i
renderery powstają kolejno w D1.2, D2, D3, D4 i D5; w R2 nie zmieniono kodu.

Po decyzji R2 następnym zadaniem było **D1.2**; bieżący wynik opisuje sekcja niżej.
Dopiero S1 PASS odblokowuje M1, potem D2. C1, D3, D4, D5, K2, K3 i REL pozostają
planned. Zmiana zatwierdzonej architektury wymaga ponownej decyzji właściciela.

## D1.2 — deterministycznie renderowany SequenceDiagramPlan (2026-09-22)

Aktywne **Generate Diagram → Sequence** buduje jeden `ArchitectureSnapshot` i digest po
groundingu. Generator zwraca ścisły `SequenceDiagramPlan` z wersją 1, uporządkowanymi ID
użytych uczestników i wiadomościami z trwałym `factId`, rodzajem, końcami, referencją
requestu dla response, etykietą oraz dokładnie jedną klasą dowodu. Source-confirmed podaje
wyłącznie `evidenceId`: kierunek, tryb, typ i dokładna nazwa interfejsu pochodzą ze snapshotu.
User-stated podaje dokładny `flowEvidenceId` i minimalne proponowane dane interfejsu;
lokalna walidacja odrzuca nieznanych uczestników, konflikty z potwierdzoną relacją oraz
jawny zakaz. Reviewer musi potwierdzić każdy taki fakt jego `factId` i `flowEvidenceId`.

Renderer używa istniejących kanonicznych aliasów i keywordów uczestników. Emituje jedną
bezpieczną sekwencję PlantUML z LF na końcu oraz mapą fakt → fizyczna linia; wspólny
document validator sprawdza kandydat przed reviewerem. Reviewer widzi ten sam snapshot,
digest, plan, dowody, linie i kandydata; zwraca tylko werdykt, kody i referencje. Lokalna
decyzja jest fail-closed. Sukces i odrzucenie reviewera to dwa wywołania, lokalny błąd
planu/renderera jedno, blokujące wejście zero; bez retry, repair, fallbacku i trzeciego
requestu. Report v2 używa `generationPath: reviewed-plan-rendered`, bezpiecznego ID profilu
providera (jeśli wybrano profil) i fizycznych dowodów,
bez surowych odpowiedzi, promptów i pełnego flow. Stara komenda `generateSequenceDiagram`,
CLI, renderer i report v1 nadal działają niezależnie. Nie dodano zależności.

Preflight tej implementacji: `feature/reviewed-diagram-pipeline`, wyjściowy HEAD
`3e9ffb19106558591135bbab95a5f0d52ec75498`, pusty working tree i staging,
upstream i `git ls-remote` zgodne. Zdalny checkpoint D1.1
`checkpoint/d1-final-plantuml-reviewed` wskazywał
`0abafa853bd10df3b2e87070197eb063a3e99233`.

Bramki wykonane w tej sesji: `npm ci --offline` i `npm ci` bez zmiany root lockfile, celowane testy
D1.2 29/29, `npm test` 1242/1242, oba typechecki, `extension:test` 153/153,
`extension:build`, `extension:package`, `extension:verify`, `demo:dry-run` — PASS.
Test runtime wyjętego z VSIX, uruchomionego z pustego katalogu poza repo bez
`node_modules`, npm i dostępnego `PATH`, przeszedł wraz z testem compatibility path
(celowany `packaging.test.ts` 12/12). VSIX ma dokładnie 6 dozwolonych wpisów; skan
syntetycznego sentinela, prywatnych kluczy i wzorców tokenów — PASS. Lokalny artefakt:
`vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix`, 197792 B, SHA-256
`fa5b933b1ca658c9f2bd8cbaf794c86a1c99fdfc62c15439e742218007cd9bdf`.
W tamtej sesji nie wykonano owner smoke ani płatnych requestów. Następny krok: S1 owner smoke D1.2;
M1 i D2 nadal czekają na S1 PASS. Bieżący Git należy porównać z tym handoffem.

### Korekta po nieudanym owner smoke S1 na D1.2 (2026-09-22)

Owner smoke aktywnego Generate Diagram → Sequence zakończył się **FAIL** z komunikatem
`plantuml-structure`. Preflight korekty potwierdził `af3239e05e2ac52436cc3c21bb915ec463f437c7`
lokalnie i na upstreamie, czyste drzewo i staging, VSIX 197792 B o SHA-256
`fa5b933b1ca658c9f2bd8cbaf794c86a1c99fdfc62c15439e742218007cd9bdf` oraz
bajtową zgodność obu bundle zainstalowanych w izolowanym profilu z VSIX. To nie był stary
bundle.

Produkcyjny snapshot z fixture S1 i minimalny poprawny plan dały PlantUML przechodzący
walidację planu, document validator i parser kontrolny. Oryginalny plan owner smoke nie został
zachowany. Dokładnie jedna lokalna reprodukcja przez produkcyjny adapter Ollamy `qwen3:30b`
(bez reviewera) zwróciła niepoprawny plan: `requestFactId` dwóch faktów `request` wskazywał
własne `factId`; dalszy fakt `user-stated` miał `proposed: null`. Walidator odrzucił plan z
`interaction-mode-mismatch` przed renderowaniem, więc ta reprodukcja nie ma PlantUML ani jego
fizycznej linii błędu. Jest osobnym przebiegiem, nie bajtową kopią owner smoke. Zapis ustawień
izolowanego profilu wskazywał w chwili diagnozy `qwen3-coder:30b`, podczas gdy zgłoszony model
to `qwen3:30b`; bez oryginalnego planu nie da się przypisać pierwotnej próbie dokładnie tego
samego naruszenia.

Przyczyna mylącego komunikatu jest jednoznaczna w integracji: każdy nie-schema błąd
`validateSequencePlan` był mapowany na `plantuml-structure`, zanim powstał jakikolwiek
PlantUML. Korekta zachowuje odrzucenie i politykę 0/1/2, lecz zwraca `diagram-plan-invalid`
z bezpiecznym kodem reguły. Faktyczny błąd document validatora nadal odrzuca dokument,
teraz z kodem reguły i fizyczną linią w szczegółach. Renderer, ADR 0002, kontrakt planu,
zakazy dokumentu i compatibility path pozostają bez zmian. Regresje obejmują syntetyczny
snapshot S1, golden output, klasy relacji, mapę linii, błąd planu i pakowany bundle.

Walidacja semantyki i relacji dla D1.2 odbywa się w `validateSequencePlan`; legacy
model/relationship validator należy do starego compatibility path. Nie był uruchamiany jako
osobny etap aktywnej ścieżki. Celowane testy 88/88, `npm test` 1246/1246, oba typechecki,
`extension:test` 156/156, `extension:build`, `extension:package`, `extension:verify` i
`demo:dry-run` — PASS. `npm ci` nie zmienił lockfile. Runtime wyjęty z finalnego VSIX działał
poza repo; niezależny review read-only nie znalazł high/medium ani blokujących DoD. Nowy VSIX:
`vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix`, 197917 B, SHA-256
`7e2766bcc23891befd44d491938b6996cb8939644c3254858ee0773afc1d0a94`, dokładnie
sześć wpisów; oba bundle są bajtowo zgodne z bieżącym buildem.

S1 pozostaje **FAIL** i wymaga ponownego owner smoke po instalacji nowego VSIX. M1, D2 i
gauntlet pozostają zablokowane.

### D1.2 — Plan Contract V2 i bezpieczny verbose (2026-09-22)

Punktowa korekta na branchu `feature/reviewed-diagram-pipeline` bazuje na czystym HEAD
`09df6f635b3fb5825e8a19831e2733111971fb8a`, zgodnym z upstreamem. Aktywne
**Generate Diagram → Sequence** buduje z jednego `ArchitectureSnapshot` deterministyczny katalog
`op-0001`, `op-0002`, … . Model zwraca wyłącznie `{ version: 2, steps }`: dla
`grounded-operation` wybiera `operationId` i podaje ograniczoną etykietę, a pozostałe pola
relacji są `null`. Resolver nadaje `factId`, kierunek, tryb, typ i nazwę interfejsu, dowód,
referencję request/response oraz uczestników w kolejności pierwszego użycia. Response może
wybrać tylko operację katalogu po jej request. Dotychczasowe sprzeczności
`evidence-conflict`, `interaction-mode-mismatch`, `interface-type-mismatch` i
`interface-name-mismatch` nie mają reprezentacji w grounded wire planie.

`user-stated-interaction` pozostaje odrębną ścieżką dla znanych końców i dokładnie jednego
`flowEvidenceId`, z lokalnym odrzuceniem konfliktu z relacją źródłową i jawnego zakazu.
Reviewer musi potwierdzić każdą referencję. D1.2 obsługuje tu tylko request i asynchronous;
user-stated response nie ma kontraktu. Renderer otrzymuje resolved plan, wypisuje końcowy LF,
mapę fizycznych linii i przechodzi document validator oraz parser kontrolny. Raport v2 wskazuje
`operationId` albo `flowEvidenceId` i źródło; raport v1 oraz stara komenda są nietknięte.

Opcjonalne `archiAgent.diagnostics.verbose` ma `default: false`, `scope: machine` i zapisuje
ograniczone JSON Lines do istniejącego Output Channel **Archi Agent**. Każdy rozpoczęty run kończy
się jednym `run.completed` z licznikami 0/1/2. Sink nie dostaje promptów, pełnych odpowiedzi,
body, sekretów, nagłówków autoryzacji, etykiet wiadomości, PlantUML, pełnego flow ani Knowledge
Pack, odpowiedzi błędu dostawcy i absolutnych ścieżek. Brak sinka nie zmienia pipeline.

Automatyczne bramki tej korekty: `npm ci`, celowane testy kontraktu/runtime/providerów/
rozszerzenia/pakowania (12 plików, 171 testów), `npm test` (86 plików, 1242 testy), oba
typechecki, `extension:test` (9 plików, 160 testów), build/package/verify, `demo:dry-run`
i pakowany runtime uruchomiony poza repo (1/1) — PASS. Finalny lokalny VSIX ma dokładnie
6 wpisów, 200416 B i SHA-256
`8f103dc705be99b78e4e3832a1f6ce47337983b14a674bf2f7c376201351c2a9`.
Skan obu bundle i wszystkich zdekompresowanych wpisów na syntetyczny sentinel i wzorce
credentiali nie znalazł trafień. Bieżący Git należy porównać z tym handoffem. Nie wykonano owner smoke z
prawdziwym modelem. Pierwszy i kolejne dotychczasowe S1 pozostają FAIL; S1 nadal nie jest PASS.
Następny krok to instalacja nowego VSIX i owner smoke S1. M1, D2 i gauntlet pozostają zablokowane.

### D1.2 — korekta findings końcowego review Plan V2 (2026-09-22)

Resolver odrzuca teraz przed reviewerem kodem `interaction-direction-mismatch` próbę zapisania
jako user-stated odwrotności relacji source-confirmed z tą samą parą uczestników, typem interfejsu
i nazwą równą po deterministycznym porównaniu bez rozróżniania wielkości liter; odrzuca też
kandydata z `null`, gdy relacja źródłowa ma nazwę, oraz parę nazw `null`. Rzeczywiście inna
niepusta nazwa lub inny typ interfejsu pozostaje kandydatem user-stated,
a jawny forbid nadal blokuje lokalnie. Wspólna polityka tekstu PlantUML sprawdza etykietę bez
zastępowania znaków: cudzysłów, backslash, CR/LF, kontrolki oraz istniejące niebezpieczne formy
markup/directive/URL są odrzucane po jednym generatorze i przed rendererem/reviewerem.

Centralny sanitizer identyfikatorów diagnostics wykrywa niezależnie od hosta absolutne ścieżki
POSIX, Windows z oboma separatorami, UNC i każdy wariant `file:` (także `file:/` oraz wielkie
litery), zastępując całość stałą redakcją bez basename
i hasha. Testy transportowe analizują pełne schematy z rzeczywistych payloadów obu requestów dla
LM Studio, Ollamy, Anthropic, OpenAI i OpenRouter: komplet required, zamknięte zagnieżdżone obiekty,
enum/nullable i typy pól, brak pól rozstrzyganych lokalnie oraz właściwą projekcję limitów.
Oczekiwania oracle są zapisane niezależnie od produkcyjnej funkcji budującej payload; pełne limity Zod
pozostają lokalne.

Bieżące bramki po korekcie trzech końcowych findings: testy celowane 28/28, `npm ci`, `npm test`
1244/1244 (bez zmiany względem 1244; dwa wcześniejsze testy zbiorcze zawierają teraz dodatkowe
przypadki), oba typechecki, `extension:test`
161/161, build/package/verify, `demo:dry-run` i runtime wyjęty z VSIX poza repo 1/1 — PASS.
VSIX ma dokładnie 6 dozwolonych wpisów, 200585 B i SHA-256
`0daf101b1dae06d317e99c5b527d13feac63de708513bfa8f7300458985dd673`. Skan obu bundle i
zdekompresowanych wpisów nie wykazał sentinela, credentiali ani absolutnych ścieżek testowych.
Owner smoke nie był wykonywany: S1 nadal FAIL/not passed i wymaga ponowienia na tym VSIX; M1, D2
i gauntlet pozostają zablokowane.

### D1.2 — Split Wire Plan v3 (2026-09-23)

Ostatni rzeczywisty owner smoke S1 z Ollamą `qwen3:30b` zwrócił poprawny JSON, lecz każdy
płaski krok oznaczył jako `user-stated-interaction`, równocześnie podając
`operationId: "op-0001"`. Lokalny walidator odrzucił go kodem `user-stated-fields-invalid`:
`generatorCalls: 1`, `reviewerCalls: 0`. To nadal FAIL, podobnie jak pierwszy i wszystkie
poprzednie S1.

Wire Plan v3 ma dokładnie `version: 3`, wymagane `groundedSteps` i `userStatedSteps`.
Grounded step zawiera tylko `order`, `operationId`, `label`; user-stated step zawiera `order`,
`fromId`, `toId`, `interactionKind`, `interfaceType`, nullable `interfaceName`,
`flowEvidenceId`, `label`. Nie ma `stepType` ani pól drugiego wariantu ustawianych na `null`.
Resolver sprawdza globalnie dodatnie, unikalne i ciągłe `order` od 1, scala listy bez
renumeracji, a następnie stosuje dotychczasowe sprawdzenia katalogu, źródeł, forbid i reviewera.
Renderer i raport v2 zachowują dotychczasową semantykę. Stary płaski krok V2 nie przechodzi
schema v3 i nie jest naprawiany; reviewer nie otrzymuje odrzuconego planu.

Bieżąca weryfikacja: testy celowane 43/43; `npm ci`; `npm test` 1245/1245; oba typechecki;
`extension:test` 163/163; build/package/verify; `demo:dry-run` — PASS. Test pakowania
uruchomił runtime wyjęty z VSIX poza repo, bez `node_modules` i npm na PATH. Pięć profili
transportowych ma testy rzeczywistych payloadów schemas generatora v3 i reviewera oraz dwóch
requestów. Regresja S1 z czterema uczestnikami, dwiema relacjami source-confirmed, dwoma
grounded steps i jednym user-stated asynchronous step przeszła z raportem v2 i wspólnym
digestem.

Nowy lokalny VSIX `vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix` ma 6 dozwolonych
wpisów, 201019 B i SHA-256
`187e28f9033ee4114444bfd33febae38d1afef60b4428601b0466a40743ca4ca`.
Skan obu bundle oraz wszystkich zdekompresowanych wpisów nie znalazł sentinela, wzorców
credentiali ani absolutnych ścieżek testowych. W tej sesji nie było owner smoke ani
prawdziwych requestów internetowych. S1 nadal nie jest PASS. Należy zainstalować ten VSIX;
następnym krokiem jest dokładnie jeden owner smoke z verbose. M1, D2 i gauntlet pozostają
zablokowane.

### D1.2 — minimalny reviewer i świadome otwarcie niezweryfikowanego kandydata (2026-09-23)

Rzeczywisty owner smoke Wire Plan v3 na Ollamie `qwen3:30b` przeszedł grounding, katalog,
parsowanie planu (4 grounded, 1 user-stated), resolver, renderer i lokalne kontrole PlantUML.
Powstał 11-liniowy kandydat z 4 uczestnikami i 5 wiadomościami. Drugi request zakończył się
`truncated-output`, więc S1 pozostaje FAIL. W tej sesji nie wykonywano ponownego owner smoke.

Reviewer zwraca teraz dokładnie `accepted`, `confirmedUserStatedFactIds` i `violations` z
zamkniętym enumem czterech kodów oraz nullable `factId`. Nie ma free-text wyjaśnień. Lokalny
walidator sprawdza komplet potwierdzeń, referencje, duplikaty i spójność z `accepted`. Limit
odpowiedzi reviewera wynosi 8192 tokenów przy maksymalnie 512 potwierdzeniach lub 32
naruszeniach; generator pozostaje na 16384. Po pełnej lokalnej walidacji, ale nieudanym lub
odrzucającym review, `generateDiagram` zwraca typowany `unverified` z dokładnym kandydatem i
bezpiecznymi kodami, bez raportu v2. Komenda pyta modalnie; Show otwiera jeden niezapisany,
oznaczony dokument PlantUML, Cancel albo zamknięcie monitu niczego nie otwiera. Cancellation
reviewera nie oferuje kandydata. Brak retry, repair, fallbacku i trzeciego requestu.

Bieżące bramki: testy celowane 96/96; `npm ci`; `npm test` 1255/1255; root i extension
typecheck; `extension:test` 172/172; build, package, verify, `demo:dry-run` oraz osobny test
runtime wyjętego z VSIX poza repo 1/1 — PASS. Pierwsze równoległe uruchomienie `npm test` i
`extension:test` spowodowało kolizję testów pakowania na wspólnym `dist` i timeout; powtórzony
sekwencyjnie `extension:test` przeszedł. Pięć providerów ma testy rzeczywistych schematów
minimalnego werdyktu i dwóch requestów. VSIX ma 6 dozwolonych wpisów, 201922 B, SHA-256
`91ba751943b16a3e469cb5cf2d4070f896367206b4c1a467f69caf31500e822b`. Skan obu
bundle i zdekompresowanych wpisów nie znalazł sentinela, wzorców credentiali ani bezwzględnych
ścieżek testowych. Bieżący Git należy porównać z tym handoffem. Nie wykonano commit ani push.

### D1.2 — diagnoza `invalid-verdict` i punktowa korekta reviewera (2026-09-23)

Nowszy owner smoke Wire Plan v3 na `qwen3:30b` przeszedł wszystkie lokalne kontrole i wyrenderował
11-liniowego kandydata (4 grounded, 1 user-stated, 4 uczestników, 5 wiadomości). Odpowiedź
reviewera została odebrana, lecz walidacja zwróciła ogólne `invalid-verdict`. Oryginalna surowa
odpowiedź nie została zachowana, więc jej dokładnej zawartości nie można dowieść retrospektywnie.
Kontrolowany request tylko do reviewera, na odtworzonym produkcyjnym snapshotcie o digescie
`869d4f0629214f7d669b58900dfbc3baf2a3a0a0075faf16c01f190be06995eb` i dokładnie
tym samym kandydacie, zwrócił `accepted: true`, pustą listę naruszeń oraz potwierdzenia
`fact-0001`, `fact-0002`, `fact-0005`. Jedynym faktem user-stated jest `fact-0005`.
Pierwszy nieudany etap reprodukcji to lokalna reguła dokładnego zestawu potwierdzeń;
transport, JSON, schema i referencje faktów przeszły. Pierwszy request z sandboxu zakończył się
`connection-failed`; drugi, poza sandboxem, zwrócił werdykt. Nie wywołano generatora ani
trzeciego requestu. Surowa odpowiedź reprodukcji i analiza pozostały poza repozytorium.

Krótki prompt teraz wymaga potwierdzania wyłącznie faktów user-stated i dokładnego ich zestawu
przy akceptacji. Lokalna walidacja zachowuje fail-closed oraz publiczne `invalid-verdict`, ale
`reviewer.failed` dodaje allowlistowany podkod, boolean `accepted` i liczby potwierdzeń/naruszeń.
W tej reprodukcji podkod to `accepted-confirmations-mismatch`. Pozostałe podkody pokrywają
schema, nieobsługiwany kod naruszenia, sprzeczność accepted/violations, pustą lub sprzeczną
odmowę, nieznane referencje i duplikaty. Diagnostics nie zawierają odpowiedzi, promptu, flow,
Knowledge Pack ani PlantUML. Regresje obejmują ten sam kształt 4+1, werdykt wadliwy i poprawny,
2 wywołania, brak raportu dla unverified oraz Show/Cancel w komendzie VS Code.

Bieżące bramki: testy celowane 80/80, `npm ci`, `npm test` 1257/1257, oba typechecki,
`extension:test` 174/174, build/package/verify oraz `demo:dry-run` — PASS. Test pakowania
uruchomił runtime wyjęty z VSIX poza repo. Pierwsze równoległe uruchomienie `npm test` i
`extension:test` ponownie wywołało kolizję na wspólnym katalogu build i timeout;
sekwencyjny `extension:test` przeszedł. VSIX ma 6 wpisów, 202425 B, SHA-256
`e96d67a3a1453167f34e331cf98d527945a24c9a710fc7d40f22293b1ede1fa4`.
Skan nie znalazł sentinela, credentiali ani absolutnych ścieżek testowych. Po korekcie nie
wykonywano owner smoke. S1 pozostaje FAIL, M1, D2 i gauntlet pozostają zablokowane.

Następny krok: zainstalować ten VSIX i ponowić owner smoke S1 z verbose. Normalny S1 PASS wymaga
verified outcome; otwarcie unverified candidate nie jest PASS. M1, D2 i gauntlet są zablokowane.

### Owner smoke S1 — PASS (2026-09-23)

Właściciel potwierdził verified outcome na samowystarczalnym VSIX poza repozytorium:
provider profile `local-ollama`, model `qwen3:30b`, generator type
`openai-compatible-local`, diagram type `sequence`, generation path
`reviewed-plan-rendered`, Wire Plan version 3. Wykonano 1 generator call i 1 reviewer call,
łącznie 2 model calls, bez retry, repair, fallbacku ani trzeciego requestu. Reviewer zwrócił
`accept`; normalny sukces nie pokazał modalu unverified. Wcześniejszą ścieżkę unverified
candidate sprawdzono podczas poprzedniej próby.

Powstały diagram i grounding report v2: 4 uczestników, 5 wiadomości, 4 fakty
source-confirmed i 1 user-stated. Raport v2 zawierał ślad fact → evidence → source/line;
reviewer potwierdził fakt user-stated. Snapshot digest:
`sha256:869d4f0629214f7d669b58900dfbc3baf2a3a0a0075faf16c01f190be06995eb`.
Całkowity czas smoke: 167036 ms; generator: 110686 ms; reviewer: 56328 ms.
Safe verbose diagnostics potwierdziły pełną politykę 0/1/2 wywołań.

D1.2 jest ukończone, S1 PASS. W chwili tego owner smoke kolejnym planowanym
milestone był M1; późniejsza decyzja właściciela dodała UX1 przed D2 i M1.

Końcowa weryfikacja w tej sesji: `npm test` 1257/1257, `npm run typecheck`,
`npm run extension:typecheck`, `npm run extension:test` 174/174,
`npm run extension:build`, `npm run extension:package`, `npm run extension:verify`
i `npm run demo:dry-run` — PASS, uruchomione sekwencyjnie. Runtime wyjęty z finalnego
VSIX uruchomiono poza repozytorium bez root `node_modules` — PASS. Finalny VSIX ma
202425 B, SHA-256 `c23ea01cedcf23b9d3c26e236653e1dc5deadd23e0ca9b78ea32b957e8d044fc`
i dokładnie 6 dozwolonych wpisów; skan obu bundle i zdekompresowanych wpisów na
syntetyczny sentinel, wzorce credentiali i absolutne ścieżki testowe — PASS.
