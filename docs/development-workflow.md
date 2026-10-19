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

Szczegóły pakowania: [rozszerzenie](vscode-extension.md).
