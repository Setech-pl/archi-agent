# Niezależny review AUD-001 / AUD-002 — 2026-10-12

| Ustalenie | Werdykt | Uzasadnienie |
| --- | --- | --- |
| AUD-001 | **PASS** | Credential jest rozwiązywany dla finalnego profilu; generator i reviewer zachowują tę samą konfigurację. Reprodukcja Anthropic→OpenAI używa klucza OpenAI w produkcyjnym adapterze OpenAI. |
| AUD-002 | **BLOCKER (medium)** | Zewnętrzne zmiany A→B→A przywracają uprawnienie starego pickera do zapisania modelu. Potwierdzono nadpisanie nowszej intencji podczas listowania i QuickPick. |

Jeden przebieg review, bez napraw kodu. Brak lokalnego commita: warunek dwóch PASS nie jest spełniony. AUD-003–006 pozostają otwarte i poza zakresem; review nie zamyka M1 ani nie potwierdza gotowości release.

## Tożsamość zmiany i dowodów

Branch `fix/audit-provider-configuration-consistency`, HEAD/baza
`20a1acb54e3ac40dff19194563846a3ded33c088`. Preflight zgodny: pięć plików modified,
cztery untracked, staging pusty. Przeczytano diff i pełną treść nowych plików.
Fingerprint dziewięciu plików zapisano w
`/private/tmp/archi-aud001-002-review-_5i8rne0/fingerprint.json`; SHA-256 tego manifestu:
`c05516cb857bcdf5551124173acfadcbb24bcf538ff653840bf9b74a4e4e206e`.
Ten katalog zawiera także `reviewed.diff`, reprodukcję i wyniki bieżących kontroli.

Wszystkie **445/445** plików zgodne z
`build/audit-provider-config/run-20261012/evidence/final-manifest.json`.
Względem manifestu gauntletu różnią się wyłącznie `docs/project-state.md` i
`docs/audit-provider-configuration-fixes.md`, zgodnie z udokumentowanym uzupełnieniem
wyników po gauntlecie. Źródła wykonywalne i testy zgodne. Pole `base` gauntletu nadal
wskazuje historyczną bazę FU2 `d5fb95a4d060ef501566792d80b346e0fe1a79cb`;
jego `head` i `finalHead` oraz baza finalnego manifestu naprawy wskazują oczekiwany `20a1acb…`.

VSIX z `build/ux4-fu2/gauntlet-2026-10-12T16-44-01-554Z-54662/`:
**119882456 B**, SHA-256
`5b5fc0e2dbe3e21b033813759a6d597e3c7827c67807d2dd448729e6ea741144`.
Trzy bundle w archiwum zgodne z hashami kandydata i świeżego buildu w manifeście.
Pięć oryginalnych plików audytu wymienionych w `original-hashes.json` zachowuje hashe;
oryginalnych dowodów nie modyfikowano.

## AUD-001 — dowody PASS

`generate-sequence-diagram.ts:308` ustala profil po zakończeniu wyboru modelu.
`readApiKey` odczytuje wpis SecretStorage przypisany temu profilowi. Zamrożone ustawienia
i request nie są zastępowane przez ponowny odczyt konfiguracji po await; runtime przekazuje
jeden skonfigurowany klient do generacji i review. Dotyczy Sequence i Component.
Budowa Knowledge Pack rozwiązuje credential po finalnej selekcji i zachowuje resource projektu.
Anulowana lub wykryta jako nieaktualna selekcja przerywa dalszą generację. Problem
niewykrytej nieaktualności A→B→A opisano osobno pod AUD-002; nie miesza on kluczy dostawców.

Bieżąca reprodukcja pierwotnego Anthropic→OpenAI: listing i generacja otrzymują syntetyczny
klucz OpenAI, endpoint `openai-chat-completions`, oba odczyty sekretu dotyczą OpenAI.
Produkcja: komenda, resolver, adapter sekretów, runtime i klient transportu;
kontrolowane: VS Code oraz ostatnia wymiana sieciowa. Bez rzeczywistej transmisji.
Ponowione istniejące testy **90/90 PASS** obejmują macierz pięciu profili × trzy cloud ×
dwa diagramy, dokładny endpoint/model/credential, stabilność review po zmianie ustawień,
ekstrakcję i anulowanie. Budżety zachowane: listing osobno, maksymalnie generacja + review,
jedna ekstrakcja; diagnostyka używa finalnego profilu, bez wypisywania klucza.

## AUD-002 — konkretny blocker

Lokalizacja: `vscode-extension/src/provider-configuration.ts:27–33,40–43` oraz
`vscode-extension/src/commands/local-provider-selection.ts:223`.
Licznik `publication` zmienia się tylko we wspólnym writerze. Guard nie obserwuje zdarzeń
zmiany ustawień; porównanie wartości nie wykrywa zewnętrznego A→B→A.

Reprodukcja z produkcyjnym `selectModel` i resolverem:

1. Stan A: LM Studio, model `intent-A-model`, binding LM Studio. Uruchom stary picker.
2. Podczas await listowania albo QuickPick zmień ustawienia poza guardem na OpenAI /
   `intent-B-model`, następnie przywróć cały stan A (np. przez User settings).
   Wszystkie sześć zapisów kończy się przed wznowieniem pickera; adapter emituje zdarzenia konfiguracji.
3. Zakończ stary picker wyborem `stale-picker-model`.
4. Oczekiwane: cancelled, zero zapisów starego pickera, zachowany `intent-A-model`.
   Rzeczywiste w obu wariantach: **selected, trzy zapisy**, efektywny model `stale-picker-model`.

Dowód: `review-reproductions.mjs` i `evidence/reproductions.json` w katalogu review;
przypadki `AUD-002-external-ABA-listing` oraz `AUD-002-external-ABA-picker`.
To zakończone zmiany przed pierwszym zapisem pickera, więc ograniczenie CAS podczas
pojedynczego update opisane w kontrakcie nie wyjaśnia tego przypadku.

Pozostała ochrona działa w przejrzanych scenariuszach: zwykła reprodukcja LM Studio→OpenAI
zwraca cancelled i zero zapisów, zachowując nowszy model/binding. Picker i Apply współdzielą
blokadę; kontrola obejmuje zakresy i każde await zapisu. Zwrot selected sprawdza efektywny
model/profil/endpoint/timeout. Legacy, null, workspace, Cancel, błędy i częściowe zapisy
mają celowane asercje; brak rollbacku nadpisującego nowsze wartości. Istniejący test ABA
przez drugi picker przechodzi, ponieważ ten writer zwiększa licznik. Nie pokrywa zmian zewnętrznych.

Minimalne dalsze działanie: unieważniać stare interakcje także po zaobserwowanych zmianach
konfiguracji poza wspólnym writerem, niezależnie od powrotu do dawnych wartości; dodać
regresję powyższych dwóch przeplotów i ponownie ocenić AUD-002. Bez samodzielnej implementacji.

## Weryfikacja i granice

Bieżące komendy: `node /private/tmp/archi-aud001-002-review-_5i8rne0/review-reproductions.mjs`
(dwie pierwotne reprodukcje naprawione, dwa warianty blockera potwierdzone) oraz
`npm test -- test/vscode-extension/audit-provider-configuration.test.ts --reporter=json --outputFile=/private/tmp/archi-aud001-002-review-_5i8rne0/focused-tests.json`
(90/90 PASS). Log i JSON zachowano poza repo.

Historyczne dowody sprawdzono w raporcie, logach i asercjach: gauntlet **294/294**,
root **1796**, extension **640**, typechecki, build/package/verify; Host **99/99**,
natywne UI **9+12+4+28 PASS**. Asercje Host/UI sprawdzają zapis bindingu, Apply/Discard,
odrzucanie starej rewizji i opóźnionych list. Te wyniki nie obalają powyższej reprodukcji ABA.
Nie ponawiano gauntletu, Host/UI ani owner smoke. Systemowy SecretStorage i realne cloud
pozostają niezweryfikowane; nie użyto prawdziwych kluczy ani płatnych calls.

Końcowo: dziewięć wejściowych plików bez zmian względem fingerprintu; dodano tylko ten raport.
`git diff --check` oraz kontrola whitespace wszystkich untracked: PASS. Staging pusty,
HEAD bez zmian. Dokumenty poprzedniej implementacji zachowano; niniejszy raport podaje
wynik ich oczekiwanego niezależnego review. Bez commit/push/merge/tag/publikacji.
