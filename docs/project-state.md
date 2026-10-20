# Project state

Krótki stan operacyjny. Git, kod i faktyczne wyniki kontroli są źródłem aktualnego stanu;
[roadmapa](product-roadmap.md) określa kierunek, [workflow](development-workflow.md) proces.

## Produkt i dystrybucja

Main po porządkach dokumentacji:
`d91bbdebcfbdf0414d64b18343147eb4b6f60278` (potwierdzone fetch 2026-10-20).
Ta gałąź EA1/EA1b nadal bazuje na main po [PR #10](https://github.com/Setech-pl/archi-agent/pull/10),
`d723af09dacc71746a82c0fddcad97beb2cece8e`; nie wykonano integracji.
Cztery diagramy: Sequence, Component, C4 Context/Container; Verify Flow Sequence/proza;
źródła Markdown, Structurizr JSON + overlay i MCP; CLI/function MCP; dokumenty, review,
nowy pack, ART1, Browser, Help PL/EN.

Opublikowane [v0.3.0-alpha.7-demo.1](https://github.com/Setech-pl/archi-agent/releases/tag/v0.3.0-alpha.7-demo.1):
Core (rekomendowany), Full (OCR offline PL/EN), CLI oraz Retail Checkout/Mission Control ZIP.
Źródła paczek: `83747d3815806f09554298ce9c4e487881932d59`, a nie merge main.
[Manifest wydania](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/release-manifest.json)
i [SHA256SUMS](https://github.com/Setech-pl/archi-agent/releases/download/v0.3.0-alpha.7-demo.1/SHA256SUMS)
identyfikują dokładne publiczne pliki. VSIX nie wymaga repo/npm/Node; CLI/MCP wymaga Node >=22.12.
Nie deklarujemy wydania stabilnego ani Marketplace.

## EA1b — lokalny checkpoint, STOP po tym etapie

Wznowienie 2026-10-20 zastało gotowy checkpoint EA1b
`2ddcf21367ce5834097859331641be48ce19ff86`, czysty working tree i pusty staging.
Nie znaleziono brakującego przyrostu implementacyjnego. Ponownie potwierdzono zgodność 178
plików produktu i trzech paczek z manifestami oraz komplet zaliczonych warstw Host/UI;
pełne bramki poniżej pozostają wynikami z 2026-10-19, nie nowym uruchomieniem.
Bieżące kontrole i niezależny review: [raport EA1b](ea1b-verification.md).
Dowód wznowienia: `build/ea1b/resume-20261020/`.
Przy późniejszej, osobno autoryzowanej integracji zachować usunięcia historycznych materiałów,
skrócone dokumenty, odnośniki publicznego DEMO1 i poprawki skryptów z main `d91bbde`;
nie zastępować ich całymi wersjami z tej gałęzi. Wtedy ponownie zweryfikować dokumentację,
Help i paczki zintegrowanego drzewa. Teraz bez merge/rebase, push, tagów, publikacji i EA2.

Zrealizowano zatwierdzony [plan EA1b](plans/ea1b-capability-map-cli-mcp.md).
Preflight: `docs/doc3-ea1`, HEAD `4f3e8d90d65078835fb32fc477f8a9f6b73414ff`, tylko plan
EA1b/project-state poza stagingiem; zachowano oba pliki i utworzono `feature/ea1b-cli-mcp`.
Lokalny checkpoint implementacji: `2ddcf21367ce5834097859331641be48ce19ff86`,
z [raportem EA1b](ea1b-verification.md). Bez push/merge/tagów/publikacji, zmian release assets
ani rozpoczęcia EA2.

Wspólny runtime generuje Capability Map lokalnie oraz przez źródło MCP w VS Code, CLI i serwerze
funkcji, z jednym frozen snapshotem, 0 wywołań LLM i 0 odczytów providera/modelu/credentiali LLM. Opcjonalny
get_enterprise_snapshot v1 zachowuje get_knowledge_snapshot v1 bez migracji. Config v2 oddziela
enterpriseSources, raport MCP v2 zachowuje prawdziwe references/pointers obok lokalnego v1,
ART1 nadal zapisuje oryginalną parę po potwierdzeniu; CLI/function MCP nie zapisują plików.
User-only knowledgeServer, readRoots, limity i zamknięcie dziecka zachowane. Gotowy adapter
Retail i komplet instrukcji PL/EN. Opublikowane DEMO1/ZIP-y oraz zależności/lockfile bez zmian.

Odbiór 2026-10-19, Node 22.12 PASS: root 2054/2054, rozszerzenie 768/768, oba typechecki, build,
sekwencyjne package/verify Core/Full/CLI i dokumentacja. Dokładne paczki/SHA-256 i osobne
warstwy: `build/ea1b/candidate-20261019/` oraz raport EA1b. Spakowany CLI/function/source MCP
poza repo z pustymi PATH/NODE_PATH 8/8, w tym nested cancel/timeout/EOF/SIGTERM i potwierdzenie
zakończenia PID. EA1 Core/Full 4+4, SRC1 3, VER1/C4 5, ART1 14 PASS.
Rzeczywisty Host: EA1b 19/19 (providerReads=0, secretReads=0), EA1 18/18.
Widoczny UI Core: MCP 6/6, lokalny EA1 5/5, pojedynczy Sequence/provider route 1/1 PASS;
`ui-summary.json` agreguje wyłącznie zaliczone wymagane warstwy. Nie utożsamiamy Host z UI.
Błędne początkowe próby testu limitu i harnessów są zachowane i opisane, bez fikcyjnego PASS.

Niezależny read-only review kodu, dokładnych paczek, manifestów, zapisanych oryginałów
oraz zrzutów UI: PASS, 0 otwartych HIGH/MEDIUM/LOW. Potwierdzony parytet semantyki/digestów
oraz PlantUML, w tym rzeczywiste UI lokalne kontra MCP. Źródła produktu i paczki bez zmian po
zaliczonych bramkach; końcowe korekty dotyczą tylko harnessów/dokumentacji.
OWNER_SMOKE: DEFERRED. Full Host/UI nie powtarzano osobno (runtime i bundle parity PASS);
live LLM/cloud, Windows/Linux i fresh clean-clone NOT_RUN. Dawnych AUD-ID nie zamykano.
Następny etap wymaga osobnego polecenia właściciela. Po EA1b STOP.

## EA1 — lokalny checkpoint i historyczny odbiór

Gałąź `docs/doc3-ea1`, baza `d723af09dacc71746a82c0fddcad97beb2cece8e`.
Osobny lokalny checkpoint DOC3: `ec3939cbcc9ca0ceaa9791c4378ae2f1c4fa6920`.
Preflight EA1 potwierdził pusty staging i wyłącznie zastany przyrost DOC3; cudzych zmian nie cofano.
DOC3 sprawdzono względem wszystkich zapisanych fingerprintów i diffu, ponownie wykonano
kontrole linków/parytetu Help PL/EN, verify dokładnych Core/Full i 4 testy otwierania Help — PASS.
Historyczne szersze dowody DOC3 pozostają w `build/doc3/verification-summary.json`.
Review planu EA1: 0 HIGH, 2 MEDIUM zamknięte (istniejący limit JSON 1 MiB / 100 000 tokenów,
wymagane version w SourceReference). Implementacja autoryzowana przez właściciela wraz
z osobnym lokalnym checkpointem EA1; bez push/merge/tagów/publikacji i zmian release assets.

Zaimplementowano osobny katalog enterprise/1, walidację/provenance, snapshot/digesty, projekcję
całość/gałąź L1 i L1–L3, bezpieczny renderer, własny raport oraz ART1; routing Create Diagram
przed packiem i providerem. Zero LLM i odczytów konfiguracji/kluczy providera.
[Kontrakt](enterprise-catalog.md), [tutorial PL](pl/capability-map.md) / [EN](en/capability-map.md)
i katalog Retail z rzeczywistym renderem w `examples/retail-checkout/`.
Końcowy [raport EA1](ea1-verification.md) identyfikuje paczki i osobne warstwy odbioru.
Bieżące bramki pod Node 22.12 PASS: root 2012/2012, rozszerzenie 745/745, oba typechecki,
build, npm ci/audity root/OCR, prepare OCR, sekwencyjne package/verify Core (31 wpisów) i Full
(553), demo dry run, dokumentacja PL/EN/Help i diff. Wyniki: `build/ea1/candidate-final-20261019/`.
Pierwszy root miał 1 FAIL (stare oczekiwanie 4 typów) / 2010 PASS; poprawiono test. Po znalezieniu
błędu lokalizacji brakującego pola uzasadniono ponowienie pełnych testów. Zaliczone instalacje/
audyty z `candidate-20261019/` zachowano bez ponawiania; zależności/lockfile bez zmian.

Core: `build/ea1/candidate-final-20261019/core/archi-agent-core-0.3.0-alpha.7.vsix`,
SHA-256 `b43a230992f6c580c9c14875d2f3992e495979f597ebf344fc1e16e38643484b`.
Full: `build/ea1/candidate-final-20261019/full/archi-agent-full-0.3.0-alpha.7.vsix`,
SHA-256 `6072f3e539c8efb8af1dc6ee4e3b908a1e6ab9004f243a13933f0f94bc6489d9`.
Trzy bundle identyczne Core/Full. Dokładny runtime poza repo z pustym PATH/NODE_PATH:
EA1 Core/Full 4/4 + 4/4 PASS, SRC1 3/3, VER1/C4 5/5, ART1 14/14 PASS.
Rzeczywisty Extension Host **Core**: 18/18 PASS (single-folder/multi-root/global, providerReads=0),
VS Code 1.142.0 / embedded Node 24.21.0. Widoczny UI **Core**: EA1 5/5, VER1/C4 7/7,
SRC1/Sequence/Component/ART1 7/7 PASS; osobne dowody od controlled Host i spakowanego runtime.
Full Host/UI nie uruchamiano osobno. Syntetyczne transporty regresji nie potwierdzają jakości LLM.

Oględziny czterech rzeczywistych lokalnych renderów PASS. Review planu i implementacji w osobnych
kontekstach: 0 otwartych HIGH/MEDIUM. Zamknięto tylko ustalenia EA1: wymagania parsera/reference,
rzeczywiste lokalizacje brakujących pól, offline Help bez linków do nieopublikowanych nowych plików,
LOW reserved-word legend. Reviewer potwierdził również finalne paczki, logi i prawdziwe Host/UI.
OWNER_SMOKE: DEFERRED; live LLM/cloud, Windows/Linux wykonanie i fresh clean-clone NOT_RUN.
Te kontrole nie są deklarowane jako zaliczone. Żadnego dawnego niezwiązanego AUD-ID nie zamknięto.
Lokalny checkpoint EA1: commit zawierający ten stan i raport EA1; dokładny SHA w Git/raporcie końcowym.
Po checkpointcie STOP: EA1b i kolejne diagramy poza zakresem, bez push/merge/tagów/publikacji.

## Otwarte kwestie

- **AUD-003 OPEN (medium):** potwierdzony NEW w reviewed Sequence może zostać odrzucony
  jako `unknown-endpoint` po jednym żądaniu; nie deklarować naprawy przez dokumentację.
- **AUD-004 OPEN (medium):** tekst wektorowy PDF może zostać uznany za blank bez OCR,
  także w trybie all; ryzyko utraty treści pozostaje.
- **AUD-005/006 OPEN (low):** nieaktualny stan publikacji i niekompletna instrukcja przygotowania
  archiwów OCR. DOC3 koryguje opisy i instrukcje, lecz nie zastępuje niezależnego closure/retest
  ani świeżego clean-clone odbioru. Pierwotny audyt na `20a1acb54e3ac40dff19194563846a3ded33c088`
  pozostaje w sąsiednim katalogu audytów właściciela; nie kopiujemy jego materiałów do produktu.
- Owner smoke dokładnych publicznych paczek: **DEFERRED**. Żywy LLM/płatny cloud,
  Windows ARM64 runtime i wykonanie setup PowerShell: **NOT_RUN** w odbiorze DEMO1.
  Syntetyczne transporty nie potwierdzają jakości modelu.
- Pełny live build packa ze skanu nadal nie ma potwierdzonego PASS; wcześniejszy timeout MD
  nie został odtworzony. Natywna automatyzacja wyboru modelu klawiaturą pozostaje niepotwierdzona.
- Brak update/merge istniejących packów, trwałych draftów, atomowego zapisu/crash recovery/fsync
  i trwałego przełącznika języka aplikacji. ART1 zapisuje oryginał, nie późniejsze edycje bufora.
  Podgląd graficzny PlantUML wymaga osobnej obsługi. Picker macOS może zwrócić symboliczne `/tmp`;
  wybierz regularny folder projektu zamiast obchodzenia walidacji ścieżki.
- **Q-04 nadal do oceny owner smoke:** wybór kilku wyników tego samego typu pokazuje typ/czas/UUID,
  które trudno skorelować z kartami podglądu; nie dodano nazwy diagramu ani historii wyników.
- EA1/EA1b Capability Map jest gotowa w lokalnym kandydacie; kolejne widoki enterprise oraz ArchiMate HLD pozostają planowane. Enterprise Architect XML nadal odłożone
  bez bezpiecznego fixture. Historia M1 nie oznacza gotowości produkcyjnej.

## Istotne dowody (historyczne, nie wyniki DOC3)

- [DEMO1](demo1-verification.md), [dowód przed publikacją](evidence/demo1-prepublication.json)
  oraz manifest publicznego wydania powyżej; [tutoriale PL](pl/tutorials.md)/[EN](en/tutorials.md).
- [MCP1 kandydat](mcp1-verification.md), [niezależny review](mcp1-independent-review.md),
  [owner smoke](testing/mcp1-owner-smoke.md), [DOC2/PUB1](doc2-pub1-verification.md).
- [SRC1](src1-verification.md) / [review](src1-independent-review.md),
  [VER1/C4](ver1-c4-verification.md) / [review](ver1-c4-independent-review.md).
- [AUD-001/002 końcowa naprawa ABA](audit-provider-configuration-aba-fix.md) i
  [niezależny re-review](audit-provider-configuration-aba-independent-review.md): oba zamknięte.
  [Pierwotny review](audit-provider-configuration-independent-review.md) zachowuje historyczny BLOCKER.
- [ICU i clean-clone](ci-clean-clone-icu.md), [publikacja alpha.5/6](test-release-publication.md);
  wcześniejsze FAIL/NOT_RUN nie stają się PASS bieżącego kodu.
- [ART1 naprawy — raport historyczny](https://github.com/Setech-pl/archi-agent/blob/d723af09dacc71746a82c0fddcad97beb2cece8e/docs/art1-audit-fixes-verification.md),
  [FU-01 — raport historyczny](https://github.com/Setech-pl/archi-agent/blob/d723af09dacc71746a82c0fddcad97beb2cece8e/docs/fu01-save-recovery-verification.md),
  [pierwotne raporty i handoffy](https://github.com/Setech-pl/archi-agent/blob/d723af09dacc71746a82c0fddcad97beb2cece8e/docs/project-state-history.md).
- [Galeria i provenance](assets/screenshots/README.md), [licencje](../vscode-extension/THIRD_PARTY_NOTICES.md)
  i [decyzje architektoniczne](adr/0002-deterministic-diagram-plan-renderers.md) pozostają zachowane.
