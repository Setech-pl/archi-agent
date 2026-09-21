# Project state

Operacyjny stan projektu Archi Agent. Aktualizuje go wykonawca po istotnej zmianie
(zob. [`development-workflow.md`](development-workflow.md)). Kierunek produktu i status etapów:
[`product-roadmap.md`](product-roadmap.md). Zasady stałe: [`AGENTS.md`](../AGENTS.md).

**Zapis może być nieaktualny — zawsze porównaj go z `git log` i `git status`.**

## Snapshot

| Pole | Wartość |
| --- | --- |
| Data aktualizacji | 2026-09-21 |
| Stan Git | Bieżący HEAD, branch i stan publikacji należy odczytywać z Git. Commit `3d1c55c` był bazą implementacji B1. |
| Stan B1 | Implemented and verified; neutralny `StructuredChatClient`, lokalny adapter node i cienki generator sequence. Pełne bramki automatyczne B1 przeszły. |
| Stan P1 | Implemented and verified; automatyczne bramki PASS oraz owner smoke Ollamy PASS na commit `50d7f47`. Profile LM Studio i Ollama, wspólny transport OpenAI-compatible oraz machine-scoped wybór profilu/modelu z trwałym bindingiem. |
| Stan P2 | Implemented; Anthropic, OpenAI i OpenRouter przez stałą allowlistę HTTPS, klucze wyłącznie w VS Code `SecretStorage`, bounded model listing i dokładnie jeden request generacyjny bez retry/repair/fallbacku. Bieżące wyniki bramek są w sekcji „Weryfikacja”. |
| Stan D1 | Implemented; baza D1: `00c8b9d62e73fff2cdb154113f15a42756f25b07`. Automatyczne DoD D1 przeszło wcześniej. Pierwszy i drugi owner smoke nowej ścieżki z Ollamą `qwen3:30b` wykryły błędy strukturalne; po poprawce wymagany jest trzeci owner smoke. D1 smoke nie jest PASS. |
| Następny etap | D2 — profil `component`. |
| Etap po D2 | C1 — VS Code Chat Participant `@archi-agent` z `/diagram`; zaplanowany, bez implementacji w D1. |
| Checkpoint produktu | `v0.2.0-alpha.1` — implemented, automatically verified, owner smoke accepted (zob. „Checkpoint VSIX v0.2.0-alpha.1”) |

## Historia na `main`

- `b759bb9` — merge fundamentu rozszerzenia VS Code (`feature/vscode-extension-foundation`,
  checkpoint `v0.2.0-alpha.1`) oraz dokumentów documentation governance do `main`.
- Po merge priorytet zmieniono z EA XML na **Knowledge Pack Builder**. EA XML jest odłożone, bo nie
  ma bezpiecznego, publicznego fixture reprezentującego rzeczywiste dane EA.
- 2026-09-19 — decyzja właściciela o nowych priorytetach (demonstracja vibe coding i AI SDLC),
  uzupełniona 2026-09-21 o C1 po D2. Obecna kolejność: R0 → B1 → P1 → P2 → D1 → D2 → C1 → D3–D5 → K1–K4 → Demo and release. Szczegóły: sekcja „Product priority”
  w [`product-roadmap.md`](product-roadmap.md).

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

W kolejności ustalonej przez właściciela (2026-09-19, aktualizacja 2026-09-21; pełny opis w roadmapie, „Product priority”):

1. **P1 i P2 (implemented):** neutralny model profilu i rejestr, profile LM Studio/Ollama oraz
   Anthropic/OpenAI/OpenRouter, machine-scoped wybór profilu/modelu i cloud keys w `SecretStorage`.
2. **D1 (implemented):** ścieżka LLM-first final PlantUML ze wspólną walidacją strukturalną i wyborem typu
   diagramu; **D2 (następny):** `component`; **C1 (po D2):** VS Code Chat Participant
   `@archi-agent` z `/diagram` i istniejącym `generateDiagram()`, tylko z historią własnych rozmów;
   **D3–D5:** `c4-context`, `c4-container`, `archimate-hld`. Integracja agentów przez MCP pozostaje w K4.
3. **K1:** provider-neutral kontrakt katalogu architektury (dziś częściowy); **K2:** Knowledge Pack
   Builder B2 i B3 (zatwierdzone decyzje etapu B bez zmian); **K3:** etap C — runtime API, adaptery
   źródeł, UI review, atomowy zapis pięciu plików; **K4:** MCP jako źródło wiedzy (klient MCP
   w warstwie node, deterministyczne wywołania narzędzi przez rozszerzenie, mapowanie do katalogu,
   demonstracyjny serwer MCP z danymi Space Mission).
4. **Demo AI SDLC i release:** branding Archi Agent, opis workflow agentowego, scenariusz demo,
   porównanie modeli lokalnych i chmurowych, checkpoint VSIX z owner smoke.

Później (bez zobowiązującej kolejności): semantic review, bounded repair, quality modes, document
sources (PDF, DOCX; Confluence/Jira preferencyjnie przez MCP), EA API, Prolaborate, zewnętrzni
dostawcy artefaktów. **EA XML pozostaje odłożone (deferred), brak implementacji** — brak
bezpiecznego, publicznego fixture; w repo nie ma kodu parsowania EA ani XML, fixture'ów EA ani
testów (jedyne odwołania do `.xml` dotyczą manifestu VSIX).

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

**D2** — profil `component`; po nim zaplanowano C1, bez rozszerzania D1. P2 jest zaimplementowane; ręczne owner smoke providerów
chmurowych pozostaje opcjonalne i kosztowe, poza automatycznym DoD.

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

### Pierwszy owner smoke D1 z Ollamą (2026-09-21)

Nowa komenda Generate Diagram, profil `local-ollama`, model `qwen3:30b`, syntetyczny flow i
Knowledge Pack: **FAIL** `plantuml-structure` (count 1), bez utworzonego diagramu. Log Ollamy
potwierdził dokładnie jeden `POST /v1/chat/completions` w tym smoke; aplikacja nie wykonała retry
ani fallbacku. Starsza komenda Generate Sequence Diagram przechodziła osobno, ale nie potwierdza D1.

Ostatni log błędu pochodzi z izolowanego profilu `fKMHrP`, którego `knowledgePackPath` wskazuje
na jego niepusty katalog: 1 aktor, 3 systemy, 3 relacje, 2 aliasy i 1 reguła. Drugi profil
`GDUWY7` ma bajtowo identyczne pięć plików Knowledge Pack, flow i zainstalowane bundle VSIX.
Jednorazowa diagnoza w `GDUWY7` na tym samym syntetycznym fixture (jeden dodatkowy POST) wykazała brak
końcowego LF w odpowiedzi. Po pominięciu tego technicznego wymogu parser wskazał właściwy błąd
groundingu prezentacji: deklaracje uczestników miały postać `actor ALIAS`, `participant ALIAS`
i `queue ALIAS`, bez kanonicznej nazwy w cudzysłowie i `as ALIAS` (pierwsze naruszenie:
`sequence-declaration-syntax`, linia 2). Ledger miał cztery wpisy z numerami linii 6–9; nie było
CR/CRLF, code fences, komentarzy, legendy, pustych linii, dodatkowych markerów, treści poza
diagramem ani niedozwolonych dyrektyw. Surową odpowiedź zapisano tylko lokalnie w katalogu
izolowanego smoke z prawami `600`; nie ma jej w repo.
Oryginalna odpowiedź z `fKMHrP` nie była zachowana, więc jej bajtowej identyczności z odpowiedzią
diagnostyczną nie da się potwierdzić; oba uruchomienia dały ten sam publiczny błąd o liczności 1.

Walidator dopuszcza teraz końcowy LF lub jego brak, ponieważ nie wpływa to na poprawność PlantUML;
wynik jest zachowywany bajt w bajt, bez repair. Prompt D1 jawnie wymaga pełnych deklaracji
z kanoniczną nazwą i zawiera przykład składni. Deklaracje zawierające sam alias nadal są
odrzucane. Błąd strukturalny przekazuje bezpieczny kod naruszenia i numer linii (gdy dotyczy),
bez linii modelu, promptu i sekretów. Smoke na nowym VSIX **wymaga ponowienia; nie jest PASS**.

Weryfikacja korekty: celowane testy D1/walidatora/komunikatów 67/67, `npm test` 1249/1249,
`npm run typecheck`, `npm run extension:typecheck`, `npm run extension:test` 185/185,
`npm run extension:build`, `npm run extension:package`, `npm run extension:verify` i
`npm run demo:dry-run` — PASS. Runtime wyjęty z nowego VSIX przeszedł test poza repo na
syntetycznej odpowiedzi bez końcowego LF i bez sieci. Nowy VSIX:
`vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix`, 195449 B,
SHA-256 `03a39e1733694313491c255cbf717a37f266e9756c2559f35c4f921a722b7697`.
Ten automatyczny wynik nie zastępuje ponownego owner smoke Ollamy.

### Drugi owner smoke D1 z Ollamą (2026-09-21)

Po instalacji VSIX z pierwszą poprawką ten sam izolowany profil `fKMHrP`, syntetyczny
Knowledge Pack i flow oraz Ollama `qwen3:30b` zwróciły **FAIL** `plantuml-structure`,
`sequence-arrow-ledger-mismatch`, fizyczna linia 6; diagram nie powstał. Pierwszy smoke
wykrył brak końcowego LF i deklaracje bez kanonicznej nazwy, drugi — rozbieżność ledgeru.
Oba przebiegi owner smoke wykonały po jednym wywołaniu generacyjnym, bez retry ani fallbacku.

Odpowiedź drugiego przebiegu nie została zachowana w bezpiecznym pliku diagnostycznym w `fKMHrP`.
Jedno kontrolowane wywołanie diagnostyczne na tych samych plikach w `fKMHrP` odtworzyło ten sam
błąd w linii 6. Surowa odpowiedź została zapisana wyłącznie w `/private/tmp` z prawami `600`,
nie w repo ani trwałym logu. Cztery wpisy ledgeru miały poprawne `order` 1–4 i `lineNumber`
6–9; źródła, cele i strzałki były zgodne. W linii 6 tekst strzałki był równy wpisowi `label`
(`Submit command (Operator Console)`), lecz nie zawierał osobnej wymaganej adnotacji
`(INTERNAL: Operator Console)` dla `interfaceType` i `interfaceName`. Pozostałe trzy strzałki
miały analogiczny brak typu/nazwy interfejsu w PlantUML. To błąd składniowej zgodności
ledgeru i PlantUML, nie błędny `lineNumber` ani dowód braku relacji w katalogu.

Decyzja kontraktowa: **`lineNumber` pozostaje wymagany w zewnętrznym strict JSON Schema**,
ponieważ diagnoza potwierdziła jego poprawność; walidator dalej porównuje go z fizyczną
linią strzałki. Prompt jawnie rozdziela `label` od adnotacji, podaje zamknięty enum
`interfaceType`, dokładną składnię `label (interfaceType: interfaceName)` oraz regułę
`interfaceName` string/null. Osobne bezpieczne kody wskazują teraz konkretny mismatch
(numer linii, order, źródło, cel, typ strzałki, async, response, typ/nazwa interfejsu,
liczność, etykieta), z fizyczną linią i order bez treści modelu. Komunikat VS Code
odróżnia błąd struktury PlantUML/ledgeru od rzeczywistego naruszenia groundingu.
Finalny PlantUML nie jest modyfikowany; bez retry, repair i fallbacku.

Nowe testy celowane D1/walidatora/komunikatów: 80/80 PASS. Pozostałe bramki automatyczne
oraz smoke runtime z nowego VSIX: do wykonania. **Owner smoke nadal wymaga ponowienia;
nie oznaczać jako PASS i nie przechodzić do D2.**
