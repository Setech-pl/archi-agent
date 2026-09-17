# Project state

Operacyjny stan projektu Archi Agent. Aktualizuje go wykonawca po istotnej zmianie
(zob. [`development-workflow.md`](development-workflow.md)). Kierunek produktu i status etapów:
[`product-roadmap.md`](product-roadmap.md). Zasady stałe: [`AGENTS.md`](../AGENTS.md).

**Zapis może być nieaktualny — zawsze porównaj go z `git log` i `git status`.**

## Snapshot

| Pole | Wartość |
| --- | --- |
| Data aktualizacji | 2026-09-17 |
| Branch | `feature/vscode-extension-foundation` (śledzi `github/feature/vscode-extension-foundation`) |
| HEAD | `d4de130` test: cover explicit interaction flags and fix Windows path assertion |
| Zmiany niezacommitowane | Wyłącznie dokumentacja z zadania „documentation governance”: nowe `AGENTS.md`, `CLAUDE.md`, `docs/development-workflow.md`, `docs/project-state.md`; zmienione `docs/product-roadmap.md`, `README.md`. Brak zmian w kodzie. |
| Checkpoint produktu | `v0.2.0-alpha.1` — implemented, automatically verified, owner smoke accepted (zob. „Checkpoint VSIX v0.2.0-alpha.1”) |

## Ostatnia implementacja (ustalona z Git)

Właściciel deklaruje, że ostatnie zadanie Claude Code zakończyło się prawidłowo; raport końcowy
nie jest dostępny. Zakres ustalony z historii Git (commity z 2026-09-16, niescalone do `main`):

- `c7c7164` — fundament rozszerzenia VS Code: `src/runtime` (host-neutral `ArchiAgentRuntime`),
  `vscode-extension/src` (komenda, ustawienia, sesja rozstrzygania niejednoznaczności i `[NEW]`),
  bundling esbuild, pakowanie i weryfikacja VSIX, testy runtime/extension/packaging,
  `docs/vscode-extension.md`.
- `927734b` — pola `async` i `isResponse` wymagane w schemacie modelu generowanego
  (`src/core/model/sequence-diagram-model.schema.ts`) oraz odpowiednie instrukcje w promptcie.
- `d4de130` — testy jawnych flag interakcji (m.in. „still rejects an asynchronous response”
  w `test/core/validation/relationship-validator.test.ts`; sama reguła `async=true` +
  `isResponse=true` → błąd jest w `src/core/validation/model-validator.ts`) i poprawka asercji
  ścieżek na Windows.

## Potwierdzone w kodzie

- Markdown Knowledge Pack, deterministyczny grounding, minimalny kontekst, digest.
- Pipeline sequence z walidacją deterministyczną i rendererem PlantUML (compatibility path).
- Lokalny adapter OpenAI-compatible (loopback, jedno żądanie, bez retry/repair), demo offline i LM Studio.
- Rozszerzenie VS Code: komenda `archiAgent.generateSequenceDiagram`, ustawienia, dwa bundle,
  skrypty `extension:package` i `extension:verify`.

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

- **EA XML: brak implementacji.** W repo (wszystkie gałęzie lokalne i zdalne, pliki śledzone
  i ignorowane) nie ma kodu parsowania EA ani XML, fixture'ów EA ani testów. Jedyne odwołania do
  `.xml` dotyczą manifestu VSIX (`[Content_Types].xml`).
- Ścieżka LLM-first final PlantUML, profile `component`, `c4-context`, `c4-container`,
  `archimate-hld`, document sources, dostawcy HTTPS/chmurowi, semantic review, repair,
  quality modes, zdalni dostawcy modeli.

## Weryfikacja

### Wykonane w bieżącej sesji (2026-09-17, weryfikacja checkpointu na HEAD `d4de130`)

| Kontrola | Wynik |
| --- | --- |
| Preflight Git (`git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git diff --stat`, `git diff --cached --stat`) | branch, HEAD i zakres zmian zgodne z oczekiwaniem; staging pusty |
| `node --version` / `npm --version` | `v22.17.0` / `11.6.0` |
| `npm ci` | PASS; bez zmian w `package-lock.json` i bez zmian w working tree |
| `npm test` | PASS — 64/64 plików, 963/963 testów |
| `npm run typecheck` | PASS |
| `npm run extension:typecheck` | PASS |
| `npm run extension:test` | PASS — 6/6 plików, 79/79 testów |
| `npm run extension:build` | PASS |
| `npm run extension:package` | PASS — nowy `vscode-extension/build/archi-agent-0.2.0-alpha.1.vsix` (176,08 KB wg raportu pakowania) |
| `npm run extension:verify` | PASS — dokładnie 6 dozwolonych wpisów |
| `git diff --check`, `git diff --stat`, `git diff --cached --stat`, `git status --short` (kontrola końcowa) | bez błędów; brak zmian w kodzie, testach i `package-lock.json`; staging nadal pusty; jedyna dodatkowa zmiana to niniejsza aktualizacja `docs/project-state.md`; VSIX nadal ignorowany przez Git |

Szczegóły artefaktu VSIX — patrz „Checkpoint VSIX v0.2.0-alpha.1” powyżej.

### Niewykonane / niezweryfikowane

- Liczba testów i wynik z poprzedniej sesji (implementacyjnej, `c7c7164`/`927734b`/`d4de130`) nadal
  nie są znane z trwałego źródła (brak raportu); nie mylić z wynikami bieżącej sesji weryfikacyjnej
  powyżej, które są jawnie potwierdzone.

## Aktywne zadanie

Finalizacja documentation governance i checkpointu VSIX — gotowe do przeglądu i commita.
Checkpoint `v0.2.0-alpha.1`: implemented, automatically verified, owner smoke accepted.

## Następny krok

1. Commit i push bieżącego brancha.
2. Scalenie `feature/vscode-extension-foundation` do `main`.
3. Utworzenie `feature/ea-xml-source`.
4. Faza PLANOWANIE dla provider-neutral architecture source oraz EA XML z local file.
