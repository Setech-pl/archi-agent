# Cloud model providers

## D1 final PlantUML

The D1 `generateDiagram` sequence path uses the selected Anthropic, OpenAI or OpenRouter
structured-chat adapter and makes one generation request. The cloud key is read by the VS Code
host immediately before the request; unsupported diagram types stop before that read. The
response is validated locally as a strict `{ plantUml, messages }` envelope and a grounded
sequence document. The legacy sequence command and provider transport behavior remain compatible.

Archi Agent supports three fixed cloud profiles alongside LM Studio and Ollama. Cloud access is
opt-in: activation, profile selection and API-key management perform no network request. Model
listing and generation happen only after the corresponding user command.

## Profiles and credentials

| Profile | ID | Generator type | SecretStorage key |
| --- | --- | --- | --- |
| Anthropic | `cloud-anthropic` | `anthropic-remote` | `archiAgent.cloudProvider.anthropic.apiKey` |
| OpenAI | `cloud-openai` | `openai-remote` | `archiAgent.cloudProvider.openai.apiKey` |
| OpenRouter | `cloud-openrouter` | `openrouter-remote` | `archiAgent.cloudProvider.openrouter.apiKey` |

Keys exist only in VS Code `SecretStorage`. A key must contain 1–1024 Unicode characters, have no
leading or trailing whitespace and contain no C0/C1 control character (including CR, LF and tab).
The same provider-neutral validation runs before secure storage, before the credential crosses the
runtime boundary and before an HTTPS header is built. Invalid values are never stored. Keys are not
copied into settings, runtime state, output, errors, prompts, reports, generated documents, fixtures
or the VSIX. The profile and its model/binding remain machine-scoped settings and survive restart
independently of the key. A key missing or invalid in secure storage blocks provider I/O. The profile
picker never reads `SecretStorage` and does not display a saved/not-saved status. Listing and
generation read the selected cloud key only after preceding user choices, directly before the
corresponding runtime operation; local profiles never read it.

Commands:

- **Archi Agent: Select Provider Profile** — no network request;
- **Archi Agent: Set or Update API Key** — password input, no key validation request;
- **Archi Agent: Delete Saved API Key** — explicit confirmation, no provider request;
- **Archi Agent: Select Model** — exactly one bounded model-list request;
- **Archi Agent: Generate Sequence Diagram** — exactly one generation request.

The P1 command identifiers for local provider/model selection remain hidden compatibility aliases.

The interaction order is part of the command contract:

- dismissing the provider-profile picker or the Generate flow-source picker performs no
  `SecretStorage.get` and no provider I/O;
- **Select Model** for a cloud profile reads the key once and performs one model-list GET before it
  can display the picker; dismissing that picker writes no model/binding and performs no generation
  POST;
- Generate with no selected model first completes the flow choice, then reads the key once and
  performs one model-list GET before displaying the picker; dismissing it writes no model/binding
  and performs no generation POST;
- Generate with an already selected model performs no model-list GET and reads the key directly
  before its generation POST;
- local profiles never read `SecretStorage`.

## Closed HTTPS allowlist

The remote transport accepts endpoint identifiers, not URLs. It always uses TLS on port 443, does
not follow redirects and does not consult a user-configurable host, path or credential-bearing URL.

| Provider | Model listing | Generation |
| --- | --- | --- |
| Anthropic | `GET https://api.anthropic.com/v1/models?limit=1000` | `POST https://api.anthropic.com/v1/messages` |
| OpenAI | `GET https://api.openai.com/v1/models` | `POST https://api.openai.com/v1/chat/completions` |
| OpenRouter | `GET https://openrouter.ai/api/v1/models?supported_parameters=response_format&limit=1000` | `POST https://openrouter.ai/api/v1/chat/completions` |

Requests and responses are bounded, UTF-8 and JSON only. The default timeout is 120 seconds and the
accepted range is 1–600 seconds. Generation responses are limited to 1 MiB, model lists to 512 KiB
and request bodies to 512 KiB. Model lists contain at most 1000 safe, unique identifiers and are
sorted deterministically. No automatic pagination is performed; a signalled or conservatively
detected truncated page fails closed. Automated tests exercise the production `NodeHttpsJsonTransport`
through a narrow `https.request` primitive seam, including every fixed target, complete headers and
UTF-8 body length, response limits, status/error mapping, timeout and cancellation socket destruction,
and the absence of retries and credential text in errors. The seam cannot change an endpoint.

## Wire contracts

Anthropic sends `x-api-key` and `anthropic-version: 2023-06-01`. Every consecutive initial system
message is joined in order with exactly two newline characters and becomes top-level `system`;
the remaining user and assistant messages retain their roles in `messages`. A system message after
the first non-system message is rejected before I/O. The request uses the caller's `maxTokens` as
`max_tokens`, `stream: false`, and stable `output_config.format`:

```json
{
  "model": "<selected model>",
  "system": "<system message>",
  "messages": [{ "role": "user", "content": "<user message>" }],
  "max_tokens": 321,
  "stream": false,
  "output_config": {
    "format": { "type": "json_schema", "schema": { "...": "projected generated-model schema" } }
  }
}
```

`321` above is only an example caller value; the adapter maps the actual validated `request.maxTokens`
and accepts the existing range 1–16384. It sends no beta header,
temperature or thinking option. A response must contain exactly one `text` block and
`stop_reason: end_turn`; thinking, redacted thinking, tool use, multiple blocks, refusal and token
truncation fail closed.

Anthropic model listing exposes only safe identifiers whose response record contains
`capabilities.structured_outputs.supported === true`. Missing, null, false or malformed capability
objects are ignored. `has_more: true` fails with `model-list-truncated`; no next page is requested.

Anthropic's wire schema is a fresh frozen projection. It changes `oneOf` to `anyOf` for the
project's disjoint branches; removes numeric constraints (`minimum`, `maximum`,
`exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`), string length constraints (`minLength`,
`maxLength`) and unsupported array constraints (`maxItems`, `uniqueItems`, `contains`,
`minContains`, `maxContains`); and preserves `minItems` only for 0 or 1. External or recursive
references, unsupported formats/keywords and object schemas without `additionalProperties: false`
are rejected. The original full schema and all local Zod/semantic validation remain unchanged.

OpenAI sends `Authorization: Bearer <key>` and maps the neutral request to Chat Completions:

```json
{
  "model": "<selected model>",
  "messages": ["<system and user message objects>"],
  "stream": false,
  "max_completion_tokens": 321,
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "archground_sequence_model_v1", "strict": true, "schema": { "...": "full schema" } }
  }
}
```

OpenRouter uses the same response envelope and bearer authentication, but sends `max_tokens` and
the mandatory routing guard. It never sends a `models` fallback list or marketing headers:

```json
{
  "model": "<selected namespace/model>",
  "messages": ["<system and user message objects>"],
  "stream": false,
  "max_tokens": 321,
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "archground_sequence_model_v1", "strict": true, "schema": { "...": "full schema" } }
  },
  "provider": { "allow_fallbacks": false, "require_parameters": true }
}
```

OpenRouter listing still checks every returned `supported_parameters` array and exposes only entries
containing `response_format`. Namespace/slash model identifiers use the unchanged safe-ID policy.
For both OpenAI and OpenRouter the response is accepted only when the single choice has exactly
`finish_reason: "stop"`; missing, null, truncated, filtered and tool-call finishes fail closed.

Official contracts: [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create),
[Anthropic models](https://platform.claude.com/docs/en/api/models/list),
[Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat),
[OpenAI models](https://developers.openai.com/api/reference/resources/models),
[OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), and
[OpenRouter fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks).

## Failure policy

Expected failures expose stable provider-neutral codes only. Pre-I/O/configuration codes include
`unknown-provider-profile`, `provider-capability-unavailable`, `credential-required`,
`invalid-credential`, `unsafe-model-id`, `invalid-timeout`, `invalid-max-tokens`,
`invalid-message-sequence`, `unsupported-json-schema` and `request-too-large`. Transport codes are
`cancelled`, `timeout`, `connection-failed`, `redirect-rejected`, `authentication-failed`,
`rate-limited`, `model-unavailable`, `request-rejected`, `provider-unavailable`,
`unexpected-content-type`, `response-too-large`, `response-truncated` and `invalid-encoding`.
Listing additionally uses `invalid-model-list`, `model-list-truncated`, `too-many-models`,
`duplicate-model-id` and `unsafe-listed-model-id`. Parsing uses `envelope-too-large`,
`invalid-envelope`, `missing-choices`, `multiple-choices`, `missing-content`, `truncated-output`,
`unexpected-finish-reason`, `content-too-large`, `empty-content`, `control-character`,
`not-a-json-object`, `malformed-json`, `empty-object`, `response-refused` and
`unexpected-content-block`.

No provider error body or raw model response is returned to the user. There is no retry, repair,
streaming, provider/model fallback or automatic key test.

## Optional owner smoke flows

These are manual and excluded from automatic Definition of Done. **Each successful generation may
incur provider cost.** Use a disposable synthetic flow/Knowledge Pack when possible and inspect the
provider dashboard/logs to confirm at most one generation request.

1. Package and verify the VSIX, then install it in a clean VS Code profile outside the repository.
2. Configure a synthetic Knowledge Pack and open a synthetic flow.
3. Select one of Anthropic, OpenAI or OpenRouter; confirm selection caused no network request.
4. Set that provider's key; confirm no validation request was made and the key is not visible.
5. Select a model (one GET), then generate once (at most one POST).
6. Verify PlantUML, grounding report and the exact provider-specific `generatorType`; verify no key
   or response body appears in output or artifacts.
7. Delete the key and confirm the next listing/generation is blocked before provider I/O.

Repeat the flow separately for each cloud provider. For OpenRouter additionally confirm the request
contains `allow_fallbacks: false`, `require_parameters: true` and no `models` field.
