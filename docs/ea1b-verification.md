# EA1b — Capability Map CLI/MCP verification

Local candidate on `feature/ea1b-cli-mcp`, base EA1
`4f3e8d90d65078835fb32fc477f8a9f6b73414ff`. The checkpoint is the commit containing this
report (resolve its exact SHA from Git). The [approved plan](plans/ea1b-capability-map-cli-mcp.md)
and its existing project-state change are included. No push, merge, tags, publication or release
asset changes. Published DEMO1 files/ZIPs are unchanged; package version alone does not identify
these new local candidates.

## Delivered behavior

CLI `diagram generate --type capability-map`, function MCP `generate_diagram` with the separate
capability-map variant, and VS Code use the same EA1 catalog validation, snapshot, projection,
renderer and original-artifact capture. Local enterprise.json and the fixed optional source tool
`get_enterprise_snapshot` v1 supply the same enterprise/1 catalog. Flow/provider/model/API-key
arguments are absent from this path; foreign options fail explicitly. No model discovery,
readiness, provider credential reads or LLM calls. Source-specific credentials remain optional.

Config v2 adds enterpriseSources; strict config v1 is preserved. Software knowledge
`get_knowledge_snapshot` v1 is unchanged, without migration. The example composes data adapters
separately from transport/validation. A v1-only source gives enterprise-unsupported, without
retry, stale/local fallback or capabilities invented from systems. VS Code enterpriseSource
selects the catalog; only User knowledgeServer can supply the process. CLI/function MCP return
results without gaining file-write authority.

Local report v1 retains actual file/line and byte hash. Remote report v2 retains original field
provenance/references and response JSON Pointers, sourceVersion and responseFingerprint, without
fabricated file/line. ART1 keeps its v1 envelope, explicit original-pair confirmation and exclusive
writer. Save does not reread the source. Existing unrelated AUD issues remain open.

## Exact local artifacts

| Profile | Repository-relative path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Core | `build/ea1b/candidate-20261019/core/archi-agent-core-0.3.0-alpha.7.vsix` | 5522774 | `c9bcfab7da67d6bb72c0e514dd2424107e8544f8a6acb99d4b5d44d220f8f3f2` |
| Full | `build/ea1b/candidate-20261019/full/archi-agent-full-0.3.0-alpha.7.vsix` | 128948953 | `55cc6d67ce15e163eb631e2c15b9bd1fdb7ece13d2bc3300f142d2bc3ffd56bd` |
| CLI/MCP | `build/ea1b/candidate-20261019/cli/archi-agent-cli-0.3.0-alpha.7.tgz` | 906403 | `8bfde71cc4599c84891c35ca13059b8949e31e2ff63fcdbaf472c4b6cdd4cc2b` |

All three executable bundles are identical Core/Full; the shared runtime also matches CLI.
Runtime SHA-256: `eed2117be089092561b96253445e2e46534bbdc41a2b3e0da3b65107a09b9ba0`.
The 178 per-file source fingerprints in gates/runtime/host manifests match the tested working
tree. Gates/runtime sourceFingerprint: `938d43bf856e1ecf5780e263fcbfe783b891cc42afa15d98edb49698b3e09110`.
Later edits concern acceptance harnesses and documentation/handoff only; no tested product
source or packaged bytes changed. No dependency or lockfile changes.

## Current-session verification

Evidence root: `build/ea1b/candidate-20261019/`. These are current EA1b results, not inherited EA1
or DEMO1 PASS claims. Each layer records exact artifacts separately.

| Layer | Result | Evidence / boundary |
| --- | --- | --- |
| Root suite, Node 22.12 | PASS 2054/2054, 134 files | `root-tests.log`; real stdio and malformed/missing/version/digest/source/schema/size/hierarchy/rating/disconnect/cancel/timeout cases, arbitrary source outputSchema, v1 regressions |
| Extension suite, Node 22.12 | PASS 768/768, 40 files | `extension-tests.log`; settings and zero-provider route, shared runtime tests |
| Both typechecks, build | PASS | `typecheck.log`, `extension-typecheck.log`, `build.log` |
| Sequential Core/Full/CLI package and verify | PASS | `gates-manifest.json`; VSIX allowlists 31/553 entries, CLI offline installation/self-contained imports |
| Docs/PL-EN/Help/demo/diff | PASS, including final handoff | `docs-core/`, `docs-full/`, `docs-final/`, `help-sync.log`, `demo-docs.log`, `diff-check.log`; final Help/demo/diff checks also passed |
| Exact CLI/MCP outside repo | PASS 8/8 | `packaged/packaged-smoke.json`; bundled acceptance driver, empty PATH/NODE_PATH, real CLI/function/source stdio, Core/Full/CLI byte parity |
| Nested process lifetime | PASS | Same packaged report: client cancel, timeout, function-server EOF and SIGTERM while source child is active; child PID termination confirmed before client shutdown, no late success |
| Exact EA1 runtime Core and Full | PASS 4/4 + 4/4 | `ea1-core/runtime-report.json`, `ea1-full/runtime-report.json`; source positions, permutation/view identity, cancel, frozen ART1 |
| Exact Core runtime regressions | PASS SRC1 3/3, VER1/C4 5/5, ART1 14/14 | `src1-runtime.json`, `ver1-c4-runtime.json`, `art1-runtime.json`; synthetic model responses, not live-model quality |
| Actual Extension Host, Core | PASS EA1b 19/19 and EA1 18/18 | `host-manifest.json`; single-folder/multi-root/global; providerReads=0, secretReads=0; source selection, stale-source, active progress cancellation/PID cleanup, remote ART1, v1-only unsupported |
| Visible installed UI, exact Core | PASS EA1b 6/6, local EA1 5/5, Sequence/provider route 1/1 | `ui-summary.json`, per-layer reports/screenshots; new MCP source and native ART1, scoped local regression, one synthetic two-call software generation; separate from controlled Host |
| Independent review | PASS, 0 open HIGH/MEDIUM/LOW | Separate read-only context reviewed code, exact packages/manifests, saved originals and visible UI screenshots; closures below |

## Parity and compatibility

The same synthetic Retail catalog and explicit view were compared through local runtime,
CLI, function MCP and the source MCP path, with no provider configured. Whole/rated and
branch/neutral maps were exercised on the exact shipped bytes; targeted tests also cover
absolute L1/L2/L3 detail, missing rating and explicit zero.

Exact equality covers PlantUML, source identity/scope/coverage, catalogDigest/snapshot ID,
projectionDigest/rendererVersion, full selection/hierarchy, visible capability data including
ratings and declared provenance/reference versions, renderLine, scales.definition, omitted IDs
with reasons, duplicate names, limitations and deterministic/modelCalls/semanticReview fields.
Only the enumerated formatVersion/source transport evidence and locators differ locally versus
MCP. For one transport, full generation reports are equal across hosts; envelope run IDs/times
and ART1 IDs/times are intentionally separate. No semantic provenance is masked.

Representation permutations change raw-byte/source-version/response fingerprints and actual
locators, while preserving semantic digests and rendering. Semantic mutation fails an expected
catalog digest as stale-source. Each generation reads one snapshot; UI inspect and generation
are separate operations. The old knowledge v1 schema/factory/validator and software data model
were not extended; existing real source v1 tests continue to pass.

## Review and diagnostic attempts

Final independent read-only review confirmed all artifact hashes, 178 source fingerprints, installed UI package bytes, saved diagram hashes, semantic/projection digests and remote sourceVersion/responseFingerprint. Local versus MCP UI produced the same 1044-byte PlantUML and semantic report projection. All new HIGH/MEDIUM/LOW findings are closed; the final documentation review also removed a stale project-state paragraph about pending harness results.

Independent review found two MEDIUM issues, corrected before full gates: malformed version
values must fail as invalid data rather than unsupported, and MCP SDK discovery must not compile
or cache a source-authored outputSchema that could override the fixed enterprise validator.
Enterprise list/call now use SDK request with standard wrapper schemas and the production
enterprise validator; software v1 retains its path. A LOW malformed-list classification was
fixed using SDK-compatible Zod error handling. Regression tests passed. A later LOW about
selected runner checks was fixed: explicit selection/scope, rejected unknown IDs, separate
selected manifest names and no false full-layer PASS.

The first full root run had 2053 PASS / 1 FAIL: Node 22 reached its deadline before the SDK
accumulated a 65 MiB pipe frame. The test now honestly accepts rejection by the size bound or
the earlier deadline; it does not claim the size branch executed on every runtime. A separate
oversized structured-response test still requires the concrete size error. That test correction
justified repeating the unpassed root gate. The initial log/manifest are retained. Typechecks,
builds, packaging and passed full suites were not rerun without product changes.

The first outside-repo acceptance-driver bundling attempt failed on top-level await in CJS;
wrapping the driver in async main fixed the harness, with no product rebuild. Early Host attempts
failed because instrumentation proxied frozen VS Code context/configuration objects incorrectly,
and because a test tried to write a machine setting at workspace scope. Empty-target forwarding
proxies and an explicit assertion that VS Code rejects that workspace write corrected the harness.
Failed attempts remain in `host-attempt1/` through `host-attempt4/`. The first visible UI attempt
stopped at an exact-label mismatch in the driver; `ui-attempt1/` retains it. The local UI driver also needed a whitespace-tolerant check for wrapped Monaco JSON text and a single-project regression scope; native helper PID is verified through that isolated browser CDP port. Attempts are retained in `ui-attempt1/` through `ui-attempt4/`. A transient selector syntax error was corrected before its GUI run. The final successful UI layers are aggregated explicitly in `ui-summary.json`; no failed or pending layer is represented as product PASS.

## Owner smoke and limits

OWNER_SMOKE: **DEFERRED**. Install the exact local Core VSIX above, enable only one Core/Full
profile and reload. Use the current checkout Retail catalog; published DEMO1 ZIPs lack this addition.

1. Open `examples/retail-checkout`; create the local map with whole/L1–L3/Dojrzałość, with
   provider/model/key settings empty. Check zero calls, partial scope, missing ratings and explicit zero.
2. Copy [source config](../examples/knowledge-server/config.enterprise.example.json) and
   [client config](../examples/knowledge-server/config.enterprise-client.example.json), adjusting
   absolute roots, executable, CLI package and config paths. Run the check-source command with
   `retail-business --type enterprise`; the server is launched by the configured MCP client.
3. Set User enterpriseSource/knowledgeServer as in the complete [EN](en/cli-mcp.md) /
   [PL](pl/cli-mcp.md) guide. Create the map from Configured MCP source with the same view/language;
   compare PlantUML/digests and genuine remote provenance. CLI and external function-MCP requests
   in the guide need no LLM configuration.
4. Save the original pair through ART1; cancel another save. Try a v1-only source and expect
   enterprise-unsupported without fallback or extra files.

Full Host/UI is not repeated separately: exact runtime smoke and executable-bundle parity cover
Full; actual Host/UI use Core. Live LLM/cloud, Windows/Linux native execution and fresh clean-clone
are NOT_RUN for EA1b. No new connector, HTTP transport, Browser enterprise, EA2, catalog editor,
atomic multi-file publication or crash-recovery guarantee. Existing unrelated AUD issues are
unchanged; synthetic regressions do not prove live-model quality.
