[English](START-HERE.en.md) · [Publiczne paczki](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1)

# Retail Checkout — zacznij tutaj

Gotowy syntetyczny model jest w `architecture/`. Pierwszy wynik uzyskasz przez **Verify Flow na PlantUML, bez LLM**. Nie budujesz wiedzy przed rozpoczęciem.

![Retail Checkout w zainstalowanym produkcie](assets/project.png)

![Architektura](assets/architecture.png)

## 1. Pobranie i instalacja

Pobierz [ZIP projektu](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-demo-retail-checkout-0.3.0-alpha.7-demo.1.zip) i rozpakuj do nowego lokalnego folderu. Obsługiwane są spacje i polskie znaki. Wymagany jest desktopowy VS Code **1.91+**. Wybierz [VSIX Core](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-core-0.3.0-alpha.7.vsix) do podstawowych ćwiczeń lub [VSIX Full](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/archi-agent-full-0.3.0-alpha.7.vsix) do opcjonalnego offline OCR PL/EN. Przed instalacją sprawdź `SHA256SUMS` wydania. Oba profile mają wspólny runtime.

**Extensions → … → Install from VSIX…**, włącz dokładnie jeden profil, potem **Developer: Reload Window**. Dotychczasowy użytkownik Full może pozostać przy Full. Przy zmianie profilu ustawienia są wspólne, ale klucze SecretStorage osobne dla ID rozszerzeń: wprowadź klucz ponownie. Użytkownik VSIX nie potrzebuje klonowania repo, npm, osobnego Node, Javy ani PlantUML. Produkt otwiera tekst diagramu; graficzny podgląd wymaga osobnego renderera.

## 2. Otwarcie gotowego źródła

**File → Open Folder**: wybierz rozpakowany folder `retail-checkout`. W terminalu VS Code w tym folderze uruchom:

- macOS/Linux: `sh ./setup.sh`
- Windows PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1`

Przeczytaj dołączony skrypt przed uruchomieniem. Setup tworzy tylko `.vscode/settings.json`, odmawia nadpisania istniejącego pliku i zapisuje rzeczywiste ścieżki absolutne. Nie rozwija `${workspaceFolder}`. Jeżeli VS Code pyta o Workspace Trust, zaufaj temu syntetycznemu projektowi.

Jeśli masz już ustawienia, zachowaj ich wpisy. W **Preferences: Open Workspace Settings (JSON)** dodaj obiekt poniżej. MODEL zastąp przez **Copy Path** z `architecture/workspace.json`, OVERLAY przez Copy Path z `architecture/overlay` w Explorerze. W JSON podwój znaki `\` ze ścieżek Windows.

```json
"archiAgent.architectureSource": {
  "kind": "structurizr-json",
  "sourceId": "retail-checkout",
  "modelPath": "MODEL",
  "overlayPath": "OVERLAY"
}
```

**Archi: Configuration → Knowledge Management**: oczekuj poprawnego Structurizr JSON, **1 aktora, 6 systemów, 6 relacji**, bez pominiętych komponentów. Systemy obejmują system nadrzędny i pięć kontenerów. **Archi: Knowledge Browser**: rozwiń źródło, systemy i relacje; sprawdź oryginalne ID i osobne pochodzenie pól JSON/nakładki. Provider nie jest potrzebny. Aliasy do podstawowych scenariuszy są już gotowe.

![Przykład bieżących kontrolek Configuration — DOC2, Big Bank](assets/20-configuration.png)

DOC2 pokazuje te same kontrolki i liczby Big Bank; pierwszy obraz powyżej pochodzi z tego projektu. [Pochodzenie DOC2](https://github.com/Setech-pl/archi-agent/blob/v0.3.0-alpha.7-demo.1/docs/assets/screenshots/README.md).

## 3. Pierwszy wynik bez modelu

Otwórz `inputs/pl/01-good.puml`, pozostaw cały dokument aktywny bez zaznaczenia. **Archi: Verify Flow (Sequence / prose) → Use active document**. Oczekiwany JSON: `report.execution = completed`, `report.assessment = conformant-within-scope`, `report.modelCalls = 0` i jeden zgodny krok. `evidence` zawiera rzeczywiste odwołania do źródeł i nakładki. To zgodność w załadowanym zakresie, nie dowód kompletnej poprawności architektury. W przykładach negatywnych anuluj picker nazw, aby zachować nierozstrzygnięte ustalenie.

Raport zapisz jawnie przez **File → Save As** pod nową nazwą w `reports/`. Weryfikacja nie używa ART1 i nie zapisuje raportów automatycznie.

## 4. Izolowane ćwiczenia weryfikacji

Wszystkie pliki są gotowe; odpowiedniki EN są w `inputs/en/`. Każdy błędny przykład zmienia jeden problem. Kontrakt maszynowy jest w `expected/verification.json`.

| Plik w inputs/pl/ | Oczekiwany wynik przed zapisem nowego aliasu |
| --- | --- |
| 01-good.puml | conformant-within-scope, sync, zero wywołań modelu |
| 02-direction.puml | discrepancies; direction-mismatch + relationship-not-in-model |
| 03-mode.puml | discrepancies; interaction-mode-conflict: async dla relacji sync |
| 04-unknown.puml | inconclusive / needs-resolution; unknown-element; anuluj mapowanie Unknown Gateway |
| 05-partial.puml | inconclusive; syntax-not-covered dla nieobsługiwanego autonumber; znany krok nadal oceniony |
| 06-alias-after-save.puml | początkowo unknown-element dla Magazynem; po ćwiczeniu 6 zgodność |
| 09-async-good.puml | conformant-within-scope dla znanej relacji asynchronicznej |

![Przykład Verify Flow — DOC2, Big Bank](assets/18-verify-flow.png)

Dokładna dołączona legenda określa znaczenie strzałek. Nie zmieniaj jej: sama strzałka nie dowodzi trybu ani odpowiedzi. Weryfikacja Component i C4 nie jest zaimplementowana. Brak relacji oznacza brak w załadowanym zakresie, nie dowód jej nieistnienia.

## 5. Własny model i cztery diagramy

**Archi: Configuration → LLM Provider**: wybierz **LM Studio** (`http://127.0.0.1:1234/v1`) albo **Ollama** (`http://127.0.0.1:11434/v1`), uruchom lokalny serwer z załadowanym modelem, wybierz profil, odśwież **Available models**, wybierz jeden **Selected model** i **Apply**. Model musi obsługiwać żądania strukturalnego JSON produktu. Dostępność, jakość i wymagania sprzętowe zależą od wybranego modelu.

Alternatywnie wybierz **Anthropic**, **OpenAI** lub **OpenRouter**, użyj **Set / Replace Key**, wybierz dostępny model i **Apply**. Klucz trafia do SecretStorage, nigdy do projektu. Cloud korzysta z Twojego konta i może być płatny. **Check Provider Configuration** sprawdza zastosowaną konfigurację. Edycje pozostają draftem do Apply; Discard przywraca stan zastosowany.

Otwórz `inputs/pl/08-generate.md`, **Archi: Create Diagram → Sequence → Use the active editor document**. Powtórz dla **Component**. Oczekuj uczestników/zależności z tego źródła oraz powiązanego raportu JSON. Dla **C4 Context** i **C4 Container** wybierz system **Retail Checkout**. Context pokazuje aktora i system; Container pięć kontenerów oraz otoczenie połączone relacjami źródłowymi. Udane generowanie to jeden plan i jeden review na tym samym snapshotcie. Brak retry/repair/fallbacku. Unverified lub failed nie jest zaliczonym wynikiem.

## 6. Proza, świadoma decyzja i trwały alias

Otwórz `inputs/pl/07-prose.txt`, Verify Flow, **Use active document → Prose (one interpretation request)**. Zamierzona interpretacja zachowuje dosłowne **Magazynem**. W pickerze świadomie wskaż **Retail Checkout / Inventory**, obejrzyj ID i provenance, potwierdź. Kontynuacja wykorzystuje tę samą interpretację, bez kolejnego żądania LLM. Oczekuj conformant-within-scope po mapowaniu. Żywy model może błędnie zinterpretować prozę: przed akceptacją sprawdź krok i dowody interpretacji.

W powiadomieniu wybierz **Save confirmed aliases**, obejrzyj proponowaną edycję `architecture/overlay/aliases.md` i zatwierdź natywne potwierdzenie zapisu. Dopiero wtedy alias jest trwały. Ponownie zweryfikuj `inputs/pl/06-alias-after-save.puml`: conformant-within-scope, zero LLM i bez pickera nazw. Samodzielne packi i MCP obsługują decyzje sesyjne, bez tego zapisu aliasów SRC1. `inputs/en/07-prose.txt` jest gotowym odpowiednikiem angielskim bez odmiany nazwy.

## 7. Oryginalna para diagram/raport ART1

Pozostaw otwarty podgląd poprawnie wygenerowanego diagramu i raport. **Archi: Save Diagram and Report**: wybierz oryginalny wynik według typu/czasu/UUID, zatwierdź natywny dialog miejsca docelowego. Powstaną `archi-agent-results/<UTC>-<UUID>/diagram.puml` i `report.json`. ART1 zachowuje oryginalną zamrożoną parę z provenance; edycja podglądu nie zmienia zapisywanych bajtów. Zapis nie wywołuje modelu. Zamknięcie obu podglądów usuwa wybór z pamięci sesji.

## Bezpieczne powtórzenie i własne dane

Zachowaj pobrany ZIP. Aby powtórzyć zapis aliasu od początku, rozpakuj drugą kopię i wykonaj setup; nie nadpisuj roboczej nakładki. Wyniki dostają nowe foldery UUID. Raporty zapisuj pod nowymi nazwami. Po przeniesieniu projektu utwórz ustawienia z nowymi ścieżkami, zachowując stary plik. Paczka nie zawiera ścieżek autora, kluczy ani prywatnych endpointów.

Podmień **kopię** `architecture/workspace.json` na własny Structurizr JSON, zachowaj stabilne oryginalne ID, dopasuj trzy tabele nakładki i source_id. Sprawdź Configuration przed użyciem. Obsługiwane są people, systems, containers i statyczne relacje; components/deployment/views poza projekcją. Brak DSL i bezpośredniego importu EA. Płaski pack Markdown nie zapewnia hierarchii C4. Sprawdź fakty przed wysłaniem wybranego minimalnego kontekstu do providera.

Owner smoke **DEFERRED**; żywy LLM i runtime Windows ARM64 podczas przygotowania **NOT_RUN**; AUD-003–006 **OPEN**. Transport syntetyczny dowodzi integracji, nie jakości żywego modelu. Natywne UI sprawdzane na macOS ARM64. Zapis nowych folderów jest kontrolowany, bez atomowej publikacji wielu plików/crash recovery. [Macierz funkcji i dowodów](https://github.com/Setech-pl/archi-agent/blob/v0.3.0-alpha.7-demo.1/docs/demo1-verification.md).

W każdym raporcie wspólne informacyjne `source-not-covered` opisuje sekcję views poza projekcją importu. Nie zmienia zgodnej oceny obsługiwanego kroku; tabela ćwiczeń wymienia dodatkowy izolowany problem.

## Mapa zdolności — tylko bieżący checkout i lokalny VSIX EA1

Powyższe opublikowane ZIP/VSIX nie zawierają EA1. Z nowym lokalnym kandydatem EA1 otwórz ten bieżący folder i wykonaj [tutorial mapy zdolności](../../docs/pl/capability-map.md). Wskaż `architecture/enterprise.json`; bez setup, źródła oprogramowania i providera. [Wyrenderowana mapa](assets/capability-map.png) · [PlantUML](assets/capability-map.puml).
