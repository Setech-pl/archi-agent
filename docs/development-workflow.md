# Development workflow

Proces pracy nad Archi Agent przy wymiennych wykonawcach (Claude Code, Codex). Zasady stałe są
w [`AGENTS.md`](../AGENTS.md); bieżący stan w [`project-state.md`](project-state.md); kierunek
produktu w [`product-roadmap.md`](product-roadmap.md).

```text
A. PLANOWANIE → B. przegląd planu → C. IMPLEMENTACJA → D. checkpoint / publikacja
```

Domyślnie każda faza to osobne zadanie. Jedno zadanie może obejmować zatwierdzony zakres,
implementację i lokalne checkpointy kolejnych milestones. Praca przebiega wtedy w tych
granicach bez ponownego zatwierdzania rutynowych wyborów.

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

1. Zadanie jest oznaczone **PLANOWANIE**.
2. Wykonawca wykonuje preflight i czyta stan projektu.
3. Analizuje kod i dokumentację istotne dla zadania.
4. Przygotowuje plan **bez implementacji**: pliki, kontrakty, testy, ryzyka, non-goals, DoD.
5. Kończy raportem z markerem `PLAN READY FOR REVIEW`.

W tej fazie nie zmienia się kodu. Plan może zostać zapisany w raporcie; nie jest źródłem prawdy
o stanie repo.

## Faza B — weryfikacja planu

- Plan podlega osobnej ocenie i niezależnemu przeglądowi.
- Wynik: plan zaakceptowany, poprawiony albo odrzucony.
- Wpis w roadmapie lub w project-state nie oznacza akceptacji planu.

## Faza C — implementacja

1. Wykonawca otrzymuje prompt **IMPLEMENTACJA** z zatwierdzonym planem albo jawne zadanie
   obejmujące projekt i implementację w określonym zakresie. Prompt:
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

## Faza D — decyzja projektowa

- Przegląd obejmuje diff i wyniki weryfikacji.
- Commit, push lub merge wymagają jawnej autoryzacji — lokalny checkpoint może być już
  autoryzowany w zadaniu. Pozostałe operacje nie wynikają ze zgody na checkpoint.

## Automatyczny gauntlet UX3

```bash
npm run ux3:gauntlet
```

Komenda rozszerza istniejący runner `.agents/skills/archi-agent-gauntlet/scripts/run-gates.sh`.
Uruchamia pełne bramki kolejno, a opcja runnera `--vsix-out /absolute/directory` kieruje pojedyncze
pakowanie i weryfikację do nowego katalogu `build/ux3/gauntlet-…/`. Wcześniejsze VSIX są zachowywane
i porównywane przez SHA-256. Nie uruchamiaj drugiego gauntletu ani pakowania w trakcie przebiegu.

Po bramkach komenda zapisuje wyniki poszczególnych asercji istniejącego harnessu rozszerzenia,
wyjmuje runtime z dokładnego VSIX poza repo i sprawdza transakcje na syntetycznych danych.
Następnie instaluje ten VSIX w świeżych profilach VS Code: rzeczywisty Extension Host sprawdza
ustawienia dla jednego folderu, multi-root i Global przy kontrolowanych odpowiedziach edytora;
osobny smoke UI używa rzeczywistych InputBox/QuickPick oraz natywnego wyboru katalogu.
Kontrolowane odpowiedzi hosta nie stanowią dowodu działania kontrolek UI.

Na macOS wymagane są lokalne VS Code (`code` w PATH i aplikacja w `/Applications`), aktywna sesja
pulpitu, Swift z Command Line Tools i macOS Accessibility dla procesu uruchamiającego harness.
UI jest sterowane przez lokalny CDP i natywny helper Accessibility identyfikujący aplikację po PID,
bez komend testowych w produkcyjnym rozszerzeniu. Profile i syntetyczne projekty hosta są w krótkim,
kanonicznym `/private/tmp`: fizyczny TMPDIR może przekroczyć limit długości socketu VS Code.
Runtime nadal odrzuca dowiązania; świadomy test odrzucenia jest raportowany osobno.
Domyślna ścieżka bez projektu jest tylko oglądana, bez zapisu w osobistym katalogu domowym.
Testy nie używają rzeczywistych kluczy ani płatnych żądań; UI liczy żądania na syntetycznym loopbacku.

`report.txt` i `report.json` zawierają PASS/FAIL/NOT_RUN, warstwę, oczekiwany i rzeczywisty wynik,
bezpieczny kod błędu, pełny HEAD, stan Git, fingerprint źródeł oraz ścieżkę, rozmiar i SHA-256 VSIX.
Obok są logi, raporty hosta i zrzuty własnego okna przy błędzie oraz dla każdego rodzaju systemu.
Każdy niezaliczony lub niewykonany wymagany scenariusz daje kod wyjścia 1 i blokuje gotowość
do odbioru. PASS tego przebiegu jest automatycznym smoke agenta; manual smoke pozostaje osobnym wynikiem.

Runner sprawdza też CLI Mammoth i produkcyjną konwersję DOCX (struktura, Unicode, uszkodzenie,
limity wejścia/wyjścia i zewnętrzny obraz) w źródłach i z rozpakowanego VSIX poza repo.
`scripts/mammoth-cli-compatibility.mjs <report.json> [baseline.json]` pozwala porównać
wyniki CLI przed i po zmianie zależności. Repo ma override tylko `mammoth → argparse 2.0.1`:
usuwa zależność sprintf-js, zachowując stare API CLI. Nie zmieniaj go automatycznie na argparse 3,
który usunął to API. Ostrzeżenia deprecation i inne formatowanie pomocy w argparse 2 są jawne;
kody błędów, wyniki poprawnej konwersji i zapisywane bajty podlegają porównaniu.

## Automatyczny gauntlet K1

Gauntlet wewnętrznego kontraktu K1: `npm run k1:gauntlet`. Zapisuje nowy katalog
`build/k1/gauntlet-…/`, pełne sekwencyjne bramki, audit JSON, celowane scenariusze wiedzy,
zgodność trzech bundle ze świeżym buildem oraz testy runtime K1/UX3/DOCX z dokładnego VSIX
poza repo. Zachowuje wcześniejsze kandydaty i fingerprinty źródeł. Rzeczywisty Extension Host
sprawdza integrację pakowania. Dla K1 UI ma zastosowanie N/A: brak zmian komend, ustawień
i kontrolek; wyniki UI UX3 należą do jego checkpointu. Nie przenoś tego wyjątku na późniejsze
zmiany zachowania rozszerzenia. Wymagany FAIL, NOT_RUN albo niezerowy kod komendy blokuje
PASS; niezależny review finalnego kandydata i MANUAL_SMOKE: DEFERRED pozostają osobnymi wynikami.

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
(otwarte decyzje — bez rozstrzygania na domysłach)
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

## Automatyczny gauntlet K3

`npm run k3:gauntlet` zapisuje nowy `build/k3/gauntlet-<UTC timestamp>-<pid>/`.
Obejmuje czyste instalacje root/OCR, oba audity, pełne testy root/rozszerzenia, typechecki,
build/package/verify, demo dry run, celowane K3 i regresje K2/K1/UX3/DOCX. Dokładny VSIX
jest rozpakowany poza repo; runtime działa z pustymi PATH/NODE_PATH. Runner sprawdza zgodność
trzech bundle i zasobów OCR ze świeżym buildem oraz zachowanie wcześniejszych VSIX.
Nowe przypadki Host używają rzeczywistego VS Code i ustawień ze sterowanymi odpowiedziami
kontrolek; nowe przypadki real UI sterują widocznymi kontrolkami oraz natywnymi pickerami
macOS przez CDP/Accessibility. Te warstwy są raportowane osobno. Brak real UI lub review
nie może być N/A dla K3 i blokuje checkpoint jako NOT_RUN. Manifest wiąże bazę, fingerprint
źródeł, środowisko, ścieżkę, rozmiar i SHA256 kandydata. Niezależny review oraz późniejszy
manual smoke pozostają osobne. Wspólne pakowanie uruchamiaj sekwencyjnie.

## Automatyczny gauntlet UX4

`npm run ux4:gauntlet` rozszerza pełny profil ART1 o Configuration/Review i zamknięty
protokół webview. Clean npm ci root/OCR, audity, oba zestawy testów i typechecki,
build/package/verify, demo, spakowany runtime i regresje oraz rzeczywisty Host i natywny UI
są wymagane na tym samym VSIX. Dowody: `build/ux4/gauntlet-…/`. Pakowanie jest sekwencyjne.
Kontrolowane odpowiedzi Host nie są dowodem UI ani manual smoke. Niezależny review
i brak wymaganych FAIL/NOT_RUN oraz HIGH/MEDIUM warunkują lokalny checkpoint.
Status ręcznej weryfikacji UX4 jest powiązany z konkretnym SHA i raportem testów.
