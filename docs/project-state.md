# Project state

Operacyjny stan projektu Archi Agent. Aktualizuje go wykonawca po istotnej zmianie
(zob. [`development-workflow.md`](development-workflow.md)). Kierunek produktu i status etapów:
[`product-roadmap.md`](product-roadmap.md). Zasady stałe: [`AGENTS.md`](../AGENTS.md).

**Zapis może być nieaktualny — zawsze porównaj go z `git log` i `git status`.**

## Snapshot

| Pole | Wartość |
| --- | --- |
| Data aktualizacji | 2026-09-20 |
| Stan Git | Bieżący HEAD, branch i stan publikacji należy odczytywać z Git. Commit `3d1c55c` był bazą implementacji B1. |
| Stan B1 | Implemented and verified; neutralny `StructuredChatClient`, lokalny adapter node i cienki generator sequence. Pełne bramki automatyczne B1 przeszły. |
| Stan P1 | Implemented and verified; automatyczne bramki PASS oraz owner smoke Ollamy PASS na commit `50d7f47`. Profile LM Studio i Ollama, wspólny transport OpenAI-compatible oraz machine-scoped wybór profilu/modelu z trwałym bindingiem. |
| Następny etap | P2 — providerzy chmurowi Anthropic, OpenAI i OpenRouter zgodnie z roadmapą. |
| Checkpoint produktu | `v0.2.0-alpha.1` — implemented, automatically verified, owner smoke accepted (zob. „Checkpoint VSIX v0.2.0-alpha.1”) |

## Historia na `main`

- `b759bb9` — merge fundamentu rozszerzenia VS Code (`feature/vscode-extension-foundation`,
  checkpoint `v0.2.0-alpha.1`) oraz dokumentów documentation governance do `main`.
- Po merge priorytet zmieniono z EA XML na **Knowledge Pack Builder**. EA XML jest odłożone, bo nie
  ma bezpiecznego, publicznego fixture reprezentującego rzeczywiste dane EA.
- 2026-09-19 — decyzja właściciela o nowych priorytetach (demonstracja vibe coding i AI SDLC;
  dokładna kolejność: R0 → B1 → P1 → P2 → D1–D5 → K1–K4 → Demo and release). Szczegóły: sekcja „Product priority”
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
- Rozszerzenie VS Code: komendy generowania i wyboru profilu/modelu, ustawienia, dwa bundle,
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

## Wyłącznie planowane

W kolejności ustalonej przez właściciela (2026-09-19; pełny opis w roadmapie, „Product priority”):

1. **P1 (implemented):** neutralny model profilu i rejestr, profile LM Studio/Ollama oraz wybór
   profilu i modelu w rozszerzeniu. **P2 (następny):** dostawcy chmurowi Anthropic, OpenAI, OpenRouter (tylko HTTPS, stała
   allowlista hostów, `SecretStorage`, lista modeli z API dostawcy, jedno wywołanie, bez retry).
2. **D1:** ścieżka LLM-first final PlantUML ze wspólną walidacją strukturalną i wyborem typu
   diagramu; **D2–D5:** `component`, `c4-context`, `c4-container`, `archimate-hld`. Sekwencja
   pozostaje compatibility path i regression oracle.
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

**P2** — osobna faza PLANOWANIA dla providerów chmurowych Anthropic, OpenAI i OpenRouter zgodnie z
ograniczeniami roadmapy (HTTPS, allowlista hostów, `SecretStorage`, jedno wywołanie, bez retry).
