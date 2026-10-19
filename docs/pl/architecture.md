# Architektura

[English](../en/architecture.md) · **Polski** · [Strona główna](../../README.pl.md)

To architektura lokalnego kandydata SRC1/VER1/D3/D4/MCP1, nie wcześniejszej publicznej paczki alpha.6. [Szczegółowa stabilna architektura](../architecture.md) opisuje bieżące granice; osobna historia zachowuje wcześniejsze wyjaśnienia; [roadmapa](../product-roadmap.md) określa plany. Obecne źródła to lokalny JSON Structurizr z nakładką wiązaną po ID, samodzielne packi Markdown oraz dokumenty wskazane do budowy nowego packa; klient wiedzy MCP w Node pobiera częściowe normalized contributions z jednego jawnie skonfigurowanego serwera stdio. Samodzielny przykład reużywa produkcyjnego parsera/mappera SRC1 i walidacji K1. Nie ma adaptera EA ani parsera DSL. Sequence i Component mają osobne plany/walidatory/renderery. C4 Context/Container korzystają z metadanych Structurizr i osobnych planów/walidatorów/rendererów; VER1 sprawdza Sequence/prozę. ArchiMate pozostaje planowane. Renderer zgodności sequence jest osobną starszą ścieżką.

Core jest deterministyczny, bez Node/VS Code I/O; orkiestracja wywołuje wstrzyknięte porty i adaptery Node. Runtime jest niezależny od hosta; edytor importuje tylko `src/runtime/index.ts`. Providerzy są wymiennymi adapterami StructuredChatClient. Dokumenty/odpowiedzi modeli są nieufnymi danymi. Do modelu trafiają ograniczone właściwe snapshoty diagramów lub ograniczony wybrany tekst ekstrakcji. Ustawienia i SecretStorage VS Code pozostają na granicy edytora; CLI/MCP używają konfiguracji procesu, przypiętych readRoots i nazwanych credentiali środowiskowych. Serwer czterech funkcji i klient wiedzy MCP mają osobne role; wszystkie hosty komponują wspólny runtime.

UX4 dodaje jeden edytor Configuration z Knowledge Management / LLM Provider i powiązany webview review K3. Oba delegują do istniejących usług runtime; zamknięty protokół hosta, nonce CSP i renderowanie tekstu chronią granicę danych. Klucze pozostają w SecretStorage; ekran otrzymuje tylko obecność. [Kontrakt UX4](../configuration-workbench.md).

## A. Komponenty i granice

```mermaid
flowchart TB
  subgraph Host["Host VS Code"]
    UI["Komendy / Configuration / Browser / Help"] --> Settings["Ustawienia / SecretStorage"]
  end
  CLI["Adapter CLI / src/cli"] --> Ops["Kompozycja hosta / readRoots / sekrety środowiska"]
  MCP["Serwer funkcji MCP / cztery tools / src/mcp"] --> Ops
  Ops --> App
  UI -->|src/runtime/index.ts| App
  subgraph Runtime["Runtime niezależny od hosta / src/runtime"]
    App["Generowanie / VER1 / dokumenty / oryginalne artefakty"]
  end
  subgraph Core["Deterministyczny core / bez I-O Node i VS Code"]
    Knowledge["Snapshot K1 / grounding / provenance"] --> Pipeline["Plany typów / walidatory / renderery / porównanie"]
  end
  subgraph Node["Adaptery Node / src/node"]
    Local["Pack / Structurizr JSON + nakładka"] --> Files["Ograniczone odczyty / wyłączny zapis"]
    Client["Klient wiedzy MCP / stałe get_knowledge_snapshot"]
    Providers["StructuredChatClient / dostawca lokalny lub chmurowy"]
    Conversion["Worker dokumentów / lokalna konwersja"]
  end
  App --> Knowledge
  App --> Local
  App --> Client
  Client --> KS["Osobny serwer wiedzy MCP / adapter źródła"]
  KS --> Model["Model architektury / przykład: produkcyjne SRC1 + K1"]
  App --> Conversion
  App --> Files
  Pipeline --> Providers
  App --> Providers
  Build["Wspólny kod / trzy identyczne bundle runtime"] --> CP["Core VSIX / konwersja tekstu / bez OCR"]
  Build --> FP["Full VSIX / przypięty offline OCR PL-EN"]
  FP --> OCR["PDF.js / canvas / Tesseract WASM / model resources"]
  Conversion -->|Full only when OCR needed| OCR
```

## B. Dokumenty i zamrożone wejście

```mermaid
flowchart LR
  Source["Dokumenty lokalne / aktywny bufor MD-TXT"] --> Capture["Odczyt bajtów lub bufora w limitach / hashe"]
  Capture --> Convert["Konwersja / OCR offline / znormalizowany tekst"]
  Convert --> Extract["JEDNO żądanie ekstrakcji / nieufni kandydaci"]
  Extract --> Evidence["Deterministyczna walidacja schematu / dowodów / referencji"]
  Evidence --> Review["Decyzje użytkownika / edycje / zwalidowany podgląd"]
  Review --> Pack["NOWY Knowledge Pack pięciu plików / provenance"]
  Structurizr["Structurizr workspace.json + nakładka / oryginalne ID"] --> Snapshot
  MCPSource["Wiedza MCP / znormalizowane dane / zakres"] --> Snapshot
  Pack --> Snapshot["Loader / snapshot K1 / deterministyczny grounding"]
  Flow["Opis przepływu / jawne decyzje"] --> Snapshot
  Snapshot --> Plan["JEDNO żądanie generatora / plan typu diagramu"]
  Plan --> Local["Walidacja / deterministyczny renderer / kontrola podzbioru"]
  Local --> Semantic["JEDNO żądanie review semantycznego / walidacja verdictu"]
  Semantic --> Result["Oryginalny diagram i powiązany raport / zamrożony wynik ART1"]
  Result --> Save["Jawne potwierdzenie / zapis exclusive / warunkowy cleanup"]
  Pack --> Browser["Knowledge Browser tylko do odczytu"]
```

## C. Ekstrakcja, review i zapis nowego packa

```mermaid
sequenceDiagram
  participant UI as UI rozszerzenia
  participant K2 as Runtime
  participant Core as Lokalny core
  participant LLM as StructuredChatClient
  participant W as Writer exclusive
  UI->>K2: Zamrożone wejście, wybór konfiguracji modelu
  K2->>LLM: complete: dokładnie JEDNO żądanie ekstrakcji
  LLM-->>K2: Nieufne propozycje
  K2->>Core: Sprawdź schemat, referencje, dosłowne dowody, konflikty
  Core-->>K2: Zamrożony wynik z decyzjami pending
  K2-->>UI: Dowody, inferred basis, ograniczenia źródeł
  loop Review i edycja użytkownika — bez LLM
  UI->>K2: Accept / reject / pending / edytuj istniejący wiersz
  K2->>Core: Walidacja KPB-A, zachowaj zamrożone dowody
  end
  alt Pending, konflikty lub brak zaakceptowanych zależności
  K2-->>UI: Blokuj preview/zapis, pokaż problemy
  else Poprawny draft po review
  K2->>W: Staging pięciu plików, produkcyjny load i kontrola bajtów
  W-->>K2: Usuń staging, niezmienny preview
  K2-->>UI: Podglądy pięciu plików
  UI->>K2: Nowy folder, Save lub Save and use
  K2->>W: Utwórz exclusive, finalny load i kontrola własności
  W-->>K2: Sukces lub warunkowy cleanup/recovery
  K2-->>UI: Zapisano, osobna aktywacja dla Save and use
  end
  Note over UI,W: Review/edycja/preview/zapis/aktywacja: zero dodatkowych wywołań modelu
```

## D. Generowanie diagramu i raportu

```mermaid
sequenceDiagram
  participant UI as UI rozszerzenia
  participant R as Runtime
  participant Core as Lokalny core
  participant G as Generator
  participant V as Reviewer
  UI->>R: Typ + przepływ + aktywny pack + decyzje
  R->>Core: Wczytaj K1, grounding, zamroź wybrany snapshot diagramu
  alt Błędne wejście / kontekst
  Core-->>UI: Odrzuć, zero wywołań generacyjnych
  else Poprawny kontekst
  Core->>G: Jedno żądanie planu właściwego dla typu
  G-->>Core: Nieufny plan Sequence / Component / C4 Context / Container
  Core->>Core: Waliduj, rozwiąż, renderuj, sprawdź podzbiór
  alt Lokalne odrzucenie
  Core-->>UI: Odrzuć po jednym wywołaniu, bez review
  else Poprawny lokalnie wyrenderowany kandydat
  Core->>V: Jedno review: ten sam snapshot/model, dokładny kandydat
  V-->>Core: Nieufny verdict i referencje faktów
  Core->>Core: Sprawdź cały verdict i potwierdzenia
  alt Zweryfikowana akceptacja
  Core-->>R: Oryginalny PlantUML + raport groundingu v2
  R->>R: Przechwyć zamrożony wynik ART1
  R-->>UI: Dwa niezapisane powiązane edytory
  else Odrzucenie/błąd review po lokalnych kontrolach
  R-->>UI: Proponuj oznaczony unverified candidate, bez raportu/artefaktu
  end
  end
  end
  Note over UI,V: Najwyżej dwa wywołania, bez retry/repair/fallbacku<br/>Cancel blokuje kolejne
```

## E. ART1 — zapis oryginalnej pary

```mermaid
sequenceDiagram
  participant UI as UI rozszerzenia
  participant A as Zamrożony artefakt
  participant P as Kontrole ścieżek
  participant W as Writer exclusive
  participant FS as System plików
  Note over UI,A: Oryginalna udana generacja już przechwycona w pamięci
  UI->>A: Wybierz wynik, wybierz projekt przy multi-root
  A-->>UI: Plan nowego bundle: folder, diagram.puml, report.json
  UI->>UI: Natywne potwierdzenie, Cancel niczego nie zapisuje
  UI->>P: Potwierdzony projekt + planowany względny cel
  P-->>A: Kanoniczny, zawarty, bez linków, cel nie istnieje
  A->>A: SHA-256 dokładnego UTF-8, envelope z przechwyconych danych
  A->>W: Zamrożona para + sygnał anulowania
  W->>FS: Exclusive mkdir i dwa pliki wx+, stopniowa widoczność
  W->>FS: Sprawdź bajty, tożsamości, przodków, finalny Cancel
  alt Zweryfikowany sukces
  W-->>UI: Potwierdzenie, Open Diagram / Open Report
  else Błąd lub Cancel przed zakończeniem
  W->>FS: Warunkowy rollback: tylko własne niezmienione zasoby
  W-->>UI: Bezpieczny błąd, sprawdź dane przy niepełnym cleanup
  end
  Note over UI,FS: Bez LLM i odświeżania źródeł, bez atomowej publikacji/crash recovery/gwarancji fsync
```

Staging przechwycenia jest tymczasowy; K2 czeka na cleanup przed zwrotem kandydatów. Zamrożony bundle powstaje przed ekstrakcją i jest źródłem dowodów całego review. Walidacja zapisu Buildera obejmuje produkcyjny load przed niezmiennym preview i po finalnym zapisie. Aktywacja jest osobną operacją ustawienia.

Odrzucenie review diagramu może zaproponować unverified candidate dopiero po lokalnej walidacji; Cancel użytkownika niczego nie proponuje. Generator/reviewer współdzielą wybrany model, ale używają osobnych kontekstów. Sequence zgodności ma jedno żądanie i raport v1.

Rejestr menu/palety ART1 przechowuje wyniki, gdy co najmniej jeden powiązany podgląd pozostaje otwarty; zamknięcie obu usuwa wpis z listy. Nadal oczekujące powiadomienie generacji zachowuje własny oryginał i może wywołać zapis bezpośrednio po zamknięciu obu podglądów. Restart/reload usuwa wyniki i powiadomienia z pamięci. Zmiana języka nie jest zamknięciem. Zapis dwóch plików jest stopniowo widoczny, a rollback warunkowy; bez atomowego rename katalogu, crash recovery i gwarancji fsync.

## Mapa źródeł

| Step / krok | Modules / moduły |
| --- | --- |
| UI navigation / nawigacja | [open-menu.ts](../../vscode-extension/src/commands/open-menu.ts), [build-knowledge-pack.ts](../../vscode-extension/src/commands/build-knowledge-pack.ts), [generate-sequence-diagram.ts](../../vscode-extension/src/commands/generate-sequence-diagram.ts), [save-diagram-and-report.ts](../../vscode-extension/src/commands/save-diagram-and-report.ts) |
| Boundary / granica | [index.ts](../../src/runtime/index.ts), [archi-agent-runtime.ts](../../src/runtime/archi-agent-runtime.ts) |
| Acquisition / przechwycenie | [extract-document-candidates.ts](../../src/runtime/extract-document-candidates.ts), [convert-document.ts](../../src/runtime/convert-document.ts), [convert.mjs](../../experiments/ux2-ocr/convert.mjs), [ocr-parent.mjs](../../experiments/ux2-ocr/ocr-parent.mjs), [ocr-child.mjs](../../experiments/ux2-ocr/ocr-child.mjs) |
| K1 / source / źródło | [knowledge-snapshot.ts](../../src/core/knowledge-pack/knowledge-snapshot.ts), [node-knowledge-pack-source.ts](../../src/node/node-knowledge-pack-source.ts) |
| Extraction evidence / dowody | [document-candidates.ts](../../src/core/knowledge-pack/builder/document-candidates.ts), [knowledge-pack-builder.ts](../../src/core/knowledge-pack/builder/knowledge-pack-builder.ts) |
| Review/save | [knowledge-pack-review.ts](../../src/runtime/knowledge-pack-review.ts), [knowledge-pack-onboarding.ts](../../src/runtime/knowledge-pack-onboarding.ts), [document-provenance.ts](../../src/core/knowledge-pack/document-provenance.ts) |
| ART1 | [diagram-artifact.ts](../../src/runtime/diagram-artifact.ts), [local-file-path.ts](../../src/node/local-file-path.ts) |
| Provider transports / transporty | [local](../../src/node/llm/openai-compatible-local-chat-client.ts), [remote OpenAI-compatible](../../src/node/llm/openai-compatible-remote-chat-client.ts), [Anthropic](../../src/node/llm/anthropic-remote-chat-client.ts) |

Sequence: [reviewed-sequence.ts](../../src/core/pipeline/reviewed-sequence.ts), [sequence-diagram-plan.ts](../../src/core/pipeline/sequence-diagram-plan.ts). Component: [generate-component-diagram.ts](../../src/core/pipeline/generate-component-diagram.ts), [component-diagram-plan.ts](../../src/core/pipeline/component-diagram-plan.ts).

## Konfiguracja, limity i błędy

Configuration oddziela widoczny draft od zastosowanych ustawień User. Refresh Models używa profilu/endpointu/timeoutu draftu, waliduje ograniczoną odpowiedź i nie zapisuje modelu. Available models zmienia Selected model; Apply zapisuje profil i binding modelu sekwencyjnie. Discard odtwarza zastosowane ustawienia i unieważnia katalog draftu. Zmiana zewnętrzna blokuje nieaktualny Apply; częściowy błąd zapisu powoduje odczyt rzeczywistego stanu. Check Provider Configuration używa zastosowanych ustawień. Profil/model/binding mają zakres machine, wybór packa — resource. Endpoint LM Studio i timeout mogą mieć efektywne nadpisania workspace, z ograniczeniami Workspace Trust. Lokalne URL wymagają dosłownego loopback; adaptery chmurowe używają stałych allowlist HTTPS.

Klucze są oddzielnymi wpisami VS Code SecretStorage dla providerów. Wprowadza się je przez maskowane pola natywne; webview dostaje tylko obecność, nigdy sekret. Help korzysta z języka wyświetlania VS Code i bundlowanego Markdown; nie wysyła żądań do providera ani nie wprowadza przełącznika języka aplikacji. Browser czyta aktywny pack produkcyjnym loaderem; nawigacja używa linii packa i zamrożonego provenance dokumentów, sprawdzając digest przed otwarciem evidence w żywym edytorze.

Konwersja przyjmuje jeden plik do 50 MiB i wynik do 8 MiB Markdown; deadline bez OCR to 120 sekund, OCR — 300 sekund i najwyżej 20 stron OCR. Builder przyjmuje osiem źródeł, po 10 MiB/20 MiB łącznie, 64 KiB tekstu na źródło/160 KiB serializowanego bundle, 256 KiB gotowego żądania i 128 kandydatów. Łączny deadline Buildera to 360 sekund; ekstrakcja ma limit 120 sekund albo krótszy timeout providera. AbortSignals docierają do żądań/workerów/zapisów; zamknięcie procesów i warunkowy cleanup mogą zakończyć się po deadline pracy. Progress pokazuje odczyt, konwersję/OCR, wybór providera, generację i walidację dowodów. Błędy zwracają ograniczone kody/etapy; bez częściowej konwersji/kandydatów ani automatycznego retry/repair/fallbacku. Pełne limity: [kontrakt dokumentów](../document-candidates.md).

## Samowystarczalny build i pakiet

`npm run extension:build` tworzy przez esbuild trzy sąsiednie bundle CommonJS: rozszerzenie, runtime niezależny od hosta i worker konwersji. Rozszerzenie externalizuje `vscode` i sąsiedni runtime; runtime — tylko moduły wbudowane Node. `npm run extension:package` przebudowuje bundle, używa jawnej allowlisty VSIX i, tylko dla Full, dodaje przypięte zasoby OCR offline z manifestem licencji/hashów. Obie instrukcje trafiają jako `readme.md` i `README.pl.md`. Użytkownik korzysta z Node wbudowanego w VS Code; nie potrzebuje ścieżek repo, npm ani osobnej instalacji Node.

`npm run extension:verify` sprawdza wpisy archiwum, importy/limity bundle, ujawnienie ścieżki repo, hashe OCR i zasoby platform. Dane produktu, fixture'y, testy i skrypty developerskie są wykluczone. Dowody Mac ARM nie potwierdzają równoważnego wykonania na wszystkich pakowanych platformach. Historyczne wyniki i pakiety są w [historii stanu projektu](https://github.com/Setech-pl/archi-agent/blob/d723af09dacc71746a82c0fddcad97beb2cece8e/docs/project-state-history.md); bieżące kontrole i przekazanie audytorowi — w [stanie projektu](../project-state.md).

Pakowanie MCP1 domyślnie wybiera Core, bez zależności i zasobów OCR. Full zachowuje dotychczasowe ID i przypięte OCR offline, z jawną kontrolą integralności instalacji. Oba profile mają identyczne bundle runtime. [CLI/MCP i profile](cli-mcp.md) opisują ścisłe wersjonowane kontrakty wyniku/źródła oraz konfigurację.

## F. VER1 — snapshot i provenance

```mermaid
sequenceDiagram
  participant H as VS Code / CLI / function MCP
  participant R as Wspólny runtime weryfikacji
  participant S as Źródło lokalne lub MCP wiedzy
  participant C as Deterministyczny core
  participant L as Model interpretacji
  H->>R: Sequence PlantUML lub proza
  R->>S: Wczytaj jeden niezmienny snapshot źródła
  S-->>R: Fakty, digest, zakres i provenance
  alt Sequence PlantUML
  R->>C: Ograniczony parser, zero wywołań modelu
  else Proza
  R->>L: Jedno ograniczone żądanie interpretacji
  L-->>R: Nieufna interpretacja z dowodami
  R->>C: Waliduj interpretację
  end
  R->>C: Rozstrzygnij nazwy i porównaj z zamrożonym snapshotem
  C-->>H: Ocena, kroki, pominięcia, provenance i digesty
  opt Jawne decyzje nazw / zapis aliasów
  H->>R: Potwierdź decyzje względem oczekiwanych digestów
  R->>S: Odczytaj źródło ponownie i sprawdź wersję
  alt Zmienione źródło lub wejście
  R-->>H: Nieaktualny wynik, ponów weryfikację
  else To samo źródło i wejście
  R->>C: Zastosuj jawne decyzje bez LLM
  C-->>H: Zaktualizowany raport z provenance
  end
  end
```

Zapis aliasów do nakładki SRC1 jest osobną operacją adaptera VS Code: minimalna edycja i natywny zapis po sprawdzeniu wersji oraz dirty buffer. Dla packa i MCP decyzje pozostają sesyjne; CLI/MCP nie zapisują źródeł. VER1 nie weryfikuje C4.

Wyrenderowane kopie (SVG / PNG): [A SVG](../assets/diagrams/pl-A.svg) / [PNG](../assets/diagrams/pl-A.png) · [B SVG](../assets/diagrams/pl-B.svg) / [PNG](../assets/diagrams/pl-B.png) · [C SVG](../assets/diagrams/pl-C.svg) / [PNG](../assets/diagrams/pl-C.png) · [D SVG](../assets/diagrams/pl-D.svg) / [PNG](../assets/diagrams/pl-D.png) · [E SVG](../assets/diagrams/pl-E.svg) / [PNG](../assets/diagrams/pl-E.png) · [F SVG](../assets/diagrams/pl-F.svg) / [PNG](../assets/diagrams/pl-F.png)

## Spójność konfiguracji dostawcy

Credential jest rozwiązywany dla ostatecznie wybranego profilu/modelu tuż przed operacją.
Generowanie i review używają tej samej niezmiennej konfiguracji mimo późniejszych zmian ustawień.
Host obserwuje zdarzenia konfiguracji we właściwym scope przed pierwszym await; monotoniczna rewizja
unieważnia stary wybór także po zewnętrznym A→B→A. Tylko jeden writer rozszerzenia publikuje naraz.
Każdy zapis sprawdza oczekiwany scope przed i po await; konsumuje wyłącznie własną oczekiwaną
notyfikację. Inne zdarzenie, zmiana zaufania/workspace lub nowsza publikacja anulują stary wybór.
Obserwacje są zwalniane w finally, również po błędzie i anulowaniu.

Kolejność bindingu pozostaje fail-closed, jawny profil jest aktywowany na końcu, a wynik odczytywany
ponownie. Częściowy zapis może pozostawić model bez bindingu. Wiele aktualizacji VS Code nie jest
atomowe; nie ma rollbacku nad nowszymi wartościami, crash recovery ani CAS wobec obcych writerów.
Sekrety pozostają w SecretStorage, poza webview, diagnostyką i raportami.

## Granice źródeł i MCP

VSIX, CLI i serwer czterech funkcji MCP komponują ten sam runtime. Osobny klient wiedzy
uruchamia jeden skonfigurowany proces stdio i wywołuje stałe get_knowledge_snapshot.
Generator i reviewer używają jednego frozen snapshotu; nowa operacja pobiera dane ponownie.
Referencje i oryginalne ID są prawdziwe; brak file/line nie tworzy fikcyjnego lokatora.
Core/Full mają identyczne bundle runtime; Core nie zawiera OCR. CLI używa jawnych readRoots
i credentiali środowiska. [Kontrakt źródła](../mcp-knowledge-source.md), [instrukcja](cli-mcp.md).

## Niezmienniki snapshotu wiedzy

Contribution deklaruje tożsamość źródła i zakres partial/complete dla każdej tabeli; pominięcie
oznacza brak dostarczonych danych. Complete dotyczy deklarowanego zakresu, nie zamkniętego świata
architektury. Brak file/line pozostaje jawną luką. Równoważne twierdzenia zachowują całe provenance.
Sprzeczne fakty/reguły, kolizje actor/system ID i forbidden relationships są jawnymi konfliktami
z referencjami wszystkich stron; nie ma pierwszeństwa źródła ani domyślnego zwycięzcy.
Wieloznaczne aliasy nadal wymagają decyzji. Digest SHA-256 obejmuje fakty semantyczne, zakresy,
provenance, luki, niejednoznaczności i konflikty; ID zawiera pełny digest. Zmiana kolejności źródeł
lub rekordów nie zmienia zserializowanych bajtów. Szczegóły rekordów określa kontrakt packa.
