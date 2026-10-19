# Project state

Porównuj z Git; [roadmapa](product-roadmap.md) opisuje kierunek,
[architektura](architecture.md) kontrakty.

## Stan tej gałęzi

Eksperymentalny D1.1: finalny PlantUML, lokalna walidacja i osobny reviewer. Dwa owner smoke wykryły błędy. S1 nadal nie jest PASS; D2/M1 pozostają zablokowane do ponownego S1. Nowego owner smoke nie wykonano.

## Historyczny stan odniesienia

| Pole | Wartość |
| --- | --- |
| Stan B1 | Implemented and verified; neutralny `StructuredChatClient`, lokalny adapter node i cienki generator sequence. Pełne bramki automatyczne B1 przeszły. |
| Stan P1 | Implemented and verified; automatyczne bramki PASS oraz owner smoke Ollamy PASS na commit `50d7f47`. Profile LM Studio i Ollama, wspólny transport OpenAI-compatible oraz machine-scoped wybór profilu/modelu z trwałym bindingiem. |
| Stan P2 | Implemented; Anthropic, OpenAI i OpenRouter przez stałą allowlistę HTTPS, klucze wyłącznie w VS Code `SecretStorage`, bounded model listing i dokładnie jeden request generacyjny bez retry/repair/fallbacku. Bieżące wyniki bramek są w sekcji „Weryfikacja”. |
| Stan D1 | Eksperymentalny checkpoint automatycznie zweryfikowany; dwa owner smoke Ollamy `qwen3:30b` nie przeszły. Ledger i diagnoza zachowane na `checkpoint/d1-ledger-pipeline` (`973b604694ad06181deaa56989b9361f4b4ba52e`). To nie jest gotowy produkt. |
| Stan R1 | Completed — ADR, architektura reviewed pipeline i KISS/BUZI zapisane na aktywnym branchu. |
| Stan D1.1 | Implemented and automatically verified — generator `{ plantUml }` → lokalne `DiagramFacts` i walidacja → niezależny semantic reviewer; prompt przekazuje literalne deklaracje i sygnatury ze snapshotu. |
| Następny etap | Dwie próby S1: FAIL; nowy owner smoke Ollamy `qwen3:30b` na nowym VSIX nadal niewykonany. D2 dopiero po S1 PASS. |
| Etapy po S1 | D2 dopiero po S1 PASS; C1 po D2; M1 (ArchitectureSnapshot/MCP) po C1. |
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
