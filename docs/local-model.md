# Local model generation (LM Studio and Ollama)

## Reviewed D1.1 sequence and compatibility path

`generateDiagram` for Sequence sends one generator request returning exactly `{ plantUml }`.
Local parsing and validation derive facts and physical lines; only a valid result reaches one
independent semantic-review request on the same selected local profile/model. Success or reviewer
rejection uses two calls; deterministic rejection uses one. The existing `generateSequenceDiagram`
request and deterministic renderer remain available with one call. There is no retry, repair,
fallback or streaming. S1 owner smoke of D1.1 with Ollama remains pending.

ArchGround can let a local language model plan the sequence diagram. The model is reached through
a local OpenAI-compatible server with structured-output support: LM Studio or Ollama, on the loopback
interface only. Both profiles use the same adapter; cloud profiles use separate HTTPS adapters and
do not change this loopback policy (see `cloud-models.md`). A
self-contained VS Code extension exists and was verified at checkpoint `v0.2.0-alpha.1` on commit
`d4de130`.

## Responsibility boundary

The core exposes a provider-neutral `StructuredChatClient` contract containing messages, schema,
token bound and cancellation only. `OpenAiCompatibleLocalChatClient` in the Node layer owns the
loopback endpoint, OpenAI-compatible request mapping, HTTP exchange and local response-channel
compatibility. The existing `OpenAiCompatibleLocalGenerator` remains the public sequence adapter;
it only builds the sequence prompt and schema and delegates one call to that client.

The provider-neutral core defines immutable profile metadata and a deterministic registry. Concrete
local profiles live in the Node adapter layer:

| Profile | ID | Default base URL |
| --- | --- | --- |
| LM Studio | `local-lm-studio` | `http://127.0.0.1:1234/v1` |
| Ollama | `local-ollama` | `http://127.0.0.1:11434/v1` |

Both advertise model listing and structured chat, and both map only to `GET /v1/models` and
`POST /v1/chat/completions`. There is no native Ollama API or `/api/tags` path.

The model performs the semantic work:

- selecting which grounded participants the diagram needs;
- creating the sequence of messages and their descriptions;
- choosing among the grounded relationships and interfaces;
- choosing synchronous, asynchronous and response semantics;
- creating alt, opt, loop and group fragments where the flow calls for them;
- deciding the useful level of detail.

Deterministic code does only what must be exact and safe:

- parsing the Knowledge Pack and grounding the participants of the flow;
- presenting the candidate participants, relationships and rules (the minimal grounded context);
- input and output limits and the structured-output contract;
- validation of the answer (strict schema, grounding, relationships, modes, interface names);
- PlantUML rendering, output safety and versioning.

There are no message templates, keyword mappings, ordering rules, response or fragment inference,
domain heuristics, fuzzy matching or correction of model output. The scripted Space Mission
generator (`scripted-demo`) remains an offline regression fixture, a deterministic smoke-test
baseline and a demonstration of the pipeline; it is never used as a fallback for the model.

## What the model receives

One system message with the planning rules and one user message with:

- the flow name, the flow language and the flow description;
- the grounding digest;
- the grounded candidate participants (element identifier, diagram kind, canonical name);
- confirmed new participants (key and display name);
- candidate relationships (direction, interface type, interface name, mode, purpose);
- the applicable grounded rules;
- the supported fragment kinds.

It never receives source paths or line numbers, the author, element descriptions, aliases, whole
Knowledge Pack files, machine paths, environment values, credentials or scanner and audit data.
Untrusted text is placed between explicit markers, and text containing the marker prefix is
refused. The markers do not prevent prompt injection; the security boundary is the strict schema
and the semantic validation of the answer. A prompt above 65536 characters is refused, never
truncated.

The JSON Schema of the answer is derived from the strict Zod schema of the generated model and is
sent as the `response_format` (`json_schema`, `strict: true`, name `archground_sequence_model_v1`).
It carries the structure; checks that JSON Schema cannot express (identifier format, text policy,
duplicates, declared endpoints, fragment nesting) are enforced by the Zod schema and the validators
after the answer. When a relationship has no interface name, the model omits the field.

Message labels are validated for the position in which they are rendered: after the controlled
`<alias> <arrow> <alias> :` prefix, on one physical line. A natural label that begins with a
PlantUML statement keyword, such as `Return validation result` or `Create payment instruction`, is
therefore accepted and rendered unchanged; line breaks, control characters, directives, markup,
URLs and every other construct that could leave that line are still rejected. The prompt does not
ask the model to avoid such words, and no label is rewritten.

## Request settings and repeatability

Every request uses `temperature: 0`, `seed: 42`, `stream: false`, a bounded `max_tokens` of 16384
and the strict structured-output response format. These settings improve repeatability, but they
do not guarantee byte-identical output across models, model versions, quantizations or runtimes: the
model itself is probabilistic. Safety comes from the deterministic validation and rendering after the
answer, not from the model.

## One attempt, no repair

Each generation makes exactly one model request. There is no retry, no repair loop, no correction
of the answer and no fallback to the scripted generator. When the answer is rejected, the run stops
with the failing stage and stable issue codes; the raw answer is neither shown nor stored. Failures
collected during owner acceptance testing (Phase 3G-B) will decide whether one bounded repair
attempt is worth adding.

## Prerequisites

1. LM Studio running its OpenAI-compatible server on port 1234, or Ollama exposing its
   OpenAI-compatible endpoint on port 11434.
2. A chat or instruction model loaded, capable of structured JSON output. Very small models,
   roughly below 7B parameters, often fail structured output or the grounding rules; a larger
   instruction model is recommended.
3. The ArchGround dependencies installed and Node.js 22.12 or later.

No API key or credential is needed and none is sent: the adapter sends no Authorization header.
ArchGround never downloads or loads a model. Prepare the model in the selected local provider before
generation. Provider-specific loading behavior is outside ArchGround.

## VS Code profile and migration behavior

Use **Archi Agent: Select Provider Profile** and **Archi Agent: Select Model**. The
explicit profile, selected model and the extension-managed `selectedModelProfile` binding are
machine-scoped user settings: VS Code Settings Sync does not copy them, and workspace or
workspace-folder settings cannot override them. A Windows computer can therefore keep an LM Studio
model while a MacBook keeps an Ollama model in the same synced VS Code account.

Legacy LM Studio mode applies only when
`inspect("localModel.profile").globalValue === undefined`. In that mode the effective
`archiAgent.localModel.baseUrl` and `archiAgent.localModel.model` retain normal VS Code precedence,
including workspace and workspace-folder values; the manifest default is not mistaken for an
explicit choice. Every present explicit profile value must resolve to a registered profile. An
unknown, empty or malformed explicit value fails with `unknown-provider-profile` before listing or
generation and never falls back to the legacy URL or model.

After an explicit profile selection, a global `archiAgent.localModel.selectedModel` is active only
when the global extension-managed `archiAgent.localModel.selectedModelProfile` exactly matches that
profile. A manual profile change therefore leaves any stale stored model inactive and the next
explicit generation asks the user to select a model. Ollama always uses its profile default endpoint
and never inherits the legacy LM Studio URL or model. Legacy settings are not deleted.

## Commands

List the models reported by the server (a bounded GET `/v1/models`; nothing is selected):

    npm run local:models

Run the model-driven demo on the Space Mission sample without writing files:

    npm run demo:llm:dry-run -- "<model-id>"

Run it and write a new versioned artifact pair:

    npm run demo:llm -- "<model-id>"

Through npm, pass the model as one positional argument. Do not use `npm run ... -- --model`: some
shells (for example PowerShell) remove the `--` separator, and npm then reads `--model` as its own
configuration option, so the model never reaches ArchGround.

After a build (`npm run build:demo`), the compiled command line can also be called directly, with
either form, and with another loopback port if needed:

    node dist/demo/lm-studio-demo.js generate --model "<model-id>" --dry-run
    node dist/demo/lm-studio-demo.js generate "<model-id>" --dry-run --base-url http://127.0.0.1:1234/v1

Exactly one model must be named: there is no default model and ArchGround never picks one from a
list. A missing model, two models (for example a positional model and `--model`) or an unsafe model
identifier stops the command before any request; a missing model points to `npm run local:models`.

## Response channel compatibility

A local server normally returns the structured answer in `choices[0].message.content`. Some local
models return it in `choices[0].message.reasoning_content` and leave `content` empty. The local
adapter handles this exactly:

- non-empty `content` is always used, even when it is invalid (then the run fails);
- only when `content` is an empty string, null or absent, and the envelope is otherwise valid (one
  choice, finish reason stop), a non-empty string `reasoning_content` is considered;
- it must hold exactly one JSON object; prose, analysis text, code fences, several objects or
  malformed JSON are rejected (codes such as `reasoning-content-not-a-json-object`);
- the two fields are never combined, and the candidate passes the same strict parser, schema and
  semantic validation as `content`;
- the console reports only the channel (`content` or `reasoning-content-compat`); the reasoning
  text is never printed, logged or stored in any report or file.

This is compatibility with a response field of local servers, not a fallback generator, and it
applies only to the local OpenAI-compatible adapter. If both fields are empty, the run fails with
`empty-content`.

## Diagnostics

When the pipeline rejects an answer, the console lists up to 20 diagnostic lines after the issue
codes, in deterministic order, and states how many further issues were omitted. Examples of the
shape:

    [interaction-mode-mismatch] message order 4, command-service -> command-queue, expected asynchronous, actual synchronous
    [unused-participant] participants.6, element telemetry-store
    [schema-violation] messages.2.label: text-forbidden-character

Message positions are the model's own `order` numbers; for relationship issues the two identifiers
show the direction of the grounded relationship. Schema diagnostics show the JSON path and the
validation code, never the rejected value. Diagnostics contain no prompt, answer text, flow text,
descriptions, paths or credentials, and they are not written to any file.

Local structured output does not make the answer valid by itself: the application always validates
it, and even with temperature 0 and seed 42 the same model can answer differently between runs. Every
failure is closed: no diagram or report is written after an invalid answer.

The dry run calls the model and executes the whole pipeline but creates no directory or file. The
normal run writes `architecture-diagrams/space-mission/sequence/telemetry-command-flow-vN.puml` and
the matching `.grounding.json` with the next free version, so scripted-demo outputs are never
overwritten. The console shows only metadata, counts, paths and issue codes, never the prompt, the
answer, the flow, the grounded context or the report. The report records `generatorType:
openai-compatible-local` and a `modelGeneration` block (model identifier, temperature, seed, attempt
count, structured output) without endpoint, prompt, answer, headers or timing.

## Network restrictions

- Only literal loopback base URLs are accepted: `http://127.0.0.1:<port>/v1` or
  `http://[::1]:<port>/v1`. Host names (including localhost), LAN and internet addresses, https,
  credentials, query strings, fragments, percent-encoding and other paths are rejected.
- Only `GET /v1/models` and `POST /v1/chat/completions` are used.
- Redirects are refused, proxy settings are not consulted, and request size, response size and time
  (120 seconds by default) are bounded.
- There is no external network access.

## Failure behavior

| Situation | Result |
| --- | --- |
| server not running, timeout, redirect, HTTP error, wrong content type, oversized answer | stage invalid-generator-output, code generator-failed, with the adapter code (for example connection-failed or timeout) |
| answer not exactly one JSON object (fences, prose, several objects, malformed, truncated) | stage invalid-generator-output, code generator-failed, with the parser code |
| JSON object that violates the strict schema | stage invalid-generator-output, code schema-violation |
| schema-valid answer with ungrounded participants, relationships or modes | stage semantic-validation-failed with the validation codes |

No artifact is written for any failure.

## Scripted demo versus model-driven demo

| | `npm run demo` | `npm run demo:llm` |
| --- | --- | --- |
| generator | scripted-demo, fixed script | openai-compatible-local, the selected model |
| network | none | loopback only |
| output | deterministic, equal to the golden files | depends on the model; validated the same way |
| purpose | regression baseline and offline demonstration | real generation for acceptance testing |
