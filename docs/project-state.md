# Project state

Porównuj z Git; [roadmapa](product-roadmap.md) opisuje kierunek,
[architektura](architecture.md) kontrakty.

## Stan tej gałęzi

Fundament rozszerzenia VS Code, runtime niezależny od hosta, grounding i samowystarczalne pakowanie. Checkpoint v0.2.0-alpha.1 ma historyczny owner smoke accepted. EA XML pozostaje planowane.

## Historyczny stan odniesienia

| Pole | Wartość |
| --- | --- |
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
