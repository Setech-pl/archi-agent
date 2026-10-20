# Mapa zdolności biznesowych — lokalny kandydat EA1b

[English](../en/capability-map.md) · [Instrukcja użytkownika](user-guide.md)

Użyj **nowego lokalnego VSIX EA1b Core lub Full**, wskazanego w lokalnym raporcie weryfikacji.
Opublikowane VSIX/ZIP DEMO1 nie zawierają tej funkcji. Użyj bieżącego checkoutu:
[folder Retail](../../examples/retail-checkout/START-HERE.pl.md) i
[enterprise.json](../../examples/retail-checkout/architecture/enterprise.json).
Nie zastępuj opublikowanych archiwów. Włącz jeden profil Core/Full i przeładuj VS Code.

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
CLI/MCP i źródło enterprise MCP są dostępne w lokalnym kandydacie EA1b. Pełna konfiguracja i komendy są w [tutorialu CLI/MCP](cli-mcp.md#capability-map-bez-modelu--lokalny-kandydat-ea1b). Po ustawieniu enterpriseSource wybierz skonfigurowane źródło MCP zamiast pliku; zakres/poziom/kolory i ART1 działają tak samo. Błędy zdalne pokazują kod i JSON Pointer bez fikcyjnych linii pliku. Powiązania z aplikacjami, strumienie wartości i krajobraz aplikacji pozostają przyszłymi etapami.
