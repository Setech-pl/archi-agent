# Archi Agent

[English](README.md) · **Polski**

Archi Agent generuje w VS Code diagramy PlantUML **Sequence** i **Component** na podstawie opisu przepływu oraz lokalnego Architecture Knowledge Pack. Grounding rozpoznaje nazwy, aliasy i dowody lokalnie. Model proponuje ograniczony plan; po lokalnej walidacji i renderowaniu osobne wywołanie ocenia zgodność znaczenia.

## Wybierz właściwy pakiet

Opublikowany prerelease to [v0.3.0-alpha.4](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.4), wydany 2026-10-03 z `31a6609cd0e8b083dbc09f3007a761e93a174b18`. Jego [VSIX](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.4/archi-agent-0.3.0-alpha.4.vsix) i [plik sumy kontrolnej](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.4/archi-agent-0.3.0-alpha.4.sha256) obejmują OCR UX2. SHA-256 publicznego VSIX to `4d30bb3b3b2108c8ecbba2748e7da537f5668460b717e2b3f2740060559e12b1` (119805952 bajty).

Te instrukcje opisują **lokalnego kandydata DOC1**, opartego na checkpointcie produktu FU-01 `a76b15ca822364810edb0298852db70437f73e9d`. Obejmuje on także diagnostykę OBS1, konfigurację packa UX3, ekstrakcję/review/zapis K1–K3 oraz zapis oryginalnego wyniku ART1. Tych dodatków **nie ma w powyższym publicznym pobraniu**. Lokalny pakiet nadal ma numer `0.3.0-alpha.4`; identyfikuj go przez dokładny SHA-256 i [dowody kandydata](docs/assets/README.md), a nie sam numer wersji. Wydania DOC1 nie opublikowano. Owner smoke tego kandydata pozostaje odroczony.

## Szybki start — lokalny kandydat

1. Uzyskaj wskazany lokalny VSIX i sprawdź sumę kontrolną. W VS Code użyj **Extensions → … → Install from VSIX…**. Nie potrzebujesz repozytorium, npm, osobnego Node.js ani backendu Archi Agent.
2. Otwórz lokalny folder projektu. W palecie poleceń uruchom **Archi Agent: Open**.
3. W **Configuration** wybierz **Select Provider Profile**, następnie **Select Model**. Przygotuj lokalnie LM Studio lub Ollamę albo wybierz Anthropic, OpenAI lub OpenRouter i użyj **Set/Update API Key**. Klucze trafiają do VS Code SecretStorage. Model musi obsługiwać strukturalny JSON.
4. Uruchom **Configure Knowledge Pack**. **Choose Existing** wybiera folder z pięcioma plikami Markdown packa; **Create Knowledge Pack** tworzy mały pack z jednego rzeczywistego systemu. Walidacja poprzedza aktywację.
5. Wybierz **Generate Diagram → Sequence** lub **Component**. Podaj dokument przepływu albo opis z nazwami kanonicznymi packa; rozstrzygnij niejednoznaczności i potwierdź jawne elementy `[NEW: Name]`, jeśli pojawi się pytanie.
6. Przeczytaj edytor PlantUML i powiązany raport groundingu. **Save Diagram and Report** zapisuje zamrożoną oryginalną parę w nowym folderze wyników projektu. Graficzny podgląd PlantUML wymaga osobnej obsługi w edytorze.

Syntetyczny przykład: Alpha (service), Beta (database) i synchroniczna relacja DB Alpha → Beta o nazwie Writer. Opis: `Alpha stores data in Beta.` [Instrukcja użytkownika](docs/pl/user-guide.md) wyjaśnia tworzenie packa, format pięciu plików, decyzje review, błędy i bezpieczny zapis; filmy nie są potrzebne do wykonania kroków.

## Instrukcje i demonstracje

- [Instrukcja użytkownika](docs/pl/user-guide.md) · [Architektura i pięć diagramów Mermaid](docs/pl/architecture.md) · [Praca deweloperska](docs/pl/development.md)
- [Trzy demonstracje prawdziwego UI, podglądy i pochodzenie](docs/assets/README.md)
- Stabilne kontrakty techniczne: [format Knowledge Pack](docs/knowledge-pack-format.md), [front matter](docs/front-matter.md), [generowanie z review](docs/reviewed-diagram-pipeline.md), [ekstrakcja dokumentów](docs/document-candidates.md), [review/zapis packa](docs/knowledge-pack-review.md), [ART1](docs/diagram-artifact-save.md)
- [Roadmapa produktu](docs/product-roadmap.md) · [Stan projektu](docs/project-state.md) · [Proces pracy wykonawców](docs/development-workflow.md)

Do wybranego modelu trafia tylko ograniczony kontekst potrzebny do zadania. Konwersja i OCR działają lokalnie. Ekstrakcja wysyła ograniczony tekst wybranych dokumentów; review/edycja/zapis nie dodają żądań do modelu. Generowanie diagramu używa najwyżej jednego żądania generatora i jednego reviewera, bez retry, repair i fallbacku. Wywołania chmurowe mogą być płatne.

Celem wsparcia 1.0 jest Mac ARM. Obecne dowody natywnego UI dotyczą macOS arm64; dołączone bindingi innych platform nie potwierdzają równoważnego wsparcia end-to-end. MCP, pobieranie z Enterprise Architect, VS Code Chat, generowanie C4/ArchiMate oraz aktualizacja/scalanie istniejących packów są planowane albo wyłączone z zakresu, a nie dostępne obecnie.

## Licencja

Własny kod i dokumentacja Archi Agent są objęte [licencją MIT](LICENSE), z kanonicznym angielskim tekstem pochodzącym z [Open Source Initiative](https://opensource.org/license/mit). Ten opis nie jest drugą licencją. Cudzy kod, modele OCR, biblioteki natywne i WASM zachowują własne licencje: [notices zależności](vscode-extension/THIRD_PARTY_NOTICES.md) i [notices OCR](experiments/ux2-ocr/TRIAL_NOTICES.md).
