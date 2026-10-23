# MCP1 — zbiorczy owner smoke

**Stan: DEFERRED.** Ten dokument jest instrukcją odbioru przez właściciela. Automatyczne
wyniki wykonawcy nie zastępują wyniku właściciela ani jakości rzeczywistego LLM.
Publiczne paczki DEMO1, rozmiary i SHA-256: [wydanie](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1), [manifest](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/release-manifest.json), [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS). Historyczny C5: [raport MCP1](https://github.com/Setech-pl/archi-agent/blob/d723af09dacc71746a82c0fddcad97beb2cece8e/docs/mcp1-verification.md). Lokalne funkcje EA1/EA1b nie należą do tego wydania.
Instrukcje instalacji i konfiguracji: [PL](../pl/cli-mcp.md), [EN](../en/cli-mcp.md).

1. Zapisz OS/architekturę, VS Code, Node (dla CLI/MCP), profil rozszerzenia, dokładne SHA-256
   paczek oraz provider/model. Sprawdź hashe przed instalacją. Nie zapisuj kluczy w raporcie.
   Rozszerzenie jest samowystarczalne; CLI/MCP wymaga Node 22.12+ i lokalnej instalacji
   dostarczonego tarballa (`npm install --global /pełna/ścieżka/archi-agent-cli-0.3.0-alpha.7.tgz`).
   Testuj w nowym katalogu poza repo i w izolowanym profilu VS Code.
2. Zainstaluj rekomendowany Core. Skopiuj syntetyczny
   `test/fixtures/structurizr/big-bank-plc` poza repo. Zachowaj `workspace.json` i trzy tabele
   nakładki `relationships.md`, `aliases.md`, `rules.md` z oryginalnymi ID. W Configuration
   wybierz Structurizr JSON zgodnie z przewodnikiem. Oczekuj poprawnej walidacji, liczników,
   jawnych pominięć i pochodzenia w Browser. Nie używaj DSL. Zły endpoint relacji w kopii
   nakładki powinien dać błąd walidacji przed LLM; przywróć plik.
3. Utwórz pełną konfigurację CLI z absolutnym readRoot tego katalogu (przykład w przewodniku),
   źródłem `bank` i wybranym providerem. Sekrety CLI/MCP ustaw w środowisku przy użyciu nazw
   `ARCHI_AGENT_*`; klucze VS Code podaj oddzielnie przez Set API Key. Inspekcja źródła i
   weryfikacja Sequence PlantUML nie wymagają providera. Sprawdź stdout JSON i osobny stderr.
4. Przygotuj plik z poprawnym przepływem z przykładu VER1 i drugi z błędnym trybem interakcji.
   Uruchom Verify Flow w VS Code, `archi-agent flow verify` i tool `verify_flow`.
   Oczekuj jednakowych ocen, kroków, fact IDs i provenance: pełna zgodność w zakresie daje
   CLI 0, rozbieżność 1, częściowe/nieobsługiwane wejście 2, błąd wykonania 3. PlantUML: 0 LLM.
   Nie utożsamiaj MCP `isError:false` z oceną zgodności.
5. Zweryfikuj prozę z rzeczywistym modelem. Oczekuj maksymalnie jednego wywołania interpretacji
   (limit 16384 tokenów odpowiedzi), a dla rozstrzygnięcia nazwy jawnego potwierdzenia
   konkretnego ID. `resolve_flow_names` używa dokładnych hashy i sessionId zwróconych przez
   `verify_flow`, bez kolejnego LLM. Sprawdź niezmienione źródła i aliasy po samym verify/resolve.
   Zmień źródło między startem a kontynuacją: oczekuj stale-source, bez zapisu i fallbacku.
6. Uruchom `archi-agent mcp serve --config /pełna/ścieżka/config.json` w kliencie stdio.
   Sprawdź dokładnie cztery tools: `inspect_knowledge`, `verify_flow`, `resolve_flow_names`,
   `generate_diagram`. Przykłady argumentów są w przewodniku. Nie przekazuj readRoots,
   executable ani kluczy jako argumentów toola. Anuluj długie wywołanie i sprawdź brak
   późnego sukcesu oraz możliwość następnej operacji.
7. Sprawdź kontrakt osobnego serwera wiedzy:
   `archi-agent-knowledge-server --config /pełna/ścieżka/knowledge.json --check-source bank`.
   Następnie skonfiguruj jego stdio command/args jako jedyny knowledgeServer w CLI i w
   **User settings** VS Code; wybierz źródło MCP. To inny proces niż serwer czterech funkcji.
   Dla tego samego workspace i nakładki oczekuj zgodnych snapshotów, groundingu i VER1.
   Zatrzymaj/ukryj wyłącznie własny testowy serwer: oczekuj błędu, wyczyszczonych starych
   liczników i braku użycia lokalnej kopii. Przywróć serwer i odśwież. Nowa operacja ma pobrać
   świeży snapshot. Workspace settings nie mogą zmienić skonfigurowanego executable.
8. Wygeneruj Sequence, Component, C4 Context i C4 Container na źródle lokalnym i MCP.
   Dla C4 jawnie wybierz właściwy system/ID. Porównaj PlantUML, grounding i provenance.
   Poprawna generacja: generator + reviewer na jednym snapshotcie, maksymalnie dwa calls
   (limity 16384 i 8192), bez retry/repair. VER1 nadal dotyczy tylko Sequence/prozy.
   Jawnie zapisz oryginalną parę Diagram and Report (ART1); sama inspekcja/generacja nie zapisuje.
9. Core: skonwertuj DOCX, XLSX i tekstowy PDF. PDF auto bez tekstu ma zgłosić OCR unavailable,
   bez częściowego Markdown; OCR all pages niedostępne. Wyłącz Core, Reload Window,
   zainstaluj/włącz Full, Reload Window. Offline sprawdź OCR syntetycznego skanu PL i EN.
   Na osobnej testowej kopii instalacji usunięty/uszkodzony wymagany zasób Full ma dać błąd
   instalacji, bez pobierania i bez udawania Core; przywróć przez ponowną instalację VSIX.
10. Sprawdź zmianę Full→Core→Full: ustawienia pozostają wspólne, klucze należą do konkretnego
    ID i nie kopiują się. Powrót do ID zachowuje jego własny klucz. Aktualizuj każdy profil
    wyłącznie paczką tego samego ID. Oba zainstalowane mogą pozostać z jednym włączonym.
    W izolowanym profilu włącz oba: oczekuj jawnego konfliktu i blokady operacji. Samodzielnie
    wyłącz jeden i wykonaj Reload Window; rozszerzenie nie podejmuje tej decyzji za użytkownika.
11. Rozbudowa serwera: adapter dopisz w `src/knowledge-server/adapter.ts` lub module obok,
    skomponuj w `main.ts`; transport pozostaje w `server.ts`. Stosuj produkcyjne
    `createKnowledgeResponse` / `validateKnowledgeResponse`, jawny scope/omissions i prawdziwe
    referencje. Uruchom `npx vitest run test/runtime/mcp-knowledge.test.ts --no-file-parallelism`,
    przebuduj paczkę i powtórz `--check-source`. Nie fabrykuj pełnego Structurizr ani linii plików.

Zapisz dla każdego punktu PASS/FAIL/NOT_RUN, dokładne polecenie, obserwację i ewentualny
zrzut bez sekretów. Wyniki rzeczywistego LLM oddziel od syntetycznych fixture'ów. Nie zmieniaj
DEFERRED na PASS bez wykonania i przekazania wyniku właściciela. Bieżący stan ustaleń AUD określa [project-state](../project-state.md); ten smoke ich sam nie zamyka.
