# SRC1 — niezależny review

Zapis wyników osobnego kontekstu read-only `src1_core_review`, nie własny review autora.
Zakres: kontrakt z czterema korektami właściciela, Core/Node/runtime/Host, K1, ART1,
konfiguracja, Browser i regresje. Wykonawca review nie edytował repo ani stagingu.

## Ustalenia i zamknięcie

| Waga | Ustalenie | Naprawa i dowód |
| --- | --- | --- |
| HIGH | UMD jsonc-parser zostawiał dynamiczny require ./impl/format w bundlu | Wąskie rozwiązywanie jsonc-parser do opublikowanego ESM; niezależny świeży produkcyjny bundle ładuje się; exact-VSIX packaged smoke PASS |
| MEDIUM | Właściwości JSON nadpisywały lokalizację obiektu | Osobne ścieżki właściwości, zachowane pozycje obiektów; regresja linii |
| MEDIUM | Duplikaty aliasów i reguł były akceptowane | Jawne klucze duplikatów; legalna niejednoznaczność zachowana; regresje |
| MEDIUM | VS Code scala obiekty konfiguracji między scope | K3 zapisuje scoped null zamiast obiektu; doubles odwzorowują null/merge, rzeczywisty Host sprawdza build→Save and use |
| MEDIUM | Niepotrzebny wariant ustawienia local-directory rozdzielał źródło walidowane i pokazywane | Usunięto wariant nowego ustawienia; pozostały null/Structurizr oraz istniejący knowledgePackPath |

Końcowy werdykt niezależnego review: **PASS, brak otwartych HIGH/MEDIUM**.
Reviewer potwierdził kontrakty ID/końców, kwalifikację nazw, model-first mode, provenance,
minimalny kontekst, wspólny snapshot, brak nowych wywołań oraz zapis bez ponownego odczytu.

Własne kontrole reviewera: 170/170 testów celowanych w siedmiu plikach; końcowy re-review
101/101 (podzbiór, nie sumować), import świeżego produkcyjnego bundla i diff-check PASS.
Niezależny hash fixture zgodny: 63526 B,
93fbed6bb643d14ee58c70a5b195c55fa319462ea20dc896280b63312196f1f3.
Dodatkowa niezależna reprodukcja dirty editor: pokazane frozen details, bez błędnej nawigacji.

Review jest odrębny od [bramek wykonawcy](src1-verification.md). Owner smoke DEFERRED.
AUD-003–006 są wcześniejszymi otwartymi pozycjami; ten review ich nie zamyka.
