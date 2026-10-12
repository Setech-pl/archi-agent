# Praca deweloperska

[English](../en/development.md) · **Polski** · [Strona główna](../../README.pl.md)

## Checkout i wymagania

Sklonuj [Setech-pl/archi-agent](https://github.com/Setech-pl/archi-agent) do katalogu pracy, następnie sprawdź Git przed zmianami. Historyczna nazwa głównego pakietu pozostaje `archground`. Manifest wymaga Node.js `>=22.12.0`; używaj obsługiwanej zainstalowanej pary Node/npm i zapisanych lockfile. Użytkownik końcowy instaluje VSIX i nie wykonuje tych komend.

Przeczytaj [AGENTS.md](../../AGENTS.md), [stan projektu](../project-state.md), [workflow](../development-workflow.md), [roadmapę](../product-roadmap.md) i właściwe kontrakty. Nie scalaj gałęzi raportów audytu do produktu. Lokalny checkpoint wymaga autoryzacji; push/merge/tag/publikacja są osobnymi działaniami wymagającymi odrębnej autoryzacji.

## Build i weryfikacja

```bash
npm ci
npm ci --prefix experiments/ux2-ocr
npm test
npm run typecheck
npm run extension:typecheck
npm run extension:test
npm run extension:build
npm run extension:package -- --out build/docs-pl-en/<unique-run>/candidate
npm run extension:verify -- build/docs-pl-en/<unique-run>/candidate/archi-agent-0.3.0-alpha.4.vsix
```

Zastąp `<unique-run>` nową nazwą katalogu; nie używaj ponownie celów wcześniejszych kandydatów. `npm ci` zachowuje opcjonalne bindingi platformowe z lockfile; unikaj zwykłego `npm install` w repo. Pakowanie przebudowuje bundle rozszerzenia/runtime/konwertera i zasoby OCR offline. Potrzebne są zależności root oraz OCR. Pakowanie/gauntlety współdzielące staging OCR uruchamiaj sekwencyjnie. `extension:verify` sprawdza allowlistę dokładnego VSIX, granice bundle i hashe zasobów. Zapisz rozmiar i SHA-256 z commitem/tree źródeł oraz rzeczywistymi zmianami; sama wersja pakietu nie wystarcza.

Do rutynowych zmian dobieraj celowane kontrole. Kod produktu wymaga właściwych testów, typechecków i builda; runtime/bundling także package/verify. Checkpoint funkcjonalny wymaga pełnych właściwych bramek. Komendy `ux3:gauntlet`, `k1:gauntlet`, `k2:gauntlet`, `k3:gauntlet`, `art1:gauntlet`, `ux4:gauntlet` istnieją w głównym manifeście; uruchamiaj te uzasadnione zakresem. DOC1 używa kontroli dokumentacji, walidacji diagramów/mediów, build/package/verify i demonstracji UI dokładnego VSIX; bez powtarzania gauntletów funkcjonalnych i przenoszenia dawnych liczników PASS. [Stabilny workflow](../development-workflow.md) określa proces.

## Narzędzia dokumentacyjne

Punkty wejścia PL/EN to README, user-guide, architecture i development; wspólne media są w `docs/assets`. Kontrakty techniczne, roadmapa i project-state zachowują ścieżki. Źródłem diagramów jest Mermaid w obu instrukcjach architektury. [Lokalne narzędzia](../../scripts/docs/README.md) przypinają osobne środowisko renderowania; jego pakiety npm nie trafiają do runtime/VSIX. Renderuj lokalnie, obejrzyj każdy diagram, zdekoduj GIF-y i sprawdź pierwsze/środkowe/ostatnie klatki. [Odtwarzanie nagrań i hashe](../assets/README.md) opisują prawdziwy VS Code z syntetycznymi odpowiedziami. Surowe klatki/profile pozostają poza śledzonymi plikami produktu.

Rozszerzenie zawiera kompletne samodzielne README EN/PL, MIT oraz notices zależności. Ścisła allowlista pomija główne instrukcje, GIF-y, surowe klatki i audyty. Obie kopie licencji muszą być identyczne. SPDX MIT dotyczy własnych pakietów, nie wszystkich cudzych składników. Zmiana lockfile DOC1 dotyczy tylko metadanych własnej licencji.

## Granice i odbiór

Core nie importuje Node I/O ani VS Code. Runtime/adaptery Node są niezależne od hosta; rozszerzenie sięga do nich przez `src/runtime/index.ts`. Stosuj KISS/BUZI i unikaj abstrakcji na przyszłość. DOC1 nie zmienia zachowania produktu. Syntetyczne fixture nie zawierają danych klienta ani credentiali.

Przed autoryzowanym checkpointem sprawdź linki/kotwice, zakres PL/EN i identyczne przykłady, nazwy UI, rozróżnienie publiczne/lokalne/planowane, diagramy, pochodzenie nagrań, licencje/notices i finalny pakiet; uruchom `git diff --check`. Osobny read-only reviewer jest niezależny od autora. Wymagane FAIL/NOT_RUN i otwarte HIGH/MEDIUM blokują checkpoint. `MANUAL_SMOKE: DEFERRED` nie jest PASS. Zaktualizuj project-state i zatrzymaj się na zatwierdzonej granicy. Demo offline: `npm run demo:dry-run`; demo na żywo jest opcjonalne i może wywołać providera.
