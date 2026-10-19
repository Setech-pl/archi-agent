# DOC2 / PUB1 — pełny przyrost do PR

Raport bieżącej publikacji gałęzi; nie publikuje release, tagu ani integracji main.
Owner smoke **DEFERRED**, żywy LLM **NOT_RUN**, Windows ARM64 runtime **NOT_RUN**,
AUD-003–006 **OPEN**. Automatyczne modele są syntetyczne.

## Preflight i zakres historii

2026-10-19: `feature/mcp1-cli-mcp-core-full`, wejściowy HEAD
`3af45f4914b4e96697d65afc27440bd9b2e86aab`, working tree czysty, staging pusty.
Remote nazywa się `github`, nie `origin`. Po `git fetch github` i odczycie API main:
`152542f35c839c06a9bd0eed05a8a7e8e2523752`; brak otwartych PR przed publikacją.
Sprawdzono zakres diffu: 202 pliki, 9731 dodanych / 480 usuniętych linii przed DOC2.

Cały przyrost do main obejmuje kolejno:

| Checkpoint | Zakres |
| --- | --- |
| `45f743d2fcefb3d6b60afe697081732afd41e86e` | Położenie galerii README przed instalacją |
| `3e33a6a93811d723b21696618eba193ed6eb54e2` | SRC1: lokalny Structurizr JSON + nakładka po ID, provenance i Browser |
| `ea3df0a73067f66a7e5fe8d2b8053c6059a8861d` | VER1 Sequence/proza, C4 Context i C4 Container |
| `62155f173001168631bf652f2f933034e6cf6306` | MCP1: CLI, serwer funkcji, klient wiedzy MCP, przykład serwera wiedzy, Core/Full |
| `3af45f4914b4e96697d65afc27440bd9b2e86aab` | Uzgodnienie wymagań i dokumentacyjny re-review |
| DOC2/PUB1 — SHA odczytaj z PR | Aktualne instrukcje, diagramy, rzeczywiste ekrany i paczki, CI wszystkich dystrybucji |

Nie jest to docs-only PR. Starsze K1/K2/K3/ART1/UX4 pozostają częścią bazowego produktu.
Nie zmieniono architektury, budżetu wywołań modelu ani kodu produktu w DOC2.

## Powiązanie z historycznym C5

[Historyczny odbiór MCP1](mcp1-verification.md) dotyczy kandydata 5 i checkpointu
`62155f173001168631bf652f2f933034e6cf6306`. W tej sesji sprawdzono łańcuch:

- manifest C5 SHA-256 `94a5eac2021000a853145bc95fd2e1c30055b282ae87c7665669983528c6f4c9`;
- acceptance SHA-256 `7a3e4e435207edcce9e9366636c11b672b402e9275f7f7a6369d3763164341da`;
- zgodność hashy/rozmiarów trzech oryginalnych paczek z `build/mcp1/checkpoint.json`;
- 576 fingerprintów źródeł C5: na wejściu różniły się wyłącznie cztery dokumenty;
  źródła produktu, testy, manifesty i oba lockfile'y były zgodne.

Bieżące porównanie nowo spakowanych bundle/zasobów i pełne hashe paczek:
[maszynowy dowód DOC2](evidence/doc2-pub1.json). Wykonywalne pliki są porównywane
bezpośrednio z archiwami C5, a nie wyłącznie z bieżącym `dist/`.
Pełny gauntlet C5 **NOT_RUN ponownie**: zmiany obejmują dokumentację, obrazy,
allowlistę obrazów i skrypty dokumentacyjnego pakowania/weryfikacji oraz CI.
Historyczne **44/44**, root **1954/1954**, extension **730/730** nie są nowym uruchomieniem.
Niezależny review C5 i re-review wymagań pozostają historycznym PASS, bez HIGH/MEDIUM;
nie powtarzano niezależnego audytu wyłącznie dla dokumentów.

## Dokumentacja i obrazy

README PL/EN: sześć aktualnych ekranów przed instalacją. Instrukcje online i bundlowany
Help opisują Structurizr JSON/nakładkę, samodzielne packi, dokumenty, cztery diagramy,
VER1, provenance, kontrolowany zapis i przełączanie Core/Full. CLI PL/EN ma przykład
bramki PR. Oddzielono serwer funkcji MCP od klienta wiedzy i przykładu adaptera serwera.
Bez deklaracji DSL, weryfikacji C4, automatycznej migracji kluczy lub publikacji alpha.7.

Architektura główna i PL/EN: sześć diagramów (12 wersji językowych),
[wyrenderowane SVG/PNG i hashe źródeł](assets/diagrams/provenance.json).
Obejrzano rendery; strzałki sprawdzono względem modułów źródeł, runtime, core,
kompozycji CLI/MCP i osobnego klienta/serwera wiedzy. Zachowano diagramy K2/K3/ART1.

[Galeria](assets/screenshots/README.md), [pochodzenie sześciu nowych zrzutów](assets/screenshots/provenance-doc2.json).
Rzeczywisty Core C5 w izolowanym VS Code/macOS ARM64, publiczna fixture Big Bank.
Sequence/C4 po rzeczywistym generowaniu i zapisie oryginalnego ART1; osobny lokalny
PlantUML 1.2026.6 / Smetana wyrenderował niezmienione źródła do PNG otwartego w VS Code.
To dodatkowe narzędzie podglądu, bez bundlowanego preview i zdalnego renderowania.
Verify Flow ma rzeczywisty raport rozbieżności i zero żądań modelu.
Starsze 14 ekranów zachowano i oznaczono jako historyczne; nie udają bieżącego capture.

## Bieżące kontrole i paczki

Wyniki, wersje, rozmiary i pełne SHA-256: [manifest](evidence/doc2-pub1.json).
Lokalne paczki są w `build/doc2-pub1/`; to nie są assety publicznego release.
Przed instalacją zawsze dobierz hash z manifestu **tej samej** paczki.
Archiwum CI może mieć inny hash niż lokalne, mimo tych samych bundle (czasy ZIP/tar,
metadane platformy). CI zapisuje `packages.json`, `SHA256SUMS` i rzeczywisty testowany SHA.

CI Linux x64 / macOS ARM64 zachowuje dotychczasowe clean npm ci/OCR/typecheck/full tests,
pakuje i weryfikuje teraz Core, Full oraz CLI/MCP i sprawdza oba offline Help.
Artefakty z paczkami są dostępne przez 14 dni w przebiegu przypisanym do PR.
Self-baseline w CI sprawdza dokumentację, nie dowodzi historycznej zgodności z C5.
Wynik zdalnego CI odczytaj z PR; historia main 152542f nie jest dowodem nowego kodu.

## Bieżące wyniki lokalne

- Package/verify Core **PASS 31 wpisów**, Full **PASS 553 wpisy**, CLI/MCP **PASS 10 wpisów**, w tym rzeczywista instalacja offline poza repo.
- Celowane testy pakowania **16/16 PASS**, Node 22.12.0/macOS ARM64; ponowny pełny gauntlet **NOT_RUN** z powodu udowodnionego parytetu kodu.
- Dokumentacja **3/3 Core + 3/3 Full PASS**: linki/kotwice, PL/EN przykłady i topologia, online/offline Help, 20 obrazów, licencje i hashe. Przejrzano oba języki i wszystkie nowe obrazy.
- Bezpośredni parytet C5 **PASS**: Core 3 bundle, Full 3 bundle + 522 zasoby OCR, CLI/MCP 4 pliki wykonywalne. Bundle runtime VSIX/CLI jest wspólny.
- Rzeczywisty offline Help końcowego Core: **EN→PL→EN PASS**, po 19/19 obrazów EN i PL załadowanych (20 unikalnych w paczce), zero żądań providera; automatyczny wybór locale pozostaje oddzielnym historycznym testem.
- Render Mermaid **12/12 PASS** (SVG i PNG) i kontrola wizualna; capture-5 **6/6 ekranów PASS**, sześć syntetycznych żądań generacji/review, zero VER1.
- `git diff --check` **PASS**; kod produktu/testy/manifesty/zależności względem C5 bez zmian. CI zdalne zostaje oddzielnym wynikiem PR.

Wcześniejsze nieudane próby są zachowane i opisane w dowodzie maszynowym: trzy harnessy capture, sandbox cache npm, limit bufora tar oraz pierwszy checker dokumentów przed mapowaniem staged Help. Po korektach narzędzi wszystkie wymagane kontrole lokalne PASS; nie przepisano ich jako historycznych PASS.

| Paczka lokalna 0.3.0-alpha.7 | Rozmiar B | SHA-256 |
| --- | ---: | --- |
| archi-agent-core-0.3.0-alpha.7.vsix | 5508318 | `a56c0348fdc6517eb4cb363d8025e2c7c455f8b1a65476d268eda3ad8d7864d7` |
| archi-agent-full-0.3.0-alpha.7.vsix | 128934489 | `5be28e9b74eed48e970ef340869e5f2464ad1b18c989d748ea6c64bd7399b923` |
| archi-agent-cli-0.3.0-alpha.7.tgz | 889217 | `dde91d6fe094588539de54f387f20e4beca62b2dce066f8d7deeb9485b346ddb` |

## Instalacja i zbiorczy odbiór

Pobierz artefakt zaliczonego joba z PR, sprawdź `packages.json` / `SHA256SUMS` i SHA joba.
Dla rozszerzenia wybierz VSIX Core lub Full i zainstaluj przez Install from VSIX;
włącz dokładnie jeden profil i wykonaj reload. Przy zmianie ID ustawienia są wspólne,
klucze wprowadza się ponownie. CLI/MCP wymaga Node 22.12+ i lokalnego tarballa.
Szczegóły [PL](pl/user-guide.md), [EN](en/user-guide.md), [CLI/MCP](pl/cli-mcp.md).

[Zbiorczy owner smoke](testing/mcp1-owner-smoke.md): na kopii danych poza repo sprawdź
źródło/Browser, cztery diagramy i oryginalny zapis, Sequence verify (bez LLM), prozę,
decyzje/zmianę źródła, parytet VSIX/CLI/MCP, osobny serwer wiedzy oraz Core↔Full i OCR.
Zapisz OS/arch, VS Code, provider/model, hashe paczek oraz wynik; bez credentiali.
Do tego raportu właściciela owner smoke pozostaje **DEFERRED**.
