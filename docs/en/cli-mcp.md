# CLI and local MCP — MCP1 candidate

The local MCP1 candidate supplies the same Archi Agent runtime through a CLI, a stdio MCP
server, and two VS Code profiles. This candidate has not been published. It verifies Sequence
PlantUML and prose; it does not verify Component or C4 diagrams. Generation supports the four
existing types: Sequence, Component, C4 Context and C4 Container.

## Install a local package

Check the SHA-256 in the candidate verification report, then install the supplied tarball:

```bash
npm install --global ./archi-agent-cli-0.3.0-alpha.7.tgz
archi-agent --version
```

Node.js >=22.12.0 is required for CLI/MCP. Alternatively extract the tarball and run
`node /opt/archi-agent-cli/package/bin/archi-agent.cjs --help`. No repository or root node_modules
is required at runtime. The VS Code extensions use the editor's Node runtime and require no npm.

## Configure sources and providers

Pass an explicit absolute `--config` path. Configuration is strict JSON, at most 64 KiB, with
no duplicate keys, include, glob, .env loading or automatic search in the current directory.
Point readRoots at architecture directories, rather than your home directory. Symlinks and
paths escaping a configured root are rejected. These are application permissions, not an OS
sandbox against another process running as the same user.

```json
{
  "schemaVersion": 1,
  "readRoots": { "project": "/srv/architecture" },
  "sources": {
    "bank": {
      "kind": "structurizr-json",
      "sourceId": "big-bank",
      "model": { "root": "project", "path": "bank/workspace.json" },
      "overlay": { "root": "project", "path": "bank/overlay" }
    },
    "pack": { "kind": "local-directory", "directory": { "root": "project", "path": "knowledge-pack" } }
  },
  "providers": {
    "local": { "profileId": "local-lm-studio", "modelId": "explicit-model-id", "baseUrl": "http://127.0.0.1:1234/v1", "timeoutMs": 120000 },
    "cloud": { "profileId": "cloud-openai", "modelId": "explicit-model-id", "credentialEnv": "ARCHI_AGENT_OPENAI_API_KEY" }
  }
}
```

Model IDs above illustrate syntax; they do not recommend or promise a particular available model.
`providers` may be empty for PlantUML verification or knowledge inspection. Supported provider
profiles remain LM Studio, Ollama, Anthropic, OpenAI and OpenRouter. Local URLs require literal
loopback. Cloud endpoints are fixed by the existing runtime.

Structurizr is a first-class source: provide workspace.json and three overlay files,
`aliases.md`, `relationships.md` and `rules.md`. Overlay source_id and target/relationship IDs
refer to original Structurizr IDs. Relationships need interface_type, and mode unless explicitly
provided by model interactionStyle; conflicting metadata fails validation. People, software systems,
containers and static relationships are imported. Components, deployment and views remain outside
this projection. There is no DSL parser or generated Markdown copy of the model. Inspect the source
to see counts, source omissions, original IDs, qualified names and field provenance.

Cloud keys come only from the named inherited environment variable. Supply it through your CI,
MCP launcher or secret manager; never put its value in argv or JSON. Secrets are read only for the
selected provider operation. CLI/MCP do not read VS Code SecretStorage and do not load `.env`.

## CLI

```bash
archi-agent knowledge inspect --config /srv/archi-agent.json --source bank --limit 20 --format json
archi-agent flow verify --config /srv/archi-agent.json --source bank --input project:flows/good.puml --input-format plantuml-sequence --format json > verification.json
archi-agent flow verify --config /srv/archi-agent.json --source bank --input project:flows/flow.txt --input-format prose --provider local --language en --format json
archi-agent diagram generate --config /srv/archi-agent.json --source bank --input project:flows/flow.md --type sequence --provider local --format json
```

Generation reads the existing front matter flow document. For C4 use `--type c4-context` or
`c4-container` with `--system-id` and `--expected-knowledge-digest` from inspection. Sequence and
Component reject those C4 options. Optional `--decisions root:path` binds explicit decisions to
input/source hashes; verification also checks the interpretation digest. Decisions do not write
aliases or alter the architecture. Inspections and verifications have no automatic write effects.
JSON stdout is one versioned result and a final LF, including discrepancies and partial coverage.
Diagnostics go to stderr. Default text shows status, assessment, coverage and finding codes.

| Verification exit | Meaning |
| --- | --- |
| 0 | All evaluated steps conform within the imported scope, with no unresolved/omitted step |
| 1 | Demonstrated discrepancies, including discrepancies with partial coverage |
| 2 | Inconclusive, unresolved, unsupported or no evaluated steps |
| 3 | Configuration, input, source, execution or result-contract error |
| 124 | Operation deadline |
| 130 / 143 | SIGINT / SIGTERM |

A zero exit is scoped compliance, not proof of complete architectural correctness. Source omissions
remain visible. `--timeout-ms` lowers/sets the total operation budget (max 600000 ms); provider
limits still apply. PlantUML uses zero model calls. Prose uses one interpretation call, and name
continuation uses none. Reviewed generation uses at most two, with no retry/repair/fallback.

## Four MCP tools

Launch the process with `archi-agent mcp serve --config /srv/archi-agent.json`. Stdout contains only
MCP frames. A client that launches stdio can use the following command and args (its outer config
format may differ):

```json
{
  "mcpServers": {
    "archi-agent": {
      "command": "node",
      "args": ["/opt/archi-agent-cli/package/bin/archi-agent.cjs", "mcp", "serve", "--config", "/srv/archi-agent.json"]
    }
  }
}
```

| Tool | Example arguments |
| --- | --- |
| inspect_knowledge | `{"source":"bank","limit":20}` |
| verify_flow | `{"source":"bank","input":{"root":"project","path":"flows/good.puml"},"format":"plantuml-sequence"}` |
| resolve_flow_names | `{"sessionId":"UUID","expectedInputSha256":"SHA256","expectedInterpretationDigest":"SHA256","expectedSnapshotDigest":"SHA256","decisions":[{"mentionId":"p2","expectedSnapshotDigest":"SHA256","targetElementId":"EXACT-ID","confirmed":true}]}` |
| generate_diagram | `{"source":"bank","input":{"root":"project","path":"flows/flow.md"},"diagramType":"sequence","provider":"local"}` |

Replace UUID/hash/ID placeholders with exact values returned by verification. A pending verification
has one process-local continuation slot with a fixed ten-minute lifetime. Source changes invalidate
it. Confirm the literal mention, target ID/name and provenance with the user before submitting a
decision. The server does not treat a client's confirmed flag as independent proof of a human click.
Results have identical structuredContent and serialized text. `isError:false` includes discrepancies
and incomplete assessment; read the outcome, rather than treating the flag as compliance.
One active tool call is allowed; another gets busy. Input frames are limited to 1 MiB, structured
results to 4 MiB and complete response frames to 10 MiB. Cancellation/EOF terminates active work.

## Core and Full in VS Code

Core (`setech-pl.archi-agent-core`) is recommended for new users. Full (`setech-pl.archi-agent`)
adds offline PL/EN OCR and retains the existing extension identity. Updates keep each identity;
an existing Full installation is never automatically replaced by Core. Both use the same runtime.

Install one candidate VSIX with Install from VSIX. You may keep both installed, with exactly one
enabled. Both enabled is an unsupported conflict: VS Code processes duplicate static declarations
before activation, and Archi Agent blocks operations. Disable one yourself and Reload Window.
To change profiles, disable the old profile, reload, enable/install the chosen profile and reload.
Shared archiAgent settings remain. SecretStorage belongs to each ID: re-enter cloud keys after
changing IDs; returning to the old ID preserves its own keys. No automatic key copying or disabling.

Core contains no Tesseract, traineddata, OCR WASM or native canvas resources. DOCX/XLSX and text PDF
work offline. PDF auto fails explicitly with pagesRequiringOcr when a page has no extractable text;
it returns no partial Markdown to knowledge extraction. No OCR reads text only and reports coverage.
OCR all pages is unavailable in Core. Full validates its installed inventory and hashes before OCR;
a missing/corrupt resource is an installation error, with no download or silent Core fallback.

## MCP knowledge client and example server

The function server above exposes Archi Agent operations. The separate knowledge client fetches
one architecture snapshot from one configured stdio process, through the fixed tool
`get_knowledge_snapshot`. Code chooses this call; the LLM does not choose knowledge tools.
Each new operation fetches anew. Generator and reviewer share the resulting frozen snapshot.
A VER1 continuation checks the same server/source/version; changed data or process settings
invalidate it. Failure has no local or stale-snapshot fallback. MCP decisions never save aliases.

Run the independent example with a copy of the local-source configuration above (providers may
be empty, and the selected source must be Structurizr):

```bash
archi-agent-knowledge-server --config /srv/knowledge-server.json --check-source bank
archi-agent-knowledge-server --config /srv/knowledge-server.json
```

The first command checks the source adapter contract. The second serves stdio and requires no
VS Code or model. Configure the Archi Agent CLI/function server with a single knowledge process:

```json
{
  "knowledgeServers": {
    "knowledge": {
      "command": "/opt/node/bin/node",
      "args": ["/opt/archi-agent-cli/package/bin/archi-agent-knowledge-server.cjs", "--config", "/srv/knowledge-server.json"]
    }
  },
  "sources": { "remote": { "kind": "mcp", "server": "knowledge", "sourceId": "bank" } }
}
```

These fields extend the complete schemaVersion/readRoots/providers configuration; they are not
a standalone config. Tool calls select `source:remote` and cannot change executable, args or env.
The process has its own configured readRoots. Archi Agent does not OS-sandbox a program explicitly
configured by its operator. No shell or automatic installation is used. Only the SDK's basic
environment allowlist and explicit `credentialEnv` names are inherited. Child stderr is discarded.

In VS Code set `archiAgent.knowledgeServer` to that command/args object in **User settings**,
and select `archiAgent.architectureSource: {"kind":"mcp","sourceId":"bank"}`. Workspace/folder
values cannot configure the executable. Configuration and Browser show validation, counts,
omissions and provenance. A reference without a local file stays a reference; Browser shows its
details and does not fetch/open the URI. The original local Structurizr option remains available.

The example separates `src/knowledge-server/server.ts` (transport) from `adapter.ts` (source).
Implement `KnowledgeAdapter.load` in adapter.ts or a sibling module, compose it explicitly in
main.ts, and rebuild. Use the shared createKnowledgeResponse/validateKnowledgeResponse contracts.
The versioned normalized contributions retain original IDs, source version, scope, omissions and
provenance. Future API/EA/database adapters can be partial; no fictitious Structurizr is required.
They are not implemented in this candidate. URI references contain no userinfo, query or hash;
fragment is a separate field. Missing local locators are explicit and never replaced with line 1.
The knowledge response is bounded to a complete 64 MiB frame, including text-copy escaping.

Developer adapter contract test:

```bash
npm run cli:build
npx vitest run test/runtime/mcp-knowledge.test.ts --no-file-parallelism
```

A cloud provider response that reflects its active credential is rejected before interpretation, rendering or publishing model IDs. This also covers JSON escapes and saved model selections containing the key. The operation fails safely; it does not redact the domain result, retry or invoke another model.
