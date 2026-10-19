# MCP knowledge source contract

Reference for the implemented v1 transport. [Setup EN](en/cli-mcp.md) / [PL](pl/cli-mcp.md).
The function server and knowledge source are separate processes; this is not LLM tool discovery.

## Dwa kierunki MCP i jeden mechanizm wiedzy

Serwer funkcji Archi Agent nadal oferuje cztery dotychczasowe tools. Osobny klient wiedzy
w `src/node` uruchamia jeden skonfigurowany proces stdio i wywołuje deterministycznie jedno
stałe narzędzie `get_knowledge_snapshot` z jednym `sourceId`. Model nie wybiera narzędzi,
nie odkrywa źródeł, nie łączy ich i nie otrzymuje pełnego katalogu. Runtime komponuje klienta
jako kolejny adapter źródła. Core pozostaje bez I/O, SDK, procesów i zależności od hosta.

Pierwszy przykładowy serwer działa samodzielnie pod Node, bez VS Code i LLM. Adapter
`structurizr` czyta dokładnie workspace.json + trzy wymagane pliki nakładki SRC1 przez
istniejący bounded reader/politykę readRoots i produkcyjny `inspectArchitectureSource` /
mapper SRC1. Bez parsera DSL i kopiowania modelu do Markdown. Nakładka wiąże oryginalne
source_id/target_id/relationship_id. Serwer zwraca kontrolowany błąd przy brakujących plikach,
metadanych interface_type/mode lub konflikcie. Zakres: people, software systems, containers,
relacje statyczne; pominięte components/deployment/views pozostają jawne. Lokalny SRC1 jest
pełnoprawnym wyborem na równi z packiem i MCP, z opisem wymaganych plików oraz walidacji.

## Wersjonowany kontrakt źródła

Jedna ścisła odpowiedź v1 (narzędzie ma inputSchema i outputSchema):

```typescript
type KnowledgeResponseV1 = {
  schemaVersion: 1;
  source: { id: string; version: string };
  format: "archi-agent-knowledge-contributions/1";
  snapshot: { id: string; digest: string };
  contributions: KnowledgeContribution[];
};
```

`source.id` jest skonfigurowanym logicznym ID (max 56, istniejący pattern). `version` jest
SHA256 deterministycznego, pełnego payloadu contributions; snapshot jest wynikiem istniejącego
`createKnowledgeSnapshot`. Scope, omissions, source hashes i provenance są w contributions,
nie są zgadywane z transportu. Każdy obiekt i rekord jest zamknięty; istniejące walidatory
wierszy i K1 stosowane po obu stronach. Max 64 contributions, 10000 rekordów na tabelę łącznie,
1 MiB na plik źródłowy, 64 MiB na odpowiedź/ramkę pobierania. Limit odpowiedzi funkcji
Archi Agent pozostaje 4 MiB/10 MiB. Brak cichego ucinania.

Przykładowy adapter projektuje produkcyjny snapshot/pack SRC1 na contributions, zachowując
wszystkie provenance, oryginalne ID, prawdziwe logical file/line i zakres źródła. Klient sam
odtwarza snapshot przez K1 i sprawdza deklarowane version/id/digest; potem tworzy wspólny pack
oraz dotychczasowe indeksy z tych samych zwalidowanych rekordów. To projekcja typów, bez
nowego dopasowania, porównania ani ponownego modelowania architektury. Identyfikatory, kind
źródła i digest nie zmieniają się tylko dlatego, że użyto MCP. Metadane procesu transportu
pozostają poza domenowym snapshotem i nigdy nie trafiają do modelu.

Kontrakt normalized contributions pozwala przyszłym adapterom API/EA/bazy danych oddawać
źródła częściowe bez tworzenia fikcyjnego Structurizr. Nie implementujemy tych adapterów.
Prawdziwe remote referencje mają w `KnowledgeSource`/`RecordProvenance` opcjonalne
`reference:{uri,version,fragment?}`: bounded URI bez userinfo/credential, prawdziwa wersja i
oryginalne externalId. Brak lokatora plikowego jest jawny, nigdy remote.md:1. Wspólne rekordy
packa i referencje indeksów/context/snapshotów/raportów Sequence/Component dostają opcjonalny
rzeczywisty `location`; źródłowe identity/provenance pozostają obowiązujące. Browser pokazuje
referencję lub brak lokalnego lokatora i nie otwiera zmyślonego pliku. Lokalny SRC1 zachowuje
obecne rzeczywiste linie. To wąskie domknięcie istniejącego kontraktu wymiennego źródła,
bez przesuwania I/O do core i bez nowej warstwy/silnika. Review ocenia koszt tej zmiany.

## Konfiguracja, bezpieczeństwo i cykl operacji

Konfiguracja procesu CLI/MCP dostaje opcjonalne `knowledgeServers` (dokładnie zero lub jeden
wpis): absolutny `command`, bounded `args` (max 32 x 1024 znaków), opcjonalne nazwy
`credentialEnv` (max 8, pattern ARCHI_AGENT_*); bez literalnych sekretów i shell. Źródło
`sources.remote` ma `kind:"mcp"`, nazwę skonfigurowanego serwera i `sourceId`. Tool wybiera tylko
nazwę źródła; nie dostarcza command/args/env ani nie rozszerza readRoots. Serwer wiedzy ma
własny jawny config/readRoots. Polityka procesu Archi Agent nie jest sandboxem uruchomionego
przez operatora programu. Nie dziedziczyć całego process.env: bazowa allowlista SDK + jawnie
wskazane zmienne. Nie logować command/argv, stderr serwera, credential ani surowych wyjątków.

VSIX: jeden serwer w nowym ustawieniu **machine/User only** `archiAgent.knowledgeServer`;
source selector `architectureSource` dopuszcza `{kind:"mcp",sourceId}`. Runtime dostaje
konfigurację serwera wyłącznie z zaufanego User scope, nigdy workspace/folder. Workspace Trust
nadal obowiązuje. UI opisuje lokalny SRC1 i MCP oraz wynik walidacji; ustawienia zaawansowane
mogą korzystać z istniejącej ścieżki natywnego JSON. Żaden automatyczny install/download.

Klient łączy się, negocjuje, wywołuje stałe narzędzie, waliduje i zawsze zamyka proces stdio
w finally; timeout max 120 s lub krótszy pozostały deadline operacji. SIGINT/SIGTERM/EOF i
AbortSignal kończą pracę oraz dziecko bez publikacji spóźnionego sukcesu. Jest jeden fetch
na nową operację. Generator i reviewer używają jednego frozen snapshotu. Kontynuacja VER1
pobiera świeżą wersję z tego samego skonfigurowanego serwera/sourceId wyłącznie do porównania;
zmiana source.version/snapshot daje stale-source, bez rebase. MCP source nie daje alias-save
ani sourceTexts do lokalnego edytora. Błąd serwera/kontraktu/timeout nie daje fallbacku do
lokalnego packa ani starej wiedzy.
