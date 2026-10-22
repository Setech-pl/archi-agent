# Archi Agent — EAK2 + EA2 — pełne zlecenie
Data: 2026-10-21. Model zalecany: GPT-6.1 Sol, effort high.

Ten dokument jest samowystarczalnym zakresem implementacji. Zastępuje wcześniejsze skróty i odesłania do niedostępnej rozmowy. Nie wymaga odszukania innego promptu. Nie jest wynikiem weryfikacji lokalnego repo.

## 1. Cel i uprawnienia

Zrealizuj dwa kamienie milowe:
- EAK2: kontrolowana aktualizacja istniejącego katalogu enterprise.
- EA2: Capability–Application Map, czyli mapa wsparcia zdolności biznesowych przez aplikacje.

Przepływ użytkownika: istniejący katalog → nowe informacje → przegląd różnic i decyzje → kontrolowany zapis → mapa zdolności i aplikacji.

Obowiązuje jedna pętla: implementacja z testami celowanymi → wspólny końcowy gauntlet i niezależny review zgodnie z kolejnością wymaganą przez repo → lokalny checkpoint. Nie ponawiaj pełnych bramek po każdej drobnej poprawce.

Autoryzowane: odczyt, plan techniczny, implementacja, testy, budowanie lokalnych paczek, niezależny review w osobnym kontekście i lokalne commity po wymaganych kontrolach. Możesz zapisać osobne lokalne commity obu milestones, zachowując uczciwe oznaczenie, które bramki wykonano przy wspólnym kandydacie.

Bez push, merge, tagów, release, publikacji, płatnych wywołań i rozpoczynania EA3/EA4.

## 2. Rzeczywista baza i zachowanie pracy

Repo główne: ~/Projects/archground
GitHub: Setech-pl/archi-agent

Właściwa baza:
a820752d655c8f1ef370ee2f22a1584d80ac34e7
branch fix/aud-fix2
worktree /private/tmp/archi-aud-fix2

Baza zawiera EAU1/EAK1 z checkpointu 7e0352d oraz lokalne zamknięcie AUD-003/004. Ostatni raport: working tree czysty, staging pusty.

Raport bazowy:
build/aud-fix2/acceptance-report.md

Dokładne paczki bazowe:
- Core: build/aud-fix2/common-r1/packages/archi-agent-core-0.3.0-alpha.7.vsix
  SHA-256 7e02e30de7bd2bc8ede0abc94a542543a682b6ac7cdaa9763917a1277284f427
- Full: build/aud-fix2/common-r1/packages/archi-agent-full-0.3.0-alpha.7.vsix
  SHA-256 1e26e43bdc00eac2d71bf8067c1f9d76307a440398574703bd432aa102ce5960
- CLI: build/aud-fix2/common-r1/packages/cli/archi-agent-cli-0.3.0-alpha.7.tgz
  SHA-256 84a53ff8ca23aba91c66a7048e11b5ed0034c7cf77a1aac91c74d5d8cae1cf9b

Nie korzystaj ze starszego checkoutu EA1b jako bazy. Sprawdź rzeczywisty Git i ancestry. Jeśli właściwe prace EAK2/EA2 już istnieją, najpierw ustal ich zakres i kontynuuj zamiast dublować.

Odczytaj AGENTS.md, instrukcje repo i właściwy SKILL.md gauntletu, docs/architecture.md, docs/enterprise-catalog.md, docs/product-roadmap.md, workflow i bazowy raport. Następnie zbadaj implementację EAK1, walidację/snapshot enterprise, zapis wersjonowanych dokumentów, ART1 oraz CLI/MCP.

Pracuj na nowej gałęzi, np. feature/eak2-ea2, w izolowanym worktree opartym na powyższej bazie. Nie przełączaj zajętych checkoutów, nie resetuj, nie stashuj i nie usuwaj cudzych zmian. Nie zmieniaj gałęzi PR #13.

## 3. Trwałość zlecenia i planu

Jako pierwszą zmianę w nowym worktree zachowaj pełną kopię tego zlecenia:
docs/plans/eak2-ea2-brief.md

Jeżeli ten plik istnieje, porównaj treść i nie nadpisuj cudzych zmian bez ustalenia ich znaczenia.

Następnie opracuj:
docs/plans/eak2-ea2-implementation.md

Plan ma zawierać konkretne typy/API, wersjonowanie danych i MCP, reguły zmian i konfliktów, zapis, widoki EA2, limity, listę plików, testy i DoD. W project-state zapisz krótkie wskazanie aktywnego zadania, obu plików i worktree.

Zatwierdzone są cele i granice w tym zleceniu. Szczegółowe nazwy nowych pól i API nie zostały wcześniej zamrożone — masz je zaprojektować na podstawie repo. Nie zatrzymuj zadania z powodu braku nieistniejącego wcześniejszego schematu aplikacji. Podejmuj rutynowe decyzje w tych granicach i realizuj implementację.

## 4. EAK2 — źródła i cykl aktualizacji

Obsłuż istniejący lokalny katalog enterprise oraz nowe informacje z:
- wpisanego opisu;
- zaznaczenia;
- całego aktywnego dokumentu;
- jawnie wybranych lokalnych dokumentów obsługiwanych przez obecny konwerter.

Reużyj konfigurację providera/modelu, bezpieczne credentiale, ekstrakcję, ograniczenia materiałów i sesję przeglądu EAK1. Nie buduj drugiego systemu konfiguracji ani ogólnego RAG.

Przechwyć materiał, tożsamość i wersję źródła oraz katalog bazowy. Cała sesja operuje na zamrożonej bazie. Późniejsza zmiana pliku nie aktualizuje jej po cichu.

Przepływ:
wybór katalogu → przechwycenie bazy → nowe materiały → propozycje → przegląd różnic → akceptacja → produkcyjna walidacja → kontrolowany zapis → odczyt i potwierdzenie.

## 5. EAK2 — operacje i tożsamość

Przegląd rozróżnia:
- dodanie zdolności;
- zmianę nazwy/opisu;
- zmianę rodzica;
- zmianę jawnej oceny;
- konflikt;
- propozycję usunięcia;
- brak zmiany.

Zachowaj ID istniejących rekordów. Rename nie jest nową tożsamością. Sugestia dopasowania po nazwie nie jest automatycznie zatwierdzonym powiązaniem. Gdy brak jednoznacznego oryginalnego ID, użytkownik potwierdza konkretny cel.

Nie zastępuj katalogu w całości wynikiem LLM. Nieobecność rekordu w nowych lub częściowych materiałach nie oznacza usunięcia. Nowa propozycja nie nadpisuje automatycznie zatwierdzonej informacji.

Usunięcie wymaga jawnej decyzji, podglądu dzieci i odwołań. Nie kasuj zależności automatycznie dla uzyskania poprawnej walidacji. Użytkownik osobno rozstrzyga ich usunięcie/przeniesienie albo operacja pozostaje zablokowana.

Sprawdzaj brakujących rodziców, cykle, poziom L1–L3, kolizje i duplikaty. Ocena nie jest zgadywana ani agregowana z dzieci. Nieznana ocena pozostaje nieznana. Nie zwiększaj coverage na podstawie samego zakończenia odpowiedzi modelu.

Po dodaniu EA2 aktualizacja musi zachowywać wszystkie obsługiwane kolekcje i odwołania. Aktualizacja samych zdolności nie może gubić aplikacji ani ich powiązań.

EAK2 nie implementuje aktualizacji/merge dawnych pięcioplikowych Knowledge Packów.

## 6. EAK2 — provenance i decyzje

Rozróżniaj fakt źródłowy, propozycję modelu i decyzję użytkownika. Cytat i lokalizacja muszą odpowiadać rzeczywiście przechwyconemu materiałowi.

Zmiana zatwierdzona przez użytkownika nie może podszywać się pod treść starego dokumentu. Zachowuj stare dowody tam, gdzie nadal opisują pola; nowe pola i decyzje otrzymują właściwe pochodzenie.

Nie wymyślaj ścieżek, numerów linii i zewnętrznych źródeł. Dla aplikacji i relacji stosuj te same zasady. Metadata sesji/review nie dodawaj przypadkowo do strict katalogu.

## 7. EAK2 — zapis i konflikty

Runtime przygotowuje zatwierdzoną, walidowaną zmianę. Host korzysta z istniejącego wzorca wersjonowanej edycji dokumentu i natywnego zapisu VS Code.

Przed zastosowaniem sprawdź:
- tożsamość źródła i katalogu;
- wersję/fingerprint bazy;
- wersję dokumentu;
- dirty buffer i zmiany na dysku.

W minimalnym wariancie dirty buffer, inna wersja dokumentu lub inne bajty pliku zatrzymują zapis istniejącego pliku. Sesji nie przenoś automatycznie na nową bazę. Zachowaj cudze zmiany.

Możesz zaoferować zapis wyniku do nowego pliku bez nadpisania istniejącego. Nie stosuj bezwarunkowego writeFile ani automatycznego scalania równoległych edycji.

Rozróżnij przygotowanie, anulowanie, konflikt, nieaktualną bazę, błąd i potwierdzony zapis. Saved wymaga ponownego produkcyjnego odczytu i walidacji zapisanych danych. Jeżeli po zapisie wykryjesz zmianę, nie cofaj cudzych edycji i nie raportuj pewnego sukcesu.

Kontrole przed/po natywnym zapisie nie są atomowym filesystem compare-and-swap. Nie deklaruj transakcji wieloplikowej ani crash recovery.

## 8. EA2 — znaczenie biznesowe

Dodaj Capability–Application Map do Enterprise Architecture.

Widok odpowiada:
- jakie aplikacje wspierają zdolność;
- jakie zdolności wspiera aplikacja;
- gdzie brakuje udokumentowanego wsparcia;
- gdzie występuje kilka jawnych powiązań.

Kilka aplikacji nie dowodzi redundancji. Brak relacji w częściowym źródle nie dowodzi braku systemu. Nie diagnozuj automatycznie kandydatów do likwidacji i nie wymyślaj rekomendacji inwestycyjnych.

## 9. EA2 — kontrakt danych i kompatybilność

Potrzebne są:
- aplikacje ze stabilnymi ID i nazwami;
- jawne powiązania aplikacji ze zdolnościami;
- provenance;
- jawny zakres/pokrycie danych aplikacyjnych i powiązań.

Aplikacja i capability mają odrębne rodzaje tożsamości. Relacja wskazuje konkretne ID, nie nazwę. Zaprojektuj minimalne wymagane pola, jednoznaczną tożsamość relacji i walidację duplikatów.

Nie wymagaj właścicieli, technologii, ocen i cyklu życia, jeśli źródło ich nie podaje. Opcjonalne pola wprowadź wyłącznie, gdy służą tej funkcji.

Jeśli ścisły obecny schemat wymaga nowej wersji katalogu, wprowadź ją jawnie:
- odczyt starych katalogów v1 nadal działa;
- dotychczasowa Capability Map zachowuje znaczenie;
- stary katalog nie dostaje automatycznie fikcyjnych aplikacji;
- brak kolekcji wsparcia oznacza brak dostarczonych informacji, nie kompletność;
- starsza wersja pozostaje dostępna bez przymusowej migracji;
- zapis nowego rozszerzonego modelu wskazuje właściwą wersję;
- nie odrzucaj po cichu nieobsługiwanych danych;
- digesty uwzględniają semantykę wersji i właściwe nowe rekordy.

Zachowaj get_knowledge_snapshot v1 bez migracji. Rozszerzenie enterprise MCP musi być jawnie wersjonowane i wybierane deterministycznie. Stary get_enterprise_snapshot v1 nadal zachowuje swój kontrakt. Nie zmieniaj formatu pod istniejącym numerem i nie stosuj fallbacku po błędzie.

W planie wpisz konkretną wybraną ścieżkę wersjonowania i testy starych/nowych klientów. Nie dodawaj nowego ogólnego frameworka protokołów.

## 10. EA2 — wprowadzanie aplikacji i relacji

Minimalna ścieżka użytkownika:
- dodaj lub wskaż aplikację;
- wskaż zdolność;
- jawnie zatwierdź powiązanie;
- zapisz katalog przy użyciu bezpiecznej ścieżki EAK2.

Reużyj istniejące wzorce review i QuickPick. Nie wymagaj ręcznego pisania rozszerzonego JSON jako podstawowego UX. Nie buduj dodatkowego rozbudowanego workbencha.

LLM może proponować aplikacje/powiązania z jawnych materiałów w przepływie EAK1/EAK2, ale obowiązują evidence, rozróżnienie propozycji i świadoma akceptacja.

Dla istniejącego modelu Structurizr możesz reużyć adapter do pobrania tożsamości/opisów systemów. Nie parsuj go drugim loaderem i nie zgaduj wsparcia capabilities z relacji technicznych ani nazw. Nowy importer EA/COM/ArchiMate i harvesting dowolnych narzędzi MCP pozostają poza zakresem.

Odczyt rozszerzonego katalogu i generowanie EA2 mają działać lokalnie i przez źródło enterprise MCP.

## 11. EA2 — generowanie i zapis

Z gotowych zaakceptowanych danych generuj deterministycznie: zero LLM i bez wymogu providera.

Zaprojektuj czytelny widok zdolności oraz wspierających aplikacji. Dopuszczaj zawężenie do domeny lub konkretnej zdolności. Zachowaj jednoznaczność przy identycznych nazwach i wielu relacjach.

Zdefiniuj jawne, uzasadnione limity węzłów, krawędzi i rozmiarów. Przekroczenie kończy się czytelnym żądaniem zawężenia zakresu, bez obcinania rekordów.

Preferuj wyłącznie bezpośrednie jawne powiązania. Nie dziedzicz automatycznie wsparcia z dzieci na rodzica. Poza zakresem są automatyczne wnioski o pokryciu i agregacja ocen.

Raport zawiera:
- źródła, snapshot i digesty;
- wybrany zakres;
- widoczne aplikacje, capabilities i relacje;
- provenance oraz lokalizacje adekwatne do transportu;
- pominięte rekordy i powody;
- zakres pokrycia i ograniczenia;
- modelCalls: 0 dla renderowania.

Generuj PlantUML przez deterministyczny bezpieczny renderer. Bez swobodnych dyrektyw LLM i zewnętrznych include. Zapis oryginalnej pary diagram/raport przez ART1.

## 12. Hosty i budżet LLM

EA2 udostępnij przez:
- VS Code Create Diagram;
- CLI;
- istniejący serwer funkcji MCP.

Wspólny runtime odpowiada za semantykę i walidację. Hosty są cienkie. Zachowaj dyskryminowane wejścia narzędzi bez naruszania starych diagramów.

Interaktywny zapis EAK2 realizuj w VS Code. Nie rozszerzaj serwera wiedzy o zdalny zapis. CLI/function MCP nie zapisują katalogu w tle ani automatycznie przy generowaniu.

Zachowaj zabezpieczenia readRoots i istniejące granice źródeł. Model nie wybiera sam narzędzi ani plików.

Dla ekstrakcji EAK2 pokaż jawnie wybrane materiały i maksymalny budżet wywołań; reużyj EAK1. Nie wysyłaj pozostałej zawartości workspace. Bez niejawnych retry/repair/fallbacku. Obsłuż timeout, truncation, anulowanie, błędne evidence i instrukcje osadzone w źródłach.

Bez płatnych wywołań. Lokalny smoke wykonaj, jeżeli dostępny jest już skonfigurowany provider bez kosztu; inaczej NOT_RUN. Nie zmieniaj konfiguracji właściciela i nie wypisuj sekretów.

## 13. Demo i testy celowane

Rozszerz syntetyczny Retail. Zapewnij:
- aplikację wspierającą kilka zdolności;
- kilka aplikacji wspierających jedną zdolność;
- zdolność bez udokumentowanego wsparcia;
- aplikację bez powiązań;
- źródło częściowe;
- rename przy zachowanym ID;
- bezpieczną zmianę katalogu z przeglądem diffu.

EAK2 testuj:
dodanie, zmianę i no-op; stabilność ID; niejednoznaczne dopasowanie; sprzeczności; brak automatycznych usunięć; usunięcie z zależnościami; cykl; zachowanie ocen i provenance; dirty/version/disk conflict; anulowanie; błąd zapisu; walidację po zapisie; zachowanie nowych kolekcji EA2.

EA2 testuj:
integralność ID/relacji; duplikaty; częściowe źródła i nieznane wsparcie; wiele aplikacji bez diagnozy redundancji; brak dziedziczenia; zakresy/limity; deterministyczność; starszy katalog/protokół; lokalne/MCP i parytet VS Code/CLI/function MCP; ART1.

Testy na syntetycznych materiałach. Enterprise Architect i rzeczywiste dane klientów nie są potrzebne.

## 14. Wspólny odbiór po obu milestones

Odczytaj aktualne package.json i instrukcje repo. Wykonaj wymagane bramki we właściwej kolejności:
- instalacje i audity wymagane profilem repo;
- root tests i extension tests;
- oba typechecki;
- build;
- sekwencyjne package/verify Core, Full i CLI;
- dokumentacja, Help PL/EN i git diff --check;
- runtime dokładnych paczek poza repo;
- rzeczywiste procesy MCP stdio, stare i nowe kontrakty;
- regresje EAU1/EAK1, EA1/EA1b, SRC1, VER1, C4 i ART1;
- regresje AUD-003 oraz rzeczywistego OCR AUD-004;
- rzeczywisty Extension Host i widoczne UI nowych zachowań;
- niezależny review w osobnym kontekście.

Reviewer sprawdza w szczególności utratę danych podczas aktualizacji, konflikty zapisu, provenance, kompatybilność, rozróżnienie unknown/braku wsparcia i zgodność dowodów z dokładnymi paczkami.

Zamknij nowe HIGH/MEDIUM. Zachowaj FAIL i wymagane NOT_RUN. Nie zastępuj Host/UI dublerami. Stare wyniki oznacz jako historyczne. Po poprawkach ponawiaj bramki adekwatne do zmiany; nie powtarzaj całości po zmianie samego opisu.

## 15. Dokumentacja, dowody i STOP

Zaktualizuj kontrakty, instrukcje i Help PL/EN:
- aktualizacja katalogu z podglądem różnic;
- konflikty i sposób ich rozwiązania;
- aplikacje i jawne powiązania;
- EA2 i zapis pary;
- ograniczenia danych częściowych;
- kompatybilność katalogów i MCP.

Nie dodawaj dzienników gauntletu do marketingowych opisów. Zachowaj portfolio cleanup i dokładne .gitignore. Brief, plan techniczny i aktualne kontrakty są dokumentami aktywnej funkcji; operacyjne raporty/logi trzymaj w ignorowanym build lub poza repo.

AUD-005/006 pozostają otwarte bez niezależnego potwierdzenia ich zamknięcia. Nie ponawiaj zakończonego AUD-FIX2 jako osobnego projektu. Nie implementuj EA3/EA4.

Zakończ lokalnym checkpointem po wymaganych bramkach. Podaj:
- branch, worktree, bazę i końcowe SHA;
- faktycznie ukończone EAK2 i EA2;
- wybraną wersję katalogu i protokołu;
- kontrole, review, ograniczenia i NOT_RUN;
- nowe Core/Full/CLI ze ścieżkami, rozmiarami i SHA-256;
- krótki zbiorczy owner smoke;
- lokalizację raportu i trwałego briefu/planu;
- stan working tree i stagingu.

Owner smoke może pozostać DEFERRED. Bez push, merge, tagów i publikacji. STOP przed kolejną pętlą.
