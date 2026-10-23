# MAIN1 + STAB1 — zatwierdzony zakres

Zadanie właściciela z 2026-10-22 po publikacji alpha.8, doprecyzowane 2026-10-23.
Obejmuje zabezpieczenie kandydata, izolowaną integrację, commit, zwykły push nowej
gałęzi stabilizacyjnej, nowy PR i sprawdzenie CI. Poniższe granice zastępują
wcześniejszą zgodę na samodzielny merge #14.

## MAIN1

Sprawdzić bezpośrednio GitHub: stan, mergedAt, rzeczywisty merge commit i HEAD #14
oraz aktualny main i #13. Merge #14 wykonuje ręcznie właściciel metodą Create a merge
commit; wykonawca go nie scala. Jeśli #14 nie jest MERGED, zakończyć MAIN1 BLOCKED.
Po merge pobrać refs w izolowanym klonie, potwierdzić obecność merge i całego zakresu
#14 w main oraz zapisać dokładną bazę STAB1. Potwierdzić CI, README PL/EN i linki.
PR #13 zamknąć bez merge tylko po potwierdzeniu, że main zawiera cały przydatny zakres;
zachować gałąź. Nie zmieniać zajętych checkoutów ani cudzych zmian.

## STAB1

Nowa gałąź od aktualnego main po MAIN1:

- Najpierw zweryfikować stan kandydata i zachować niezależny backup HEAD/statusu,
  pełnego patcha staging/working tree i nowych plików STAB1. Nie modyfikować kandydata
  ani innych checkoutów. Przenosić wyłącznie ustalone zmiany, zachowując nowszy main.

- AUD-005: zgodność README, instrukcji, CLI/MCP, Help i roadmapy z alpha.8 i main;
  naprawa nieaktualnych twierdzeń, niezależny retest przed zamknięciem.
- AUD-006: fresh clean-clone, pusty cache, bez kopiowania zależności i gotowych zasobów;
  udokumentowane przygotowanie OCR, build, Core/Full package/verify i rzeczywisty OCR.
  Naprawić brakujące kroki; odróżnić zgodność kodu/zasobów od identyczności ZIP.
- Safe-conflict LOW: zbadać pierwotne dowody, LF/CRLF, wersję dokumentu, bajty dysku
  i multi-root. Nie osłabiać zapisu; brak reprodukcji nie oznacza naprawy.
- Skrócić project-state do aktualnego handoffu bez sprzecznych STOP i historii sesji.
  Dowody poza repo lub w ignorowanym build; zachować portfolio cleanup i dokładne .gitignore.
  Instrukcje i Help utrzymać PL/EN.

## Kontrole i zakończenie

Testy proporcjonalne do zmian; bez ponawiania odbioru EA3/EA4 dla samych dokumentów.
Kod wymaga regresji i bramek repo. Niezależny read-only review zamknięcia AUD-ID.
Owner smoke DEFERRED do wykonania; zachować wcześniejsze FAIL/NOT_RUN, bez pętli prób UI.
Zachowane build/OCR/review dotyczą konkretnych źródeł i platform; dokumentacyjny commit
nie wymaga ponowienia pełnego gauntletu ani OCR przy niezmienionych wejściach produktu.
Wypchnąć gałąź, utworzyć PR, sprawdzić CI; raportować SHA, kontrole, ustalenia,
ograniczenia i stan working tree/staging.

Bez force-push, usuwania gałęzi, zmiany alpha.8, nowego wydania ani merge nowego PR.
STOP przed EVAL1 i nowymi funkcjami. Publikacji i odbioru EA3/EA4 nie powtarzać.
