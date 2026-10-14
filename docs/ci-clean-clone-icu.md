# CI clean-clone — naprawa brakującego ICU

Raport implementacji i lokalnej walidacji z 2026-10-14. Zakres obejmuje wyłącznie
zatwierdzone uzupełnienie zasobów pakowania i bramkę CI. Nie obejmuje publikacji,
SRC1, Core/Full ani pozostałych ustaleń audytu.

## Stan Git i zakres

Preflight: `ci/clean-clone-linux-macos`, HEAD
`ba34379bd0a75e9415cf433120e8c48e30242210`, working tree clean, staging empty.
Naprawa ICU nie była jeszcze wykonana. Testowany commit lokalnego kandydata:
**`d9370b6fa719785cc8e3ef1d177b89206a9d3c01`**.
Końcowy checkpoint dokumentacji jest jego bezpośrednim następcą; pełne SHA odczytaj
przez `git rev-parse HEAD`. Kod i testy po pełnej bramce nie zmieniały się.

Canvas pozostaje **0.1.97**, oba lockfile'y i osiem platform są zachowane.
Nie aktualizowano zależności, nie modyfikowano oryginalnych tarballi ani `.node`
i nie osłabiono kontroli kompletności. Inne braki nadal kończą przygotowanie błędem.

| Plik | Zmiana |
| --- | --- |
| `scripts/prepare-ci-ocr.mjs` | Uzupełnienie brakującego ARM64 ICU z donora x64 po weryfikacji jego SRI; porównanie bajtów i SHA256; metadane pochodzenia. |
| `experiments/ux2-ocr/build-trial.mjs` | Uzupełnienie wyłącznie w product-assets; dotychczasowa kontrola wszystkich deklarowanych zasobów po uzupełnieniu; pochodzenie w manifeście. |
| `vscode-extension/scripts/verify-vsix.mjs` | Obowiązkowe oba ICU, ich manifestowe hashe, identyczne bajty i metadane donora zgodne z OCR lockfile. |
| `test/scripts/prepare-ci-ocr.test.ts` | Poprawne uzupełnienie, brak źródłowego ICU oraz uszkodzony donor. |
| `test/vscode-extension/packaging.test.ts` | Odrzucenie braku każdego ICU w VSIX, również po usunięciu wpisu z manifestu. |
| Dokumentacja | Bieżące wyniki; zachowany historyczny FAIL. |

## Źródło upstream i pochodzenie

[PR #1278](https://github.com/Brooooooklyn/canvas/pull/1278) opisuje brak ICU
w paczce Windows ARM64.
[Commit `e1a75d1aa888dcdf44467875829d58ea19c6cdd7`](https://github.com/Brooooooklyn/canvas/commit/e1a75d1aa888dcdf44467875829d58ea19c6cdd7)
w `scripts/release-skia-binary.mjs`, linie 128–140, kopiuje ten sam pobrany
`icudtl.dat` do obu paczek Windows. Jest to bezpośredni dowód wspólnego źródła
danych ICU dla obu architektur. Nie pobieramy ICU z nowszej wersji canvas.

Donor: `@napi-rs/canvas-win32-x64-msvc@0.1.97`, wpis `package/icudtl.dat`
z `napi-rs-canvas-win32-x64-msvc-0.1.97.tgz`. SRI zweryfikowane względem OCR lockfile:

```text
sha512-sWtD2EE3fV0IzN+iiQUqr/Q1SwqWhs2O1FKItFlxtdDkikpEj5g7DKQpY3x55H/MAOnL8iomnlk3mcEeGiUMoQ==
```

Pole `canvasResourceSupplements` w finalnym `resource-manifest.json` zapisuje
uzasadnienie, URL PR, upstream commit, oba pakiety i wersje, resolved, SRI,
tarball, wpis archiwum, ścieżki plików, liczbę bajtów i oba SHA256.

## Weryfikacja wykonana w tej sesji

Testy celowane na Node 22.12.0: **22/22 PASS** — helper 6, packaging 16.
Oba typechecki PASS. Log i źródła upstream:
`/private/tmp/archi-ci-icu-g2u9jxx5/` (`targeted-tests.log`, `targeted-tests.json`,
`upstream-commit.json`, `upstream-release-skia-binary.mjs`).

Nowy izolowany klon powstał przez:

```bash
git clone --no-local --single-branch --branch ci/clean-clone-linux-macos /Users/marcinkrzetowski/Projects/archground /private/tmp/archi-ci-icu-clone-rzkssbrj/repo
```

Komenda tworzy niezależną bazę obiektów Git z lokalnego kandydata. Preflight
potwierdził testowane SHA, clean Git, brak root/OCR `node_modules`, `build/`,
`vscode-extension/build`, `vscode-extension/dist` i VSIX. Osobny cache
`/private/tmp/archi-ci-icu-clone-rzkssbrj/npm-cache` był pusty przed instalacją.
Nie kopiowano build/, node_modules, tarballi ani wcześniejszego VSIX.
Środowisko: Node **22.12.0**, npm **10.9.0**, macOS **26.6.2 (25G83)**,
darwin/arm64, uid **501**. Bundle nadal ma target Node 20.

Poniższe komendy uruchomiono w tej kolejności, bez nakładania testów i pakowania:

| Komenda | Wynik |
| --- | --- |
| `npm ci` | PASS, 194 packages |
| `npm ci --prefix experiments/ux2-ocr` | PASS, 17 packages |
| `node scripts/prepare-ci-ocr.mjs` | PASS, osiem tarballi/SRI i przygotowane zasoby |
| `npm run typecheck` | PASS |
| `npm run extension:typecheck` | PASS |
| `npm test -- --no-file-parallelism` | PASS, 1824/1824, 112 plików |
| `npm run extension:test -- --no-file-parallelism` | PASS, 662/662, 27 plików |
| `npm run extension:package` | PASS |
| `npm run extension:verify` | PASS, 532 wpisy |

Wyniki testów root i extension częściowo się nakładają; nie sumujemy ich.
Logi 01–09, `clone.log`, `run.mjs` i `report.json`:
`/private/tmp/archi-ci-icu-clone-rzkssbrj/`.

## Finalny VSIX i dowód ICU

Ścieżka:
`/private/tmp/archi-ci-icu-clone-rzkssbrj/repo/vscode-extension/build/archi-agent-0.3.0-alpha.4.vsix`

Rozmiar: **124478869 B**. SHA256:

```text
3deedebffae9bb5e9453f80c73b8c53141d175d9c4fcf2eca461d6e4afdf1b38
```

Oba wpisy są w finalnym archiwum oraz jego manifeście:

- `extension/ux2-ocr/node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat`
- `extension/ux2-ocr/node_modules/@napi-rs/canvas-win32-arm64-msvc/icudtl.dat`

Każdy ma **10468208 B**, identyczne bajty z donorem oraz SHA256:

```text
9ae98c06cbb0ea43c5cd6b5725310c008c65e46072421a1118cb88e1de9a8b92
```

Dodatkowy odczyt finalnego VSIX porównał źródłowe ICU bezpośrednio z tarballa
donora z oboma wpisami i wpisami manifestu: **PASS**. Potwierdził ponownie SRI
**8/8 tarballi** oraz identyczne bajty **8/8 natywnych `.node`** względem
oryginalnych tarballi. Verifier finalnego artefaktu: **PASS**.
Dowód: `/private/tmp/archi-ci-icu-clone-rzkssbrj/artifact-report.json`;
skrypt odczytu: `/private/tmp/archi-ci-icu-g2u9jxx5/check-artifact.mjs`.

## Lockfile'y i zachowane FAIL

Oba lockfile'y są identyczne z bazą, przed i po bramce oraz w repo właściciela.

| Plik | SHA256 |
| --- | --- |
| `package-lock.json` | `865a030ec6417d30f11690b939f3d0a32f6a8fb4b57b766eda506cec362e00c8` |
| `experiments/ux2-ocr/package-lock.json` | `3a4cc9a4aeaff01081ad2d144f4e836eb0b372f3431f1353bd73b73b66b311bb` |

Po bramce klon jest clean, staging empty, tracked diff i `git diff --check` PASS.
Końcowy checkpoint dokumentacji nie zmienia kodu względem testowanego SHA.
Bez push, PR, merge, tagów i publikacji.

Historyczny FAIL ICU z 2026-10-13 dla
`4a39cfc4b6c80e498313970f47b25b53a6a09267` zachowany w project-state i w
`/private/tmp/archi-clean-clone-ci-wh910gqd/`. SHA256 jego `report.json` nadal:
`ff96827f88491406914d1db5bfe725a94adc237f55fbd22097acfe05348366ae`.

Pierwsza nowa próba w sandboxie zachowana w
`/private/tmp/archi-ci-icu-clone-fecfofxx/`: npm ci FAIL przez DNS ENOTFOUND,
pozostałe kroki NOT_RUN. Przebieg PASS wykonał kolejny nowy klon i pusty cache
po przyznaniu dostępu do sieci; nie użył zasobów niezaliczonej próby.
Wcześniejsze błędy sandboxa przy pobraniu upstream i domyślnym cache npm
nie są wynikami pełnej bramki PASS.

**LOCAL CLEAN-CLONE VALIDATION: PASS.**
**GITHUB LINUX CI: NOT_RUN; GITHUB MACOS CI: NOT_RUN; WINDOWS ARM64 RUNTIME: NOT_RUN.**
**SRC1 ENTRY GATE: OPEN.**

IMPLEMENTATION READY FOR REVIEW
