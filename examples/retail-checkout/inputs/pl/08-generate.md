---
diagram_name: retail-checkout
flow_name: Retail Checkout
author: Demo
language: pl
---
Klient wywołuje komponent Witryna. Witryna wywołuje komponent Zamówienia. Zamówienia synchronicznie wywołują Płatności i Magazyn. Zamówienia asynchronicznie wysyłają zdarzenie do komponentu Powiadomienia.
