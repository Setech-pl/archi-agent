# Instrukcja użytkownika

[English](../en/user-guide.md) · **Polski** · [Strona główna](../../README.pl.md)

## Bieżący prerelease: profile i wiedza

Publiczny prerelease [**v0.3.0-alpha.8**](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.8) udostępnia VSIX Core i Full, CLI oraz dwa dwujęzyczne ZIP-y demo. Zawiera serwer czterech funkcji MCP i klienta wiedzy MCP. Dokładne pliki identyfikują jego [manifest wydania](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.8/release-manifest.json) i [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.8/SHA256SUMS). To wydanie obejmuje cztery deterministyczne widoki enterprise oraz tworzenie i aktualizację katalogów z przeglądem. [Instalacja CLI/MCP, polecenia i kontrakty](cli-mcp.md).

**Core** (`setech-pl.archi-agent-core`) jest rekomendowany nowym użytkownikom. Zawiera wspólny runtime oraz tekstową konwersję PDF/DOCX/XLSX, bez zależności i modeli OCR. **Full** (`setech-pl.archi-agent`) dodaje przypięte lokalne OCR PL/EN. Istniejący Full pozostaje Full. Żaden profil nie pobiera OCR. W Core Auto OCR działa dla tekstowych PDF; strona wymagająca OCR zatrzymuje konwersję z jawnym pokryciem, bez częściowego Markdown. OCR all pages wymaga Full. Uszkodzony Full zgłasza błąd instalacji: zainstaluj ponownie zweryfikowany VSIX Full.

Aby zmienić profil, zainstaluj wybrany VSIX, samodzielnie wyłącz poprzedni profil i przeładuj VS Code. Oba ID mogą pozostać zainstalowane, ale włącz dokładnie jedno. Przy obu włączonych deklaracje statyczne kolidują przed aktywacją; VS Code może zgłosić duplikaty, a Archi Agent blokuje operacje do wyboru profilu i przeładowania. Aktualizacje dotyczą każdego ID osobno. Wspólne ustawienia `archiAgent.*` pozostają; SecretStorage należy do każdego ID osobno. Wprowadź klucze chmurowe ponownie dla wybranego profilu: nie są kopiowane ani czytane przez CLI/MCP.

Wybierz jedno źródło na operację: Markdown Knowledge Pack; **Structurizr workspace.json + nakładka**; albo **wiedza MCP**. Structurizr wymaga `workspace.json` oraz plików nakładki SRC1 `aliases.md`, `relationships.md`, `rules.md`, powiązanych z oryginalnymi ID. Produkcyjny resolver sprawdza wymagane interface type/mode, odwołania i konflikty; Knowledge Browser pokazuje walidację, oryginalne ID, pochodzenie, obsługiwany zakres i pominięcia. Obsługiwane są people, software systems, containers i relacje statyczne; components/deployment/views są pomijane. DSL nie jest obsługiwany. [Pełny kontrakt SRC1](../src1-structurizr-source.md).

Dla MCP ustaw `archiAgent.knowledgeServer` w **ustawieniach User**, następnie `archiAgent.architectureSource` na `{"kind":"mcp","sourceId":"bank"}`. Workspace nie może wskazać programu. Zacznij od samodzielnego przykładu w [instrukcji CLI/MCP](cli-mcp.md#klient-mcp-wiedzy-i-przykładowy-serwer). Operacja pobiera jeden niezmienny snapshot; następna pobiera ponownie. Błąd zatrzymuje operację; brak fallbacku do starej lokalnej wiedzy i automatycznego zapisu aliasów. LLM nie wybiera narzędzi źródła. JSON Verify Flow korzysta z tego samego przenośnego raportu co CLI/MCP.

**Serwer funkcji MCP** (`archi-agent mcp serve`) udostępnia zewnętrznym klientom `inspect_knowledge`, `verify_flow`, `resolve_flow_names`, `generate_diagram`. Opisany wyżej **klient wiedzy MCP** pobiera `get_knowledge_snapshot` z osobnego serwera źródła. Dostarczony przykład `archi-agent-knowledge-server` współdzieli produkcyjne SRC1/K1 i rozdziela transport od `KnowledgeAdapter.load`. W żadnym kierunku LLM nie wybiera tools źródła. CLI/serwery wymagają Node 22.12+ oraz jawnych readRoots/sekretów środowiska; VSIX używa Node VS Code i SecretStorage. W pipeline PR użyj `flow verify` i akceptuj tylko exit 0; 1 oznacza rozbieżności, 2 nierozstrzygnięte/częściowe/nieobsługiwane, 3 błąd wykonania. Pełna konfiguracja i polecenia: [CLI/MCP](cli-mcp.md).

## Mapa zdolności biznesowych

Dostępna w powyższych paczkach Core/Full alpha.8.
Otwórz lokalny projekt i uruchom **Archi: Create Diagram → Architektura korporacyjna → Mapa zdolności biznesowych**.
Wskaż `enterprise.json`, wybierz całą mapę lub gałąź L1, szczegółowość L1–L3 oraz brak kolorowania
albo jawną skalę ocen. W multi-root najpierw wybierz projekt źródła. Nie potrzebujesz packa
oprogramowania, providera, modelu ani klucza API; operacja wykonuje zero wywołań modelu.

Aby zacząć od opisu firmy lub dokumentów, uruchom **Archi: Build Business Capability Catalog / Utwórz katalog zdolności biznesowych**. Wybierz **Wyodrębnij z materiałów** albo **Zaproponuj model firmy**, a następnie zaznaczenie, aktywny dokument (także dirty/untitled), wpisany opis lub jawnie wskazane dokumenty lokalne. Przejrzyj zamrożone materiały przed maksymalnie jednym wywołaniem modelu; chmura wymaga osobnej autoryzacji. Przejrzyj/popraw hierarchię L1–L3 i pochodzenie, zaakceptuj/odrzuć propozycje, określ zakres i zapisz nowy `enterprise.json` z `enterprise.review.json`. Istniejące pliki nie są nadpisywane. **Wygeneruj Capability Map** użyje zapisanego katalogu bez dodatkowego wywołania modelu. Oceny pozostają nieznane, a pokrycie częściowe. [Pełna instrukcja i budżety](capability-map.md#opis-firmy--przegląd-katalogu--mapa).

Dla gotowego JSON opcja **Aktywny dokument — także niezapisane zmiany** przechwytuje tekst przed pierwszym pickerem diagramu. Późniejsze zmiany nie podmieniają wejścia operacji; błędny JSON nigdy nie uruchamia modelu. Jawne źródła plik/MCP pozostają dostępne. Raport wskazuje pozycje/fingerprint przechwyconego bufora, a ART1 zapisuje wejście w pamięci.

Podgląd graficzny wymaga osobnego renderera PlantUML. Dwa niezapisane edytory pokazują PlantUML i deterministyczny raport provenance. Zapisz oryginalną
parę przez **Archi: Save Diagram and Report** i potwierdź miejsce; Cancel nie zapisuje częściowej pary.
Szare „Brak danych” oznacza brak oceny. Oceny rodziców nie są agregowane; wielkość kafla nie jest oceną.
Legenda/raport pokazują pokrycie źródła i świadome pominięcia zakresu/szczegółowości. Duża mapa wymaga
jawnego zawężenia widoku. Raport nie jest semantic review ani Verify Flow.
W bieżącym checkoucie `docs/pl/capability-map.md` zawiera ćwiczenie Retail i mapę referencyjną,
a `docs/enterprise-catalog.md` opisuje dokładny kontrakt. Te instrukcje opisują bieżące wydanie.
CLI obsługuje diagram generate z --type capability-map i wpisem enterpriseSources w config v2, bez input/provider. Serwer funkcji używa tego samego generate_diagram z osobnym wariantem capability-map. Zmiana jest zawarta w alpha.8.

Dla katalogu MCP użyj lokalnie spakowanego archi-agent-knowledge-server z config v2: wpis enterpriseSources o nazwie retail-business wskazuje architecture/enterprise.json w readRoots, sources/providers są puste. Sprawdź źródło przez --check-source retail-business --type enterprise. Poniższe instrukcje zawierają kompletną konfigurację offline. Dostosuj absolutne ścieżki executable/paczki/config.

Zapisz kompletną konfigurację źródła jako `/srv/retail-knowledge.json`. Zastąp readRoot katalogiem Retail z bieżącego checkoutu. Użyj Node >=22.12 i executable knowledge-server z **paczki CLI alpha.8**. Poniższy config i polecenie działają także offline. Skonfigurowany klient MCP uruchamia proces; polecenie kontrolne kończy się po walidacji.

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

```bash
node /opt/archi-agent-cli/package/bin/archi-agent-knowledge-server.cjs --config /srv/retail-knowledge.json --check-source retail-business --type enterprise
```

Następnie zapisz te User settings:

```json
{
  "archiAgent.enterpriseSource": {"kind": "mcp", "sourceId": "retail-business"},
  "archiAgent.knowledgeServer": {
    "command": "/opt/node/bin/node",
    "args": ["/opt/archi-agent-cli/package/bin/archi-agent-knowledge-server.cjs", "--config", "/srv/retail-knowledge.json"]
  }
}
```

Create Diagram → Architektura korporacyjna → Mapa zdolności oferuje teraz skonfigurowane źródło MCP i Local enterprise.json. Wybierz MCP, a następnie dotychczasowy zakres/poziom/oceny. Tylko User knowledgeServer konfiguruje proces, workspace nie może tego zrobić. Software architectureSource pozostaje osobne. Generacja ładuje jeden snapshot, wykonuje zero wywołań modelu i zapisuje dopiero po potwierdzeniu ART1. Brak get_enterprise_snapshot v1 daje enterprise-unsupported bez fallbacku. Raport zdalny v2 zachowuje referencje i JSON Pointers, bez fikcyjnych file/line. Get_knowledge_snapshot v1 pozostaje bez zmian.

## Verify Flow i C4

Verify Flow i C4 są dostępne w DEMO1. Ekrany 15–20 ilustrują te funkcje; oryginalną tożsamość zrzutów zapisano w provenance poniżej.

**Archi: Verify Flow (Sequence / prose)** sprawdza wpisany tekst, zaznaczenie lub aktywny bufor.
Sequence PlantUML nie używa LLM; proza używa jednego żądania interpretacji. Raport JSON odróżnia
potwierdzone kroki, rozbieżności, nierozstrzygnięte nazwy i pominięcia składni/źródła. Tylko dokładna
legenda Archi Agent ustanawia znaczenie sync/async/response strzałek; inne style mogą pozostać
nierozstrzygnięte. C4 jest poza zakresem weryfikatora. Nieznane nazwy wymagają jawnego wyboru elementu.
Dla Structurizr Save confirmed aliases przygotowuje minimalną edycję nakładki i natywny zapis;
brudny, zmieniony lub konfliktowy plik zatrzymuje zapis. Dla samodzielnego packa decyzje są sesyjne.
Zmiana źródła podczas potwierdzania wymaga nowej weryfikacji; decyzje nie są automatycznie przenoszone.

**Create Diagram** oferuje także **C4 Context** i **C4 Container**. Ustaw lokalny JSON Structurizr
oraz nakładkę SRC1 przez Source Settings. Jawnie wybierz system. Context pokazuje osoby i bezpośrednio
powiązane systemy, bez wewnętrznych kontenerów. Container pokazuje kontenery rodzica w jawnej granicy
i obsługiwane otoczenie zewnętrzne. Przynależność nie tworzy relacji, a relacje dzieci nie są zwijane.
Technologie i opisy pochodzą z pól źródła; raport zachowuje provenance hierarchii i pominięcia.
Samodzielny pack bez hierarchii zgłasza brak danych. Poprawne C4 używa jednego żądania planu i jednego
review na tym samym snapshotcie. **Save Diagram and Report** zapisuje oryginalną parę wyników.
Podgląd graficzny nadal wymaga osobnej obsługi PlantUML; zdalne include C4 nie jest potrzebne.


## Aktualne ekrany produktu

Rzeczywiste zainstalowane UI, publiczny przykład Big Bank, syntetyczne odpowiedzi modelu. Pierwsze trzy obrazy pokazują PNG wyrenderowane **osobno lokalnym PlantUML 1.2026.6 / Smetana**, otwarte w VS Code: Sequence/Context obok oryginalnego raportu, Container na pełną szerokość. Ta obsługa graficzna nie jest bundlowana w Archi Agent. [Pochodzenie zrzutów](../assets/screenshots/provenance-doc2.json).

![Sequence + report](../assets/screenshots/15-sequence.png)

![C4 Context](../assets/screenshots/16-c4-context.png)

![C4 Container](../assets/screenshots/17-c4-container.png)

![Verify Flow / zero LLM](../assets/screenshots/18-verify-flow.png)

![Knowledge Browser](../assets/screenshots/19-knowledge-browser.png)

![Configuration / Structurizr JSON + overlay](../assets/screenshots/20-configuration.png)

## Instalacja na Macu i Windows

Pobierz VSIX Core lub Full z [prerelease alpha.8](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.8). Porównaj SHA-256 z [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.8/SHA256SUMS) i [manifestem](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.8/release-manifest.json) tego wydania. Wersja paczki to **0.3.0-alpha.8**, a tag wydania to **v0.3.0-alpha.8**. Lokalny build lub artefakt CI może mieć inny hash i nie jest opublikowaną paczką.

Mac:

```bash
shasum -a 256 <file.vsix>
```

Windows PowerShell:

```powershell
Get-FileHash <file.vsix> -Algorithm SHA256
```

W VS Code wybierz **Extensions → … → Install from VSIX…**, wskaż plik i przeładuj okno, jeśli jest to wymagane. Sprawdź wersję w szczegółach **Archi Agent**. Nie potrzebujesz repozytorium, npm ani osobnej instalacji Node.js. Starszą wersję zastąpisz tym samym poleceniem instalacji wskazanego prerelease.

Starsze wydania pozostają dostępne osobno. [Zbiorczy owner smoke](../testing/ea3-ea4-owner-smoke.md) opisuje bieżącą procedurę odbioru; owner smoke pozostaje **DEFERRED**. Publikacja nie oznacza gotowości stable/Marketplace.

### Wymagania i pierwsze uruchomienie

Potrzebujesz desktopowego VS Code zgodnego z deklaracją `^1.91.0`, lokalnego systemu plików oraz providera modeli do ekstrakcji lub diagramów oprogramowania z review. Mapa zdolności nie wymaga providera. Oba profile zawierają bundle runtime Node i worker konwersji; Full dodaje zasoby OCR offline. Osobne Node/npm nie są potrzebne. Natywne dowody UI pochodzą z macOS arm64; równoważny przepływ end-to-end na innych platformach nie jest jeszcze potwierdzony. Pakiet zawiera także bindingi Mac Intel, Linux x64/arm64 GNU i musl oraz Windows x64/arm64 — to pokrycie pakowania, nie weryfikacja natywnego UI tych systemów. Workspace zdalny lub wirtualny nie potwierdza obsługi zdalnych ścieżek dokumentów; używaj lokalnych folderów. W niezaufanym workspace ustawienia objęte ograniczeniami są odczytywane z ustawień użytkownika.

Zainstaluj właściwy VSIX przez **Extensions → … → Install from VSIX…**, następnie uruchom **Archi: Open**. Menu zawiera **Create Diagram**, **Verify Flow (Sequence / prose)**, **Save Diagram and Report**, **Configuration**, **Knowledge Browser**, **Build Knowledge Pack from Documents**, **Build Knowledge Pack from Active File**, **Convert to Markdown** oraz **Help**. **Archi: Configuration** otwiera jeden panel edytora z zakładkami **Knowledge Management** i **LLM Provider**; ponowne polecenie pokazuje ten panel. **Archi: Create Diagram** pyta o **Sequence**, **Component**, **C4 Context**, **C4 Container** lub cztery widoki **Enterprise Architecture** przed generacją. Osobne polecenie Sequence jest ukryte i deleguje do tego wyboru. **Check Provider Configuration** jest dostępne w zakładce providera; identyfikator zgodności jest ukryty w palecie. Budowanie opisuje [instrukcja deweloperska](development.md).

## Zacznij tutaj — pierwsze użycie

1. Pobierz Core lub Full z alpha.8, sprawdź checksumę i zainstaluj przez **Extensions → … → Install from VSIX…**. Włącz dokładnie jeden profil, przeładuj okno i otwórz lokalny projekt. Potwierdź **0.3.0-alpha.8** w szczegółach rozszerzenia.
2. Uruchom **Archi: Configuration → LLM Provider**. Przygotuj LM Studio/Ollamę albo wybierz profil chmurowy. Dla chmury użyj **Set / Replace Key for <provider>** i wpisz klucz w natywnym maskowanym polu.
3. Wybierz **Refresh Models** przed lub po Apply. Wskaż dokładne ID w **Available models / Dostępne modele**; pojawi się w **Selected model**. Wybierz **Apply**, potem **Check Provider Configuration**. Refresh niczego nie zapisuje; **Discard Changes** przywraca zastosowane pola. Wybrany jest jeden model, wspólny dla generatora i reviewera diagramu; nie ma listy wielu modeli „Selected Models”.
4. W **Knowledge Management** użyj **Choose Existing Knowledge Pack** albo **Create Knowledge Pack** dla małego katalogu. Kompletny przykład Alpha/Beta poniżej nadaje się do pierwszego diagramu. Możesz też zbudować pack z dokumentów, rozstrzygnąć każdego kandydata, sprawdzić pięć podglądów i użyć **Save and use**, aby aktywować nowy pack.
5. Uruchom **Archi: Knowledge Browser**, aby sprawdzić aktywny katalog. Wybierz **Archi: Create Diagram → Sequence** albo **Component** i wpisz `Alpha stores data in Beta.` przy aktywnym przykładowym packu.
6. Przeczytaj oba edytory wyniku, następnie wybierz **Archi: Save Diagram and Report** i potwierdź nowy folder w projekcie. **Archi: Help** lub **Archi: Open → Help** otwiera tę instrukcję offline.

Help otwiera polską instrukcję przy języku wyświetlania VS Code `pl` (także wariantach regionalnych), a w pozostałych przypadkach angielską. Odnośniki **English / Polski** otwierają drugą bundlowaną instrukcję. To wybór języka pomocy: większość kontrolek produktu zachowuje angielskie nazwy i nie ma trwałego przełącznika języka całej aplikacji.

## Co oznaczają poszczególne artefakty

| Artefakt | Przykład | Cel i następny krok |
| --- | --- | --- |
| Dokument źródłowy | `architecture.pdf` albo niezapisany edytor `source.md` | Fakty i kontekst wejściowy; rozszerzenie nie zmienia źródła. |
| Wynik konwersji | Niezapisany Markdown z `## Page 1` i znacznikami OCR | Lokalnie wydobyty tekst, bez modelu. To jeszcze nie wiedza o architekturze; sprawdź tekst lub użyj źródła w Builderze. |
| Kandydaci wiedzy | Proponowany serwis Alpha i relacja Alpha → Beta, jeszcze `pending` | Nieufne propozycje modelu z dowodami; zaakceptuj, odrzuć lub edytuj w Knowledge Pack Review. Cytat potwierdza lokalizację, nie interpretację. |
| Zaakceptowany Knowledge Pack | Pięć tabel Markdown w nowym folderze | Twój przejrzany katalog odczytywany przez produkcyjny loader. Save go tworzy; Save and use dodatkowo aktywuje. |
| Diagram i raport | `diagram.puml` oraz `report.json` | Wygenerowany widok przepływu i powiązany zapis dowodów/walidacji. Zapis nie tworzy ani nie aktualizuje packa. |

PDF może więc stać się tekstem po konwersji, potem kandydatami i zaakceptowanym packiem. Późniejszy opis przepływu wraz z tym packiem daje diagram. Są to osobne operacje; konwersja nie uruchamia automatycznie ekstrakcji wiedzy ani generowania diagramu.

## Provider, profil i model

Provider to usługa uruchamiająca model. Profil wybiera adapter i zasady endpointu; identyfikator modelu wskazuje jeden model u tego providera.

| Profil UI | ID | Endpoint | Klucz |
| --- | --- | --- | --- |
| LM Studio | `local-lm-studio` | domyślnie `http://127.0.0.1:1234/v1` | brak |
| Ollama | `local-ollama` | `http://127.0.0.1:11434/v1` | brak |
| Anthropic | `cloud-anthropic` | stały `https://api.anthropic.com` | SecretStorage |
| OpenAI | `cloud-openai` | stały `https://api.openai.com` | SecretStorage |
| OpenRouter | `cloud-openrouter` | stały `https://openrouter.ai/api/v1` | SecretStorage |

Przygotuj lokalny serwer/model samodzielnie; rozszerzenie nie pobiera modeli. Otwórz **Archi: Configuration → LLM Provider**. Wybierz profil, uzupełnij właściwe pola endpointu/timeoutu/modelu i użyj **Apply**. **Discard Changes** przywraca zastosowane wartości. Niezapisane zmiany przetrwają przełączanie zakładek. Refresh Models czyta widoczny profil/adres bez zapisu ustawień; diagnostyka zastosowanej konfiguracji wymaga Apply lub Discard. Operacje klucza dotyczą widocznego profilu formularza i są dostępne także przed Apply. Zewnętrzna zmiana ustawień jest pokazywana bez utraty wpisanych wartości; przy konflikcie użyj Discard i wpisz zamierzone zmiany ponownie. Zmiana konfiguracji unieważnia diagnostykę. **Refresh Models** pobiera listę jednym ograniczonym żądaniem. Wybierz dokładne ID z **Available models** albo wpisz je w Selected model, następnie Apply. Pusta, niepoprawna i błędna odpowiedź mają odrębne komunikaty EN/PL oraz następne działanie. Identyczne powtórzone bezpieczne ID lokalnego dostawcy tworzą jeden wybór; niebezpieczne ID nadal odrzuca listę. Model nie jest wybierany automatycznie. Chmura wymaga **Set / Replace Key** (natywne zamaskowane pole); **Remove Key** prosi o potwierdzenie. Klucze pozostają w SecretStorage; ekran otrzymuje tylko informację o obecności. **Check Provider Configuration** testuje zastosowane ustawienia najwyżej jednym żądaniem listy, bez generacji. Pokazuje połączenie, listing, model i gotowość generacji oraz następne działanie. Listing nie dowodzi gotowości generacji, dostępu, rozliczeń ani quota. Jawne **Create Diagram** testuje generację przy zachowanej polityce żądań. Nie wszystkie profile providera mają wyniki testów na żywo.

| Ustawienie | Znaczenie |
| --- | --- |
| `archiAgent.knowledgePackPath` | bezwzględny folder pięciu plików packa; scope resource |
| `archiAgent.localModel.profile` | ID profilu na tym komputerze |
| `archiAgent.localModel.selectedModel` | ID modelu na tym komputerze |
| `archiAgent.localModel.selectedModelProfile` | binding zarządzany przez rozszerzenie; nie edytuj |
| `archiAgent.localModel.baseUrl` | loopback LM Studio; Ollama go ignoruje |
| `archiAgent.localModel.model` | starsze ustawienie modelu LM Studio do jawnego wyboru profilu |
| `archiAgent.localModel.timeoutSeconds` | jedno żądanie modelu, domyślnie 120; zakres 1–600 |
| `archiAgent.defaultAuthor` | autor wpisanego opisu, domyślnie `Archi Agent` |
| `archiAgent.diagnostics.verbose` | bezpieczna diagnostyka JSON w Output; domyślnie false |

Wybór profilu/modelu ma scope machine: Settings Sync go nie synchronizuje, a workspace nie nadpisuje. Po zmianie profilu wybierz model ponownie; stary binding jest nieaktywny. Preferuj UI zamiast ręcznych zmian ustawień modelu. Lokalne URL dopuszczają dosłowne `127.0.0.1` lub `[::1]` z `/v1`; `localhost`, zdalne hosty, przekierowania i URL z credentialami są odrzucane. Szczegóły: [adaptery lokalne](../local-model.md), [adaptery chmurowe](../cloud-models.md).

## Wybór lub utworzenie aktywnego Knowledge Pack

Knowledge Pack to lokalny katalog architektury: systemy, aktorzy, relacje, aliasy i reguły. Grounding dopasowuje nazwy kanoniczne i aliasy do tego katalogu przed generowaniem przez model.

Otwórz **Configuration → Knowledge Management** (ukryty identyfikator zgodności **Configure Knowledge Pack** otwiera tę samą zakładkę). Sprawdź projekt, aktywną ścieżkę, zapisany zakres, źródło efektywnej konfiguracji, walidację loadera i rzeczywiste liczby wierszy. W multi-root najpierw jawnie wybierz projekt. **Choose Existing Knowledge Pack** otwiera natywny picker folderu i waliduje pięć tabel przed aktywacją przez UX3. **Validate / Refresh** ponownie czyta pack; **Open systems.md** i cztery pozostałe przyciski otwierają pliki. Jeden projekt zapisuje WorkspaceFolder; bez workspace używany jest User/Global. Cancel zachowuje ustawienie. Aktywny jest jeden pack dla wybranego zakresu.

**Create Knowledge Pack** wybiera istniejący folder nadrzędny natywnym pickerem, pyta o jedną nazwę folderu i rzeczywisty system (ID, nazwa, kind, opis), następnie tworzy pięć tabel bez wymyślonych relacji. UX3 nadal obsługuje nowy lub istniejący pusty cel i odrzuca niepuste foldery. Builder dokumentów wymaga nowego folderu. Onboarding pierwszego **Create Diagram** zachowuje natywne Create/Choose/Cancel i edytowalny bezwzględny domyślny cel; nie używa modelu.

Dla małego katalogu demonstracyjnego utwórz Alpha jako `service`, następnie dodaj Beta jako `database` i relację zgodnie z [formatem pięciu tabel](../knowledge-pack-format.md). Wymaga to świadomej edycji plików i ponownej walidacji; Builder dokumentów nie aktualizuje tego packa. Relacja może mieć `interface_type` `DB`, `interface_name` `Writer` i `mode` `synchronous`.


### Kompletny syntetyczny pack z pięciu plików

Utwórz te pięć plików UTF-8 w jednym folderze i wybierz go przez Configuration → Knowledge Management → Choose Existing Knowledge Pack. To ręczny przykład, nie wynik Buildera z provenance.

`systems.md`:

```markdown
| id | canonical_name | kind | description |
| --- | --- | --- | --- |
| a | Alpha | service | Synthetic service |
| b | Beta | database | Synthetic store |
```

`actors.md`:

```markdown
| id | canonical_name | kind | description |
| --- | --- | --- | --- |
```

`relationships.md`:

```markdown
| from_id | to_id | interface_type | interface_name | mode | purpose |
| --- | --- | --- | --- | --- | --- |
| a | b | DB | Writer | synchronous | Store |
```

`aliases.md`:

```markdown
| alias | target_id |
| --- | --- |
```

`rules.md`:

```markdown
| rule | from_id | to_id | reason |
| --- | --- | --- | --- |
```

## Lokalna konwersja dokumentów i OCR

Full kieruje widoczne kształty wektorowe bez warstwy tekstowej do lokalnego OCR w Auto i all; mogą to być litery albo ilustracja. Raport odróżnia obrazy rastrowe (`imageCount`), wynik OCR (`ocrText`: recognized/empty) i biały render (`blankAssessment`: rendered-white). Pusty wynik OCR nie oznacza pustej strony. `blank` opisuje biały render przy użytej rozdzielczości, nie dowód braku wszelkiej treści; porównaj pokrycie z oryginałem. Core zgłasza strony bez dostępnego tekstu jako wymagające OCR.

Uruchom **Archi: Convert to Markdown**, wybierz jeden lokalny plik `.pdf`, `.docx` lub `.xlsx` i obejrzyj niezapisany Markdown. Dla PDF wybierz **No OCR**, **Auto OCR** lub, w Full, **OCR all pages**. Auto zachowuje strony tekstowe i wykonuje OCR stron bez użytecznego tekstu. W Full modele OCR PL/EN są w paczce i działają offline; polecenie nie wysyła żądań do dostawcy i nie potrzebuje Knowledge Pack. Aby zachować Markdown, użyj zwykłego Save edytora. Sprawdź błędy OCR przed wykorzystaniem tekstu jako evidence. Konwersja nie tworzy packa ani diagramu.

## Dokumenty → nowy pack

1. Uruchom **Build Knowledge Pack from Documents** z palety lub przyciskiem **Build Knowledge Pack from Documents** w **Configuration → Knowledge Management**. Wybierz jawnie lokalne pliki `.md`, `.txt`, `.pdf`, `.docx`, `.xlsx`. Nie ma skanowania katalogu ani pobierania URL. Istniejący pack nie jest wymagany.
2. Dla PDF picker Buildera **PDF OCR mode** używa **none**, **auto**, **all**. `auto` zachowuje strony tekstowe i rozpoznaje strony bez tekstu; `all` rozpoznaje wszystkie; `none` wymaga użytecznego tekstu. Osobne **Convert to Markdown** nazywa te opcje **No OCR**, **Auto OCR**, **OCR all pages** i otwiera jeden niezapisany edytor Markdown. Nie potrzebuje providera ani packa i nie wysyła żądania sieciowego.
3. Lokalne przetwarzanie przechwytuje dokładne bajty w limitach, oblicza hashe, konwertuje prywatne kopie i zamraża znormalizowany tekst. Review nie czyta ponownie oryginałów. Przechwycenie nie jest atomowym snapshotem pliku zmienianego równocześnie. Przygotuj stabilne dokumenty. Wybór brakującego modelu następuje po walidacji wejścia; progress obsługuje Cancel. Poprawna ekstrakcja wysyła jedno żądanie generacyjne StructuredChatClient z ograniczonym tekstem dokumentów, a następnie lokalnie sprawdza propozycje/dowody.
4. Powiązany panel **Knowledge Pack Review** pokazuje propozycje, problemy walidacji, ograniczenia źródeł i OCR. Rozwiń **Evidence, references and original proposal** przy wierszu. `pending` oznacza brak decyzji; `accepted` — Twoją decyzję włączenia; `rejected` — wykluczenie. `explicit` i `inferred` opisują oryginalną propozycję; inferred wymaga uzasadnienia. Evidence to dosłowny cytat z tożsamością źródła, hashami oryginału/tekstu oraz offsetami/liniami w znormalizowanym tekście. Poprawne pozycje i prawdziwy cytat nie dowodzą interpretacji architektury. Pewność OCR jest niedostępna; pokrycie pozostaje częściowe.
5. **Accept selected**, **Reject selected**, **Return selected to pending** obsługują grupy; dostępne są też **Accept all pending** / **Reject remaining pending**. Sprawdź dowody przed akceptacją. Rozwiń **Edit proposed row**, zmień pola i wybierz **Apply row edit**; referencje wybierasz z encji. Nie dodaje propozycji ani nie zmienia ID, dowodów, basis i reasoning. Edytowany wiersz zachowuje oryginalny dowód i znacznik `editedByUser`; cytat nie jest przedstawiany jako dosłowne źródło Twojej zmiany. Niezastosowana edycja wiersza nie zmienia sesji.
6. **Validate and preview** blokuje zapis, gdy wiersz jest pending, zaakceptowana relacja/alias/reguła nie ma zaakceptowanych końców, pozostają konflikty, aliasy kolidują lub zbiór nie ma systemu. Zależności nie są akceptowane automatycznie. Zmień decyzje/pola i waliduj ponownie. Każda zmiana unieważnia poprzedni niezmienny preview.
7. Wybierz istniejący folder nadrzędny i jedną **nową nazwę folderu packa**. Rozwiń pięć podglądów tylko do odczytu na tym samym ekranie: `systems.md`, `actors.md`, `relationships.md`, `aliases.md`, `rules.md`. Zamrożony podgląd to dokładna treść zapisu.
8. **Save** tworzy nowy pack i zachowuje aktywne ustawienie. **Save and use** najpierw zapisuje/wczytuje, potem aktywuje w wybranym scope UX3 (Global bez projektu). **saved, not activated** oznacza zachowane poprawne pliki przy błędzie konfiguracji; wybierz je później przez Choose Existing Knowledge Pack. Decyzje pozostają nad podglądami; **Cancel** lub zamknięcie panelu kończy przed zapisem. Po kolizji **Choose new pack folder** wybiera inny nowy cel bez ekstrakcji.

W jednym Extension Host działa jeden build. Cancel lub zamknięcie panelu review kończy build; ukończony zapis zwalnia blokadę builda. Nie ma trwałych draftów, autosave, aktualizacji/scalania packów ani historii akceptacji. Nowe polecenie to nowa ekstrakcja. Review/edycja/walidacja/preview/zapis/aktywacja używają **zera dodatkowych żądań LLM**, również po kolizji zapisu i powrocie do review.

Limity Buildera są mniejsze niż samodzielnej konwersji:

| Granica | Builder | Samodzielna konwersja |
| --- | --- | --- |
| Pliki/wejście | 8; po 10 MiB, łącznie 20 MiB | jeden; 50 MiB |
| Tekst/wyjście | 64 KiB UTF-8 na źródło; serializowany bundle 160 KiB | 8 MiB Markdown |
| Żądanie/kandydaci | 256 KiB gotowego żądania; 128 kandydatów, 32 aliasy, 64 relacje | bez LLM |
| Deadline pracy | 360 sekund; generowanie 120 sekund ograniczone pozostałym czasem | 120 sekund bez OCR; deadline OCR 300 sekund |

Obie ścieżki zachowują limity: 300 stron PDF, 20 stron OCR, 10 MP renderowanego canvas, 16 MP osadzonego obrazu; ZIP Office 1000 wpisów, 100 MiB po rozpakowaniu łącznie, 25 MiB na wpis, proporcja 100:1; XLSX 40 arkuszy, 20000 wierszy, 150 kolumn, 250000 komórek. PDF traci układ/strukturę tabel; DOCX pomija obrazy/zasoby zewnętrzne, złożony układ może stracić wierność; XLSX bierze zapisane wyniki formuł, bez przeliczania. DOC/XLS są nieobsługiwane. Full zawiera lokalne modele OCR PL/EN; Core zgłasza strony wymagające OCR. Cancel/błąd nie zwraca częściowej konwersji ani kandydatów. Zamykanie workerów/cleanup może wykroczyć poza deadline pracy. Zobacz [pełne limity ekstrakcji](../document-candidates.md#limits-and-cancellation).

## Aktywny plik i Knowledge Browser

**Archi: Build Knowledge Pack from Active File** przechwytuje niezapisany Markdown/TXT (także untitled) przed ekstrakcją. Nie zapisuje edytora. Lokalny podgląd PDF/DOCX/XLSX musi udostępniać URI pliku; w przeciwnym razie wybierz obsługiwane źródło jawnie. Dalej dostępne są te same evidence, pięć podglądów, Save oraz Save and use.

**Archi: Knowledge Browser** otwiera **Archi Agent — Knowledge** w Explorerze. Rozwiń projekt i aktywny pack, potem Systems, Relations, Rules, Sources/Evidence (jeśli dostępne) lub Files. System pokazuje aliasy i odwołania do relacji przychodzących/wychodzących. Rekord otwiera plik packa na właściwej linii; evidence bez lokalizacji oryginału otwiera lokalne szczegóły. Refresh i zapis plików odczytują walidację produkcyjną; błędna wiedza nie pozostaje aktualnym widokiem.

W Configuration opis profilu i przyciski kluczy reagują na wybór formularza. Natywny input wskazuje profil docelowy i pozostaje z nim związany po zmianie wyboru. Effective configuration pokazuje zastosowane ustawienia do udanego Apply. Zmiana profilu czyści model formularza. Discard przywraca zapisane ustawienia. Progress ekstrakcji wskazuje odczyt/konwersję/wybór providera/generację/walidację, z Cancel. Generacja K2 ma limit 120 s albo krótszy timeout providera; po timeout wybierz szybszy model lub mniejsze wejście. Brak automatycznych retry.


Drzewo zawiera także **Actors**. Po zewnętrznej edycji plików użyj **Refresh Knowledge** w tytule drzewa. Zapis pliku packa w VS Code, zmiana aktywnej ścieżki lub folderów workspace automatycznie odświeża widok. Evidence z aktywnego edytora otwiera go tylko przy zgodności digestu znormalizowanego tekstu z przechwyconym wejściem; w przeciwnym razie pokazuje zamrożone szczegóły. To przeglądarka tylko do odczytu, nie edytor wiedzy ani katalog packów.

## Generowanie i odczyt diagramu

Wybierz **Create Diagram → Sequence** (kolejność interakcji) albo **Component** (komponenty i zależności). Wybierz aktywny dokument, **Choose a flow file** albo wpisz opis. Plik wymaga ograniczonego front matter; dla opisu metadane zbiera UI. W obu językach użyj tego samego syntetycznego pliku:

```markdown
---
diagram_name: synthetic-art1
flow_name: Synthetic ART1
author: Test
language: en
---
Alpha stores data in Beta.
```

Rozstrzygnij niejednoznaczności, wskazując właściwy element. Nieznany zwykły tekst nie tworzy nowego elementu; wpisz jawnie `[NEW: Name]` i potwierdź. Alias nie ustanawia relacji. Relacje źródłowe i podane w przepływie pozostają rozróżnialne; brak relacji w źródle nie dowodzi jej nieistnienia. Lokalne zakazy nadal blokują generowanie.

Reviewed Sequence obsługuje jawnie potwierdzonego uczestnika `[NEW: Name]`. Jest oznaczony `[NEW]`, ma pochodzenie `user-confirmed`, a interakcje pozostają faktami z opisu użytkownika wymagającymi review. Nie jest zapisywany do źródła architektury. Odrzucenie lub anulowanie potwierdzenia blokuje generowanie; model nie może sam dodać uczestnika.

Błąd wejścia/groundingu daje zero żądań generacyjnych; odrzucenie generatora/lokalnej walidacji — jedno; poprawny lokalnie kandydat uruchamia osobne żądanie reviewera, łącznie dwa. Generator i reviewer używają tego samego profilu/modelu, osobnych żądań i tego samego zamrożonego snapshotu. Bez retry, repair, fallbacku i trzeciego wywołania. Zweryfikowany sukces otwiera obok siebie niezapisany PlantUML i powiązany raport groundingu JSON. Sprawdź fakty, klasy dowodów, linie źródeł, ostrzeżenia, walidację deterministyczną, verdict semantyczny i digest snapshotu. Edytor zawiera tekst PlantUML; graficzny podgląd wymaga osobnej obsługi PlantUML. Lokalna walidacja podzbioru nie jest gwarancją renderowania oficjalnym silnikiem PlantUML.

Gdy review odrzuci wynik/nie powiedzie się po lokalnych kontrolach, **Show unverified candidate** może otworzyć oznaczony kandydat bez raportu; Cancel niczego nie otwiera. Nie jest to ukończony wynik ART1. Anulowanie przez użytkownika nie proponuje kandydata. Stary identyfikator `archiAgent.generateSequenceDiagram` jest niewidocznym delegatem **Create Diagram**. Starsze API runtime z jednym wywołaniem pozostaje wewnętrzną ścieżką zgodności, bez osobnego wejścia użytkownika ani fallbacku.

## Zapis oryginalnego diagramu i raportu

Użyj **Save Diagram and Report** w powiadomieniu generacji, **Archi: Save Diagram and Report** w palecie albo menu Open. Menu/paleta wybiera oryginalny wynik według typu, czasu utworzenia UTC i UUID wyniku. Jeden lokalny projekt jest celem; multi-root wymaga jawnego wyboru projektu docelowego. Bez projektu otwórz najpierw lokalny folder. W modalu potwierdź oryginalny wynik, pełny nowy folder, `diagram.puml` i `report.json`. Cancel przed zapisem niczego nie tworzy.

```text
<project>/archi-agent-results/<UTC-time>-<bundle-UUID>/
  diagram.puml
  report.json
```

ART1 przechwytuje zamrożony wynik udanej generacji: oryginalny PlantUML (z końcowym LF), powiązany raport, metadane źródeł/snapshotu i bezpiecznej konfiguracji. Edycja bufora, późniejsze ustawienia/zmiana packa czy inna generacja nie zastępują tej pary. Edytowany bufor zapisz osobno zwykłym Save edytora; to nie jest oryginalna para ART1. ART1 nie wysyła **nowego żądania LLM, listy, diagnostyki, konwersji, credentiali ani odświeżania źródeł** i nie zmienia ustawień.

`report.json` to envelope v1 `archi-agent-artifact`. `generationReport` zachowuje kontrakt raportu generacji. `diagram.sha256` i `byteLength` opisują dokładne bajty UTF-8 diagramu, z białymi znakami i newline. Digesty wiedzy/snapshotu identyfikują kanoniczne wejścia semantyczne; digesty oryginału/tekstu — przechwycone bajty dokumentu/tekst po normalizacji; digest konfiguracji dotyczy deterministycznej bezpiecznej projekcji, bez credentiali i możliwości pełnego odtworzenia konfiguracji. Hashe identyfikują treść, nie jej autentyczność ani jakość modelu. Brakujące hashe bajtów źródła/wersja runtime mają `null`, nie są odtwarzane później.

Źródła wewnątrz projektu docelowego mają referencje względne, gdzie to możliwe; zewnętrzne — logiczne nazwy plików oznaczone `logical-name-only`. Przepływ z pamięci ma `in-memory-input`. Dokumenty i pełne snapshoty nie są kopiowane. Fakty raportu zachowują dostępne dowody i ostrzeżenia. **Open Diagram** / **Open Report** otwierają zapisane pliki po sukcesie. Błąd otwarcia nie usuwa zapisanej pary; otwórz ją ręcznie.

Lista menu/palety przechowuje wyniki w bieżącym Extension Host, gdy co najmniej jeden powiązany podgląd pozostaje otwarty. Zamknięcie diagramu i raportu usuwa wpis z tej listy; zamknięcie jednego go zachowuje. Nadal oczekujące powiadomienie generacji może zachować własny oryginalny wynik i wywołać Save Diagram and Report bezpośrednio, nawet po zamknięciu obu podglądów. Zmiana języka edytora nie jest rzeczywistym zamknięciem. Restart/reload usuwa wyniki z pamięci i oczekujące powiadomienia; zapisane pliki ich nie importują. Ponowny jawny zapis tworzy nowy UUID bundle dla tego samego oryginalnego wyniku. Nie ma trwałej historii.

## Błędy zapisu i rozwiązywanie problemów

### Objaw → przyczyna → działanie

| Objaw | Prawdopodobna przyczyna | Działanie użytkownika |
| --- | --- | --- |
| Available models jest puste | Brak odświeżenia, pusta odpowiedź albo błąd listowania | Przeczytaj status listy; uruchom serwer/model lokalny lub sprawdź klucz chmurowy, następnie jawnie Refresh Models. Sam HTTP 200 nie dowodzi poprawnej listy. |
| Wybór modelu znika po Discard/reload | Wybór był tylko draftem | Wybierz ID ponownie i Apply; otwórz Configuration i sprawdź Effective configuration. |
| Check jest zablokowany | Niezastosowane pola providera | Apply zapisuje zmiany; Discard Changes pozwala sprawdzić zapisany stan. Refresh Models może czytać draft. |
| Apply zgłasza zmianę ustawień | Projekt/ustawienia zmieniły się podczas edycji | Discard Changes, sprawdź projekt i zastosowane wartości, wpisz zmiany ponownie i Apply. |
| Klucz obecny, lecz błąd uwierzytelnienia | Obecność klucza nie dowodzi poprawności/uprawnień | Set / Replace Key dla widocznego profilu; sprawdź dostęp w konsoli providera, Apply właściwy profil/model i ponów Check. |
| Knowledge Browser pokazuje brak packa/błąd | Brak ścieżki albo odrzucone tabele w zakresie projektu | Configuration → Knowledge Management: wybierz projekt, Validate / Refresh, napraw pięć tabel albo wybierz poprawny pack; odśwież drzewo. |
| Build from Active File odrzuca kartę | Nieobsługiwany format, zdalne URI albo podgląd bez lokalnego URI pliku | Aktywuj edytor Markdown/TXT, także untitled, albo wybierz plik binarny przez Build Knowledge Pack from Documents. |
| PDF zgłasza brak tekstu/limit OCR | Skan w No OCR albo ponad 20 stron OCR | Wybierz Auto OCR lub OCR all pages dla małego skanu; większy dokument podziel przed ponowieniem. |
| Timeout ekstrakcji | Model przekroczył 120 sekund albo krótszy timeout providera | Wybierz szybszy model lub zmniejsz wejście. Timeout providera powyżej 120 nie podnosi limitu ekstrakcji. |
| Evidence-location mismatch albo błędny wiersz modelu | Propozycja nie przeszła deterministycznych kontroli | Sprawdź bezpieczny kod błędu; wybierz model przestrzegający formatu i evidence slices, uruchom operację jawnie ponownie. Walidacja nie jest omijana. |
| Cancel trwa dłużej | Kończy się zamykanie workera lub cleanup własnych plików tymczasowych | Poczekaj na zakończenie; częściowa konwersja/kandydaci nie są zwracani. |

| Sytuacja | Działanie |
| --- | --- |
| Cel Buildera istnieje, nawet pusty | zachowaj go; wróć przez review/wybór miejsca i wybierz nowy folder; bez ponownej ekstrakcji |
| Cel ART1 istnieje | ponów Save, aby uzyskać nowy bundle; bez nadpisywania/scalania |
| Symlink, brak folderu nadrzędnego, rodzic nie jest katalogiem lub błąd containment | najpierw popraw wskazany lokalny projekt/ścieżkę; nowy bundle nie naprawi ścieżki |
| Cancel podczas zapisu lub błąd zapisu/weryfikacji | poczekaj na cleanup; obejrzyj wskazaną lokalizację, jeśli cleanup jest niepełny |
| Zachowana cudza edycja/podmiana/nieudowodniony częściowy zapis | zachowaj edycje, sprawdź dane, przenieś zachowane pliki lub wybierz inne miejsce przed ponowieniem |
| Pack zapisany, aktywacja nieudana | zachowaj pliki, sprawdź ustawienia i aktywuj przez Choose Existing Knowledge Pack |
| Brak modelu/klucza/połączenia lub błąd strukturalnej odpowiedzi | użyj Configuration i Check Provider Configuration; popraw konfigurację i jawnie uruchom nową operację |
| Pending/brak zależności/konflikt | sprawdź problemy, rozstrzygnij wiersze, zaakceptuj wymagane encje lub odrzuć zależne wiersze; waliduj ponownie |
| Brak ukończonego wyniku | pozostaw otwarte podglądy albo uruchom nową udaną generację; edytowane niezapisane pliki same nie są wynikami ART1 |

Sukces następuje po sprawdzeniu dokładnych bajtów/wczytania/własności i finalnej kontroli anulowania. Pliki mogą być widoczne stopniowo. To kontrolowane operacje z warunkowym rollbackiem, **nie atomowa publikacja katalogu ani dwóch plików**. Cleanup usuwa tylko zasoby o potwierdzonej własności i niezmienionej treści; niepewne dane zachowuje. Nie ma crash recovery ani gwarancji trwałości fsync; przenośne sprawdzanie ścieżek nie eliminuje wrogich wyścigów między syscallami. Cancel po sukcesie nie cofa danych. Pliki packa i ustawienia VS Code są osobnymi operacjami.

Na macOS natywny picker może zwrócić `/tmp` zamiast `/private/tmp`. Kontrolowany zapis packa odrzuca symboliczną ścieżkę. Wybierz zwykły katalog nadrzędny poza tym aliasem (np. lokalny folder projektu); nie omijaj kontroli ścieżki.

## Screenshoty, Help i licencja

**Archi: Help** otwiera tę instrukcję z zainstalowanej paczki. Przełącznik **English / Polski** i screenshoty są w VSIX i działają offline. Dodatkowe linki do repozytorium, wydań i dokumentacji technicznej potrzebują sieci. [Galeria aktualnych ekranów PL/EN](../assets/screenshots/README.md) podaje czynności i pochodzenie. Syntetyczne odpowiedzi pokazują UI, nie jakość żywego modelu ani wynik owner smoke.

Własny kod: [MIT](../../LICENSE). Składniki: [notices](../../vscode-extension/THIRD_PARTY_NOTICES.md) i notices OCR. Ograniczenia, otwarte ustalenia i stan weryfikacji: [roadmapa](../product-roadmap.md), [stan techniczny](../project-state.md). Widoki oprogramowania i enterprise, tworzenie/aktualizacja katalogów oraz MCP są w alpha.8.

## Lokalne źródło Structurizr — SRC1

To źródło jest dostępne w DEMO1.
Skonfiguruj lokalny workspace JSON i nakładkę Knowledge Pack z trzech plików w ustawieniach
User lub projektu VS Code. Configuration → Knowledge Management pokazuje walidację i pominięcia.
Source Settings otwiera User JSON; dla projektu użyj `.vscode/settings.json`.

```json
{"archiAgent.architectureSource":{"kind":"structurizr-json","sourceId":"big-bank","modelPath":"/project/architecture/workspace.json","overlayPath":"/project/architecture/overlay"}}
```

Nakładka zawiera aliases.md, rules.md i relationships.md. Metadane relacji wiążą oryginalne
ID relacji i oczekiwane from_id/to_id. interface_type jest jawne. interactionStyle modelu
wyznacza mode; przy jego braku tryb musi podać nakładka. Konflikt blokuje generowanie.
Nazwy kontenerów mają format `System / Container`; oryginalne ID pozostają stabilne po zmianie nazwy.
Komponenty źródłowe i deployment są pomijane; obsługiwane są wynikowe diagramy Sequence, Component, C4 Context i C4 Container.
Każda operacja odczytuje źródła ponownie. Zapis wyniku zachowuje jego oryginalny snapshot.

Ustaw `archiAgent.architectureSource` na null, aby wrócić do knowledgePackPath. K3 Save and use
robi to automatycznie w wybranym zakresie; tworzy samodzielny pack, nie nakładkę.

## Aktualizacja katalogu enterprise i mapa wsparcia aplikacyjnego

Wybierz **Archi: Update Enterprise Catalog** (także w **Archi: Open**) i wskaż czysty lokalny katalog
JSON. Komenda zamraża bazę. Nowe informacje mogą pochodzić z przechwyconego zaznaczenia/dokumentu,
wpisanego opisu lub wybranych obsługiwanych plików lokalnych. Podgląd EAK1 pokazuje dokładnie wybrane
materiały i limit jednego wywołania ekstrakcji. Cały katalog/workspace nie trafia do modelu. Używane
są dotychczasowe ustawienia providera/modelu i bezpieczne credentiale.

Każdą propozycję przypisz jawnie do konkretnego istniejącego ID, utwórz nową zdolność albo odrzuć.
Zgodna nazwa jest sugestią. **Przejrzyj różnice i decyzje** otwiera przed/po oraz oryginalne dowody
i decyzje; wybierz operację i zaakceptuj/odrzuć. Możesz proponować zmianę nazwy, opisu, rodzica
i jawnej oceny, również ocenę nieznaną. Pominięte zdolności pozostają. Usunięcia pokazują dzieci
i odwołania wsparcia; blokada trwa do osobnego przeniesienia lub usunięcia zależności. Sprzeczności,
cykle, błędne poziomy/ID i nierozstrzygnięte decyzje blokują zapis.

Aby wprowadzić wsparcie, zaproponuj **Dodaj aplikację** ze stabilnym ID/nazwą i zaakceptuj w przeglądzie.
Wybierz **Dodaj jawne powiązanie aplikacji i zdolności**, wskaż aplikację i zdolność, a następnie osobno
zatwierdź relację. Aplikacja i zdolność mają odrębne tożsamości. Ręczna edycja JSON nie jest wymagana.
Jawne dodanie aplikacji rozszerza przeglądany katalog do enterprise/2; aktualizacja samych zdolności
zachowuje v1. Aktualizacja zachowuje istniejące aplikacje, relacje, oceny i pochodzenie niezmienionych pól.

**Zatwierdź i zapisz katalog** używa natywnego zapisu edytora. Dirty buffer, inna wersja dokumentu
lub bajty dysku zatrzymują operację; rozwiąż zmiany i rozpocznij nową sesję. Raport przeglądu pozostaje
w `enterprise-updates/<sessionId>/<revision>/enterprise.review.json`; zachowaj go razem z katalogiem.
Sam raport nie oznacza zapisanego katalogu. Dopiero produkcyjny odczyt i walidacja potwierdzają
`saved`. Cudze edycje nie są cofane. Bez automatycznego merge, transakcji i crash recovery.

Wybierz **Create Diagram → Enterprise Architecture → Capability–Application Map** i rozszerzony
lokalny katalog, przechwycony aktywny JSON albo skonfigurowane źródło enterprise MCP. Wskaż całą mapę
lub zdolność/domenę. Provider nie jest potrzebny: renderowanie ma **0 wywołań modelu**. Pokazywane
są wyłącznie jawne bezpośrednie powiązania; rodzic nie dziedziczy relacji dzieci. Brak relacji oznacza
brak udokumentowanego wsparcia, nie brak systemu. Wiele relacji nie dowodzi redundancji. Pokrycie
częściowe pozostaje częściowe. Raport zawiera zakres, dowody, pominięcia i digesty. Po przekroczeniu
120 węzłów lub 240 relacji zawęź widok; dane nie są obcinane. **Save Diagram and Report** zapisuje
oryginalną parę ART1.

Wypróbuj `examples/retail-checkout/architecture/enterprise-applications.json`: jedna aplikacja wspiera
kilka zdolności, płatności mają kilka aplikacji, inne zdolności mają nieznane wsparcie, a Back Office
nie ma powiązań. Zmień nazwę zdolności przez aktualizację/przegląd; jej ID i relacje pozostają.
Katalogi v1 i Capability Map nadal działają. Enterprise MCP v1 pozostaje bez zmian; EA2 jawnie wybiera
`get_enterprise_snapshot_v2` / contractVersion 2 bez fallbacku. Dla Capability Map ze zdalnego katalogu
v2 ustaw `enterpriseSource.contractVersion:2`. Zobacz [kontrakt enterprise](../enterprise-catalog.md)
i [CLI/MCP](cli-mcp.md).

## Value Stream i Application Landscape

Otwórz `architecture/enterprise-views.json` w demo Retail i uruchom **Archi: Create Diagram → Enterprise Architecture**.
Wybierz **Value Stream** dla drogi od potrzeby zakupowej do otrzymania zamówienia lub **Application Landscape**
dla portfela aplikacji. Wybierz aktywny dokument (przechwycony także z niezapisanymi zmianami) albo ten sam plik
lokalny. Te widoki nie potrzebują modelu/providera i mają zero wywołań LLM. Obsługują też jawnie wersjonowane
źródło enterprise MCP. Raport towarzyszy edytowalnemu PlantUML; podgląd graficzny wymaga osobnego renderera.

Dla Value Stream wybierz strumień i etapy. Widok zachowuje jawną kolejność i pierwotne numery etapów;
wspólne powiązania ze zdolnościami są jawne. Kontekst, rezultaty, dowody, deklarowane pokrycie i pominięcia
pozostają w raporcie. Częściowe źródło nie dowodzi, że firma nie ma danej zdolności.
Dla Landscape wybierz cały portfel albo domenę biznesową oraz opcjonalną zdefiniowaną skalę ocen.
Aplikacje bez domeny pozostają widoczne w całym portfelu. Brak właściciela, cyklu życia lub oceny oznacza
nieznane dane; zero ma znaczenie nadane przez jawną skalę. Wiele aplikacji nie dowodzi redundancji.
Po przekroczeniu limitu wybierz mniej etapów, domen lub aplikacji; wynik nie jest obcinany.

Własne dane utworzysz przez **Archi: Build Enterprise Catalog**: przejrzyj propozycję zdolności i zapisz katalog.
Następnie **Archi: Update Enterprise Catalog** oferuje **Dodaj / zmień domenę biznesową**, **Dodaj / zmień
strumień i jawną kolejność etapów**, **Zmień aplikację, właściciela, cykl życia lub ocenę** oraz **Zdefiniuj jawną
skalę ocen**. To prowadzone formularze; edycja JSON jest opcjonalna. Zachowuj ID przy zmianie nazwy,
wybieraj jawne powiązania zdolności i potwierdź kolejność etapów. Zmieniając strumień, zachowaj istniejące ID
etapów i podaj docelową uporządkowaną listę; pominięte etapy zobaczysz w różnicach przed akceptacją.

**Propozycje Value Stream / Landscape z materiałów** reużywa zaznaczenie, przechwycony cały dokument,
wpisany opis lub wybrane pliki, ograniczoną konwersję, konfigurację providera i jedno jawne wywołanie modelu.
Ekstrakcja wymaga dowodów dla każdego podanego pola; tryb propozycji zachowuje nieudowodnioną kolejność jako
propozycję. **Przejrzyj propozycję nowych widoków i wskaż ID** pokazuje pierwotne pochodzenie pól i dowody,
a prowadzone formularze pozwalają wskazać tożsamości i referencje. Przejrzyj różnice, jawnie zaakceptuj lub
odrzuć każdą zmianę, potwierdź ostrzeżenia i **Zatwierdź i zapisz katalog**. Akceptacja jest decyzją użytkownika,
a nie cytatem ze starego źródła. Usuwanie wymaga jawnego rozwiązania zależności. Konflikt zachowuje cudze
bajty na dysku; sprawdź bufor i rozpocznij nową sesję aktualizacji. Zachowuj raporty `enterprise-updates/`
razem z katalogiem. **Save Diagram and Report** zapisuje oryginalną parę ART1; edycja podglądu jej nie zmienia.

To prerelease z odroczonym odbiorem właściciela. Testy syntetyczne nie potwierdzają jakości żywego modelu
ani dodatkowych platform natywnych. Automatyzacja widocznego UI może być niedostępna; kontrole paczek,
runtime i Extension Host są raportowane oddzielnie. Historyczna obserwacja bezpiecznego konfliktu pozostaje otwarta.
