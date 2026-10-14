# Archi Agent — testy właściciela / owner tests

[English](#english) · [Polski](#polski) · [Releases](https://github.com/Setech-pl/archi-agent/releases)

## Polski

To prerelease do testów. Testy właściciela Mac/Windows i Windows ARM64 runtime: **NOT_RUN** do otrzymania raportu. Publikacja nie zamyka SRC1 ani nie potwierdza M1/produkcji.

1. Pobierz VSIX i plik `.sha256` z tego samego wydania. Porównaj wynik z checksumą.

   Mac:
   ```bash
   shasum -a 256 <plik.vsix>
   ```

   Windows PowerShell:
   ```powershell
   Get-FileHash <plik.vsix> -Algorithm SHA256
   ```

2. W desktop VS Code wybierz **Extensions → … → Install from VSIX…**. Wskaż pobrany plik, przeładuj okno i potwierdź wersję w szczegółach rozszerzenia **Archi Agent**. Otwórz lokalny syntetyczny projekt.
3. **Archi: Open → Configuration → LLM Provider**: wybierz LM Studio/Ollama albo Anthropic/OpenAI/OpenRouter. Przygotuj własny model lub klucz przez zamaskowane **Set / Replace Key**. **Refresh Models**, wybierz dokładny ID, **Apply**, **Check Provider Configuration**. Sprawdź **Discard Changes** i zachowanie modelu po ponownym otwarciu. Kluczy nie wpisuj do raportu.
4. **Knowledge Management → Choose Existing Knowledge Pack**: wybierz pięć plików z [przykładu PL](../pl/user-guide.md#kompletny-syntetyczny-pack-z-pięciu-plików) / [EN](../en/user-guide.md#complete-synthetic-five-file-pack). **Validate / Refresh**, potem **Archi: Knowledge Browser**: otwórz Alpha, Beta i relację.
5. **Archi: Create Diagram → Sequence**, opis `Alpha stores data in Beta.`. Obejrzyj PlantUML i raport. Powtórz dla **Component**. Zapisz komunikat błędu, jeśli dostawca odrzuci odpowiedź. Graficzny podgląd wymaga osobnej obsługi PlantUML.
6. **Archi: Save Diagram and Report**: wybierz wynik i potwierdź lokalizację. Sprawdź `diagram.puml` i `report.json` w nowym katalogu `archi-agent-results`. Anulowanie nie tworzy plików; zapis dotyczy oryginalnego wyniku, nie późniejszych edycji.
7. **Archi: Build Knowledge Pack from Documents**: użyj małego syntetycznego MD/TXT; przejrzyj evidence, edytuj opis, podejmij decyzje dla każdego wiersza, **Validate and preview**, wybierz nowy katalog, **Save and use**. Sprawdź pięć plików i aktywną wiedzę.
8. **Archi: Convert to Markdown**: sprawdź mały DOCX lub PDF tekstowy; następnie krótki PDF skanowany z **Auto OCR** / **OCR all pages**. Konwersja i OCR działają lokalnie bez dostawcy i internetu.
9. **Archi: Help**: otwórz help, przełącz **English / Polski**, sprawdź obrazy i lokalne odnośniki z odłączoną siecią. Domyślny język help zależy od języka wyświetlania VS Code; większość przycisków pozostaje angielska.
10. Zapisz OS i wersję, architekturę CPU, wersję VS Code, wersję/rozmiar/SHA256 VSIX, profil i ID modelu (bez sekretów), wynik każdego kroku **PASS/FAIL/NOT_RUN**, bezpieczny kod błędu i uwagi. Mac i Windows raportuj osobno. Windows ARM64 oznacz osobno, jeśli rzeczywiście był testowany.

## English

This is a test prerelease. Mac/Windows owner tests and Windows ARM64 runtime remain **NOT_RUN** until a report exists. Publication does not close SRC1 or establish M1/production readiness.

1. Download the VSIX and `.sha256` from the same release. Compare the command output with the checksum.

   Mac:
   ```bash
   shasum -a 256 <file.vsix>
   ```

   Windows PowerShell:
   ```powershell
   Get-FileHash <file.vsix> -Algorithm SHA256
   ```

2. In desktop VS Code, use **Extensions → … → Install from VSIX…**, select the downloaded file, reload, and confirm the version in **Archi Agent** extension details. Open a local synthetic project.
3. **Archi: Open → Configuration → LLM Provider**: choose LM Studio/Ollama or Anthropic/OpenAI/OpenRouter. Prepare your own model or enter a key through masked **Set / Replace Key**. **Refresh Models**, choose the exact ID, **Apply**, **Check Provider Configuration**. Test **Discard Changes** and persistence after reopening. Never include keys in a report.
4. **Knowledge Management → Choose Existing Knowledge Pack**: select the five files from the [English example](../en/user-guide.md#complete-synthetic-five-file-pack). **Validate / Refresh**, then **Archi: Knowledge Browser**: open Alpha, Beta and their relationship.
5. **Archi: Create Diagram → Sequence**, description `Alpha stores data in Beta.`. Inspect PlantUML and the report. Repeat for **Component**. Record safe errors if your provider rejects structured output. Graphical preview needs separate PlantUML support.
6. **Archi: Save Diagram and Report**: choose a result and confirm its location. Check `diagram.puml` and `report.json` in the new `archi-agent-results` folder. Cancellation creates no files; saving retains the original result rather than later edits.
7. **Archi: Build Knowledge Pack from Documents**: use a small synthetic MD/TXT, inspect evidence, edit a description, decide every row, **Validate and preview**, choose a new folder, **Save and use**. Check five files and the active knowledge.
8. **Archi: Convert to Markdown**: test a small DOCX or text PDF, then a short scanned PDF with **Auto OCR** / **OCR all pages**. Conversion and OCR run locally without a provider or internet.
9. **Archi: Help**: switch **English / Polski**, inspect images and local links with the network disconnected. Default help language follows VS Code display language; most controls remain English.
10. Record OS/version, CPU architecture, VS Code version, VSIX version/size/SHA256, provider/model ID without secrets, each step's **PASS/FAIL/NOT_RUN**, safe error codes and notes. Report Mac and Windows separately. Identify Windows ARM64 separately if actually tested.
