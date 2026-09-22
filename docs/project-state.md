# Project state

Operacyjny stan projektu Archi Agent. Aktualizuje go wykonawca po istotnej zmianie
(zob. [`development-workflow.md`](development-workflow.md)). Kierunek produktu i status etapów:
[`product-roadmap.md`](product-roadmap.md). Zasady stałe: [`AGENTS.md`](../AGENTS.md).

**Zapis może być nieaktualny — zawsze porównaj go z `git log` i `git status`.**

## Snapshot

| Pole | Wartość |
| --- | --- |
| Data aktualizacji | 2026-09-22 |
| Stan Git | D1.2 wykonano na `feature/reviewed-diagram-pipeline`. Bieżący HEAD, upstream, publikację i czystość working tree zawsze sprawdzaj w Git. |
| Stan B1 | Implemented and verified; neutralny `StructuredChatClient`, lokalny adapter node i cienki generator sequence. Pełne bramki automatyczne B1 przeszły. |
| Stan P1 | Implemented and verified; automatyczne bramki PASS oraz owner smoke Ollamy PASS na commit `50d7f47`. Profile LM Studio i Ollama, wspólny transport OpenAI-compatible oraz machine-scoped wybór profilu/modelu z trwałym bindingiem. |
| Stan P2 | Implemented; Anthropic, OpenAI i OpenRouter przez stałą allowlistę HTTPS, klucze wyłącznie w VS Code `SecretStorage`, bounded model listing i dokładnie jeden request generacyjny bez retry/repair/fallbacku. Bieżące wyniki bramek są w sekcji „Weryfikacja”. |
| Stan D1 | Eksperymentalny checkpoint automatycznie zweryfikowany; dwa owner smoke Ollamy `qwen3:30b` nie przeszły. Ledger i diagnoza zachowane na `checkpoint/d1-ledger-pipeline` (`973b604694ad06181deaa56989b9361f4b4ba52e`). To nie jest gotowy produkt. |
| Stan R1 | Completed — ADR, architektura reviewed pipeline i KISS/BUZI zapisane na aktywnym branchu. |
| Stan D1.1 | Implemented and automatically verified, lecz S1 FAIL; historyczna ścieżka `{ plantUml }` zachowana na `checkpoint/d1-final-plantuml-reviewed`, superseded jako aktywny kierunek. |
| Stan R2 | Completed — właściciel zatwierdził DiagramPlan, lokalną walidację i deterministyczne renderery per typ; ADR 0002 i checkpoint D1.1. |
| Stan D1.2 | Implemented and automatically verified — ścisły SequenceDiagramPlan, lokalna walidacja, deterministyczny renderer i niezależny reviewer; szczegóły w sekcji D1.2 niżej. |
| Następny etap | Ponowny owner smoke S1 z D1.2; M1 i D2 nadal czekają. |
| Bramka S1 | Próby D1.1: FAIL; S1 na D1.2 nie został wykonany i nie jest PASS. M1, D2 i stary gauntlet pozostają zablokowane do S1 PASS. |
| Kolejność | R2 → D1.2 → S1 → M1 → D2 → C1 → D3 → D4 → D5 → K2 → K3 → REL. |
| Checkpoint produktu | `v0.2.0-alpha.1` — implemented, automatically verified, owner smoke accepted (zob. „Checkpoint VSIX v0.2.0-alpha.1”) |

## Historia na `main`

- `b759bb9` — merge fundamentu rozszerzenia VS Code (`feature/vscode-extension-foundation`,
  checkpoint `v0.2.0-alpha.1`) oraz dokumentów documentation governance do `main`.
- Po merge priorytet zmieniono z EA XML na **Knowledge Pack Builder**. EA XML jest odłożone, bo nie
  ma bezpiecznego, publicznego fixture reprezentującego rzeczywiste dane EA.
- 2026-09-19 — wcześniejsza decyzja o priorytetach (demonstracja vibe coding i AI SDLC),
  następnie zastąpiona R1 z 2026-09-21 i R2 z 2026-09-22. Obowiązująca kolejność:
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
(`sequence`) jest zaimplementowane i automatycznie zweryfikowane. S1 z Ollamą `qwen3:30b` następuje
po D1.2 i pozostaje FAIL/not passed po próbach D1.1. M1, D2 i stary gauntlet są zablokowane
do S1 PASS. Dalej obowiązuje M1 → D2 → C1 → D3 → D4 → D5 → K2 → K3 → REL.
Szczegóły: [ADR 0002](adr/0002-deterministic-diagram-plan-renderers.md) i
[roadmapa](product-roadmap.md). D1.1 jest zachowane historycznie i na
`checkpoint/d1-final-plantuml-reviewed`.

Później (bez zobowiązującej kolejności): bounded repair, quality modes, document
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

**S1 owner smoke na D1.2** — wykonać osobno z Ollamą `qwen3:30b` i zainstalowanym VSIX.
Automatyczne bramki D1.2 nie zastępują tej decyzji właściciela. Bez S1 PASS nie zaczynać
M1, D2 ani starego gauntletu. Nie uruchomiono płatnych requestów ani rzeczywistego owner smoke.

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
Nie wykonano owner smoke ani płatnych requestów. Następny krok: S1 owner smoke D1.2;
M1 i D2 nadal czekają na S1 PASS. Bieżący Git należy porównać z tym handoffem.
