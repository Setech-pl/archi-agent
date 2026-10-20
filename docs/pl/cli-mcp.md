# CLI i lokalny MCP — MCP1

[English](../en/cli-mcp.md) · **Polski**

MCP1 udostępnia ten sam runtime Archi Agent przez CLI, serwer MCP stdio
oraz dwa profile VS Code, dostępne w [publicznym DEMO1](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1). Lokalne prace EA1/EA1b są poza tym wydaniem. Weryfikacja dotyczy Sequence
PlantUML i prozy, nie diagramów Component ani C4. Generowanie obsługuje cztery istniejące
typy: Sequence, Component, C4 Context i C4 Container.

## Instalacja lokalnej paczki

Pobierz tarball CLI z DEMO1 i sprawdź go z [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS) i [manifestem](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/release-manifest.json) tego wydania, następnie zainstaluj:

```bash
npm install --global ./archi-agent-cli-0.3.0-alpha.7.tgz
archi-agent --version
```

CLI/MCP wymaga Node.js >=22.12.0. Alternatywnie rozpakuj tarball i uruchom
`node /opt/archi-agent-cli/package/bin/archi-agent.cjs --help`. Runtime nie potrzebuje repozytorium
ani jego node_modules. Rozszerzenie VS Code używa Node edytora i nie wymaga npm.

## Źródła i dostawcy

Podaj jawną absolutną ścieżkę `--config`. Konfiguracja jest ścisłym JSON do 64 KiB: bez
powtórzonych kluczy, include, globów, odczytu .env i szukania w bieżącym katalogu. readRoots
powinny wskazywać katalogi architektury, a nie cały katalog domowy. Symlinki i wyjście poza
zadeklarowany root są odrzucane. To uprawnienia aplikacji, nie sandbox systemowy chroniący
przed innym procesem tego samego użytkownika.

```json
{
  "schemaVersion": 1,
  "readRoots": { "project": "/srv/architecture" },
  "sources": {
    "bank": {
      "kind": "structurizr-json",
      "sourceId": "big-bank",
      "model": { "root": "project", "path": "bank/workspace.json" },
      "overlay": { "root": "project", "path": "bank/overlay" }
    },
    "pack": { "kind": "local-directory", "directory": { "root": "project", "path": "knowledge-pack" } }
  },
  "providers": {
    "local": { "profileId": "local-lm-studio", "modelId": "explicit-model-id", "baseUrl": "http://127.0.0.1:1234/v1", "timeoutMs": 120000 },
    "cloud": { "profileId": "cloud-openai", "modelId": "explicit-model-id", "credentialEnv": "ARCHI_AGENT_OPENAI_API_KEY" }
  }
}
```

Powyższe modelId pokazują składnię, nie rekomendują ani nie gwarantują dostępności modelu.
`providers` może być puste dla weryfikacji PlantUML i inspekcji wiedzy. Dostawcy pozostają ci
sami: LM Studio, Ollama, Anthropic, OpenAI i OpenRouter. Lokalny URL wymaga literalnego
loopback, a endpointy cloud są stałe w istniejącym runtime.

Structurizr jest pełnoprawnym wyborem źródła. Wymaga workspace.json i trzech plików nakładki:
`aliases.md`, `relationships.md`, `rules.md`. source_id i identyfikatory celów/relacji odnoszą
się do oryginalnych ID Structurizr. Relacje wymagają interface_type oraz mode, jeżeli model
nie zawiera jawnego interactionStyle; sprzeczne metadane blokują walidację. Import obejmuje
people, software systems, containers i relacje statyczne. Components, deployment i views
pozostają poza projekcją. Nie ma parsera DSL ani kopii modelu w Markdown. Inspekcja pokazuje
liczby, pominięcia, oryginalne ID, kwalifikowane nazwy i pochodzenie poszczególnych pól.

Klucze cloud pochodzą wyłącznie z nazwanej odziedziczonej zmiennej środowiska. Dostarcz ją
przez CI, launcher MCP lub menedżer sekretów; nie umieszczaj wartości w argv ani JSON.
Odczyt następuje dopiero dla operacji z wybranym dostawcą. CLI/MCP nie czyta VS Code
SecretStorage ani plików `.env`.

## CLI

```bash
archi-agent knowledge inspect --config /srv/archi-agent.json --source bank --limit 20 --format json
archi-agent flow verify --config /srv/archi-agent.json --source bank --input project:flows/good.puml --input-format plantuml-sequence --format json > verification.json
archi-agent flow verify --config /srv/archi-agent.json --source bank --input project:flows/flow.txt --input-format prose --provider local --language pl --format json
archi-agent diagram generate --config /srv/archi-agent.json --source bank --input project:flows/flow.md --type sequence --provider local --format json
```

Generowanie czyta istniejący dokument flow z front matter. Dla C4 podaj `--type c4-context`
lub `c4-container` oraz `--system-id` i `--expected-knowledge-digest` z inspekcji. Sequence
i Component odrzucają opcje C4. Opcjonalne `--decisions root:path` wiąże jawne decyzje z
hashami wejścia/źródła; weryfikacja sprawdza też digest interpretacji. Decyzje nie zapisują
aliasów i nie zmieniają architektury. Inspekcja i weryfikacja niczego automatycznie nie zapisują.
JSON stdout zawiera jeden wersjonowany wynik i końcowy LF, także dla rozbieżności i częściowego
pokrycia. Diagnostyka trafia na stderr. Domyślny tekst pokazuje status, ocenę, pokrycie i kody.

| Kod weryfikacji | Znaczenie |
| --- | --- |
| 0 | Wszystkie ocenione kroki zgodne w zaimportowanym zakresie, bez nierozstrzygniętych/pominiętych kroków |
| 1 | Wykazane rozbieżności, także przy częściowym pokryciu |
| 2 | Ocena niepełna, nierozstrzygnięta, nieobsługiwana lub brak ocenionych kroków |
| 3 | Błąd konfiguracji, wejścia, źródła, wykonania lub kontraktu wyniku |
| 124 | Deadline całej operacji |
| 130 / 143 | SIGINT / SIGTERM |

Kod zero oznacza zgodność w zakresie, nie dowód kompletnej poprawności architektury. Pominięcia
źródła pozostają jawne. `--timeout-ms` określa łączny budżet (max 600000 ms); ograniczenia
providera nadal obowiązują. PlantUML nie wywołuje LLM. Proza używa jednej interpretacji,
kontynuacja nazw żadnej. Generowanie z review używa najwyżej dwóch, bez retry/repair/fallbacku.

## Cztery narzędzia MCP

Uruchom `archi-agent mcp serve --config /srv/archi-agent.json`. Stdout zawiera tylko ramki
MCP. Klient uruchamiający stdio może użyć poniższych command i args (zewnętrzny format jego
konfiguracji może być inny):

```json
{
  "mcpServers": {
    "archi-agent": {
      "command": "node",
      "args": ["/opt/archi-agent-cli/package/bin/archi-agent.cjs", "mcp", "serve", "--config", "/srv/archi-agent.json"]
    }
  }
}
```

| Narzędzie | Przykładowe argumenty |
| --- | --- |
| inspect_knowledge | `{"source":"bank","limit":20}` |
| verify_flow | `{"source":"bank","input":{"root":"project","path":"flows/good.puml"},"format":"plantuml-sequence"}` |
| resolve_flow_names | `{"sessionId":"UUID","expectedInputSha256":"SHA256","expectedInterpretationDigest":"SHA256","expectedSnapshotDigest":"SHA256","decisions":[{"mentionId":"p2","expectedSnapshotDigest":"SHA256","targetElementId":"EXACT-ID","confirmed":true}]}` |
| generate_diagram | `{"source":"bank","input":{"root":"project","path":"flows/flow.md"},"diagramType":"sequence","provider":"local"}` |

Zastąp UUID/hash/ID dokładnymi wartościami z wyniku. Oczekująca weryfikacja ma jeden slot
kontynuacji w procesie, z nieprzedłużanym czasem dziesięciu minut. Zmiana źródła ją unieważnia.
Przed wysłaniem decyzji potwierdź z użytkownikiem literalną wzmiankę, kanoniczny cel/ID i
pochodzenie. Flaga confirmed klienta nie jest niezależnym dowodem kliknięcia człowieka.
structuredContent i tekstowa kopia zawierają ten sam obiekt. `isError:false` obejmuje też
rozbieżności i niepełną ocenę; sprawdzaj outcome, nie samą flagę.
Proces dopuszcza jedno aktywne narzędzie; kolejne otrzymuje busy. Ramka wejścia ma limit
1 MiB, structured result 4 MiB, a pełna odpowiedź 10 MiB. Anulowanie/EOF kończy aktywną pracę.

## Core i Full w VS Code

Core (`setech-pl.archi-agent-core`) jest rekomendowany nowym użytkownikom. Full
(`setech-pl.archi-agent`) dodaje offline OCR PL/EN i zachowuje dotychczasową tożsamość.
Aktualizacje zachowują ID; istniejący Full nie zmienia się automatycznie w Core. Runtime jest wspólny.

Zainstaluj wybrany VSIX przez Install from VSIX. Oba mogą być zainstalowane, lecz dokładnie
jeden włączony. Dwa włączone to niewspierany konflikt: VS Code przetwarza duplikaty deklaracji
przed aktywacją, a Archi Agent blokuje operacje. Samodzielnie wyłącz jeden i wykonaj Reload
Window. Aby zmienić profil, wyłącz dotychczasowy, przeładuj, włącz/zainstaluj wybrany i przeładuj.
Ustawienia archiAgent pozostają wspólne. SecretStorage jest osobny dla każdego ID: po zmianie
ID wprowadź klucze ponownie; powrót do starego ID zachowuje jego klucze. Bez automatycznego
kopiowania kluczy lub wyłączania rozszerzeń.

Core nie zawiera Tesseract, traineddata, OCR WASM ani natywnych zasobów canvas. DOCX/XLSX
i tekstowy PDF działają offline. PDF auto zgłasza pagesRequiringOcr, gdy strona nie ma
wydobywalnego tekstu, i nie przekazuje częściowego Markdown do ekstrakcji wiedzy. No OCR
czyta tylko tekst i pokazuje pokrycie. OCR all pages jest niedostępne w Core. Full sprawdza
inwentarz i hashe przed OCR; brak/uszkodzenie zasobu to błąd instalacji, bez pobierania i bez
cichego przejścia w Core.

## Klient MCP wiedzy i przykładowy serwer

Serwer funkcji powyżej udostępnia operacje Archi Agent. Osobny klient wiedzy pobiera jeden
snapshot architektury z jednego skonfigurowanego procesu stdio przez stałe narzędzie
`get_knowledge_snapshot`. Wywołanie wybiera kod; LLM nie wybiera narzędzi dostawcy wiedzy.
Nowa operacja pobiera dane ponownie. Generator i reviewer współdzielą jeden frozen snapshot.
Kontynuacja VER1 sprawdza ten sam serwer/źródło/wersję; zmiana danych lub ustawienia procesu
ją unieważnia. Błąd nie uruchamia fallbacku do lokalnej lub starej wiedzy. Decyzje MCP nie
zapisują aliasów.

Uruchom niezależny przykład z kopią wcześniejszej konfiguracji lokalnego źródła (providers
może być puste, a wybrane źródło musi być typu Structurizr):

```bash
archi-agent-knowledge-server --config /srv/knowledge-server.json --check-source bank
archi-agent-knowledge-server --config /srv/knowledge-server.json
```

Pierwsze polecenie sprawdza kontrakt adaptera, drugie udostępnia stdio. Nie wymagają VS Code
ani modelu. Skonfiguruj jeden proces wiedzy w CLI/serwerze funkcji Archi Agent:

```json
{
  "knowledgeServers": {
    "knowledge": {
      "command": "/opt/node/bin/node",
      "args": ["/opt/archi-agent-cli/package/bin/archi-agent-knowledge-server.cjs", "--config", "/srv/knowledge-server.json"]
    }
  },
  "sources": { "remote": { "kind": "mcp", "server": "knowledge", "sourceId": "bank" } }
}
```

Powyższe pola uzupełniają kompletną konfigurację schemaVersion/readRoots/providers; nie są
samodzielnym plikiem. Tool wybiera `source:remote` i nie może zmienić executable, args ani env.
Proces serwera ma własne readRoots. Archi Agent nie jest sandboxem systemowym programu jawnie
skonfigurowanego przez operatora. Nie używa powłoki ani automatycznej instalacji. Dziedziczone
są tylko podstawowa allowlista środowiska SDK oraz jawne nazwy credentialEnv. Stderr dziecka
jest odrzucany.

W VS Code ustaw `archiAgent.knowledgeServer` na powyższy obiekt command/args w **User settings**,
a `archiAgent.architectureSource` na `{"kind":"mcp","sourceId":"bank"}`. Workspace/folder nie
mogą skonfigurować executable. Configuration i Browser pokazują walidację, liczby, pominięcia
i pochodzenie. Referencja bez lokalnego pliku pozostaje referencją; Browser pokazuje szczegóły
i nie pobiera/otwiera URI. Dotychczasowy lokalny Structurizr pozostaje dostępny.

Przykład rozdziela `src/knowledge-server/server.ts` (transport) i `adapter.ts` (źródło).
Dodaj implementację KnowledgeAdapter.load w adapter.ts lub osobnym module, jawnie skomponuj
ją w main.ts i przebuduj paczkę. Użyj wspólnych createKnowledgeResponse/validateKnowledgeResponse.
Wersjonowane contributions zachowują oryginalne ID, wersję, zakres, pominięcia i provenance.
Przyszłe adaptery API/EA/bazy danych mogą być częściowe, bez fikcyjnego Structurizr. Ten kandydat
ich nie implementuje. URI nie zawiera userinfo, query ani hash; fragment jest osobnym polem.
Brak lokalnego lokatora jest jawny i nie jest zastępowany linią 1. Odpowiedź wiedzy ma limit
pełnej ramki 64 MiB, wliczając escaping kopii tekstowej.

Test kontraktu adaptera dla wykonawcy:

```bash
npm run cli:build
npx vitest run test/runtime/mcp-knowledge.test.ts --no-file-parallelism
```

Odpowiedź dostawcy chmurowego odbijająca aktywny credential jest odrzucana przed interpretacją, renderingiem lub publikacją ID modeli. Dotyczy to również escape JSON i zapisanej selekcji modelu zawierającej klucz. Operacja bezpiecznie kończy się błędem; nie redaguje wyniku domenowego, nie ponawia żądania i nie wywołuje innego modelu.

## Pipeline PR: deterministyczna bramka Sequence

Zainstaluj pobrany tarball zgodnie z instrukcją powyżej. Zapisz konfigurację z jawnymi lokalnymi readRoots i źródłem, bez credentiali. Przykład kroku shell po checkout; PlantUML nie wymaga providera. Niezerowy wynik ma zatrzymać krok: bez `|| true`. Sprawdź pokrycie i provenance w artefakcie JSON. Niepełny/nieobsługiwany zakres to exit 2, nie PASS.

```bash
archi-agent flow verify --config /srv/archi-agent.json --source bank --input project:flows/good.puml --input-format plantuml-sequence --format json > verification.json
```
