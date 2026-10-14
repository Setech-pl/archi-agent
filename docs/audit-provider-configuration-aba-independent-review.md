# Niezależny re-review korekty ABA AUD-002 — 2026-10-13

| Ustalenie | Werdykt | Dowód |
| --- | --- | --- |
| AUD-002 | **PASS** | Oba pierwotne zewnętrzne A→B→A podczas listing i QuickPick kończą się `cancelled`, bez zapisów starego pickera, z zachowanym nowszym profilem, modelem i bindingiem A. |
| Zachowanie AUD-001 | **PASS** | Anthropic→OpenAI wiąże credential z finalnym profilem OpenAI; generator i reviewer zachowują ten sam endpoint, model i credential mimo kolejnej zmiany ustawień. |

Jeden niezależny przebieg review; bez zmian kodu i testów, bez pętli napraw.
Brak blokujących ustaleń i istotnych nierozstrzygniętych niepewności w ocenianym
kontrakcie. PASS zamyka AUD-001/002 w lokalnej naprawie. AUD-003–006 pozostają
otwarte; M1 i gotowość do release nie są zamknięte. Pierwotny
[raport BLOCKER](audit-provider-configuration-independent-review.md) pozostaje
niezmienioną historią.

## Tożsamość przeglądanej wersji

Preflight: `fix/audit-provider-configuration-consistency`, HEAD
`20a1acb54e3ac40dff19194563846a3ded33c088`, dokładnie 6 modified + 8 untracked,
pusty staging. Przeczytano instrukcje repo, diff i wszystkie nowe pliki naprawy.
Manifest: `build/audit-provider-config/aba-20261012/manifest.json`.

- Fingerprint `source-fingerprint.json`: **403/403 zgodne**; SHA-256
  `992422d8234651258f6bf3405e359d6cd53c0a493c448c6ef6c46f8950d8d0cf`.
- Wszystkie **14/14** hashy `finalFilesSha256` zgodne przed edycją dokumentacji review.
- VSIX `build/audit-provider-config/aba-20261012/candidate/archi-agent-0.3.0-alpha.4.vsix`:
  **119882805 B**, SHA-256
  `2a8c4ef7b3b325e333393a0428bbb3d06f82f3ac494fb3af8734942e8056908f`.
  Trzy bundle odczytane bezpośrednio z ZIP mają hashe zgodne z manifestem pakowania.
- Pięć oryginalnych plików audytu zgodnych z `original-hashes.json`.
  Zachowano oryginalny review, reprodukcje, wcześniejsze błędy i stare artefakty.

Własne dowody znajdują się poza repo: `/private/tmp/archi-aba-review-ur80padb/`.
`initial-files.json` utrwala wejściowe pliki naprawy, `preserved-evidence.json`
utrwala 104 istniejące pliki dowodowe naprawy i pierwszego review.

## Ocena produkcyjnej korekty AUD-002

`vscode-extension/src/provider-configuration.ts:27` rejestruje
`workspace.onDidChangeConfiguration` synchronicznie. `selectModel` robi capture
przed pierwszym odczytem SecretStorage; Select Provider przed QuickPick, a Apply
przed asynchroniczną publikacją stanu panelu. Nie ma luki przed pierwszym
istotnym await objętej tymi interakcjami.

Callback sprawdza sześć kluczy dostawcy przez `affectsConfiguration` w zakresie
przekazanego zasobu; bez zasobu przekazuje jawny scope bez URI. Zmiana istotna
zwiększa monotoniczną rewizję obserwacji, niezależną od powrotu wartości do A.
Porównanie ośmiu pól `inspect`, tożsamości/trust workspace oraz wspólny licznik
publikacji uzupełniają kontrolę. Ekstrakcja i generowanie przekazują resource
projektu do pickera; zapis modelu/bindingu pozostaje Global.

`local-provider-selection.ts:151` sprawdza aktualność po credentialu, listowaniu
i QuickPick. Publisher sprawdza ją przed publikacją oraz między każdym zapisem
i jego await. Zwraca snapshot z tą samą obserwacją, więc kontrola w komendzie po
await publikacji nadal wykrywa ABA; przed `selected` następuje też sprawdzenie
efektywnego profilu/modelu/endpointu/timeoutu. Apply używa tego samego mechanizmu.
Konflikt zatrzymuje dalsze zapisy; brak rollbacku nadpisującego nowsze wartości.

Rozpoznawanie własnych zapisów (`provider-configuration.ts:39,79`) dopuszcza
jednorazowo jeden oczekiwany klucz i dokładny stan wszystkich obserwowanych
wartości. No-op nie dostaje tego wyjątku, a `finally` usuwa oczekiwanie po update.
Nie wycisza całego okresu publikacji. Dwie dodatkowe próby niezależne sprawdziły
ABA tego samego klucza po własnym zdarzeniu oraz sytuację, w której zewnętrzne
zdarzenie jako pierwsze osiąga oczekiwany stan. W obu kolejne zdarzenia podnoszą
rewizję do 2, publikacja zgłasza konflikt i nie wykonuje następnego zapisu.

API zdarzeń nie udostępnia tożsamości writera. Rozpoznanie pojedynczego eventu
jest zgodnością klucza i stanu, nie dowodem pochodzenia. Pojedynczy równoczesny
zewnętrzny zapis dokładnie tej samej oczekiwanej wartości podczas trwającego
update pozostaje granicą opisanego braku CAS. Nie obala to wykrywania obserwowanego
ABA ani obu pierwotnych przeplotów, w których zmiany kończą się przed publikacją.

Subskrypcje komend i operacji panelu są zwalniane w `finally`, również po Cancel,
błędzie zapisu, wyjątku listowania i zamknięciu panelu. Guard przy błędzie zwalnia
stan `writing`. Kontrole pozytywne potwierdzają zwykły wybór, legacy, własne
powiadomienia i niepowiązane zmiany.

## Bieżące celowane kontrole

1. `npm test -- test/vscode-extension/audit-provider-configuration.test.ts -t 'external ABA|allows publication|observes ABA|checks the original revision|a no-op|disposes configuration observation|cloud-anthropic -> cloud-openai' --reporter=json --outputFile=/private/tmp/archi-aba-review-ur80padb/targeted-tests.json`:
   **22/22 PASS**, 88 pominiętych, exit 0. Obejmuje 20 regresji korekty i dwa
   warianty Anthropic→OpenAI (Sequence/Component), z asercjami generatora/reviewera.
2. `node /private/tmp/archi-aba-review-ur80padb/review-reproductions.mjs`:
   **6/6 PASS**, exit 0. Kopia pierwotnej niezależnej reprodukcji, z oczekiwaniami
   poprawnego zachowania ABA oraz powiadomieniami tylko dla zmienionej wartości
   (oryginalny prosty adapter emitował również no-op). Produkcyjne komendy,
   guard, resolver i transport; kontrolowane VS Code i ostatnia wymiana sieciowa.
   Dodatkowo dwie powyższe próby rozpoznawania własnego eventu. Oryginału nie zmieniono.

| Pierwotny przeplot | Wynik | Zapisy starego pickera | Stan po zakończeniu |
| --- | --- | --- | --- |
| A→B→A podczas listing | cancelled | 0 | local-lm-studio / intent-A-model / local-lm-studio |
| A→B→A podczas QuickPick | cancelled | 0 | local-lm-studio / intent-A-model / local-lm-studio |

W każdym wariancie sześć zewnętrznych zapisów i sześć zdarzeń kończy się przed
wznowieniem starego pickera. Stan zachowuje również binding; subskrypcje są zwolnione.

AUD-001: niezależna reprodukcja potwierdza dwa odczyty sekretu OpenAI, prawidłowy
credential listowania i generowania oraz endpoint `openai-chat-completions`.
Celowane testy sprawdzają również drugi request review: ten sam model
`final-model`, endpoint i credential pomimo zmiany ustawień podczas generowania.
Kod komendy ustala profil po selekcji; runtime zamraża request i przekazuje
jeden skonfigurowany klient do generowania i review. Guard tego kontraktu nie zmienia.

## Zastane dowody i ograniczenia

Przeczytano asercje i raporty/logi; poniższych przebiegów nie ponawiano:

- **Host 9/9 PASS**: `real-host-verified/host-report.json`, `host.log` oraz oba
  skrypty `audit-provider-configuration-host`. Wrapper wywołuje rzeczywiste
  `getConfiguration().update` i oryginalne `onDidChangeConfiguration`; nie
  zwiększa ręcznie rewizji guarda. Dla listing/QuickPick: cancelled, 0 zapisów,
  6 zdarzeń, zachowany pełny stan A i 0 aktywnych subskrypcji. Produkcyjny picker
  i guard pochodzą ze źródeł, listing i UI są kontrolowane.
- **Bundle VSIX 36/36 PASS**: `packaged-report.json`, `packaged.log`, runner
  i asercje `scripts/audit-provider-configuration-smoke.mjs`. Niezmienione bundle
  poza repo, puste PATH/NODE_PATH; oba ABA, zero dalszej generacji i pełna macierz
  AUD-001. To osobna warstwa od rzeczywistego Host.
- **1816/1816** w `root-tests-final.json`, historyczne oba typechecki,
  build/package/verify **531 wpisów**. Przed poprawką oba nowe ABA były FAIL.

Kontrola innego zasobu w rzeczywistym Host zmienia resource-scoped Knowledge Pack,
a nie klucz dostawcy; rzeczywisty endpoint ma zakres window. Workspace ABA endpointu
jest sprawdzone natywnie, a filtr klucza dostawcy według resource — w teście jednostkowym.
Nie przypisuję temu mocniejszego pokrycia integracyjnego niż wynika z asercji.

Nie wykonywano pełnego gauntletu, pełnego audytu, owner smoke, natywnego UI ani
ponownego build/pakowania. Bez płatnych calls, sieci cloud i rzeczywistych kluczy.
Systemowy SecretStorage i inne platformy pozostają niezweryfikowane. Wielokrotne
zapisy VS Code nie są atomowe; ograniczenia CAS i crash recovery pozostają w kontrakcie.

## Lokalny checkpoint

Warunki lokalnego commita spełnione: oba PASS, brak blockerów, źródła/testy zgodne
z manifestem. Aktualizacja statusów obejmuje wyłącznie dokumentację naprawy i
project-state; historyczny BLOCKER pozostaje bez zmian. Commit obejmuje 14
zastanych plików naprawy oraz ten raport, bez build/, VSIX i niezwiązanych zmian.
Kontrole finalizacji: ponowny fingerprint **403/403 PASS**, zachowanie **104/104**
plików dowodowych PASS, odnośniki i whitespace PASS, `git diff --check` oraz
`git diff --cached --check` PASS. Staged diff obejmuje dokładnie 15 autoryzowanych
plików; kod/testy i historyczny review są bajtowo zgodne z ocenioną wersją.
SHA checkpointu podaje Git i raport końcowy sesji, bez samoodwołującego się SHA
w dokumencie.
