# Project state

Porównuj zapis z Git. [Roadmapa](product-roadmap.md), [workflow](development-workflow.md)
i [architektura](architecture.md) pozostają źródłami kierunku, procesu i kontraktów.

## MAIN1 potwierdzone, integracja STAB1 (2026-10-23)

[Zatwierdzony zakres](plans/main1-stab1-brief.md). Bezpośredni odczyt GitHub:
[PR #14](https://github.com/Setech-pl/archi-agent/pull/14) MERGED 2026-10-23 07:42:47 UTC,
HEAD `bfd6bec7934cd27f118a3c290aded056c8ce90dc`, rzeczywisty merge i baza STAB1
`065d56779ed5c3ce539e61d850aa4013330f831e`. Jego rodzice to poprzedni main
`d91bbdebcfbdf0414d64b18343147eb4b6f60278` i HEAD #14; drzewo jest identyczne z HEAD #14.
Fetch w niezależnym klonie potwierdził obecność merge i całego zakresu #14 w origin/main.
[PR #13](https://github.com/Setech-pl/archi-agent/pull/13) GitHub oznacza MERGED
2026-10-23 07:42:48 UTC. Jego HEAD `4dffbf4e474a57a57d046f78917af8de58e67369`
jest przodkiem main; wykonawca nie zamykał ani nie scalał tego PR. Gałąź zachowana.

Oryginalny kandydat: `~/Projects/archground/build/main1-stab1/clean-clone`, detached
na HEAD #14, dziewięć zmienionych dokumentów i nowy brief; pozostawiony bez zmian.
Backup: `~/Projects/archi-agent-stab1-20261023T074402Z/backup/` — HEAD, status,
listy plików, pełny patch oraz osobne staging/working tree, dziesięć plików i manifest SHA-256.
Wszystkie dziesięć hashy potwierdzono po przeniesieniu; bez konfliktów dzięki identycznym drzewom.
Integracja: sąsiedni `integration/`, gałąź `docs/stab1-release-build-consistency` od powyższej bazy.
Dowody historyczne: `~/Projects/archground/build/main1-stab1/evidence/`, w tym pełny
wcześniejszy project-state. Bieżące kontrole: sąsiedni wobec integracji `evidence/`.
Do repo trafia wyłącznie dokumentacja. HEAD i wynik nowego PR/CI odczytuj z Git/GitHub.

## Dystrybucja i zakres produktu

Publiczna [alpha.8](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.8)
pozostaje niezmienna: źródła `a032a5dcedb1b6ddd53f1d637d2ae5cba3e18781`,
[manifest](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.8/release-manifest.json),
[SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.8/SHA256SUMS).
Wydanie zawiera Core/Full/CLI, Retail/Mission Control, instrukcje PL/EN i offline Help.
Sequence, Component, C4 Context/Container, Verify Flow, źródła Markdown/Structurizr/MCP,
konwersja dokumentów, OCR Full, review/nowy pack, ART1, Browser oraz katalogi enterprise/1–3
z tworzeniem/aktualizacją i czterema deterministycznymi widokami są dostępne w alpha.8.
Wersje źródeł i bajty opublikowanych paczek identyfikuje manifest, nie późniejszy merge main.

## Ustalenia i granice dowodów

- AUD-001/002: zamknięte historycznie naprawą ABA. AUD-003/004: naprawione i opublikowane
  w alpha.8; wcześniejsze FAIL zachowane w dowodach, bez ponownego odbioru EA3/EA4.
- AUD-005: CLOSED w kandydacie STAB1 po niezależnym retest/review z 2026-10-22 README,
  instrukcji, CLI/MCP, Help PL/EN i roadmapy. Korekty czekają na merge osobnego PR STAB1.
- AUD-006: CLOSED w kandydacie STAB1 po fresh clone z pustym cache, obu npm ci,
  przygotowaniu 8 archiwów OCR, build i sekwencyjnych Core/Full package/verify.
  Rzeczywisty OCR: 6/6 wykonawcy, niezależny Node 22.12 8/8 oraz dodatkowy Core/Full 4/4.
  Wszystkie 17/539 rozpakowane wpisy zgodne z publiczną alpha.8; całe VSIX mają inne SHA.
  Niezależny raport `audit-closure-review.md`; szczegóły i logi `acceptance-report.md`
  w katalogu historycznych dowodów wskazanym wyżej. Źródła retestu: HEAD #14 `bfd6bec…`,
  różniący się od źródeł alpha.8 wyłącznie project-state; baza STAB1 ma identyczne drzewo.
  Kod, lockfile, skrypty i zasoby produktu pozostają niezmienione w STAB1. Wyniki build/OCR
  z 2026-10-22 dotyczą macOS ARM64 / Node 22.12.0, nie są uruchomieniami nowego commita.
- Safe-conflict LOW: OPEN. Brak dowodu utraty danych/fałszywego saved; brak reprodukcji nie
  zamyka pierwotnej obserwacji. Oryginał i odtworzony bufor mają LF bez CRLF; brakuje
  wersji dokumentu/applied/checkBase z chwili FAIL. Niezależne celowane testy 38/38 PASS
  nie wyjaśniają przyczyny. Nie osłabiono zabezpieczeń; brak atomowego filesystem CAS.
- OWNER_SMOKE: DEFERRED. [Instrukcja PL/EN](testing/ea3-ea4-owner-smoke.md).
  Historyczne local Host FAIL/NOT_RUN (Code SIGABRT), odmowa Computer Use i visible UI NOT_RUN
  pozostają zachowane. Kontrolowany Host nie jest dowodem widocznego UI.
- Live LLM w odbiorze alpha.8 NOT_RUN (lokalny serwis odmawiał połączenia); płatny cloud
  nietknięty. Windows ARM64 runtime i PowerShell setup NOT_RUN; inventory nie dowodzi wykonania.
  Syntetyczne odpowiedzi nie potwierdzają jakości modelu. Q-04 nadal wymaga owner smoke.
- Brak update/merge istniejących software packów, trwałych draftów, atomowego zapisu wielu
  plików/crash recovery/fsync i trwałego przełącznika języka. ART1 zapisuje oryginalną parę.
  EA XML czeka na bezpieczny fixture; brak deklaracji stable/Marketplace/production readiness.

Historyczne dowody wydania pozostają w pierwotnym checkoutcie
`~/Projects/archground/build/ea3-ea4/integration/build/ea3-ea4/`,
a wcześniejszy ręczny r2 i backup w katalogu audytów właściciela. Incydent odtworzenia
nadpisanego scratch reportu jest opisany w `acceptance/report-recovery.md`; nie deklarować
pierwotnej tożsamości bajtowej tego raportu. Nie usuwać tych dowodów ani portfolio cleanup.

Kontrole integracji wykonane 2026-10-23 (Node 26.12.0): linki/kotwice i parytet
przykładów PL/EN, sync-help --check, check-docs Core/Full na zachowanych dokładnych paczkach,
check-demo-docs.py i diff --check — PASS. Check-docs porównuje z publicznymi Core/Full alpha.8,
potwierdzając parytet odpowiednio 3/525 wpisów runtime/OCR oraz pakowanego Help.
Nie zmieniono wejść generowanego Help ani jego bajtów;
nowy build/OCR/gauntlet lokalnie nie jest wymagany. Nowy PR uruchamia własne CI, którego
HEAD i testowany merge SHA należy raportować osobno od historycznych przebiegów.

STOP przed EVAL1 i nowymi funkcjami. Bez nowego wydania, zmiany alpha.8 i merge PR STAB1.
