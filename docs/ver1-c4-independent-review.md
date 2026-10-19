# VER1 / D3 / D4 — niezależny review

Osobne konteksty read-only: `ver1_review` i `c4_review`. Reviewerzy nie zmieniali plików
repo ani stagingu. Baza zakresu: `3e33a6a93811d723b21696618eba193ed6eb54e2`.

## Ustalenia i naprawy

| Waga | Ustalenie | Zamknięcie |
| --- | --- | --- |
| HIGH | Brak wymaganej interakcji mógł pozostawić `conformant-within-scope` | `require` bez pokazanej interakcji daje wynik nierozstrzygnięty; regresja |
| HIGH | Odpowiedź mogła użyć innego interfejsu niż żądanie | Zgodność jawnych atrybutów przy parowaniu i ponownie w porównaniu; regresja |
| MEDIUM | Inny interfejs w kierunku prostym zasłaniał dopasowanie odwrotne | Niezależne wyszukanie relacji odwrotnej dla jawnych atrybutów; regresja |
| MEDIUM | Proza dopuszczała ponowne `responseTo` tego samego żądania | Unmatched/LIFO, zakaz ponownego zamknięcia i kontrola interfejsów; regresja |
| MEDIUM | ART1 kopiował dodatkowe pola obiektu `c4Selection` | Jawna projekcja tylko dwóch pól w runtime i ART1; regresja z syntetycznym sekretem |

Końcowe re-review obu zakresów: **PASS, brak otwartych HIGH/MEDIUM**.

Reviewer VER1 potwierdził także ograniczenie decyzji do dopuszczalnych celów, brak nadpisania
jednoznacznej nazwy, kontrolę zmiany rodzaju źródła przed zapisem oraz zachowanie fokusu wejścia.
Uruchomione przez reviewera: 39/39 testów VER1, później celowany podzbiór runtime/native-save
18/18. To kolejne kontrole, nie sumowane wyniki.

Reviewer C4 potwierdził osobne kontrakty i digesty, źródłowe granice, brak zwijania relacji,
stabilne ID, ten sam snapshot w obu wywołaniach, provenance i oryginalny ART1. Uruchomione
9/9 testów oraz niezależne próby: brak relacji, równoległe relacje, niebezpieczna technologia
i nieznane pole konfiguracji. Re-review tytułów/legend/łamania tekstu i anulowania: PASS.

`git diff --check`: PASS. Wyniki dokładnego VSIX, Host i widocznego UI są osobnymi dowodami
w [raporcie wykonawcy](ver1-c4-verification.md). Review nie jest owner smoke ani dowodem
jakości żywego modelu. AUD-003–006 pozostają OPEN.
