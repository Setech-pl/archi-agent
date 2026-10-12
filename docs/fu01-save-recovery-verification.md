# FU-01 — weryfikacja wskazówki po błędzie zapisu K3

Weryfikacja wykonawcy z 2026-10-07, ograniczona do FU-01. To nie jest nowy audyt Claude.
Źródłem ustalenia jest lokalny commit audytu
`791481be703b227fb2f26d6e6404c77e9f1f45d3`, raport
`audits/2026-10-07-a3dd71f-claude-follow-up/report.md` oraz reprodukcja
`repro/k3-save-message.audit.ts`, odczytane przez `git show`.

## Preflight i poprawka

Oczekiwany branch audytu, HEAD, clean working tree i pusty staging potwierdzone.
Commit raportów ma jednego bezpośredniego rodzica produktu
`a3dd71fc5b59bb4d83ffd34ae6daf91efb347eb2` i zmienia wyłącznie `audits/`.
`fix/art1-audit-findings` wskazuje tę samą bazę. Nowa gałąź
`fix/k3-save-recovery-message` powstała bezpośrednio z produktu, bez merge/cherry-pick.
Ignorowany cache audytora zachowano. Brak upstreamu nowej gałęzi; nie wykonywano operacji
na zdalnych refs. Lokalny `github/main` pozostawał `31a6609`.

Przy kompletnym cleanupie `StarterPackCreateError.recovery` ma wartość `""`.
Operator `??` zachowywał pusty string i usuwał wskazówkę z komunikatu kolizji.
Jedyna zmiana produkcyjna to `??` → `||` w komunikacie błędu komendy K3.
Kod błędu i lokalizacja pozostają; puste/brakujące recovery daje
`Choose another new folder.`, a niepuste recovery jest zachowane w całości.
Writer, walidacja ścieżek, symlinki, rollback, konfiguracja, Cancel i aktywacja bez zmian.
ART1-01/02/03 oraz Q-02 pozostają zamknięte; K4 nie rozpoczęto. Wersji nie zmieniono.

## Dowody tej sesji

Katalog dowodów: `build/fu01/run-2026-10-07T14-11-23Z/`.

| Sprawdzenie | Wynik i dowód |
| --- | --- |
| Reprodukcja przed poprawką | 4 oczekiwane FAIL komunikatu: Save/Save and use × pusty/zapełniony cel; pozostałe 15 PASS. `before-tests.json`, powiązanie źródeł i komendy w `before-reproduction.json`. |
| Produkcyjna komenda, po poprawce | 19/19 PASS w `candidate/focused-tests.json`, w tym 8 nowych regresji. Kolizja zachowuje folder i jego dane; kolejny wybór lokalizacji kończy zapis bez dodatkowej ekstrakcji/LLM. Brak recovery daje fallback; `cleanupIncomplete=true` zachowuje oryginalną wskazówkę. Oba warianty Save sprawdzone. |
| Celowany zestaw profilu K3 | 256/256 PASS, `candidate/focused-tests.json`. |
| Czyste instalacje i audity | Root/OCR `npm ci` PASS; oba audity 0 podatności. Logi i JSON w `candidate/`. |
| Pełne testy | Root 1635/1635 (106 plików), rozszerzenie 479/479 (22 pliki), `candidate/full-gates.log`. |
| Typecheck, build, pakowanie | Oba typechecki, extension:build/package/verify (529 wpisów), demo:dry-run i kontrole diff PASS, `candidate/full-gates.log`. |
| Runtime poza repo, pusty PATH/NODE_PATH | K3 15/15, K2 17/17, K1 16/16, UX3 27/27; odpowiednie JSON w `candidate/`. DOCX source/package po 5/5 PASS. |
| Extension Host, dokładny VSIX | UX3 12/12, K3 33/33 (w tym 18 nowych FU-01), `candidate/host-*.json`, `candidate/k3-host-*.json`. VS Code 1.140.0 / Node24.21.0, single-folder/multi-root/Global. |
| Natywne UI K3 | Pełny celowany rerun 9/9 PASS na tym samym VSIX, `k3-ui-rerun/summary.json`; natywne pickery i widoczne kontrolki macOS. |
| Pełny wymagany profil | `effective-report.json`: PASS168/168 scenariuszy i 13/13 komend. Liczby nie obejmują niezależnego review ani manual smoke. |

Pełny profil wynika z `docs/knowledge-pack-review.md` i `docs/development-workflow.md`.
Uruchomiono kopię lokalnego `scripts/k3-gauntlet.mjs` w katalogu dowodów: zmieniono wyłącznie
rozwiązanie importów, root repo i katalog wyjścia. Komendy, scenariusze i asercje zachowane.
Żadna obowiązkowa bramka profilu nie ma N/A. Oddzielny gauntlet ART1 nie dotyczy tej zmiany
komunikatu K3; pełne testy nadal obejmują jego regresje.

Zachowano nieudane próby. Pierwsza próba sandboxowa (`report.json` w katalogu głównym run)
miała ENOTFOUND dla auditów i EPERM dla testowych serwerów loopback; nie stanowi PASS.
Ponowiono profil z dostępem do sieci/GUI. `candidate/report.json` zachowuje FAIL/NOT_RUN UI:
NSOpenPanel zwrócił alias `/tmp`, co produkcyjny writer poprawnie odrzucił jako symlink
(zrzut `candidate/k3-save-without-activation-failure.png`). Rerun użył istniejącego parametru
`projectParent` harnessu i kanonicznego katalogu dowodów. Nie zmieniano produktu, asercji ani
VSIX; `effective-report.json` wskazuje zastąpienie tylko kompletu UI i bramki jego pokrycia.

## Kandydat i niezależny review

Nowy kandydat do zbiorczego manual smoke:
`build/fu01/run-2026-10-07T14-11-23Z/candidate/archi-agent-0.3.0-alpha.4.vsix`.
Pomiar rzeczywistego pliku: **119846838 B**, SHA-256
`1416fd4b5b9654dabe44985c817a7746bf788cbca81ae4f9cde7b320a0b521ae`.

`component-comparison.json` porównuje rzeczywiste SHA wszystkich 529 wpisów nowego i poprzedniego
VSIX. Zmienił się tylko `extension/dist/extension.js`:
`f805f53fee9c6c1e7a6c41c1135ceecc6dfc06af8d7f6e9a739e3a18923d6ee1` →
`a176de4dbfc7f6267528de18afa00a74dd37fb8727b88d9a136d7d5d9b65956f`.
Pozostałe 528 wpisów, w tym runtime, worker i wszystkie zasoby, są identyczne bajtowo.
Gauntlet dodatkowo porównał bundle i OCR ze świeżym buildem finalnego kodu.
Zachowany poprzedni kandydat:
`build/art1-audit-fixes/gauntlet-2026-10-07T12-13-56-397Z-43506/archi-agent-0.3.0-alpha.4.vsix`,
SHA-256 `02b70bba8ef43ec2123f2ba9db4728d48f58e53f2d8b48c72d180c3c16b55f16`.
Historyczne ART1 213/213 nie są wynikiem nowego kandydata.

Niezależny read-only review GPT-6.1 Sol/high: raport
`build/fu01/run-2026-10-07T14-11-23Z/independent-review-final.md`.
Checkpoint wymaga jego PASS bez otwartych HIGH/MEDIUM; wynik i dokładne źródła/Git/VSIX
wiąże `final-manifest.json` w tym samym katalogu. Dokumentacja statusu i niniejszy raport
powstały po bramkach; manifest odróżnia te zmiany dokumentacyjne od kodu poddanego testom.

Host używa produkcyjnej komendy z zainstalowanego, bajtowo sprawdzonego VSIX, real settings
i kontrolowanych odpowiedzi edytora. Kolizja jest rzeczywistą operacją FS; brak recovery
i incomplete cleanup są celowanymi wstrzyknięciami błędu na `session.save` z klasą runtime.
Nie stanowią nowego testu awarii writera ani rzeczywistych warunków niepełnego cleanupu.
Transporty i dokumenty są syntetyczne, bez realnych providerów, kluczy czy oceny jakości LLM.
Natywne UI jest osobnym automatycznym dowodem, nie ręcznym manual smoke.

MANUAL_SMOKE: DEFERRED. PUSH / MAIN_INTEGRATION / TAG / PUBLICATION: NOT_REQUESTED.
Lokalny checkpoint na gałęzi poprawki jest autoryzowany po bramkach i review; dokładny hash,
parent i finalny stan drzewa/staging należy odczytać z Git i `final-manifest.json`. STOP.
