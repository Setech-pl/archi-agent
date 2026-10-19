# DOC2 — aktualna galeria / current gallery

Sześć rzeczywistych ekranów Core 0.3.0-alpha.7, macOS ARM64, publiczny Structurizr Big Bank. Modele syntetyczne; rzeczywiste UI, SRC1, K1, generowanie, ART1 i VER1. / Six actual Core 0.3.0-alpha.7 screens, macOS ARM64, public Structurizr Big Bank. Synthetic models; real UI, SRC1, K1, generation, ART1 and VER1.

Pierwsze trzy ekrany pokazują osobny lokalny render oryginalnego zapisanego PlantUML (PlantUML 1.2026.6 / Smetana), otwarty jako PNG w VS Code (Sequence/Context obok raportu, Container na pełną szerokość). Archi Agent nie bundluje tego podglądu. / The first three screens show a separate local render of the original saved PlantUML (PlantUML 1.2026.6 / Smetana), opened as PNG in VS Code (Sequence/Context beside the report, Container at full width). Archi Agent does not bundle that preview.

Bez makiet, odrysowania, sekretów i danych klienta. Obrazy obejrzane; zachowano pełne okno własnego PID. / No mockups, redrawing, secrets or customer data. Images inspected; the entire owned PID window is retained.

[Commit, hash VSIX, czas, metoda i SHA-256 obrazów / capture provenance](provenance-doc2.json). Bieżący capture-5: PASS, sześć żądań (plan + review dla każdego diagramu), zero dla Verify Flow i konfiguracji/Browser. Wcześniejsze próby 1–3 zachowano lokalnie jako FAIL: dopasowanie etykiety, wysokość drzewa Browser, brak pierwszej klatki ScreenCaptureKit. Nie stanowią dowodów PASS. / Current capture-5: PASS, six requests (plan + review per diagram), zero for Verify Flow and Configuration/Browser. Earlier attempts 1–3 remain local FAIL evidence: label matching, Browser tree height, missing first ScreenCaptureKit frame.

## Sequence i raport / Sequence and report

![Sequence i raport / Sequence and report](15-sequence.png)

## C4 Context

![C4 Context](16-c4-context.png)

## C4 Container

![C4 Container](17-c4-container.png)

## Verify Flow: rozbieżności, bez LLM / discrepancies, no LLM

![Verify Flow: rozbieżności, bez LLM / discrepancies, no LLM](18-verify-flow.png)

## Knowledge Browser: zakres źródła / source scope

![Knowledge Browser: zakres źródła / source scope](19-knowledge-browser.png)

## Configuration: JSON + nakładka / JSON + overlay

![Configuration: JSON + nakładka / JSON + overlay](20-configuration.png)

---

# Historyczne ekrany alpha.6 / Historical alpha.6 screens

[README EN](../../../README.md) · [README PL](../../../README.pl.md) · [Help EN](../../en/user-guide.md) · [Help PL](../../pl/user-guide.md)

Rzeczywisty VS Code 1.141.0 na macOS 26.6.2 ARM64, izolowany profil i syntetyczny projekt Alpha/Beta. ScreenCaptureKit przechwytuje okno przypisane do PID. Transport modeli/listingu jest syntetyczny i lokalny; OCR wykonano rzeczywiście z zasobów VSIX. / Actual VS Code 1.141.0 on macOS 26.6.2 ARM64, isolated profile and synthetic Alpha/Beta project. ScreenCaptureKit captures the owned PID window. Model/list responses are synthetic and local; OCR actually uses VSIX resources.

14 PNG. Bez generowania lub odrysowania UI, danych klienta i osobistego profilu. / 14 PNG files, without generated/redrawn UI, customer data or a personal profile.

[Provenance i SHA256 każdego obrazu / per-image provenance and SHA256](provenance.json). Komplet zawiera obrazy z kilku przebiegów. Niektóre próby zatrzymał harness po wykonaniu poprawnych zdjęć; ich statusy pozostają w metadanych. / Images come from several runs. Some acquisition attempts failed after valid captures; their run statuses remain in metadata.

Te demonstracje nie dowodzą jakości żywego LLM ani owner smoke. Help pochodzi z nieopublikowanego alpha6-preview1 (hash paczki i obu instrukcji w provenance); sprawdzono rzeczywiste EN→PL→EN i wszystkie lokalne obrazy. / Help is captured from unpublished alpha6-preview1 (package and both instruction hashes in provenance); actual EN→PL→EN switching and all local images were checked.

UI poza Help pochodzi z alpha.5; byte parity z finalnym prerelease jest sprawdzana osobno. Historyczne animacje DOC1 w katalogu nadrzędnym pozostają historią. / These demonstrations establish neither live-model quality nor owner smoke. Non-Help UI is from alpha.5; byte parity with the final prerelease is checked separately. Parent-directory DOC1 animations remain historical.

## 01-open

Wybierz czynność z Archi: Open. / Choose a task in Archi: Open.

![Wybierz czynność z Archi: Open. / Choose a task in Archi: Open.](01-open.png)

## 02-provider

Odczytaj modele, wybierz ID i zastosuj profil. / Refresh models, choose an ID and apply the profile.

![Odczytaj modele, wybierz ID i zastosuj profil. / Refresh models, choose an ID and apply the profile.](02-provider.png)

## 03-knowledge

Wybierz i zwaliduj aktywny pack. / Choose and validate the active pack.

![Wybierz i zwaliduj aktywny pack. / Choose and validate the active pack.](03-knowledge.png)

## 04-browser

Przeglądaj systemy i ich relacje. / Browse systems and their relationships.

![Przeglądaj systemy i ich relacje. / Browse systems and their relationships.](04-browser.png)

## 05-review

Podejmij decyzje dla propozycji wiedzy. / Decide proposed knowledge rows.

![Podejmij decyzje dla propozycji wiedzy. / Decide proposed knowledge rows.](05-review.png)

## 06-edit

Edytuj proponowany opis przed akceptacją. / Edit a proposed description before acceptance.

![Edytuj proponowany opis przed akceptacją. / Edit a proposed description before acceptance.](06-edit.png)

## 07-pack-preview

Sprawdź pięć podglądów i nową lokalizację; capture anuluje zapis packa. / Inspect five previews and a new destination; capture cancels the pack save.

![Sprawdź pięć podglądów i nową lokalizację; capture anuluje zapis packa. / Inspect five previews and a new destination; capture cancels the pack save.](07-pack-preview.png)

## 08-sequence

Obejrzyj Sequence i raport grounding. / Inspect Sequence and its grounding report.

![Obejrzyj Sequence i raport grounding. / Inspect Sequence and its grounding report.](08-sequence.png)

## 09-component

Obejrzyj Component i powiązany raport. / Inspect Component and its linked report.

![Obejrzyj Component i powiązany raport. / Inspect Component and its linked report.](09-component.png)

## 10-save

Potwierdź zapis oryginalnej pary diagram/raport; zapis i hash zweryfikowano. / Confirm saving the original diagram/report pair; actual files and hash were verified.

![Potwierdź zapis oryginalnej pary diagram/raport; zapis i hash zweryfikowano. / Confirm saving the original diagram/report pair; actual files and hash were verified.](10-save.png)

## 11-conversion

Odczytaj wynik lokalnego OCR PDF. / Read the result of local PDF OCR.

![Odczytaj wynik lokalnego OCR PDF. / Read the result of local PDF OCR.](11-conversion.png)

## 12-help

Otwórz help z zainstalowanego VSIX. / Open Help from the installed VSIX.

![Otwórz help z zainstalowanego VSIX. / Open Help from the installed VSIX.](12-help.png)

## 13-ocr

Wybierz tryb lokalnego OCR PDF. / Choose a local PDF OCR mode.

![Wybierz tryb lokalnego OCR PDF. / Choose a local PDF OCR mode.](13-ocr.png)

## 14-help-pl

Przełącz na polski help lokalnym odnośnikiem. / Switch to Polish Help using the local link.

![Help Polski](14-help-pl.png)
