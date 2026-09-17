# Development workflow

Proces pracy nad Archi Agent przy wymiennych wykonawcach (Claude Code, Codex). Zasady stałe są
w [`AGENTS.md`](../AGENTS.md); bieżący stan w [`project-state.md`](project-state.md); kierunek
produktu w [`product-roadmap.md`](product-roadmap.md).

```text
A. PLANOWANIE  →  B. weryfikacja planu  →  C. IMPLEMENTACJA  →  D. decyzja właściciela
   (wykonawca)     (właściciel + przegląd    (wykonawca)           (commit / push / merge)
                    zewnętrzny)
```

Każda faza to osobny prompt. Zakończenie fazy nie uruchamia automatycznie następnej.

## Preflight (fazy A i C)

```bash
git branch --show-current     # bieżąca gałąź
git status --short            # zmiany w working tree
git log -8 --oneline --decorate
git diff --stat               # niezaindeksowane zmiany
git diff --cached --stat      # staging area
```

Następnie przeczytaj `docs/project-state.md` i porównaj go z wynikami powyżej.

## Faza A — planowanie

1. Właściciel przekazuje zadanie oznaczone **PLANOWANIE**.
2. Wykonawca wykonuje preflight i czyta stan projektu.
3. Analizuje kod i dokumentację istotne dla zadania.
4. Przygotowuje plan **bez implementacji**: pliki, kontrakty, testy, ryzyka, non-goals, DoD.
5. Kończy raportem z markerem `PLAN READY FOR REVIEW`.

W tej fazie nie zmienia się kodu. Plan może zostać zapisany w raporcie; nie jest źródłem prawdy
o stanie repo.

## Faza B — weryfikacja planu

- Właściciel przekazuje plan do przeglądu zewnętrznego (np. ChatGPT) i sam go ocenia.
- Wynik: plan zaakceptowany, poprawiony albo odrzucony.
- Wpis w roadmapie lub w project-state nie oznacza akceptacji planu.

## Faza C — implementacja

1. Wykonawca otrzymuje osobny prompt **IMPLEMENTACJA** z zatwierdzonym planem. Prompt:
   - zawiera zatwierdzony plan lub pełne odwołanie do jego trwałej wersji;
   - zawiera wszystkie decyzje i korekty wynikające z przeglądu planu;
   - jest samowystarczalny dla Claude Code lub Codexa;
   - nie zakłada dostępu do historii rozmowy poprzedniego wykonawcy.
2. Ponownie wykonuje preflight.
3. Sprawdza aktualność planu wobec bieżącego HEAD; różnice wskazuje w raporcie i dostosowuje tylko
   elementy konieczne.
4. Wdraża wyłącznie zatwierdzony zakres.
5. Wykonuje wymaganą weryfikację (patrz „Weryfikacja” w `AGENTS.md`).
6. Aktualizuje `docs/project-state.md`; roadmapę tylko przy zmianie zakresu lub stanu etapu.
7. Kończy kompletnym raportem z markerem `IMPLEMENTATION READY FOR REVIEW`.

## Faza D — decyzja właściciela

- Właściciel przegląda diff i wyniki weryfikacji.
- Dopiero osobna decyzja zezwala na commit, push lub merge — wykonywane przez właściciela albo
  na jego wyraźne polecenie.

## Szablon raportu planowania

```markdown
## Raport planowania — <zadanie>

**Preflight:** branch, HEAD, working tree, staging (stan zastany)
**Stan wyjściowy:** co ustalono z kodu i Git (rozbieżności z project-state)

### Cel i zakres
### Non-goals
### Proponowane zmiany
| Plik | Zmiana |
### Kontrakty i interfejsy
(nowe/zmienione typy, porty, formaty; zgodność wstecz)
### Testy
(nowe testy, dotknięte testy, komendy weryfikacji)
### Ryzyka i otwarte decyzje
(pytania do właściciela — bez rozstrzygania na domysłach)
### Definition of Done

PLAN READY FOR REVIEW
```

## Szablon raportu implementacji

```markdown
## Raport implementacji — <zadanie>

**Preflight:** branch, HEAD, working tree, staging (stan zastany)
**Plan:** odniesienie do zatwierdzonego planu; odstępstwa i ich powód

### Zmienione pliki
| Plik | Zmiana |
### Weryfikacja wykonana w tej sesji
| Komenda | Wynik |
### Nie wykonano / nie zweryfikowano
(np. smoke test poza repo, LM Studio — z powodem)
### Aktualizacja dokumentacji
(project-state, roadmapa, dokumenty tematyczne)
### Ryzyka i otwarte decyzje
### Stan Git na koniec
(`git status --short`, `git diff --stat`; brak commit/push/merge)

IMPLEMENTATION READY FOR REVIEW
```

## Handoff przy utracie kontekstu

Zaktualizuj w `docs/project-state.md`: aktywne zadanie i fazę, co jest zrobione, co niezweryfikowane,
stan working tree i jeden następny krok. Nie wpisuj wyników testów, których nie uruchomiono.
