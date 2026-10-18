# MCP1 / MCP1-KNOW — lokalny odbiór

Branch: `feature/mcp1-cli-mcp-core-full`. Pełna baza:
`ea3df0a73067f66a7e5fe8d2b8053c6059a8861d`. Lokalny checkpoint odczytaj z Git;
jego pełny SHA wiąże również `build/mcp1/checkpoint.json`. Bez push, merge, tagów i publikacji.
Zastane plan i project-state zachowano i włączono do przyrostu. Staging przed pracą był pusty.

Wyniki końcowe i dokładne paczki są poniżej. Owner smoke **DEFERRED**, rzeczywisty LLM
**NOT_RUN**, remote CI **NOT_RUN**, Windows ARM64 runtime **NOT_RUN**. AUD-003–006 **OPEN**.
To lokalny odbiór techniczny, bez deklaracji gotowości M1 ani produkcyjnej.

## Zakres i review

[Plan](plans/mcp1-cli-mcp-core-full.md) oraz [niezależny review](mcp1-independent-review.md)
obejmują pierwotny MCP1 i kontrakty MCP1-KNOW przed wdrożeniem odpowiednich części.
Rutynowe ustalenia doprecyzowały współinstalację, readRoots, bounded odpowiedzi, canonical
version/provenance i anulowanie; nie wprowadzono drugiego runtime ani silnika weryfikacji.
Końcowy niezależny review: **PASS w zakresie lokalnym**, brak otwartych HIGH/MEDIUM.
Werdykt i bramki są powiązane z dokładnym kandydatem wskazanym w tym raporcie.

CLI i serwer czterech funkcji są adapterami wspólnego runtime. Klient MCP wiedzy jest
osobnym adapterem Node, deterministycznie pobierającym `get_knowledge_snapshot`; LLM nie
wybiera narzędzi. Przykładowy serwer wiedzy reużywa produkcyjne SRC1 i K1, bez VS Code/LLM.
Jedna operacja ma jeden snapshot, następna pobiera ponownie. Brak cichego fallbacku.

Structurizr `workspace.json` + `relationships.md`, `aliases.md`, `rules.md` w nakładce to
pełnoprawny wybór obok istniejącego Knowledge Pack i źródła MCP. Zachowano oryginalne ID,
referencje, metadane typów/hierarchii i walidację. Zakres/pominięcia są jawne; bez DSL i
bez deklaracji obsługi wszystkich kategorii Structurizr. Partial normalized sources nie
muszą udawać kompletnego Structurizr, a brak lokatora nie tworzy fikcyjnego pliku/linii.

Core `setech-pl.archi-agent-core` jest rekomendowany nowym użytkownikom. Full zachowuje
`setech-pl.archi-agent`. Oba mają wspólny runtime i ustawienia, osobne SecretStorage.
Współinstalacja oznacza dokładnie jeden włączony profil. Oba włączone dają rzeczywiste
kolizje statycznych deklaracji VS Code przed aktywacją; guard blokuje operacje i anuluje
pracę, lecz nie usuwa tych kolizji. Użytkownik sam wyłącza jeden profil i wykonuje reload.
Nie ma automatycznej zamiany Full w Core, kopiowania kluczy ani wyłączania rozszerzeń.

## CLI i MCP

Pełna instalacja/config/limity: [PL](pl/cli-mcp.md), [EN](en/cli-mcp.md).
Paczka dostarcza `archi-agent` i `archi-agent-knowledge-server`.
Przykładowa konfiguracja serwera wiedzy: [examples](../examples/knowledge-server/README.md).
Rozszerzenie nie wymaga osobnego Node; samodzielne CLI/MCP wymaga Node 22.12+.

```bash
archi-agent knowledge inspect --config /srv/archi-agent.json --source bank --format json
archi-agent flow verify --config /srv/archi-agent.json --source bank --input project:flows/good.puml --input-format plantuml-sequence --format json
archi-agent diagram generate --config /srv/archi-agent.json --source bank --input project:flows/flow.md --type sequence --provider local --format json
archi-agent mcp serve --config /srv/archi-agent.json
archi-agent-knowledge-server --config /srv/knowledge-server.json --check-source bank
```

| Tool funkcji | Przykład argumentów |
| --- | --- |
| `inspect_knowledge` | `{"source":"bank","limit":20}` |
| `verify_flow` | `{"source":"bank","input":{"root":"project","path":"flows/good.puml"},"format":"plantuml-sequence"}` |
| `resolve_flow_names` | `{"sessionId":"UUID","expectedInputSha256":"SHA256","expectedInterpretationDigest":"SHA256","expectedSnapshotDigest":"SHA256","decisions":[{"mentionId":"p2","expectedSnapshotDigest":"SHA256","targetElementId":"ID","confirmed":true}]}` |
| `generate_diagram` | `{"source":"bank","input":{"root":"project","path":"flows/flow.md"},"diagramType":"sequence","provider":"local"}` |

UUID/hash/ID należy wziąć z rzeczywistego wyniku, a decyzję jawnie potwierdzić. Kontynuacja
jest lokalna dla procesu i wygasa po 10 minutach. CLI może przyjąć jawny plik decyzji.
Weryfikacja CLI: 0 tylko pełna zgodność kroków w importowanym zakresie, 1 rozbieżności,
2 wynik częściowy/niejednoznaczny/nieobsługiwany, 3 błąd wykonania, 124 timeout,
130/143 sygnały. Stdout zawiera wynik, stderr diagnostykę; stdio serwerów tylko ramki MCP.
Błąd domenowy jest wynikiem, a nie błędem JSON-RPC. `isError:false` nie oznacza zgodności.

ReadRoots pochodzą z konfiguracji procesu, są przypięte do tożsamości katalogu i egzekwowane
przy odczytach oraz kontynuacjach. Tool nie rozszerza korzeni. Symlinki, traversal i zamiana
roota są odrzucane. Sekrety z nazwanych zmiennych `ARCHI_AGENT_*`; bez SecretStorage CLI/MCP.
Guard decoded strings odrzuca odpowiedź providera/źródła odbijającą credential, także po
JSON escaping, przed publikacją label/model ID/metadanych. Bez redakcji wyniku i retry.

Limity funkcji: wejście 1 MiB, wynik 4 MiB, ramka wyjścia 10 MiB, jedno aktywne wywołanie;
serwer wiedzy 64 MiB pełnej ramki. Walidacja ścisła; źródła pozostają danymi.
VER1 nadal obejmuje tylko Sequence PlantUML i prozę. Generowanie reużywa czterech istniejących
typów: Sequence, Component, C4 Context, C4 Container. Inspekcja i verify nie zapisują aliasów
ani źródeł. Zapis oryginalnego wyniku korzysta z jawnego istniejącego ART1.

## Weryfikacja końcowa

**Kandydat 5: 44/44 wymagane lokalne bramki PASS**, źródła niezmienione podczas całego
przebiegu (`sourceFilesUnchanged:true`). Pełny manifest i mapa SHA-256 plików:
`build/mcp1/candidate-5/manifest.json`. Uruchomiono `scripts/mcp1-verify.mjs` na Node 22.12.0
z ponownym wykorzystaniem wyłącznie bramek dependency/OCR preparation o sprawdzonych,
niezmienionych wejściach; wyników wcześniejszego produktu nie przenoszono.

| Bramka | Wynik / bieżący dowód |
| --- | --- |
| Czysty Core bez experiments | PASS: odrębne npm ci, build, package i verify |
| Instalacje/audity root i OCR / prepare | PASS z potwierdzonym fingerprintem wejść; audity 0 podatności, optional platform bindings zachowane |
| Typecheck i extension:typecheck | PASS |
| npm test | **1954/1954**, 129 plików |
| extension:test | **730/730**, 37 plików |
| extension:build, cli:build, demo:dry-run | PASS |
| Oba VSIX + CLI tarball package/verify | PASS |
| Świeże niezależne buildy i docs PL/EN/Help/licencje | PASS dla obu profili |
| Packaged runtime/CLI/MCP, sygnały, sekrety, parytet | **15/15 PASS**, `packaged/packaged-smoke.json` |
| Full realny offline OCR i uszkodzenia | **7/7 PASS**, `Full-OCR/full-ocr.json` |
| SRC1/K1/K3/ART1 poza repo | **48/48 PASS**, osobne packaged JSON |
| VER1 i C4 poza repo | **5/5 PASS**, `ver1-c4-packaged.json` |
| Instalacja/upgrade/switch/współinstalacja | **23/23 PASS**, `profiles/profile-smoke.json` |
| Rzeczywisty Host SRC1 i VER1/C4 | **30/30 na profil**, oba profile PASS |
| Rzeczywisty eksport edytora VSIX/CLI/MCP | **9/9 na profil**, oba profile PASS |
| Widoczny MCP/PDF UI | Core **4/4**, Full **3/3 PASS** |
| Widoczny SRC1/Sequence/Component/ART1 UI | **7/7 na profil PASS** |
| Widoczny VER1/C4/native alias UI | **7/7 na profil PASS** |
| git diff --check, sourceFilesUnchanged | PASS |

Bieżące dowody wierszy poza root/extension są w podkatalogach tego samego kandydata.


Nie sumować root i extension: zestawy częściowo się nakładają. Wszystkie modele w testach
korzystają z kontrolowanego syntetycznego transportu, bez rzeczywistego LLM. Rzeczywiste są
procesy Node/MCP, instalacje/aktualizacje VSIX, Extension Host, widoczny UI i natywny OCR.
Środowisko: macOS ARM64, Node 22.12.0, VS Code 1.142.0 (Extension Host Node 24.21.0).

Porównanie domenowe obejmuje cały portable report/evidence (ocena, kroki, interpretacja,
resolutions, decyzje, fact IDs, pokrycie i provenance), pełny PlantUML/grounding/digest oraz
wersję i snapshot. Nie pomija różnic domenowych. JSON grounding parsowany przed deepEqual.
`meta.adapter` jest sprawdzane osobno jako oczekiwane `cli`/`mcp`; VSIX eksportuje ten sam
portable report bez koperty transportu. Wyłącznie niedeterministyczne pola koperty są poza
porównaniem: `meta.runId`, `meta.startedAt`, `meta.elapsedMs`, `continuation.sessionId`,
`continuation.expiresAt`. W samych report/evidence nie usunięto żadnego pola.

Budżety: PlantUML i inspekcja 0 LLM; proza maksymalnie 1 interpretacja / 16384 tokenów;
kontynuacja 0; generowanie 1 generator / 16384 + 1 reviewer / 8192 na jednym snapshotcie.
Brak retry, repair, dodatkowego semantic review albo fallbacku. Testy sprawdzają też
rozbieżności, częściowe pokrycie, timeout, sygnały, busy, EOF i anulowanie bez późnego sukcesu.

Źródła lokalne/MCP: jednakowe snapshoty, grounding, VER1 i cztery typy diagramów; malformed
response, fałszywy digest, niepełny zakres bez lokatora, świeży odczyt następnej operacji,
stale continuation, niedostępny executable, timeout i anulowanie ze sprawdzeniem zamknięcia
także opornego procesu. Configuration używa tylko User process settings, czyści stare
liczniki po błędzie i nadal wskazuje MCP zamiast lokalnego fallbacku.

Full: realny offline OCR PL/EN i all/text, anulowanie bez częściowego Markdown, brak zasobu
i uszkodzenie o tym samym rozmiarze. Core: czysta kopia źródeł bez experiments, brak OCR
w VSIX, import/aktywacja i tekstowe PDF/DOCX/XLSX, jawne OCR unavailable dla skanu.
Wymagane puste pomocnicze entries inventory nie zastępują kontroli wymaganych modeli.

Profile: prawdziwy upgrade Full alpha.6→alpha.7 oraz jawnie syntetyczny poprzednik Core
(nie było wydanego Core), zachowanie ustawień i trwałych kluczy per ID; powrót między
profilami, obie kolejności współinstalacji i rzeczywiste static diagnostics. Osobne regresje
konfliktu obejmują abort i blokadę późnej edycji/zapisu, Configuration i inspekcję systemu C4.

## Paczki

| Paczka | Rozmiar B | Pliki | Po rozpakowaniu B | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `build/mcp1/candidate-5/core/archi-agent-core-0.3.0-alpha.7.vsix` | 3933117 | 25 | 7557449 | `96715aeb6e5583337af178fc337644b8d61ce868795a554b9f559eac444739bb` |
| `build/mcp1/candidate-5/full/archi-agent-full-0.3.0-alpha.7.vsix` | 127359392 | 547 | 305236441 | `14e092acbd12ac610e4e5258de679e3597a089acf80250163388de92a0a7fd98` |
| `build/mcp1/candidate-5/cli/archi-agent-cli-0.3.0-alpha.7.tgz` | 888813 | 10 | 5109543 | `e6dcfc335517eca7e0f187c2d631a9f192b10ce53775124769b1954c84d391e0` |

Core: trzy bundle (extension/runtime/converter-worker), profil, manifesty, licencje,
PL/EN Help i 14 obrazów. **0 plików OCR**, bez Tesseract/traineddata/WASM/native canvas.
Full: ten sam rdzeń oraz **522 pliki OCR / 297679045 B** po rozpakowaniu, w tym
Tesseract/WASM, modele pol/eng, przypięte bindingi canvas, licencje i resource inventory.
Tarball: **10 plików** (CLI, functions MCP entry, knowledge-server, runtime, package/profile,
licencja/notices i README PL/EN), bez node_modules/OCR. Pełna lista wszystkich wpisów:
`build/mcp1/candidate-5/artifact-inventory.json`.


Runtime ma identyczne bajty w obu profilach i CLI; extension i converter-worker są
identyczne między Core i Full. Wykonywalne
zasoby paczek porównano ze świeżym niezależnym buildem tego samego kandydata. Tarball
zainstalowano lokalnie offline do tymczasowego prefixu; dostarczane procesy uruchomiono
poza repo z pustymi PATH/NODE_PATH. Rozszerzenie nie szuka runtime w root node_modules.
Full nie pobiera zasobów, a uszkodzony Full zgłasza problem instalacji zamiast udawać Core.

## Historia prób i ograniczenia

Zachowano wcześniejsze wyniki, bez zmiany FAIL na PASS:

- Próby deweloperskie: sandbox loopback EPERM, błędy harnessu/bundlingu, odrzucenie legalnych
  pustych `.gitkeep` Full i pamięciowy SecretStorage extensionTests; poprawione i ponownie sprawdzone.
- Candidate 1: FAIL SRC1 UI native picker; pozostałe wykonane bramki PASS. Osobny rerun UI PASS.
- Candidate 2: pełne bramki PASS, potem niezależny HIGH ujawnił odbicie sekretu w poprawnym
  JSON providera. Kandydat unieważniony dla checkpointu; guard i regresje dodano do produktu.
- Candidate 3: FAIL synchronizacji zmiany User settings w harnessie UI. Wszystkie 37 wcześniejszych
  bramek PASS. Osobny komplet sześciu UI na tych samych paczkach PASS; zastąpiono zmianę settings
  kontrolowaną niedostępnością testowego executable. Następny review wymagał guardu Configuration.
- Candidate 4: FAIL SRC1 Component native Go to Folder; wcześniejsze bramki i MCP UI PASS.
  Review wskazał analogiczny brak sygnału podczas inspekcji C4. Oba guardy i regresje są w kandydacie
  końcowym, który ma własne pełne bramki. Nie przeniesiono PASS wcześniejszego produktu.

- Candidate 5: **cały pełny profil PASS**, wszystkie sześć UI bez wznowień i sourceFilesUnchanged.
  To końcowe paczki; osobne zamknięcie metadanych wiąże je z review i checkpointem.

Ścieżki build są lokalnymi dowodami, nie publikacją. Dokumenty operacyjne/review uzupełniono
po zamrożonych testach; `build/mcp1/candidate-5/acceptance.json` zawiera mapę hashy,
ponowną kontrolę trzech paczek i jawną listę wyłącznie tych zmian.
Zbiorczy [owner smoke](testing/mcp1-owner-smoke.md) pozostaje **DEFERRED** do wyniku właściciela.
Remote CI, Windows ARM64 runtime i rzeczywisty LLM pozostają **NOT_RUN**; AUD-003–006 **OPEN**.
