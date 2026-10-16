# SRC1 — weryfikacja lokalnego kandydata

Baza: `45f743d2fcefb3d6b60afe697081732afd41e86e`, branch feature/src1-structurizr-source.
Checkpoint odczytaj z Git; `build/src1/candidate-2/acceptance.json` zapisuje jego dokładne SHA.
Kandydat był testowany jako working tree; mapa SHA256 każdego pliku jest zachowana w
`build/src1/candidate-2/manifest.json`. Fingerprint tej mapy (UTF-8 compact JSON):
`779ddd4414b553a3b46b0cbfebf7bd8289e44703aef8c4f801e62853f89499a5`. Przed checkpointem potwierdzono brak zmian produktu i testów.
Po pełnych bramkach zmienił się tylko harness UI; po odbiorze dokumentacja operacyjna.

## Bieżące wyniki

Node 22.12.0, macOS ARM64. Oficjalny tarball Node zweryfikowany przez SHASUMS256.txt.
Polecenie: `node scripts/src1-verify.mjs build/src1/candidate-2` przy Node 22.12.0 w PATH.

| Bramka | Wynik |
| --- | --- |
| npm ci root oraz OCR | PASS |
| npm audit --audit-level=low root oraz OCR | PASS |
| node scripts/prepare-ci-ocr.mjs | PASS |
| npm run typecheck / extension:typecheck | PASS |
| npm test -- --no-file-parallelism | 1843/1843, 114 plików PASS |
| npm run extension:test -- --no-file-parallelism | 668/668, 28 plików PASS |
| extension:build / extension:package / extension:verify | PASS |
| demo:dry-run / checker dokumentacji / PL-EN / online-offline / diff-check | PASS |
| Runtime z dokładnego VSIX poza repo, bez PATH/NODE_PATH | SRC1 3/3, K1 16/16, K3 15/15, ART1 14/14 PASS |
| Rzeczywisty Extension Host | 13/13 PASS; single-folder, multi-root, global |
| Rzeczywiste widoczne UI, finalne ui-retry-3 | 7/7 PASS |
| Świeży build trzech bundle vs VSIX | identyczne bajty, PASS |
| Niezależny review | PASS; brak HIGH/MEDIUM |

Root i extension częściowo się nakładają. Nie sumować wyników ani powtórnych testów review.
Host korzysta z kontrolowanych odpowiedzi edytora; UI steruje widocznymi kontrolkami,
natywnym pickerem pliku i potwierdzeniem zapisu. Transport modeli jest syntetyczny loopback.
UI wykonuje 4 żądania: dwa dla Sequence i dwa dla Component, bez dodatkowego żądania zapisu
lub walidacji błędnego źródła. K3 Host wykonuje osobne jedno żądanie ekstrakcji.

## Dokładny pakiet

`build/src1/candidate-2/archi-agent-0.3.0-alpha.6.vsix`

- Rozmiar: 127241221 B.
- SHA256: `1bb8f13ba4c69f8da4449a82eaf3b2a7fe19afb958d1af8bd3863ae69cc77388`.
- extension.js: `8a250b9282dfd33665bfa3934971722add97c407f1493634c82036f0e632b74d`.
- runtime: `ff7e4e47f0ee27aa9c2080eca5b1d5e191099fb4200aba69a81979e49a08cdca`.
- converter worker: `6883e1ca32aef7c66507d15f4f65d0d242eed6c4605fad5aa3b63f9645f0eef5`.

To nieopublikowany lokalny SRC1 z dotychczasowym numerem manifestu; publiczne alpha.6
nie zostało zmienione. Fixture/licencja/syntetyczna nakładka nie są pakowane w VSIX.

## Zachowane nieudane próby

candidate-1 jest wcześniejszym przebiegiem: pełne testy/runtime przeszły, ale kod zmienił się
podczas przebiegu, a asercja Host myliła globalną wartość z effective merged configuration.
Manifest zachowuje FAIL. Próby UI zachowują błędy harnessu: edytor ustawień jako floating editor,
zwirtualizowane drzewo i dopasowanie ikony/etykiety oraz synchronizację QuickPick.

candidate-2/manifest.json również zachowuje FAIL: początkowy UI miał timeout CDP Target.getTargets.
Nie nadpisywano wyniku ani nie zmieniano VSIX. Powtórzenie wyłącznie UI na tej samej paczce
z poprawionym harnessiem dało 7/7 PASS w ui-retry-3. acceptance.json łączy ważne pełne bramki,
Host, finalny UI, niezależny review i dowód zgodności źródeł/bundli. FAIL nie są raportowane jako PASS.

## Granice dowodów

CI Linux x64/macOS ARM64 [run 38611666025](https://github.com/Setech-pl/archi-agent/actions/runs/38611666025)
dotyczy wyłącznie bazy 152542f35c839c06a9bd0eed05a8a7e8e2523752. Remote CI SRC1: NOT_RUN.
Windows ARM64 runtime: NOT_RUN. Owner smoke: DEFERRED. Brak dowodu jakości żywego modelu.
AUD-003–006 pozostają OPEN. Bez push, merge, tagów, publikacji i VER1/MCP1.

[Kontrakt i instrukcja Big Bank](src1-structurizr-source.md#owner-smoke--big-bank).
