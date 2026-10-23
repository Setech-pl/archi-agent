# EA1b — Capability Map przez CLI/MCP

Status: **REVIEWED — implementacja EA1b autoryzowana przez właściciela 2026-10-19**.
Plan opisuje zatwierdzony zakres; lokalny checkpoint po bramkach, bez push/merge/publikacji.
Bieżący wynik implementacji i odbioru: [EA1b verification](https://github.com/Setech-pl/archi-agent/blob/7efa83f5fbe3c3c3da637676ff6316f831b9177f/docs/ea1b-verification.md).

## Preflight i zakres

Potwierdzono lokalnie gałąź `docs/doc3-ea1`, HEAD
`4f3e8d90d65078835fb32fc477f8a9f6b73414ff` (EA1), rodzic DOC3
`ec3939cbcc9ca0ceaa9791c4378ae2f1c4fa6920`. Working tree czyste, staging pusty.
Nie wykonano fetch; nie deklarujemy aktualnego stanu remote. Zapis project-state zgadza się
z Git; jego końcowe „STOP po EA1” zostaje zastąpione wyłącznie autoryzacją planowania EA1b.
Przed implementacją powtórzyć preflight i porównać API z tą bazą, zachowując nowsze zmiany.

Cel: ten sam katalog enterprise/1 i ten sam jawny wybór widoku dają te same dane biznesowe,
digest katalogu i projekcji oraz bajty PlantUML w VS Code, CLI i serwerze funkcji MCP.
Każda ścieżka ma **0 wywołań LLM**, bez flow, providera, modelu, klucza LLM i interpretacji tekstu.
Źródło może wymagać własnego credentialu dostępu; Retail nie wymaga żadnego.

Trzy ścieżki:

| Ścieżka | Wywołujący i przepływ |
| --- | --- |
| A | CLI → wspólny runtime EA1 → lokalny enterprise.json → projekcja/render/raport |
| B | Zewnętrzny klient → serwer **funkcji** Archi Agent (`generate_diagram`) → ten sam runtime; źródło wyłącznie z konfiguracji operatora |
| C | VS Code lub CLI/serwer funkcji → klient **wiedzy** → osobny skonfigurowany proces źródłowy (`get_enterprise_snapshot`) → zwalidowany snapshot → ten sam runtime EA1 |

Serwer funkcji wykonuje operacje produktu. Serwer wiedzy dostarcza dane, nie generuje mapy.
Mogą działać w osobnych procesach na tej samej maszynie; „zdalny” oznacza tu źródło przez MCP
stdio, nie dodanie HTTP/SSE. Użytkownik dostarcza executable i args w zaufanej konfiguracji.

Non-goals: EA2–EA4, XML/EA/API/baza jako gotowe adaptery, ogólny metamodel, nowe zależności,
LLM/tools agent, wyszukiwanie capabilities z systemów, trwały cache/sesje enterprise, edytor,
Browser enterprise, nowy webview konfiguracji, ogólne zmiany transportu/bezpieczeństwa,
automatyczny zapis w CLI/MCP, publikacja ani zmiany opublikowanych ZIP-ów DEMO1.

## Rzeczywista baza i miejsca rozszerzenia

Przeczytano [AGENTS](../../AGENTS.md), [workflow](../development-workflow.md),
[stan](../project-state.md), [roadmapę](../product-roadmap.md), [architekturę](../architecture.md),
[plan EA1](ea1-capability-map.md), [raport EA1](https://github.com/Setech-pl/archi-agent/blob/7efa83f5fbe3c3c3da637676ff6316f831b9177f/docs/ea1-verification.md),
[kontrakt enterprise](../enterprise-catalog.md) i instrukcje CLI/MCP PL/EN.
Poniższe sygnatury opisują kod HEAD, nie wcześniejsze propozycje planu EA1.

| Obecny plik/API | Stan i dokładne rozszerzenie EA1b |
| --- | --- |
| `src/core/enterprise/enterprise-catalog.ts` | `validateEnterpriseCatalog(raw): EnterpriseCatalog` rzuca `EnterpriseError`; `createEnterpriseSnapshot(catalog,evidence): EnterpriseSnapshot` waliduje, kopiuje, sortuje i zamraża. Zachować walidację i domenę digestu. `EnterpriseEvidence` wymaga dziś `file`, `sourceBytesSha256` i fizycznych lokalizacji: dodać oddzielny wariant MCP. |
| `src/node/enterprise-json-source.ts` | `EnterpriseSourceConfig={kind:"enterprise-json";path:string}`; `loadEnterpriseJson(source,signal?,localReadPolicy?)`. Jeden bounded read, prawdziwe pointers/linie. Zachować loader jako lokalny adapter; union źródeł przenieść do runtime. |
| `src/core/enterprise/capability-map.ts` | `capabilityMapSelectionSchema`, `projectCapabilityMap(snapshot,selection)`, `renderCapabilityMap(projection)`, `validateCapabilityMapRender(text,count)`. Bez nowego generatora, nowej domeny digestu ani zmiany renderera. |
| `src/core/enterprise/capability-map-report.ts` | Ścisły raport `archi-agent-capability-map-report` v1 wymaga lokalnego file/hash i locatorów. Zachować v1; dodać jawny v2 dla MCP, opisany dalej. |
| `src/runtime/capability-map.ts` | `inspectEnterpriseSource(source,signal?,localReadPolicy?)`; `generateCapabilityMap({source,selection},signal?,localReadPolicy?)`. Wynik success ma `diagramType,plantUml,report,artifact`; failure `code,issues,count?`. Generacja ładuje jeden snapshot; inspekcja to osobna operacja. Zmienić wyłącznie dispatch źródła i budowanie raportu/capture. |
| `src/runtime/index.ts` | Eksportuje powyższe operacje i typy, ale nie factory/validator enterprise. Dodać eksporty kontraktu transferu i jawne typy wyników potrzebne hostom i adapterowi; host nie importuje core/node. |
| `src/hosts/local/config.ts` | Ścisłe config v1, `readRoots`, `sources:KnowledgePackSourceConfig`, opcjonalny jeden knowledgeServer, `providers` może być `{}`. `loadLocalHostConfig`, `readHostInput`, leniwy `hostGenerator`. Dodać osobny config v2 i `enterpriseSources`, zachować parser v1. |
| `src/hosts/local/schemas.ts` | `generateInputSchema` to union Sequence/Component i C4, oba wymagają input/provider. Rozdzielić po diagramType; dodać wariant capability-map, analogiczny wariant inspekcji. |
| `src/hosts/local/operations.ts` | `LocalOperations.generate` dziś od razu czyta flow i wywołuje hostGenerator. Nowy dispatch przed tymi krokami; wywołuje publiczne `generateCapabilityMap`. `inspect` kieruje enterprise do `inspectEnterpriseSource`; `run/failure` zachowują typ wyniku capability-map również przy timeout/busy. |
| `src/cli/main.ts` | `parseArgs` z allowlistą per komenda, wykrywanie powtórzeń, `reference(ROOT:PATH)`, sygnały i stdout. Dodać flagi capability i walidację wariantu przed I/O operacji; istniejące komendy i wartości domyślne zostają. |
| `src/runtime/host-results.ts` | Strict `HostResultV1`, `portableDiagramOutcome`, 4 MiB. Dodać odrębne warianty enterprise outcome bez fikcyjnych summary/generatorType/grounding report. Zachować dotychczasowe wyniki bajtowo/strukturalnie. |
| `src/mcp/server.ts`, `src/cli/mcp-entry.ts` | Cztery istniejące tools, wspólne LocalOperations; SDK stdio, busy, timeout/cancel, 1 MiB stdin/10 MiB odpowiedź. Rozszerzyć schematy input/output istniejących inspect/generate i opis; bez piątego narzędzia funkcji i bez writer. |
| `src/node/mcp-knowledge-source.ts` | `mcpKnowledgeServerSchema`, `fetchMcpKnowledge(server,sourceId,signal?)`: stałe get_knowledge_snapshot, 64 MiB, credential scan, deadline, zamknięcie dziecka. Nowa funkcja `fetchMcpEnterprise` w tym module, z tym samym cyklem transportu; v1 nie dostaje discovery ani nowych argumentów. |
| `src/core/knowledge-pack/knowledge-transfer.ts` | `knowledgeResponseSchema` jest strict v1; `createKnowledgeResponse/validateKnowledgeResponse`. Nie modyfikować kontraktu; enterprise ma osobny moduł. |
| `src/runtime/architecture-source.ts` | `inspectArchitectureSource` ładuje K1/Structurizr/MCP v1. Nie zamieniać go w enterprise loader i nie konwertować systems na capabilities. |
| `src/knowledge-server/{adapter,server,main}.ts` | `KnowledgeAdapter.load(sourceId,AbortSignal):Promise<KnowledgeResponseV1>`, Structurizr adapter, `serveKnowledge(adapter)`, check-source. Dodać opcjonalny EnterpriseAdapter i jawne skomponowanie w main; zachować dotychczasowe wywołanie serveKnowledge(adapter). |
| `vscode-extension/src/{settings.ts,commands/generate-capability-map.ts}` | EA1 wybiera plik, inspect, pickery, generate, dwa edytory/ART1; omija provider. `configuredArchitectureSource` czyta executable tylko z `inspect(...).globalValue`. Dodać osobne configuredEnterpriseSource i nowy wybór lokalny/MCP; nie wiązać z software architectureSource. |
| `src/runtime/diagram-artifact.ts` | `captureCapabilityMapArtifact(plantUml,report,sourcePath)` wymaga ścieżki; WeakMap, strict report, envelope ART1 v1 i exclusive writer. Obsłużyć source reference MCP bez fikcyjnego pliku i bez zmiany writer. |

## Konfiguracja źródeł i kompatybilność

Config v1 pozostaje dokładnie strict v1, z tymi samymi wymaganymi polami. Nowe pola w v1 są
błędem. Config v2 zachowuje `readRoots`, `sources`, `providers`, `knowledgeServers` i ich limity,
dodaje wymagane `enterpriseSources` (0–16 nazw), a `sources`/`providers` mogą być pustymi mapami.
Nie migracyjnie dopisywać pól do starego config. Nowy loader akceptuje v1 i v2; stary produkt
odrzuci v2 zamiast źle zinterpretować dane. Wspólny wewnętrzny LocalHostConfig otrzyma
`enterpriseSources:{}` dla v1. Narzędzia nie mogą zmieniać żadnej części tej konfiguracji.

Pełny docelowy config CLI/serwera funkcji, A oraz C:

```json
{
  "schemaVersion": 2,
  "readRoots": {"project": "/srv/retail-checkout"},
  "sources": {},
  "enterpriseSources": {
    "retail-local": {
      "kind": "enterprise-json",
      "file": {"root": "project", "path": "architecture/enterprise.json"}
    },
    "retail-mcp": {"kind": "mcp", "server": "knowledge", "sourceId": "retail-business"}
  },
  "knowledgeServers": {
    "knowledge": {
      "command": "/opt/node/bin/node",
      "args": ["/opt/archi-agent-cli/package/bin/archi-agent-knowledge-server.cjs", "--config", "/srv/retail-knowledge.json"],
      "timeoutMs": 10000
    }
  },
  "providers": {}
}
```

Nazwy config to dotychczasowe `[a-z][a-z0-9-]{0,55}`. Runtime enterprise source ma union:

```typescript
type EnterpriseSourceConfig =
  | {readonly kind: "enterprise-json"; readonly path: string}
  | {readonly kind: "mcp"; readonly sourceId: string; readonly server: McpKnowledgeServerConfig};
```

Lokalne file rozwiązuje istniejący `resolveLocalReadReference`, zgodnie z readRoots operatora;
runtime dostaje bezwzględny path i niezmienną LocalReadPolicy. MCP wymaga istniejącego serwera
z knowledgeServers. Połączenie nie dodaje nowych uprawnień odczytu. Nazwy `retail-local` i
`retail-mcp` to aliasy hosta; logiczna tożsamość katalogu w obu przypadkach to `catalog.source.id`.
Nie wolno wybrać software source dla mapy ani enterprise source dla starej operacji:
`source-kind-incompatible` (jeśli nazwa występuje tylko w drugiej mapie), inaczej `source-unknown`.
Ta sama nazwa może istnieć w obu mapach; diagramType jednoznacznie wybiera przestrzeń.

VS Code: nowe resource-scoped ustawienie `archiAgent.enterpriseSource`, default `null`:
`null` = istniejący picker lokalnego pliku; jedyny nowy wariant to
`{"kind":"mcp","sourceId":"retail-business"}`. Nie dodawać executable/args do tego ustawienia.
Serwer nadal pochodzi wyłącznie z User/global `archiAgent.knowledgeServer` (machine scope),
przez `inspect(...).globalValue`, z kopią args/env. Wartości workspace/folder tego executable
są ignorowane zgodnie z obecną zasadą; jeśli nie ma poprawnego global, błąd konfiguracji,
bez uruchomienia procesu. Nie czytać zwykłego effective `get(knowledgeServer)`.

Create Diagram → Enterprise Architecture → Capability Map: gdy enterpriseSource jest MCP,
QuickPick daje „Configured MCP source: retail-business” i „Local enterprise.json…”. To jawny wybór
użytkownika, nie fallback po błędzie. `null` zachowuje dotychczasową drogę pliku. Po wyborze
MCP nie pokazywać dialogu pliku. Istniejące pickery zakresu/poziomu/skali są wspólne. Lokalny
projekt nadal jest wymagany jak w EA1, m.in. dla późniejszego ART1; bez nowego trybu no-folder.
Nie używać `readSettings`, onboardingu software packa ani providera.

## CLI i serwer funkcji MCP

### Polecenia

Rozszerzyć istniejące `knowledge inspect` o `--type capability-map`, kierujące do enterprise,
bez zmiany zachowania wywołań bez `--type`. Domyślny format nadal text.

```bash
archi-agent knowledge inspect --config /srv/archi-agent.json --source retail-local --type capability-map --format json
archi-agent diagram generate --config /srv/archi-agent.json --source retail-local --type capability-map --max-level 3 --color-scale maturity --language pl --format json
archi-agent diagram generate --config /srv/archi-agent.json --source retail-mcp --type capability-map --root sales --max-level 2 --language en --format json
archi-agent mcp serve --config /srv/archi-agent.json
```

Nowe flagi generate: `--root ID` (jeden korzeń L1; brak = całość), `--max-level 1|2|3`
(default 3), `--color-scale ID` (brak = none), `--language pl|en` (default en, niezależny od
locale maszyny), `--expected-catalog-digest SHA256` (opcjonalny hash z inspekcji).
Bez expected generacja wiąże wybór z właśnie załadowanym snapshotem, bez drugiego odczytu.
Z expected wymaga równości; formatowanie/kolejność rekordów nie unieważnia wyboru EA1.
CLI wspiera jeden root jak UI; MCP/runtime zachowują obecną tablicę rootIds. Powtórzenie flagi
root lub dowolnej innej nadal daje `argument-duplicate`; nie wprowadzać CSV/implicit append.
Timeout domyślny capability generate/inspect = 30000 ms; `--timeout-ms` nadal 1..600000,
ale nie podnosi wewnętrznych limitów EA1. Stare komendy zachowują 240000/120000 ms.

Capability-map odrzuca `--input`, `--provider`, `--decisions`, `--system-id`,
`--expected-knowledge-digest`, nawet jeżeli wskazują poprawne wartości. Software diagrams
odrzucają nowe flagi mapy (w tym language, niedostępne dotąd dla generate).
Enterprise inspect dopuszcza tylko config/source/type/format/timeout-ms oraz
expected-catalog-digest; odrzuca query/offset/limit/expected-knowledge-digest.
Nie przenosić obcych opcji do zagnieżdżonego c4Selection i nie usuwać ich przed walidacją.
Odrzucenie przed odczytem źródła/credentiali/uruchomieniem procesu, exit 3.

### Rozdzielone schematy narzędzi

Nadal dokładnie cztery tools serwera funkcji. `generate_diagram` przyjmuje strict union
poniższych wariantów; `additionalProperties:false` na każdym obiekcie i zagnieżdżeniu.
Nie wymagać wspólnego generateBase z provider/input dla wszystkich diagramów.

| diagramType | Wymagane pola | Opcjonalne |
| --- | --- | --- |
| sequence, component | source, input:FileReference, provider, diagramType | decisionsFile:FileReference, timeoutMs |
| c4-context, c4-container | source, input, provider, diagramType, c4Selection:{systemId,expectedKnowledgeDigest} | timeoutMs |
| capability-map | source, diagramType, selection:{rootIds,maxLevel,colorBy,language} | selection.expectedCatalogDigest, timeoutMs |

Ścisły schemat nowego wariantu (składnik oneOf generowanego ze schematu Zod):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["source", "diagramType", "selection"],
  "properties": {
    "source": {"type": "string", "pattern": "^[a-z][a-z0-9-]{0,55}$"},
    "diagramType": {"const": "capability-map"},
    "timeoutMs": {"type": "integer", "minimum": 1, "maximum": 600000},
    "selection": {
      "type": "object", "additionalProperties": false,
      "required": ["rootIds", "maxLevel", "colorBy", "language"],
      "properties": {
        "rootIds": {"type": "array", "maxItems": 1000, "items": {"type": "string"}},
        "maxLevel": {"enum": [1, 2, 3]},
        "language": {"enum": ["pl", "en"]},
        "expectedCatalogDigest": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
        "colorBy": {"oneOf": [
          {"type": "object", "additionalProperties": false, "required": ["kind"], "properties": {"kind": {"const": "none"}}},
          {"type": "object", "additionalProperties": false, "required": ["kind", "scaleId"], "properties": {"kind": {"const": "rating"}, "scaleId": {"type": "string"}}}
        ]}
      }
    }
  }
}
```

Walidacja istniejącej selekcji EA1 nadal sprawdza duplicate rootIds, istnienie L1 i skali,
stale digest i limity widoku. Nieposortowane poprawne rootIds zostają kanonizowane jak dziś.
Przykładowe argumenty generate i inspect serwera funkcji:

```json
{
  "source": "retail-mcp",
  "diagramType": "capability-map",
  "selection": {"rootIds": [], "maxLevel": 3, "colorBy": {"kind": "rating", "scaleId": "maturity"}, "language": "pl"}
}
```

```json
{"source": "retail-mcp", "diagramType": "capability-map"}
```

Drugi obiekt to `inspect_knowledge`: nowy strict wariant dopuszcza wyłącznie source,
diagramType, expectedCatalogDigest? i timeoutMs?. Stary wariant nie ma diagramType i zachowuje
query/offset/limit/expectedKnowledgeDigest. Unknown/mixed fields dają `arguments-invalid`.
Nie dodawać diagramType do verify_flow ani resolve_flow_names.

### Wyniki, błędy, zapis

Zachować host envelope `{schemaVersion:1,operation,outcome,meta}` i istniejące pola meta
(adapter/runId/startedAt/elapsedMs); dodać tylko nowe, rozłączne warianty outcome. Aktualizować
również outputSchema tools/list i walidator `mcpResultSchema`. Stary odbiorca strict może nie
obsłużyć nowego diagramType — musi pozostać przy dotychczasowych wywołaniach; ich JSON się nie zmienia.

Dokładny nowy success generacji:
`{status:"success",diagramType:"capability-map",plantUml:string,report:CapabilityMapReportV1|V2}`.
Bez `artifact` (obiekt procesu/WeakSet), provider/generatorType i udawanego summary Sequence.
Text stdout pokazuje PlantUML i JSON raportu jak dotychczasowy generate, z etykietą report.json.
JSON stdout to pojedynczy envelope z końcowym LF. Nie kopiować raportu do dwóch pól JSON.
Błędy parsera argumentów lub ładowania config przed `LocalOperations.run` zachowują obecną
politykę: bezpieczny stały komunikat stderr, pusty stdout i exit 3 także przy `--format json`.
Nie rozszerzać przy tym zadaniu globalnego protokołu błędów CLI.

Enterprise inspection success ma dokładnie:
`{status:"success",diagramType:"capability-map",source:<source katalogu>,snapshot:{id,catalogDigest},`
`sourceEvidence:<local albo mcp evidence summary>,counts:{capabilities,scales},`
`roots:[{id,name}],scales:[{id,name}]}`. Roots sortowane po ID, max 1000, scales max 8.
Nie zwraca całego katalogu, locatorów i dowolnych opisów rekordów; meta/result limit 4 MiB nadal działa.
Local summary to `{kind:"enterprise-json",file,sourceBytesSha256}`, MCP summary to
`{kind:"mcp",sourceId,sourceVersion,responseFingerprint,tool:"get_enterprise_snapshot",contractVersion:1}`.
Inspekcja może zwrócić pustą listę/coverage not-provided, jak obecne runtime inspect;
generacja daje wtedy jawny brak danych, nie sukces pustej mapy.

Nowe failure outcome generate/inspect:
`{status:"failed"|"unsupported",diagramType:"capability-map",code,issues:[{code,path,location?}],count?}`.
`issues` max 100; count to faktyczna liczba problemów albo visible count dla map-too-large.
Nie mapować enterprise błędów do fikcyjnego stage generator-configuration. Run musi otrzymać
kontekst wariantu przed wykonaniem pracy, żeby błędne argumenty/busy/timeout też miały właściwy
kształt; brak/nieznany diagramType zachowuje dotychczasową odpowiedź arguments-invalid.

| Wynik | Kod | CLI exit / MCP isError |
| --- | --- | --- |
| Sukces, także poprawny partial catalog | — | 0 / false; coverage pozostaje w raporcie |
| Tool nieobecny lub wersja nieobsługiwana | enterprise-unsupported / enterprise-version-unsupported; status unsupported | 2 / false, bez diagramu |
| Coverage not-provided, puste partial/complete | enterprise-data-unavailable / empty-scope; status failed | 2 / false, bez diagramu |
| Zmieniona semantyka względem expected | stale-source | 3 / true |
| Złe argumenty/źródło/hierarchia/provenance/oceny, rozmiar mapy/render | arguments-invalid, source-kind-incompatible, invalid-source, invalid-selection, map-too-large, render-invalid | 3 / true |
| readRoots/symlink/UTF-8/JSON | Istniejące containment-violation, symbolic-link, invalid-utf8, enterprise-json-invalid, source-key-duplicate itd. | 3 / true |
| Złe sourceId, schemat odpowiedzi / deklarowany hash | enterprise-response-invalid / enterprise-response-digest-mismatch | 3 / true |
| Nadmiar odpowiedzi / credential w odpowiedzi | mcp-knowledge-result-too-large / mcp-knowledge-sensitive-response | 3 / true |
| Połączenie/źródło/cleanup | mcp-knowledge-unavailable / mcp-knowledge-source-failed / mcp-knowledge-cleanup-unconfirmed | 3 / true |
| Deadline hosta / EA1 / MCP źródła | timeout / deadline-exceeded / mcp-knowledge-timeout | 124 / true |
| Cancel narzędzia/progress | cancelled | 3 / true; CLI SIGINT 130, SIGTERM 143 mają pierwszeństwo |

Kod 1 nadal dotyczy starych discrepancies/review rejection, nigdy deterministycznej mapy.
Runtime zachowuje obecne failure dla lokalnych wywołań EA1; portable mapping dodaje
diagramType/status unsupported tam, gdzie potrzebuje go kontrakt hosta. Nowe błędy nie zmieniają
mapowania starych wyników. UI pokazuje code i pierwszą ścieżkę problemu; cancellation jest ciche.

CLI i serwer funkcji nie zapisują plików, nie przyjmują outputRoot/path, nie eksportują ART1
receipt i nie uzyskują writer przez samo wybranie mapy. Shell redirection stdout jest decyzją
operatora. VS Code zachowuje oryginalny frozen ART1 capture, native confirm, exclusive write,
conditional rollback, registry lifetime i envelope `archi-agent-artifact` formatVersion 1.
Capture dla MCP zapisuje logiczną referencję, nigdy command/args/env, absolutną ścieżkę procesu
ani fikcyjny file. Save nie odpyta ponownie źródła i nie zapisuje edycji podglądu.

## Osobny protokół enterprise

| Wariant | Zalety | Koszt / zgodność |
| --- | --- | --- |
| Opcjonalne stałe `get_enterprise_snapshot`, niezależny kontrakt v1 | get_knowledge_snapshot v1 i jego strict schema pozostają nietknięte; brak migracji SRC1/K1; brak tool jest jednoznaczny | Jedna nowa ścieżka discovery dla enterprise, osobny mały validator |
| get_knowledge_snapshot v2 z negotiated supportedFormats, format w żądaniu i union odpowiedzi | Jedno narzędzie dla wielu domen | Potrzebny handshake/negocjacja, dwa warianty klienta i serwera, migracja dokumentacji; bez negocjacji stare strict v1 odrzuca nowe pola |

**Wybór: pierwsza opcja.** Enterprise nie jest K1 contributions. Nie wysyłać argumentu format
ani enterprise pól do starego narzędzia. Stary klient v1 nadal wywołuje wyłącznie v1, a nowy
klient software zachowuje swój obecny przebieg. Nowy serwer może mieć oba tools albo tylko
enterprise, jeśli nie skomponowano KnowledgeAdapter. Brak enterprise nie jest błędem starych funkcji.

Stała nazwa: **get_enterprise_snapshot**. Wersja protokołu odpowiedzi:
`schemaVersion:1`, `format:"archi-agent-enterprise-snapshot/1"`.
Wersja danych katalogu pozostaje `schemaVersion:1`, `format:"archi-agent-enterprise/1"`.
Input strict: `{sourceId,contractVersion:1}`; sourceId używa dotychczasowego wzorca do 56 znaków.
Katalog lokalny nadal może mieć source.id do 64 znaków; przez MCP obowiązuje wspólny podzbiór,
bez aliasowania/przepisywania source.id. Adapter musi jawnie zgłosić niezgodność konfiguracji.

```json
{"sourceId": "retail", "contractVersion": 1}
```

Pełny przykład **structuredContent** odpowiedzi sukcesu (syntetyczny mały katalog; hashe wyliczone
z dokładnie tych danych; nie jest to pełny katalog demonstracyjny Retail Checkout):

```json
{
  "schemaVersion": 1,
  "format": "archi-agent-enterprise-snapshot/1",
  "source": {
    "id": "retail",
    "version": "c72192cb23a387d7e9db44a6d8a2e5555bf05ec4dad2c7fa49fe8ed538c9d397"
  },
  "snapshot": {
    "id": "enterprise-85c1a09eb8c8844c55aa3996d5422f02b75c9638e0094926d940746af3a102a6",
    "digest": "85c1a09eb8c8844c55aa3996d5422f02b75c9638e0094926d940746af3a102a6"
  },
  "catalog": {
    "schemaVersion": 1,
    "format": "archi-agent-enterprise/1",
    "source": {
      "id": "retail", "name": "Retail",
      "scope": {"id": "sales", "description": "Retail sales", "coverage": "partial"}
    },
    "scales": [],
    "capabilities": [
      {
        "id": "sales", "name": "Sales", "description": "Serve retail customers",
        "provenance": [
          {
            "sourceId": "retail", "recordId": "CAP-01",
            "fields": ["/description", "/name"],
            "reference": {"uri": "https://catalog.example.org/capabilities/CAP-01", "version": "r1"}
          }
        ]
      }
    ]
  }
}
```

MCP wrapper: `isError:false`, `structuredContent` powyżej,
`content:[{type:"text",text:JSON.stringify(structuredContent)}]`. Walidowana jest struktura;
kopię tekstową ograniczamy rozmiarem i sprawdzamy na credentiale, nie traktujemy jej jako instrukcji.
Nie przyjmować wyłącznie tekstowej odpowiedzi lub pobierania catalog z URL.

Output tool jest strict union powyższej odpowiedzi i
`{schemaVersion:1,status:"unsupported"|"failed",code}`. Unsupported dopuszcza tylko
`enterprise-unsupported` i `enterprise-version-unsupported`; failed dopuszcza arguments-invalid,
source-unknown, source-failed, invalid-source, result-too-large, busy, cancelled, deadline-exceeded.
Te kody są mapowane do tabeli hosta; nie kopiować dowolnego komunikatu/stack/stderr źródła.
Nieznana nazwa tool = standardowy MCP InvalidParams. Nieznane sourceId = source-unknown,
nie unsupported. Nowszy dodatni integer contractVersion daje
`{schemaVersion:1,status:"unsupported",code:"enterprise-version-unsupported"}`, isError:false;
pozostałe złe argumenty dają failed/arguments-invalid, isError:true. Serwer musi rozpoznać tę
różnicę przed ścisłym parserem v1. Nowy klient wysyła wyłącznie 1; nie negocjuje w dół.

Discovery w tej samej sesji stdio przed odczytem: `tools/list` i wyszukanie dokładnej nazwy.
Obsłużyć nextCursor, maks. 16 stron / 256 definicji / 1 MiB łącznego JSON listy; przekroczenie,
powtórzony cursor lub uszkodzona lista = enterprise-response-invalid. Listowanie nie wybiera
innych tools ani nie interpretuje opisów. Brak nazwy po pełnej liście albo MethodNotFound dla
tools/list = enterprise-unsupported, bez callTool/fallbacku. Gdy narzędzie zniknie po liście,
standardowy błąd unknown tool daje ten sam wynik; inne błędy protokołu = unavailable.
Nie polegać na swobodnym opisie/outputSchema jako deklaracji wersji: wysłać contractVersion:1
i sprawdzić odpowiedź. Inne schemaVersion/format odpowiedzi = enterprise-version-unsupported;
brak/malformed wersji albo nieznane pola wspieranej v1 = enterprise-response-invalid.

Walidacja jest wspólna u dostawcy (przed publikacją) i klienta (przed użyciem):

1. Sprawdzić limit całej odpowiedzi, aktywne credentiale i wrapper/isError. Rozpoznać strict
   unsupported/failure; brak struktury to błąd, nie pusta lista capabilities.
2. Sprawdzić wersję oraz strict envelope; `source.id === requested sourceId === catalog.source.id`.
   Nie przepisywać ID. Każde provenance.sourceId nadal musi być ID katalogu.
3. Ograniczyć serializację catalog do 1 MiB UTF-8, 100000 tokenów i głębokości JSON 64;
   użyć istniejącej polityki bounded JSON, bez wystawiania jej lokalnych lokalizacji w MCP.
   Dane obiektowe przechodzą SDK JSON parser; lokalny plik zachowuje obecne wykrywanie duplikatów
   kluczy. Nie obiecywać dodatkowego skanera surowych ramek SDK w EA1b.
4. `validateEnterpriseCatalog`: komplet pól, max 1000 records, 8 skal, pełne provenance,
   poprawne L1–L3/parents/cykle i jawne wartości ocen. Partial także wymaga istniejących przodków;
   nie wstawia placeholderów ani domyślnych ocen. URI ma rzeczywistą version, jest wyłącznie danymi.
5. Przeliczyć source.version i snapshot.id/digest według reguł niżej; każda niezgodność kończy
   operację bez diagramu. Skopiować i zamrozić dane, nie zatrzymywać mutowalnej odpowiedzi SDK.

Limity: ten sam `maxBufferSize` transportu klienta 64 MiB i limit pełnej odpowiedzi wiedzy
64 MiB wraz z escaped text copy. Nowy kontrakt enterprise dodatkowo ogranicza structuredContent
do **2 MiB** UTF-8 JSON, a catalog do 1 MiB. Nie podnosić istniejącego transport limitu ani nie
zmieniać v1. Niedostateczny limit/report = błąd, bez obcięcia danych, paginacji katalogu lub retry.
Deadline źródła nadal max 120000 ms z konfiguracji, ale źródło w generacji EA1 działa pod
całkowitym 30 s budżetem operacji; użyć krótszego budżetu przy connect/list/call, nie resetować
go na każdym etapie. Osobne inspect także ma 30 s całości; lokalny read zachowuje swoje 10 s.

## Snapshot, hashe i provenance

Nie zmieniać semantyki `createEnterpriseSnapshot` ani selekcji/rendererVersion 1. Rozszerzyć
evidence tylko o wariant transportu, nie tworzyć drugiego modelu capability.
Lokalne `EnterpriseEvidence` i raport v1 pozostają zgodne; nowe MCP evidence:

```typescript
interface McpEnterpriseEvidence {
  readonly kind: "mcp";
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly responseFingerprint: string;
  readonly tool: "get_enterprise_snapshot";
  readonly contractVersion: 1;
  readonly capabilities: Readonly<Record<string, {
    readonly pointer: string; // /catalog/capabilities/<index> w structuredContent
    readonly fields: Readonly<Record<string, {readonly pointer: string}>>;
  }>>;
  readonly scales: Readonly<Record<string, {readonly pointer: string}>>;
}
```

Locatory wylicza klient z kolejności odebranych danych przed sortowaniem snapshotu. Błąd
walidacji ma path względem catalog, UI może pokazać JSON Pointer, ale bez file/line/location.
Reference rekordu/skali pozostaje w `catalog.provenance`, łącznie z sourceId/recordId/fields
i opcjonalnym prawdziwym URI/version/fragment. Nie dopisywać remote URI do catalog na podstawie
adresu procesu — zmieniłoby to semantyczny digest. Brak reference jest jawnym brakiem, nie file.
Przykładowy adapter przekazuje oryginalne provenance lokalnego Retail bez wzbogacania go
o położenie transportu. To umożliwia rzeczywisty parytet katalogu.

| Tożsamość / hash | Dokładna reguła i zakres |
| --- | --- |
| Tożsamość biznesowa | source.id + capability.id; scope.id/description/coverage są danymi katalogu, nie aliasem hosta/serwera |
| Tożsamość konfiguracji transportu | Zaufana kopia server config + requested sourceId w pamięci; brak jej w semantic digest i publicznym raporcie (command/args mogą zawierać prywatne ścieżki) |
| Lokalne bajty | Obecny sourceBytesSha256 z odczytu UTF-8; zachować istniejący loader, bez deklarowania identyczności pliku po ponownej serializacji MCP |
| source.version MCP | `stableDigest({domain:"archi-agent-enterprise-source-version/1",catalog:<zwalidowany katalog w kolejności odpowiedzi>})`; liczone przed sortowaniem snapshotu, nie timestamp. To fingerprint reprezentacji danych; obejmuje zadeklarowane provenance/reference version. |
| responseFingerprint MCP | `stableDigest(<całe strict structuredContent sukcesu>)`; wylicza klient, nie deklaruje serwer. Dla przykładu: `44016693fce2ecf08558b08f252bfb6c60dd2f56cd0e57d3802f981dbf85fe9b`. Nie obejmuje wrappera, kopii text, whitespace ani JSON-RPC ID. |
| catalogDigest | Dokładnie EA1: `stableDigest({domain:"archi-agent-enterprise-snapshot/1",catalog:<kanonizowany katalog>})`; bez adapter evidence i transportu, ze wszystkimi danymi biznesowymi i deklarowanym provenance. |
| snapshot.id | Dokładnie `enterprise-${catalogDigest}`; response.snapshot.digest musi być równy wyliczonemu catalogDigest. |
| projectionDigest | Dokładnie EA1: hash `{domain:"archi-agent-capability-map/1",catalogDigest,selection:<bez expectedCatalogDigest>,visibleRecords,excludedIdsWithReasons,rendererVersion:1}`. |

`stableDigest` to istniejący SHA-256 kanonicznego JSON, UTF-8 bez whitespace/LF, klucze
sortowane porządkiem UTF-16, tablice zachowują kolejność. EA1 przed catalogDigest sortuje
capabilities/scales po ID, provenance po canonicalSerialize i fields po stableCompare.
RootIds selekcji też sortuje. Permutacje tych rekordów nie zmieniają catalog/projectionDigest
i PlantUML, choć zmienią source.version, responseFingerprint, pointers lub hash lokalnych bajtów.
Skale wymagają rosnących levels; ich zmiana kolejności nie jest dozwoloną permutacją.
Zmiany nazw/opisów/parent/ocen/skali/source scope/provenance/reference version zmieniają
catalogDigest; nie wolno wyłączyć ich z porównania parytetu. Digest nie jest podpisem ani
potwierdzeniem prawdziwości katalogu; sprawdza spójność deklarowanych danych.

Jedno `generateCapabilityMap` ładuje dokładnie jeden snapshot przez dispatch local/MCP.
Cały rendering, raport i capture używają tej instancji. Jeśli expected nie podano,
runtime uzupełnia je z załadowanego digestu przed istniejącym projectCapabilityMap.
Nie robić inspect+generate z dwoma odczytami wewnątrz CLI/MCP operation. Publiczny typ request
może przyjąć `Omit<CapabilityMapSelection,"expectedCatalogDigest"> & {expectedCatalogDigest?:string}`;
dotychczasowi wywołujący EA1 pozostają zgodni. Pełna selekcja raportu nadal ma required expected.

UI ma dwie osobne operacje: inspect dla pickerów, potem generate czyta świeży snapshot raz
i porównuje expectedCatalogDigest jak EA1. Zmiana semantyki = stale-source i ponowny jawny wybór;
zmiana wyłącznie kolejności/formatowania = nowy fingerprint/locatory z generacji, ta sama mapa.
Nie wymagać równości source.version między pickerem i generacją, bo to osłabiłoby parytet
permutacji zatwierdzony w EA1. Nowa operacja odczytuje ponownie; cache między operacjami nie powstaje.

### Raport i ART1 dla źródła MCP

Zachować ścisły v1 dla źródła lokalnego. Nowy report v2 ma ten sam format/name, wszystkie
semantyczne pola v1 i te same limity; różnice wyłącznie w:

- `formatVersion:2`;
- `source:{contract:"archi-agent-enterprise/1",schemaVersion:1,identity:<catalog.source>,`
  `transport:{kind:"mcp",sourceId,sourceVersion,responseFingerprint,tool:"get_enterprise_snapshot",contractVersion:1}}`;
- `visible[].locator:{pointer,fields:Record<string,{pointer}>}` oraz `scales[].locator:{pointer}`.

Nie ma source.file, sourceBytesSha256 ani lokalnego location. Validator raportów jest jawnie
union v1/v2, nie otwartym obiektem z opcjonalnymi polami. RenderLine nadal jest rzeczywistą linią
PlantUML i musi być taka sama jak lokalnie. Snapshot ID, digests, selection, hierarchy,
visible.capability/hierarchy, scales.definition, excluded, duplicateNames i limitations zostają.

Capture akceptuje union raportu i opcjonalną lokalną ścieżkę tylko dla v1. Dla v2 metadata
versions.reportContract=2, enterprise zawiera snapshotId/catalogDigest/projectionDigest oraz
sourceVersion/responseFingerprint; brak sourceBytesSha256. W envelope ART1 v1:
`sourceReferences.enterpriseCatalog={reference:{sourceId,tool:"get_enterprise_snapshot",contractVersion:1},availability:"remote-source"}`.
Zachować formatVersion envelope i strukturę pary, dopisać test nowego jawnego wariantu reference.
Nie dotykać sourceReferences pozostałych diagramów, writer ani jego uprawnień.

## Przykładowy serwer i tutorial Retail

Nowy `src/core/enterprise/enterprise-transfer.ts`: strict schema sukcesu/stanów protokołu,
`createEnterpriseResponse(sourceId,catalog)` oraz `validateEnterpriseResponse(raw,sourceId)`.
Factory waliduje katalog i wylicza source.version/snapshot, validator przelicza je; obie funkcje
eksportowane przez runtime/index. Nie wymagać od autora adaptera implementacji transportu,
hashowania, walidacji hierarchii ani składania odpowiedzi MCP.

W `src/knowledge-server/adapter.ts` (lub małym sibling module) dodać:

```typescript
interface EnterpriseAdapter {
  load(sourceId: string, signal: AbortSignal): Promise<EnterpriseCatalog>;
}
```

Przykładowy EnterpriseJsonAdapter używa `inspectEnterpriseSource` dla lokalnego źródła z
config.enterpriseSources i jego read policy, zwraca tylko snapshot.catalog. Serwer wywołuje
factory transferu i sprawdza limit przed odpowiedzią. Własny adapter użytkownika zwraca surowe
dane zgodne z EnterpriseCatalog; factory i klient niezależnie je walidują. Implementacja
własnego API/DB pozostaje po stronie użytkownika. Jawne compose w main, bez dynamicznego
ładowania modułu z danych/workspace. Nie dodawać nowego frameworka adapterów.

`serveKnowledge(adapter,enterpriseAdapter?)` zachowuje dotychczasowy pierwszy argument;
można dopuścić undefined jako pierwszy dla serwera enterprise-only. Lista tools zależy tylko
od jawnej kompozycji przy starcie. Nie reklamować enterprise, jeśli brak adaptera. Stary
StructurizrKnowledgeAdapter/KnowledgeAdapter/load i get_knowledge_snapshot v1 działają jak dziś.
Przykład serwera nie przyjmuje enterprise source kind mcp jako własnego adaptera — brak proxy
łańcuchów i przypadkowej rekurencji procesów; source-kind-incompatible przy check/start.

Nowy kompletny `examples/knowledge-server/config.enterprise.example.json` (docelowy):

```json
{
  "schemaVersion": 2,
  "readRoots": {"project": "/srv/retail-checkout"},
  "sources": {},
  "enterpriseSources": {
    "retail-business": {"kind": "enterprise-json", "file": {"root": "project", "path": "architecture/enterprise.json"}}
  },
  "providers": {}
}
```

W przykładzie serwera klucz `retail-business` jest równy rzeczywistemu source.id katalogu Retail Checkout; inne aliasy lokalne
w config produktu pozostają dozwolone. Check command z nową flagą, stary bez flagi bez zmian:

```bash
archi-agent-knowledge-server --config /srv/retail-knowledge.json --check-source retail-business --type enterprise
archi-agent-knowledge-server --config /srv/retail-knowledge.json
```

`--type enterprise` wymaga check-source; inne type lub type bez check-source = exit 3.
Check-source enterprise wypisuje jeden JSON `{status:"valid",source,snapshot,counts:{capabilities,scales}}`,
exit 0 tylko po wspólnej walidacji, inaczej exit 3 (bez surowych danych w stderr).
Transport produkcyjny nadal obsługuje lifetime/cancellation/busy jak obecny przykład.

Tutorial PL/EN w `docs/{pl,en}/capability-map.md` i `cli-mcp.md`, linki w user-guide/Help oraz
examples/knowledge-server README (EN + nowy README.pl.md) pokażą:

1. Użyj katalogu z checkout `examples/retail-checkout/architecture/enterprise.json`; uruchom
   lokalną mapę UI oraz pierwszą komendę CLI bez konfiguracji LLM. Nie pobieraj starego ZIP
   DEMO1 jako źródła pliku EA1 i nie twierdź, że opublikowane CLI już ma EA1b.
2. Skopiuj config.enterprise.example, ustaw absolutny readRoot i uruchom check-source enterprise.
3. Skopiuj config v2 klienta; executable podaj jako absolutny Node/.exe i args z paczki, nie shell.
4. User settings VS Code: enterpriseSource MCP i global knowledgeServer. Wybierz skonfigurowane
   źródło, całość/L1–L3/skala maturity, język pl; CLI dla retail-mcp z tymi samymi ustawieniami.
5. Klient MCP wywołuje generate_diagram z podanym wariantem; porównaj digests i PlantUML z
   lokalnym wynikiem oraz sprawdź provenance/coverage. Zapisz parę w VS Code przez ART1.
6. Podmień jedynie EnterpriseAdapter.load na własne źródło: zachowaj ID, rzeczywistą hierarchię,
   oceny/skale i provenance; częściowość deklaruj jawnie. Bez interpretacji opisów i mapowania systemów.

Instrukcje offline paczek muszą zawierać wystarczające komendy/JSON, bez linków do nieopublikowanych
plików jako warunku użycia. Sync Help i parytet PL/EN według istniejących skryptów; nowe ustawienie
zarejestrować w package.json oraz contributions.ts (`settingKeys`). Nie przebudowywać ani nadpisywać publicznych DEMO1 ZIP-ów.

## Granice i przypadki błędów

Reużyć `mcpKnowledgeServerSchema`, literal absolute executable, ograniczone args i credentialEnv
ARCHI_AGENT_*, SDK bez shell, bazową allowlistę środowiska SDK oraz jawne credentiale. Dziecko
stderr odrzucane; credential scanning obejmuje cały wynik (w tym text i escaped JSON) przed
użyciem. Zaufany proces nie jest sandboxowany przez readRoots rodzica: przykład ma własne
readRoots. Ten fakt należy do instrukcji, nie nowego systemu uprawnień.

Lokalny config max 64 KiB, bounded reads, root identity/dev/ino i symlink/containment checks
pozostają. Nie brać nowych root/path/executable z argumentów MCP, odpowiedzi źródła ani katalogu.
W UI lokalny picker pozostaje jawnym wyborem pliku z dotychczasowymi kontrolami EA1; polityki
CLI nie zastępują tego mechanizmu. Źródłowe URI nigdy nie są fetch/open instrukcją.

Timeout/cancel obejmuje connect → list → call → walidację → projekcję i capture, z kontrolami
między synchronicznymi bounded etapami. Zachować polling CancellationSignal 20 ms, złożenie
deadline i sygnału użytkownika, `finally` close klienta/transportu i potwierdzenie zamknięcia
dziecka (do 5 s cleanup po budżecie pracy). Odróżnić timeout od cancel przy mapowaniu sygnału
EA1; obecny combined aborted nie może ukryć deadline jako zwykłego cancel.
Przerwanie/EOF/SIGTERM serwera funkcji przerywa też jego aktywnego klienta źródłowego.
Brak LLM, retry, repair, ponownego połączenia, local fallbacku lub użycia starego snapshotu.

Testować konkretnie: workspace executable bez global; brak server config; wyjście poza root,
symlink i zamianę root; oversized/malformed/missing structuredContent; sourceId mismatch;
forged version/digest/snapshot ID; obcy format; zerwanie podczas initialize/list/call;
cancel i stubborn child; brak tool; unsupported version; brak parent, cykle, L4, invalid ratings,
unknown scale, niekompletne provenance, not-provided i pusty zakres. Żaden nie daje częściowej mapy.

## Kolejność przyrostów i pliki

Wszystkie poniższe to proponowana implementacja po osobnym poleceniu IMPLEMENTACJA.
Nie zmieniać roadmapy tylko po zapisaniu planu; nie dodawać zależności.

| Kolejność | Pliki istniejące / nowe | Zamknięty przyrost |
| --- | --- | --- |
| 1. Kontrakty | `src/core/enterprise/{enterprise-catalog,capability-map-report}.ts`, nowy `enterprise-transfer.ts`; test/core/enterprise | MCP evidence, strict report v2 obok v1, response schema/factory/validator/golden; unchanged semantic digest/renderer |
| 2. Runtime/adapter | `src/runtime/{capability-map,index,diagram-artifact,host-results}.ts`, `src/node/enterprise-json-source.ts`, nowy `src/runtime/enterprise-source.ts`; test/runtime | Source union/dispatch, optional expected przy jednej lekturze; lokalne EA1 zachowanie; typed portable outcome i ART1 remote reference; loader MCP jeszcze z test double |
| 3. CLI | `src/hosts/local/{config,schemas,operations,results}.ts`, `src/cli/main.ts`; test/cli/local-host + nowe enterprise cases | Config v1/v2, osobny enterpriseSources, disjoint input i lokalny CLI end-to-end, exits/no writer/no provider |
| 4. Serwer funkcji | `src/mcp/server.ts`; test/mcp/{stdio,limits}.test.ts | Te same cztery tools, input/output schemas, local capability-map przez prawdziwy stdio proces, cancel/busy/result limits |
| 5. Klient wiedzy | `src/node/mcp-knowledge-source.ts`, runtime dispatch, `vscode-extension/src/{settings,contributions}.ts`, `commands/generate-capability-map.ts`, `vscode-extension/package.json`; test/runtime i test/vscode-extension | Fixed enterprise tool/discovery/validation/lifetime; źródło MCP w UI i wszystkich hostach, brak odczytu providera/SecretStorage; software v1 bez zmian |
| 6. Przykład | `src/knowledge-server/{adapter,main,server}.ts`, opcjonalny mały `enterprise-adapter.ts`, `examples/knowledge-server/config.enterprise.example.json`, README.md/README.pl.md | Wymienny adapter danych, oba protokoły osobno, check-source enterprise, real process parity z Retail |
| 7. Dokumentacja | `docs/enterprise-catalog.md`, PL/EN capability-map/cli-mcp/user-guide/architecture, `docs/architecture.md`, wygenerowane Help/README, examples/retail-checkout instrukcje; project-state | Działające PL/EN kroki local → server → VS Code/CLI/function MCP, prawdziwa provenance, brak obietnic o publicznym DEMO1 |
| 8. Odbiór | nowe `scripts/ea1b-verify.mjs`, `ea1b-packaged-smoke.mjs`, `ea1b-extension-host.cjs`, `ea1b-real-ui-smoke.mjs`, `docs/ea1b-verification.md`; reużycie helperów EA1/MCP1 | Celowany odbiór warstw z fingerprintami, rzeczywistymi procesami, review w osobnym kontekście i aktualizacją project-state |

Przed edycją ponownie potwierdzić powyższe ścieżki w bieżącym checkout. Brak potrzeby zmiany dependency/lockfile, runtime-types software
DiagramType ani generatorów/semantic reviewer. Współdzielone małe fragmenty cyklu MCP można
wydzielić prywatnie w tym samym module, jeśli unikną dublowania cleanup; bez nowego transport frameworka.

## Testy i bramki implementacji

### Kontrakty i zgodność

- Golden odpowiedzi enterprise z powyższymi hashami, wszystkie strict pola i unknown fields,
  wersje, sourceId, bounds, hierarchia/provenance/rating failures; niezmieniony catalogDigest EA1.
- Test v1 → stary serwer i nowy klient software; v1 → nowy serwer; enterprise → v1-only server
  zwraca unsupported, bez wywołania get_knowledge_snapshot. Istniejące testy strict v1 bez
  przepisywania oczekiwań. Enterprise-only server i dual adapter; fixed tool/parametry niezależne
  od opisów/instrukcji w danych. Discovery pagination i zmiana dostępności tool.
- Schema config v1 identyczna; v2 źródła i niezgodne namespace; mieszane/obce argumenty wszystkich
  diagramType, także CLI c4Selection dropping i pusty/niepoprawny provider. Same spy liczniki
  nie wystarczą: rzeczywiste procesy z `providers:{}` i bez env kluczy muszą generować mapę.
- Report v1 golden dla lokalnego EA1, report v2 remote, ART1 oryginał/provenance/hash bez procesu
  i credentiali, bez source refresh, kolizja/cancel/rollback i rejestr wyników. CLI/MCP brak zapisów
  przy sukcesie i błędach; katalog testowy przed/po.

### Macierz parytetu

Jeden fixture: istniejący syntetyczny Retail, bez edycji semantyki i bez dodawania reference
przez adapter. Zamrozić odczyt testu i podać ten sam language/rootIds/maxLevel/colorBy.
Sprawdzić whole map/branch, L1/L2/L3, neutral/rating, brak rating oraz jawne 0.

| Porównanie | Wymagane równości / dozwolone różnice |
| --- | --- |
| Lokalny runtime → CLI → function MCP → VS Code local | Dokładne bajty PlantUML i cały generation report v1 (ten sam basename i bajty pliku); nie envelope meta ani ART1 UUID/time |
| Ten katalog przez knowledge server → runtime → CLI → function MCP → VS Code MCP | Dokładne PlantUML oraz report v2 dla tej samej odpowiedzi; równe sourceVersion/responseFingerprint i pointers |
| Local versus MCP | Równe catalog/source identity/scope/coverage, catalogDigest/snapshot.id, projectionDigest/rendererVersion, selection, hierarchy, visible capability/hierarchy/renderLine, scales.definition, excluded/reasons, duplicateNames, limitations, deterministicValidation/modelCalls/semanticReview |
| Wyłącznie różnice pochodzenia/transportu | V1 vs V2 formatVersion, source.file/sourceBytesSha256 vs source.transport, locatory file/line vs /catalog pointers; meta adapter/runId/time i ART1 bundle/result IDs/daty; raport referencji ART1 |
| Permutacja/formatowanie | Równe wszystkie pola semantyczne i PlantUML; mogą różnić się byte/source/version/response fingerprints i locatory; modyfikacja semantyczna musi zmienić catalog i projection digest, expected ma odrzucić ją jako stale |

Porównanie stosuje jawnie zdefiniowaną projekcję semantyczną powyższych pól, nie ogólne
„usuń provenance” ani maskowanie całych obiektów source/visible/scales. Sprawdza także
oryginalne provenance/reference/version z katalogu. W teście osobno asercje poprawności
różnych locatorów i hashów, a nie tylko ich wyłączenie z diff. Nie obiecywać całego JSON
identycznego między transportami. Report v2 z sourceReference innym niż lokalne dane nie
jest parytetem tego samego katalogu, nawet jeśli widoczna mapa przypadkiem wygląda tak samo.

### Procesy, paczki i Host/UI

Rozszerzyć rzeczywiste SDK stdio testy `test/mcp/stdio.test.ts`, `test/runtime/mcp-knowledge.test.ts`
oraz testy CLI, nie ograniczać odbioru do transport doubles. Przebieg zagnieżdżony: zewnętrzny
SDK client → spakowany serwer funkcji → spakowany knowledge-server → Retail → wynik mapy.
Do tego nieprawidłowe/oversized odpowiedzi i stubborn process; potwierdzić rzeczywisty exit/PID
oraz cleanup po timeout/cancel/EOF/zerwaniu. Testy kontrolują nowe ograniczenia i przypadki,
bez „PASS” z samej listy narzędzi lub transportu in-memory.

Komendy w istniejącym package.json, do wykonania dopiero przy implementacji:

```bash
npx vitest run test/core/enterprise test/runtime/capability-map.test.ts test/runtime/mcp-knowledge.test.ts test/cli/local-host.test.ts test/mcp --no-file-parallelism
npm test
npm run extension:test
npm run typecheck
npm run extension:typecheck
npm run extension:build
npm run cli:package -- build/ea1b/candidate/cli
npm run cli:verify -- build/ea1b/candidate/cli/archi-agent-cli-0.3.0-alpha.7.tgz
npm run extension:package -- --profile core --out build/ea1b/candidate/core
npm run extension:verify -- build/ea1b/candidate/core/archi-agent-core-0.3.0-alpha.7.vsix
npm run extension:package -- --profile full --out build/ea1b/candidate/full
npm run extension:verify -- build/ea1b/candidate/full/archi-agent-full-0.3.0-alpha.7.vsix
node scripts/docs/sync-help.mjs --check
python3 scripts/check-demo-docs.py
git diff --check
```

Nazwy/wersję paczek dostosować do rzeczywistego package.json w preflight implementacji;
katalog kandydatów ma być nowy i nie nadpisywać wcześniejszych dowodów. Package/verify uruchamiać
sekwencyjnie. Pełne root/extension suites, typecheck/build i świeże CLI/Core/Full są wymagane,
bo wspólny runtime oraz capture się zmieniają. Bez automatycznego uruchamiania wszystkich
historycznych gauntletów. Npm ci tylko gdy przygotowanie środowiska wymaga instalacji;
brak zmiany deps/lockfile nie uzasadnia osobnej przebudowy OCR/audytu jako dowodu funkcji EA1b.

CLI verify sprawdza pakowanie/instalację offline, ale nie zastępuje smoke mapy. Rozpakować
dokładny tgz poza repo i uruchomić CLI, function MCP i knowledge server z pustym PATH/NODE_PATH
(Node przez absolutny executable), bez root node_modules/repo; niezależne readRoots klienta
i źródła. Powiązać wyniki ze SHA256/bytes paczek, pełnym HEAD/fingerprintem źródeł i środowiskiem.
Dokładny runtime z obu VSIX poza repo: local+MCP map success/błędy/save, parity bundle Core/Full
i brak OCR w Core. Nie ma potrzeby testować ponownie wszystkich platform OCR.

Rzeczywisty Extension Host świeżego Core: ustawienia single-folder/multi-root/global,
enterpriseSource vs architectureSource, wyłącznie global executable, brak SecretStorage/provider
reads, oba typy źródła, stale-source, cancel i ART1 remote. Osobne widoczne UI Core: wybór
configured MCP source, scope/detail/rating, diagram/raport, ART1 confirm/save i cancel, czytelny
unsupported od v1-only źródła. Native UI nie zastępuje controlled Host i odwrotnie. Full ma
package/verify, exact runtime smoke i identyczność bundle; osobnego powtórzenia tego samego
UI Full nie wymagać, chyba że parytet się nie potwierdzi. MANUAL_SMOKE: DEFERRED dopuszczalne
zgodnie z workflow; wymagane automatyczne NOT_RUN nie jest PASS.

Celowane regresje: EA1 local snapshots/render/report/save i routing bez providera; stare CLI
inspect/verify/decisions i cztery generate types; cztery function tools, limity i pending VER1;
MCP v1 knowledge snapshot i source-confirmed Sequence/Component/C4; ART1. Existing real UI
regresje ograniczyć do lokalnej Capability Map i jednego software generation/provider route
dotkniętego dispatch; nie ponawiać historycznych OCR, dokumentów/review, całego Help/Configuration
i wszystkich dawnych UI. Jeśli pojawi się konkretna regresja, poszerzyć testy z uzasadnieniem.

## Definition of Done i review

1. A/B/C dają semantycznie te same mapy i pełne dowody z jednego frozen snapshotu na operację,
   bez modelu/providera/flow; nowy typ ma disjoint strict input i odrzuca obce argumenty.
2. K1/get_knowledge_snapshot v1, stare config/komendy/wyniki działają bez migracji;
   brak enterprise/wrong version daje jawny unsupported bez fallbacku.
3. Walidowane identity/version/digests, brak fikcyjnych file/line, scope/coverage i provenance
   zachowane, limity/cancel/cleanup i readRoots potwierdzone rzeczywistymi procesami.
4. CLI/function MCP pozostają read-only; ART1 v1 envelope/writer i lokalny report v1 zachowane,
   remote report v2 i reference jawnie walidowane oraz objęte testami.
5. Retail local → example server → VS Code/CLI/MCP działa z samą konfiguracją źródła;
   wymienny adapter dostarcza dane, transport i walidacja są wspólne; instrukcje PL/EN działają.
6. Wymagane bramki, packaged outside-repo i nowy Host/UI PASS na dokładnych paczkach,
   niezależny review finalnej implementacji bez otwartych HIGH/MEDIUM; raport oddziela historię,
   NOT_RUN i owner smoke. Bez zmiany opublikowanych paczek/ZIP/push/merge.

Proponowane decyzje do zatwierdzenia z planem: osobny tool/protokół, config v2 z enterpriseSources,
osobne ustawienie enterpriseSource, raport remote v2 przy zachowaniu lokalnego v1, additive
wariant host outcome v1. Są koniecznym rozszerzeniem granicy źródła EA1, nie zgodą na wdrożenie
innych widoków lub transportów. Brak odrębnej nierozstrzygniętej decyzji produktowej blokującej
review; implementacja wymaga osobnego jawnego polecenia właściciela.

Niezależny read-only review w osobnym kontekście (`review_ea1b`, 2026-10-19):
**0 otwartych HIGH, 0 MEDIUM, 0 LOW**. Reviewer porównał kontrakty/API i granice EA1, CLI,
obu ról MCP, VS Code i ART1 oraz potwierdził hashe przykładu. Własna kontrola autora przed
zamknięciem review poprawiła sourceId przykładu Retail na rzeczywiste `retail-business`, ścieżkę
`contributions.ts` i doprecyzowała zastane zachowanie błędów CLI przed uruchomieniem operacji.
Brak ustaleń wymagających rozszerzenia zakresu lub decyzji produktowej.

Kontrole wykonane w tej sesji planowania: 7 bloków JSON poprawnych; source.version,
snapshot.id/digest i responseFingerprint przykładu zgodne z SHA-256; lokalne odnośniki poprawne;
`node scripts/docs/sync-help.mjs --check` PASS; `python3 scripts/check-demo-docs.py` PASS
(26 dokumentów, 28 kontraktów VER1); `scripts/docs/check-docs.mjs` w trybie `--docs` PASS
(linki/anchors, PL/EN, Help/licencje i niezmienione bundle istniejącej paczki EA1 Core).
Baseline dokumentacji to ta sama istniejąca paczka EA1, nie nowy kandydat EA1b; wynik nie
potwierdza wykonania żadnej planowanej funkcji. Dowód: `/private/tmp/ea1b-plan-doc-check/documentation-check.json`.
Końcowy diff i `git diff --check` oraz kontrola nowego pliku przez `--no-index --check` PASS.
Nie uruchamiano testów produktu/runtime, buildów, pakowania ani gauntletu.

PLAN READY FOR REVIEW
