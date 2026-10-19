# Knowledge MCP server example

Copy config.example.json, replace the absolute readRoot and relative paths, and supply the
three SRC1 overlay tables alongside the original workspace.json. Run the packaged server:

```bash
archi-agent-knowledge-server --config /srv/knowledge-server.json --check-source bank
archi-agent-knowledge-server --config /srv/knowledge-server.json
```

The first command checks the adapter contract and prints identity/version/snapshot/counts.
The second serves one deterministic `get_knowledge_snapshot` tool over stdio; it is a knowledge
provider, separate from the four-tool Archi Agent function server. Neither command calls an LLM.

Implement `KnowledgeAdapter.load` in `src/knowledge-server/adapter.ts` (or a sibling module)
and compose it explicitly in main.ts. The transport is in server.ts. Use the shared runtime
`createKnowledgeResponse` and `validateKnowledgeResponse`, rather than copying row or model
validation. Original references, IDs, version, partial scope and omissions belong to the source.
Local file/line is optional; a remote source uses actual reference URIs and original external IDs.
Do not fabricate Structurizr, Markdown files or line numbers. URI references are data, never
instructions to fetch/open them, and cannot contain userinfo, query credentials or a URI hash;
use the separate fragment field for a source locator. Rebuild with `npm run cli:package`.

Developer contract and parity checks:

```bash
npm run cli:build
npx vitest run test/runtime/mcp-knowledge.test.ts --no-file-parallelism
```

The first adapter reuses the production Structurizr JSON parser/mapper, bounded local reads,
readRoots and original-ID overlay. No DSL, API, EA or database adapter is included. The normalized
response permits future adapters to remain partial without masquerading as complete Structurizr.
See the PL/EN CLI/MCP guides for configuring this server as an Archi Agent source.

## Enterprise catalog adapter — local EA1b candidate

The published DEMO1 package is unchanged; build a new local package for this feature.
Use [config.enterprise.example.json](config.enterprise.example.json) for the source server and
[config.enterprise-client.example.json](config.enterprise-client.example.json) for the product.
Replace /srv/retail-checkout with the current checkout Retail folder and executable/package paths.

```bash
archi-agent-knowledge-server --config /srv/retail-knowledge.json --check-source retail-business --type enterprise
archi-agent diagram generate --config /srv/archi-agent.json --source retail-mcp --type capability-map --max-level 3 --color-scale maturity --language en --format json
```

EnterpriseJsonAdapter.load returns EnterpriseCatalog data only. Implement EnterpriseAdapter.load
for your own source and compose it explicitly in main.ts. Shared createEnterpriseResponse and
validateEnterpriseResponse own EA1 validation and source/version/snapshot digests; server.ts owns
stdio, busy/cancel/closure and bounded replies. Preserve stable IDs, parents, explicit scales/ratings,
source scope/coverage and original field provenance/reference URI/version. No invented locations,
software systems converted to capabilities, automatic proxy chain, arbitrary plugin path or LLM.
The client lists tools and calls only get_enterprise_snapshot with contractVersion:1. A server with
no enterprise adapter does not advertise that tool. get_knowledge_snapshot v1 is unchanged.
The complete source/client/User settings and external function-MCP request are in the
[EN guide](../../docs/en/cli-mcp.md#capability-map-with-no-model--local-ea1b-candidate) /
[PL guide](../../docs/pl/cli-mcp.md#capability-map-bez-modelu--lokalny-kandydat-ea1b).
