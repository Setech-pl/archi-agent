# Przykładowy serwer wiedzy MCP

[English](README.md). Serwer wiedzy dostarcza dane; osobny serwer funkcji Archi Agent generuje
mapy przez wspólny runtime. Get_knowledge_snapshot v1 pozostaje bez migracji.

## Katalog enterprise

Opublikowane DEMO1 pozostaje bez zmian. Użyj nowych lokalnych paczek.
Skopiuj [config źródła](config.enterprise.example.json) do /srv/retail-knowledge.json oraz
[config klienta](config.enterprise-client.example.json) do /srv/archi-agent.json.
Dostosuj absolutne readRoots do folderu Retail bieżącego checkoutu oraz ścieżki Node i paczki.
Nie umieszczaj credentiali w JSON/argv; providers pozostaje pusty.

```bash
archi-agent-knowledge-server --config /srv/retail-knowledge.json --check-source retail-business --type enterprise
archi-agent diagram generate --config /srv/archi-agent.json --source retail-mcp --type capability-map --max-level 3 --color-scale maturity --language pl --format json
```

EnterpriseJsonAdapter.load zwraca tylko dane EnterpriseCatalog. Własne źródło podłącz przez
EnterpriseAdapter.load i jawną kompozycję w main.ts. Wspólne createEnterpriseResponse oraz
validateEnterpriseResponse walidują regułami EA1 i liczą hashe, server.ts obsługuje transport,
busy, cancel i zamykanie. Zachowaj ID, rzeczywistych rodziców, skale/oceny, zakres/coverage,
provenance pól i prawdziwe URI/version. Nie twórz fikcyjnego file/line ani capabilities z systemów.
Brak adaptera enterprise oznacza brak reklamowania get_enterprise_snapshot; klient zwraca
unsupported bez fallbacku. Nie ma proxy do kolejnego MCP ani dynamicznego ładowania adapterów.
Kompletne kroki VS Code i zewnętrznego klienta serwera funkcji są w
[tutorialu CLI/MCP](../../docs/pl/cli-mcp.md#capability-map-bez-modelu).
Dotychczasowy adapter software i konfiguracja v1 są opisane w angielskim README.
