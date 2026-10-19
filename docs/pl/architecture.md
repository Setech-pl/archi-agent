# Architektura — przegląd

[English](../en/architecture.md) · **Polski** · [Instrukcja użytkownika](user-guide.md)

Archi Agent zachowuje cienką warstwę edytora. Core odpowiada za deterministyczną wiedzę, grounding, walidację i renderowanie; adaptery Node zapewniają ograniczony odczyt plików, konwersję i transport do modeli. Wspólny runtime składa te operacje dla VS Code, CLI i MCP. Do modelu trafiają tylko wybrane dowody. Importowane dane i odpowiedzi modelu pozostają nieufne.

Diagramy poniżej objaśniają zaimplementowane przepływy. Szczegółowe interfejsy, limity i kontrakty błędów opisuje [architektura techniczna](../architecture.md). [Profile diagramów](../diagram-profiles.md) pomagają wybrać właściwy widok.

Lokalny kandydat EA1 dodaje osobną deterministyczną projekcję katalogu enterprise dla mapy zdolności. Nie wymaga providera, packa oprogramowania ani modelu; ma własny raport provenance i zapis ART1. [Kontrakt enterprise](../enterprise-catalog.md). Sześć poniższych diagramów przepływów oprogramowania zachowuje dotychczasowe znaczenie.

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

## Kontrakty techniczne

[Host i pakowanie](../vscode-extension.md) · [Źródła](../src1-structurizr-source.md) · [Weryfikacja przepływu](../ver1-flow-verification.md) · [C4](../c4-diagrams.md) · [Ekstrakcja dokumentów](../document-candidates.md) · [Review i zapis nowego packa](../knowledge-pack-review.md) · [Zapis oryginalnej pary](../diagram-artifact-save.md) · [CLI/MCP](cli-mcp.md) · [Decyzje architektoniczne](../adr/0002-deterministic-diagram-plan-renderers.md).

Wyrenderowane kopie (SVG / PNG): [A SVG](../assets/diagrams/pl-A.svg) / [PNG](../assets/diagrams/pl-A.png) · [B SVG](../assets/diagrams/pl-B.svg) / [PNG](../assets/diagrams/pl-B.png) · [C SVG](../assets/diagrams/pl-C.svg) / [PNG](../assets/diagrams/pl-C.png) · [D SVG](../assets/diagrams/pl-D.svg) / [PNG](../assets/diagrams/pl-D.png) · [E SVG](../assets/diagrams/pl-E.svg) / [PNG](../assets/diagrams/pl-E.png) · [F SVG](../assets/diagrams/pl-F.svg) / [PNG](../assets/diagrams/pl-F.png)
