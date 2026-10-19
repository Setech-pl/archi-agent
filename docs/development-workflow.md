# Development workflow

[AGENTS.md](../AGENTS.md) zawiera stałe reguły, [project-state](project-state.md) bieżący stan,
[roadmapa](product-roadmap.md) kierunek.

PLANOWANIE → niezależny review planu → IMPLEMENTACJA → odbiór/checkpoint/publikacja.
Planowanie nie upoważnia do implementacji; roadmapa ani następny krok nie zastępują polecenia.

## Preflight (fazy A i C)

```bash
git branch --show-current     # bieżąca gałąź
git status --short            # zmiany w working tree
git log -8 --oneline --decorate
git diff --stat               # niezaindeksowane zmiany
git diff --cached --stat      # staging area
```

Następnie przeczytaj `docs/project-state.md` i porównaj go z wynikami powyżej.


## Pętla milestone — decyzja projektowa z 2026-10-06

Obowiązuje kolejność: uzgodniony zakres → implementacja → gauntlet → niezależny review
→ lokalny checkpoint → następny autoryzowany milestone. Istotne pytania produktowe,
konflikty zakresu i zmiany architektury nadal wymagają decyzji projektowej.

Manual smoke jest wykonywany zbiorczo po kilku milestones. Do zgłoszenia wyniku zapisuj
`MANUAL_SMOKE: DEFERRED`; brak smoke nie blokuje lokalnego checkpointu ani kolejnego etapu.
To zastępuje wcześniejszą bramkę manual smoke przed każdym checkpointem, także w lokalnych
instrukcjach gauntletu. Wymagane automatyczne FAIL/NOT_RUN i otwarte high/medium nadal blokują
checkpoint. Niezależny review wykonuje osobny kontekst tylko do odczytu; własna kontrola
wykonawcy go nie zastępuje.

Lokalny commit wymaga autoryzacji w zadaniu. Push, integracja main, tagowanie i publikacja
wymagają odrębnego polecenia; zgoda na lokalny checkpoint ich nie obejmuje.


## Implementacja i przekazanie

Wdrażaj mały zatwierdzony zakres. Ponownie sprawdź założenia planu względem Git.
Istotną zmianę architektury lub produktu zatrzymaj do decyzji właściciela.
Raport ma wskazywać bazę, zakres/diff, wykonane kontrole i ich wyniki, NOT_RUN,
otwarte ustalenia i stan Git. Przy planie użyj PLAN READY FOR REVIEW, przy implementacji
IMPLEMENTATION READY FOR REVIEW. Nie przypisuj nowej sesji wyników historycznych.

Commit wymaga autoryzacji; push/merge/tag/publikacja mają osobny zakres autoryzacji.
Przed końcem sprawdź diff i git diff --check. Aktualizuj krótki project-state;
raporty, paczki i historię testów zachowuj lokalnie poza śledzoną dokumentacją.

## Weryfikacja

Komendy i dostępne profile bierz z package.json tej gałęzi. Dla dokumentacji sprawdź
linki, kotwice, zgodność PL/EN, obrazy, licencje i wejścia Help/pakowania.
Dla kodu wykonaj odpowiednie testy, typecheck i build; runtime/bundling wymaga package/verify.
Pełne bramki są wymagane dla checkpointu funkcjonalnego. Nie uruchamiaj wielokrotnie
gauntletu dla samych porządków dokumentacji. Pakowanie wykonuj sekwencyjnie i zachowuj
wcześniejsze kandydaty oraz ich sumy. Wymagane FAIL/NOT_RUN blokują PASS;
niezależny review nie jest własną kontrolą autora.

Szczegóły buildu/OCR/wydawania: [EN](en/development.md) / [PL](pl/development.md).
Narzędzia dokumentacyjne: [instrukcja](../scripts/docs/README.md).

`npm run ux3:gauntlet` uruchamia funkcjonalny profil; wyniki zapisuje w build/ux3/.

`npm run k1:gauntlet` uruchamia funkcjonalny profil; wyniki zapisuje w build/k1/.

`npm run k3:gauntlet` uruchamia funkcjonalny profil; wyniki zapisuje w build/k3/.

`npm run ux4:gauntlet` uruchamia funkcjonalny profil; wyniki zapisuje w build/ux4/.
