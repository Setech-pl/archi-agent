# Project state

Porównuj z Git; [roadmapa](product-roadmap.md) opisuje kierunek,
[architektura](architecture.md) kontrakty.

## Stan tej gałęzi

D1.2 reviewed Sequence i D2 Component są zaimplementowane: plan, lokalna walidacja/render i osobny reviewer, bez retry/repair/fallbacku. Historyczny S1 Sequence PASS dotyczy qwen3:30b i dokładnego wcześniejszego VSIX; nie jest nowym testem porządków.

## Historyczny stan odniesienia

| Pole | Wartość |
| --- | --- |
| Stan B1 | Implemented and verified; neutralny `StructuredChatClient`, lokalny adapter node i cienki generator sequence. Pełne bramki automatyczne B1 przeszły. |
| Stan P1 | Implemented and verified; automatyczne bramki PASS oraz owner smoke Ollamy PASS na commit `50d7f47`. Profile LM Studio i Ollama, wspólny transport OpenAI-compatible oraz machine-scoped wybór profilu/modelu z trwałym bindingiem. |
| Stan P2 | Implemented; Anthropic, OpenAI i OpenRouter przez stałą allowlistę HTTPS, klucze wyłącznie w VS Code `SecretStorage`, bounded model listing i dokładnie jeden request generacyjny bez retry/repair/fallbacku. Bieżące wyniki bramek są w sekcji „Weryfikacja”. |
| Stan D1 | Eksperymentalny checkpoint automatycznie zweryfikowany; dwa owner smoke Ollamy `qwen3:30b` nie przeszły. Ledger i diagnoza zachowane na `checkpoint/d1-ledger-pipeline` (`973b604694ad06181deaa56989b9361f4b4ba52e`). To nie jest gotowy produkt. |
| Stan R1 | Completed — ADR, architektura reviewed pipeline i KISS/BUZI zapisane na aktywnym branchu. |
| Stan D1.1 | Implemented and automatically verified, lecz S1 FAIL; historyczna ścieżka `{ plantUml }` zachowana na `checkpoint/d1-final-plantuml-reviewed`, superseded jako aktywny kierunek. |
| Stan R2 | Completed — właściciel zatwierdził DiagramPlan, lokalną walidację i deterministyczne renderery per typ; ADR 0002 i checkpoint D1.1. |
| Stan D1.2 | Ukończone: Wire Plan v3, deterministyczny renderer sequence, minimalny reviewer, safe diagnostics i unverified candidate UX. |
| Stan UX1 | Completed — owner smoke PASS 2026-09-23 na samowystarczalnym VSIX w świeżym, izolowanym profilu VS Code. |
| Stan D2 | Completed — automatyczne bramki PASS, niezależny review 3/3 bez high/medium, owner smoke PASS 2026-09-28 na pakowanym VSIX. |
| Następny etap | M1 (MCP), potem C1. |
| Bramka S1 | PASS — owner smoke 2026-09-23 na samowystarczalnym VSIX poza repozytorium; verified outcome, bez modalu unverified. Szczegóły w sekcji „Owner smoke S1”. |
| Kolejność | R2 → D1.2 → S1 → UX1 → D2 → M1 (MCP) → C1 → D3 → D4 → D5 → K2 → K3 → REL. |
| Checkpoint produktu | `v0.2.0-alpha.1` — implemented, automatically verified, owner smoke accepted (zob. „Checkpoint VSIX v0.2.0-alpha.1”) |
| Kandydat wydania | `v0.3.0-alpha.1` — VSIX po integracji `github/main` z `12af6b0`: automatyczne bramki PASS i owner smoke PASS 2026-09-29; tag i publikacja oczekują. |

## Ograniczenia

Porządki nie wykonują nowego owner smoke ani gauntletu. Dawne PASS/FAIL pozostają
dowodami swoich wersji. Nie implementują późniejszych funkcji z main.

## Aktywne zadanie

PORTFOLIO-CLEANUP: konsolidacja dokumentacji bez zmian zachowania produktu.
Wycofane materiały są zachowane lokalnie poza repo i w historii Git; nie należy
synchronizować innych checkoutów bez zabezpieczenia ich własnych kopii.
Wyniki bieżących kontroli i macierz gałęzi pozostają w raporcie poza repo.
Dalsze zmiany funkcjonalne wymagają osobnego zatwierdzonego zadania.
