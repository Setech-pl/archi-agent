# Project state

Porównuj z Git; [roadmapa](product-roadmap.md) opisuje kierunek,
[architektura](architecture.md) kontrakty.

## Stan tej gałęzi

Checkpoint D1: Sequence z finalnym PlantUML i ledgerem, jeden request. Zachowana starsza ścieżka zgodności. Pozostałe typy kończą się diagram-type-unsupported przed I/O. Review i zapis packa nie są tu zaimplementowane.

## Historyczny stan odniesienia

| Pole | Wartość |
| --- | --- |
| Stan B1 | Implemented and verified; neutralny `StructuredChatClient`, lokalny adapter node i cienki generator sequence. Pełne bramki automatyczne B1 przeszły. |
| Stan P1 | Implemented and verified; automatyczne bramki PASS oraz owner smoke Ollamy PASS na commit `50d7f47`. Profile LM Studio i Ollama, wspólny transport OpenAI-compatible oraz machine-scoped wybór profilu/modelu z trwałym bindingiem. |
| Stan P2 | Implemented; Anthropic, OpenAI i OpenRouter przez stałą allowlistę HTTPS, klucze wyłącznie w VS Code `SecretStorage`, bounded model listing i dokładnie jeden request generacyjny bez retry/repair/fallbacku. Bieżące wyniki bramek są w sekcji „Weryfikacja”. |
| Stan D1 | Implemented and verified; baza D1: `00c8b9d62e73fff2cdb154113f15a42756f25b07`. Automatyczne bramki D1 przeszły w sesji 2026-09-21. |
| Następny etap | D2 — profil `component`. |
| Etap po D2 | C1 — VS Code Chat Participant `@archi-agent` z `/diagram`; zaplanowany, bez implementacji w D1. |
| Checkpoint produktu | `v0.2.0-alpha.1` — implemented, automatically verified, owner smoke accepted (zob. „Checkpoint VSIX v0.2.0-alpha.1”) |

## Ograniczenia

Porządki nie wykonują nowego owner smoke ani gauntletu. Dawne PASS/FAIL pozostają
dowodami swoich wersji. Nie implementują późniejszych funkcji z main.

## Aktywne zadanie

PORTFOLIO-CLEANUP: konsolidacja dokumentacji bez zmian zachowania produktu.
Wycofane materiały są zachowane lokalnie poza repo i w historii Git; nie należy
synchronizować innych checkoutów bez zabezpieczenia ich własnych kopii.
Wyniki bieżących kontroli i macierz gałęzi pozostają w raporcie poza repo.
Dalsze zmiany funkcjonalne wymagają osobnego zatwierdzonego zadania.
