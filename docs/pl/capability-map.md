# Mapa zdolności biznesowych

[English](../en/capability-map.md) · [Instrukcja użytkownika](user-guide.md)

Użyj **VSIX Core lub Full alpha.8** i zgodnego ZIP Retail. Dołączony `architecture/enterprise.json` to minimalny przykład v1; `enterprise-views.json` obsługuje wszystkie cztery widoki. Włącz jeden profil i przeładuj VS Code.

## Opis firmy → przegląd katalogu → mapa

1. Uruchom **Archi: Build Business Capability Catalog / Utwórz katalog zdolności biznesowych** z palety poleceń lub menu Archi.
2. Wybierz **Wyodrębnij z materiałów**, aby uzyskać zdolności poparte materiałem, albo **Zaproponuj model firmy**, aby przygotować propozycję modelu biznesowego L1–L3. Przykład: „Jesteśmy producentem żywności i chemii domowej. Mamy trzy zakłady, sprzedaż przez sieci i dystrybutorów oraz własny sklep internetowy. Przygotuj propozycję mapy zdolności L1–L3”.
3. Wybierz przechwycone zaznaczenie, cały aktywny dokument (także dirty/untitled), wpisany opis lub wskazane lokalne dokumenty MD/TXT/PDF/DOCX/XLSX. Tekst edytora jest przechwytywany przed pierwszym pickerem; dowody zaznaczenia wskazują pozycje oryginalnego dokumentu i jego wersję/fingerprint. Pliki lokalne są zamrażane przed konwersją i dostępem do modelu. Odwołania dokumentów po konwersji wskazują tekst konwersji i ostrzeżenia konwertera/OCR, bez wymyślonych współrzędnych stron oryginału.
4. Przejrzyj otwarty podgląd materiałów i jawnie zatwierdź ich wysłanie. Tylko te materiały trafiają do skonfigurowanego providera/modelu. Obowiązują istniejąca konfiguracja i bezpieczny magazyn kluczy. Provider chmurowy wymaga osobnej autoryzacji tego potencjalnie płatnego wywołania.
5. Przejrzyj hierarchię, oryginalne propozycje i dowody. Zaznacz elementy do akceptacji, odrzucenia lub ponownego przeglądu; popraw nazwę, opis lub rodzica w edytorze wiersza. ID pozostają stabilne. Przed odrzuceniem rodzica jawnie odrzuć zachowane dzieci albo przenieś je do innego rodzica. Przejrzyj ostrzeżenia materiałów przed zapisem.
6. Nazwij katalog i określ jego zakres. Wybierz folder docelowy i **Zapisz nowy katalog**. Powstaną `enterprise.json` i `enterprise.review.json`; istniejące pliki blokują zapis. Produkcyjny odczyt weryfikuje zapisane bajty przed sukcesem. Aktualizacja/merge istniejącego katalogu nie jest obsługiwana.
7. Kliknij **Wygeneruj Capability Map**. Zapisany katalog trafia do istniejącej ścieżki deterministycznej, z **zerem dodatkowych wywołań modelu**. W dużym katalogu wybierz domenę/szczegółowość, jeśli widok przekracza 12 korzeni lub 120 kafli. ART1 pozwala zachować oryginał diagramu i raportu.

Model zwraca propozycje semantyczne, nigdy PlantUML. Każde pole odróżnia deklarowane poparcie materiałem od propozycji modelu; cytaty i pozycje sprawdzamy mechanicznie, a ich znaczenie wymaga Twojego przeglądu. Proponowana hierarchia pozostaje propozycją. Akceptacja i ręczna edycja to decyzje użytkownika; nie zmieniają materiału źródłowego w potwierdzenie nowej treści. Osobny raport zachowuje oryginały, dowody i decyzje; provenance katalogu wskazuje rzeczywistą sesję przeglądu i digest raportu. Oceny, właściciele i wsparcie aplikacji nie są zgadywane. Pokrycie pozostaje `partial`.

Jeden ograniczony bundle oznacza maksymalnie **jedno wywołanie ekstrakcji**, 16 384 tokeny wyjścia i 120 sekund łącznego czasu ekstrakcji (albo krótszy timeout providera). Limity: 8 dokumentów, 10 MiB każdy/20 MiB łącznie oryginalnych bajtów, 64 KiB tekstu na dokument, 160 KiB bundle, 256 KiB żądanie, 1 MiB odpowiedź i 1000 rekordów katalogu. Nadmiar materiału kończy się jawnym błędem: zawęź materiał i świadomie ponów operację. Bez cichego obcinania, nieograniczonego chunkingu, automatycznych retry, napraw i fallbacku. Ucięta odpowiedź, błędny schemat/dowody, timeout i anulowanie nie tworzą zapisanego katalogu. Core nie ma OCR; wybierz tekstowy tryb PDF albo Full dla obsługiwanego lokalnego OCR. Ostrzeżenia konwersji i częściowe pokrycie pozostają widoczne. Instrukcje w źródłach są danymi, nie poleceniami wykonania.

## Mapa z istniejącego katalogu lub aktywnego JSON

**Create Diagram** przechwytuje aktywny lokalny dokument tekstowy przed pierwszym pickerem diagramu. Wybierz **Aktywny dokument — także niezapisane zmiany**, aby użyć JSON, również dirty lub untitled. Późniejsze zmiany edytora nie podmieniają wejścia trwającej operacji. Jawne opcje lokalnego pliku i skonfigurowanego MCP pozostają dostępne. Aktywny dokument nie wymaga providera/modelu; błędny JSON nigdy nie uruchamia interpretacji modelem. Istniejący przepływ katalogu i opcjonalny zapis ART1 wymagają lokalnego folderu projektu.

Lokatory `editor-buffer:<name>` i hash UTF-8 dotyczą przechwyconego tekstu, nie bajtów z dysku. ART1 zapisuje `in-memory-input` i zachowuje przechwycony oryginał. Custom preview, diff i zdalne dokumenty nie podstawiają starego edytora. Funkcje są dostępne w alpha.8.

1. Otwórz bieżący folder `examples/retail-checkout` w VS Code. Ustawienia providera,
   modelu, klucza API i źródła architektury oprogramowania mogą pozostać puste.
   Ta mapa nie wymaga uruchamiania skryptu setup.
2. Uruchom **Archi: Create Diagram → Architektura korporacyjna → Mapa zdolności biznesowych**.
   W workspace multi-root wybierz projekt, następnie wskaż `architecture/enterprise.json`.
3. Wybierz **Cała mapa**, **L1–L3**, następnie **Dojrzałość**. Przykład zawiera trzy obszary L1,
   jedenaście zdolności i jawną deklarację częściowego pokrycia. Nazwy pozostają polskie;
   język UI steruje legendą.
4. Przeczytaj otwarte obok siebie PlantUML i raport JSON. Oczekiwane pola: `modelCalls: 0`,
   `generationPath: deterministic-catalog-projection`, semantic review `not-applicable`.
   Podgląd graficzny wymaga osobnego lokalnego renderera PlantUML; obraz poniżej jest już wyrenderowany.
5. Uruchom **Archi: Save Diagram and Report**, wybierz oryginalny wynik capability,
   wskaż projekt zapisu, jeżeli pojawi się pytanie, i potwierdź. Nowy folder
   `archi-agent-results/<czas-i-UUID>/` zawiera `diagram.puml` oraz `report.json`.
   Zapis zachowuje oryginał również po edycji podglądu. Cancel na etapie wyboru lub
   potwierdzenia nie tworzy częściowego wyniku na dysku.

![Zdolności biznesowe Retail](../../examples/retail-checkout/assets/capability-map.png)

[Referencyjny PlantUML](../../examples/retail-checkout/assets/capability-map.puml) ·
[Provenance renderu](../../examples/retail-checkout/assets/capability-map-provenance.json).

Zagnieżdżenie wyraża podział biznesowy: obszar L1, zdolność L2, szczegół L3. Kolory odpowiadają
wyłącznie jawnej skali i podpisom legendy. Szare **Brak danych** oznacza brak oceny, a nie zero.
Jawne zero jest poprawną oceną w tym przykładzie. Rodzice nie dziedziczą ocen dzieci;
wielkość kafla nie wyraża oceny. **Bez kolorowania ocen** świadomie ukrywa oceny w widoku.

Powtórz z **Sprzedaż** i **L1–L2**: raport rozróżni inne gałęzie poza zakresem i rekordy L3
poniżej wybranego poziomu. Pokrycie źródła pozostaje częściowe. To świadome pominięcia,
a nie brakujące rekordy źródła. Po przekroczeniu limitu wybierz gałąź lub mniejszą szczegółowość;
dane nie są obcinane po cichu. Jeśli katalog zmieni się podczas wyboru, powtórz Create Diagram.
Błędne dane otrzymują pole/kod/linię; popraw katalog bez zgadywania nazw lub rodziców przez model.

[Dokładny kontrakt pliku, limity i digesty](../enterprise-catalog.md).
CLI/MCP i źródło enterprise MCP są dostępne w alpha.8. Pełna konfiguracja i komendy są w [tutorialu CLI/MCP](cli-mcp.md#capability-map-bez-modelu). Po ustawieniu enterpriseSource wybierz skonfigurowane źródło MCP zamiast pliku; zakres/poziom/kolory i ART1 działają tak samo. Błędy zdalne pokazują kod i JSON Pointer bez fikcyjnych linii pliku. Wydanie dodaje kontrolowane aktualizacje katalogu i jawne wsparcie aplikacyjne; zobacz [aktualizację i powiązania aplikacji](user-guide.md#aktualizacja-katalogu-enterprise-i-mapa-wsparcia-aplikacyjnego). Value Stream i Application Landscape również są dostępne; zobacz aktualną instrukcję użytkownika.
