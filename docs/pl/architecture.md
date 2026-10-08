# Architektura

[English](../en/architecture.md) · **Polski** · [Strona główna](../../README.pl.md)

To architektura zaimplementowana w lokalnej bazie FU-01/DOC1, nie w publicznym pakiecie UX2. [Szczegółowa stabilna architektura](../architecture.md) zachowuje wyjaśnienia historyczne; [roadmapa](../product-roadmap.md) określa plany. Obecne pozyskiwanie używa lokalnych packów Markdown oraz jawnie wskazanych dokumentów do budowy nowego packa; nie ma adaptera pobierania EA/MCP. Sequence i Component mają osobne plany/walidatory/renderery. Context/Container/ArchiMate są planowane. Renderer zgodności sequence jest osobną starszą ścieżką.

Core jest deterministyczny, bez Node/VS Code I/O; orkiestracja wywołuje wstrzyknięte porty i adaptery Node. Runtime jest niezależny od hosta; edytor importuje tylko `src/runtime/index.ts`. Providerzy są wymiennymi adapterami StructuredChatClient. Dokumenty/odpowiedzi modeli są nieufnymi danymi. Do modelu trafiają ograniczone właściwe snapshoty diagramów lub ograniczony wybrany tekst ekstrakcji. Ustawienia i SecretStorage pozostają na granicy VS Code.

## A. Komponenty i granice

```mermaid
flowchart TB
  subgraph Host["Granica rozszerzenia VS Code"]
    direction TB
    UI["Polecenia / pickery / edytory"] --> Settings["Ustawienia / SecretStorage"]
  end
  subgraph Runtime["Runtime niezależny od hosta"]
    direction TB
    App["archi-agent-runtime / extract-document-candidates"] --> Review["knowledge-pack-review / diagram-artifact"]
  end
  subgraph Core["Deterministyczny core — bez I/O"]
    direction TB
    Knowledge["Loader packa / snapshot K1 / grounding / KPB-A"] --> Pipeline["Plany / walidatory / renderery / raport"]
  end
  subgraph Adapters["Adaptery Node i lokalne zasoby pakietu"]
    direction TB
    Pack["NodeKnowledgePackSource"] --> Files["Lokalne pliki: odczyt w limitach / zapis exclusive / cleanup"]
    Conversion["Prywatne kopie / worker konwersji"] --> OCR["PDF.js / canvas / Tesseract WASM + PL/EN"]
    Providers["LM Studio / Ollama / Anthropic / OpenAI / OpenRouter"]
  end
  UI -->|src/runtime/index.ts| App
  App --> Knowledge
  Review --> Knowledge
  App --> Pack
  App --> Conversion
  Pipeline -->|StructuredChatClient| Providers
  App -->|StructuredChatClient| Providers
  Review -->|ART1 / K3 / UX3| Files
```

## B. Dokumenty i zamrożone wejście

```mermaid
sequenceDiagram
  participant UI as UI rozszerzenia
  participant K2 as Runtime
  participant FS as System plików
  participant CV as Konwerter / OCR
  UI->>K2: Jawne ścieżki dokumentów + polityka OCR
  K2->>FS: Odczyt deskryptora w limitach, przechwyć bajty
  FS-->>K2: Dokładne bajty, prywatna kopia tymczasowa
  K2->>K2: SHA-256 bajtów oryginału
  opt PDF / DOCX / XLSX
  K2->>CV: Konwertuj prywatną kopię, przekaż anulowanie
  CV-->>K2: Tekst + pokrycie stron + ograniczenia, worker zamknięty
  end
  K2->>K2: UTF-8 / BOM / LF / NFC, digest tekstu, limity bundle
  K2->>K2: Sortuj źródła, zamroź bundle i digest
  Note over UI,K2: Błąd wejścia lub Cancel: zero żądań generacyjnych
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
  G-->>Core: Nieufny plan Sequence v3 / Component v1
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
