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
npm run extension:package -- --profile core --out build/docs-pl-en/<unique-run>/candidate
npm run extension:verify -- build/docs-pl-en/<unique-run>/candidate/archi-agent-core-0.3.0-alpha.7.vsix
```

Zastąp `<unique-run>` nową nazwą katalogu; nie używaj ponownie celów wcześniejszych kandydatów. `npm ci` zachowuje opcjonalne bindingi platformowe z lockfile; unikaj zwykłego `npm install` w repo. Pakowanie przebudowuje bundle rozszerzenia/runtime/konwertera. Domyślny Core potrzebuje tylko zależności root; Full wymaga dodatkowo zależności OCR i przypiętych zasobów. Dla niego wskaż jawnie --profile full. Pakowanie/gauntlety współdzielące staging OCR uruchamiaj sekwencyjnie. `extension:verify` sprawdza allowlistę dokładnego VSIX, granice bundle i hashe zasobów. Zapisz rozmiar i SHA-256 z commitem/tree źródeł oraz rzeczywistymi zmianami; sama wersja pakietu nie wystarcza.

Do rutynowych zmian dobieraj celowane kontrole. Kod produktu wymaga właściwych testów, typechecków i builda; runtime/bundling także package/verify. Checkpoint funkcjonalny wymaga pełnych właściwych bramek. Komendy `ux3:gauntlet`, `k1:gauntlet`, `k2:gauntlet`, `k3:gauntlet`, `art1:gauntlet`, `ux4:gauntlet` istnieją w głównym manifeście; uruchamiaj te uzasadnione zakresem. DOC1 używa kontroli dokumentacji, walidacji diagramów/mediów, build/package/verify i demonstracji UI dokładnego VSIX; bez powtarzania gauntletów funkcjonalnych i przenoszenia dawnych liczników PASS. [Stabilny workflow](../development-workflow.md) określa proces.

## Narzędzia dokumentacyjne

Punkty wejścia PL/EN to README, user-guide, architecture i development; wspólne media są w `docs/assets`. Kontrakty techniczne, roadmapa i project-state zachowują ścieżki. Źródłem diagramów jest Mermaid w obu instrukcjach architektury. [Lokalne narzędzia](../../scripts/docs/README.md) przypinają osobne środowisko renderowania; jego pakiety npm nie trafiają do runtime/VSIX. Renderuj lokalnie, obejrzyj każdy diagram, zdekoduj GIF-y i sprawdź pierwsze/środkowe/ostatnie klatki. [Odtwarzanie nagrań i hashe](../assets/README.md) opisują prawdziwy VS Code z syntetycznymi odpowiedziami. Surowe klatki/profile pozostają poza śledzonymi plikami produktu.

Rozszerzenie zawiera kompletne samodzielne README EN/PL, MIT oraz notices zależności. Ścisła allowlista pomija główne instrukcje, GIF-y, surowe klatki i audyty. Obie kopie licencji muszą być identyczne. SPDX MIT dotyczy własnych pakietów, nie wszystkich cudzych składników. Zmiana lockfile DOC1 dotyczy tylko metadanych własnej licencji.

## Granice i odbiór

Core nie importuje Node I/O ani VS Code. Runtime/adaptery Node są niezależne od hosta; rozszerzenie sięga do nich przez `src/runtime/index.ts`. Stosuj KISS/BUZI i unikaj abstrakcji na przyszłość. DOC1 nie zmienia zachowania produktu. Syntetyczne fixture nie zawierają danych klienta ani credentiali.

Przed autoryzowanym checkpointem sprawdź linki/kotwice, zakres PL/EN i identyczne przykłady, nazwy UI, rozróżnienie publiczne/lokalne/planowane, diagramy, pochodzenie nagrań, licencje/notices i finalny pakiet; uruchom `git diff --check`. Osobny read-only reviewer jest niezależny od autora. Wymagane FAIL/NOT_RUN i otwarte HIGH/MEDIUM blokują checkpoint. `MANUAL_SMOKE: DEFERRED` nie jest PASS. Zaktualizuj project-state i zatrzymaj się na zatwierdzonej granicy. Demo offline: `npm run demo:dry-run`; demo na żywo jest opcjonalne i może wywołać providera.

## CLI model demo

Demo wykonawcy przyjmuje jeden pozycyjny ID modelu. Przygotuj lokalne LM Studio; dry run nie zapisuje plików. To narzędzie wykonawcy; użytkownicy VSIX korzystają z instrukcji użytkownika.

```bash
npm run local:models
npm run demo:llm:dry-run -- qwen/qwen3-14b
npm run demo:llm -- qwen/qwen3-14b
```

## MCP1

Pełny lokalny odbiór uruchom Node 22.12.0: `npm run mcp1:verify -- build/mcp1/<unique-run>`. Obejmuje świeże Core/Full i tarball CLI, niezależną parity bundle, rzeczywisty Host/UI, integralność OCR i aktualizacje profili między wersjami. Poprzednik Full musi być dokładnym lokalnym alpha.6 wskazanym w planie. Każda próba zachowuje własne raporty; błędów nie nadpisujemy. Owner smoke i jakość żywego modelu pozostają osobnymi wynikami. [Instrukcja CLI/MCP](cli-mcp.md).

## Przygotowanie OCR i pochodzenie ICU

Zainstaluj oba zatwierdzone lockfile przez npm ci. Przygotuj OCR przed pakowaniem Full (albo jedynego
profilu OCR na starszej gałęzi). Poniższa komenda sprawdza osiem archiwów canvas 0.1.97 względem
SRI z lockfile i tworzy zasoby produktu; nie potrzebuje historycznych JSON wyników ani zewnętrznego
manifestu próbnego. Brak zasobu kończy przygotowanie błędem.

```bash
node scripts/prepare-ci-ocr.mjs
```

Brakujący Windows ARM64 icudtl.dat pochodzi wyłącznie z archiwum Windows x64 canvas 0.1.97
zweryfikowanego przez SRI. Oba pliki ICU muszą mieć identyczne bajty i SHA-256; canvasResourceSupplements
zapisuje donora/wersję/resolved/SRI/wpis archiwum/ścieżki/hashe. Upstreamowy
[skrypt wydania](https://github.com/Brooooooklyn/canvas/commit/e1a75d1aa888dcdf44467875829d58ea19c6cdd7)
używa tego samego źródła ICU dla obu architektur. Nie używamy nowszego canvas ani zmienionych bindingów.
Przypięty patch modułu display PDF.js wymaga zero fuzz i pełnego kontekstu zgodnego z GNU patch;
worker, licencje i zasoby platform zachowują zweryfikowane hashe. Pakowanie i verify wykonuj kolejno.

## Procedura wydania

Użyj świeżego klonu i jawnego SHA źródeł. Wykonaj właściwe testy, oba typechecki, przygotowanie OCR,
package i verify każdego istniejącego profilu. Zachowaj logi, nieudane próby, rozmiary i SHA-256
dokładnych paczek poza śledzoną dokumentacją. Nie używaj ponownie katalogu wcześniejszego kandydata.
Tylko osobno autoryzowane wydanie może utworzyć tag/prerelease i wysłać assets. Paczki CI same nie
publikują wydania. Pobierz publiczne pliki i porównaj ich bajty/checksumy ze zweryfikowanymi kandydatami;
zachowaj manifest wydania i tożsamość źródeł oddzielnie od merge commita. Nie zastępuj istniejących
assets i nie wnioskuj z CI o owner smoke, jakości żywego modelu ani wykonaniu na innych platformach.
