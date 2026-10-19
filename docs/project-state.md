# Project state

Krótki stan operacyjny. Git, kod i faktyczne wyniki kontroli są źródłem aktualnego stanu;
[roadmapa](product-roadmap.md) określa kierunek, [workflow](development-workflow.md) proces.

## Produkt i dystrybucja

Main po merge [PR #10](https://github.com/Setech-pl/archi-agent/pull/10):
`d723af09dacc71746a82c0fddcad97beb2cece8e` (potwierdzone fetch 2026-10-19).
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

## Aktywne zadanie: DOC3 + plan EA1

Gałąź `docs/doc3-ea1`, baza/HEAD `d723af09dacc71746a82c0fddcad97beb2cece8e`.
Preflight: poprzednia gałąź feature na `fa586dd6f0398f72cdab4925bf5db907e00ebb23`,
working tree czysty, staging pusty. Remote nazywa się `github`, nie `origin`.
Zakres: konsolidacja dokumentów, bieżące instrukcje i Help PL/EN, celowane narzędzia oraz
[plan Capability Map](plans/ea1-capability-map.md). Bez implementacji EA, zależności,
commit/push/merge/tagów/publikacji i bez modyfikacji istniejących release assets.

Usunięto trzy historie, dawny plan D2, relacje FU1/FU2, ART1/FU-01 i pierwszy opis naprawy
providerów. Aktualne kontrakty przeniesiono do [architektury](architecture.md),
[Configuration](configuration-workbench.md), [profilów](diagram-profiles.md),
[specyfikacji hosta](vscode-extension.md) i roadmapy. Historyczne dowody pozostają w Git;
potrzebne odsyłacze używają pełnego SHA. Zachowano unikalny historyczny BLOCKER ABA,
raport ICU i identyfikację publikacji alpha.5/6. Końcowe dowody ABA i re-review pozostają lokalne.

Bieżące kontrole DOC3 **PASS**: 104 pliki Markdown (linki/kotwice), parytet PL/EN,
sync-help i testy pozytywne/negatywne narzędzi, Help z dokładnych świeżych Core/Full,
package/verify (31/553 wpisy), instalacja offline CLI i zgodność czterech plików wykonywalnych
CLI z DEMO1. Trzy bundle VSIX i 525 pozycji runtime/OCR Full zgodne z publicznym baseline;
63 pliki mediów/provenance/licencji bez zmian, 12 źródeł Mermaid zgodnych z provenance.
Cztery testy otwierania Help PASS (57 innych pominiętych). Wyniki lokalne: `build/doc3/`,
`verification-summary.json`, `final-check-core/`, `final-check-full/`, `tool-checks-final/`.
Pierwszy checker odrzucił starą paczkę Help; kolejny wykrył dwa stare anchory i zamierzoną
różnicę języka CLI (poprawiono linki i jawnie uwzględniono tylko argument języka). Pierwszy
harness porównania dużego bundle przekroczył bufor odczytu; poprawiono wyłącznie harness.
CLI offline wymagał ponowienia poza sandboxem po odmowie zapisu cache npm; ponowienie PASS.
Pełnego gauntletu, fresh clean-clone, nowego real Host/UI ani żywego LLM nie uruchamiano dla DOC3.
Working tree zawiera wyłącznie ten przyrost dokumentów/narzędzi; staging pozostaje pusty.
`git diff --check` PASS; bez commitów i operacji publikacyjnych.
Niezależny review planu EA1 2026-10-19: 0 HIGH, 2 MEDIUM rozwiązane: limit istniejącego
parsera 1 MiB / 100 000 tokenów i wymagane version w SourceReference. Implementacja EA1
autoryzowana osobnym zadaniem właściciela; w tym checkpointcie wyłącznie DOC3 i plan.
Przed checkpointem ponownie sprawdzono zgodność fingerprintów wszystkich zastanych plików
z zapisanym raportem DOC3 oraz bieżące kontrole dokumentów, Help i verify Core/Full.

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
- Enterprise Architecture i ArchiMate HLD są planowane. Enterprise Architect XML nadal odłożone
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
