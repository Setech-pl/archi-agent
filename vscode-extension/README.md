# Archi Agent

Archi Agent turns a plain-language flow description into a PlantUML sequence diagram that is
grounded in an Architecture Knowledge Pack. Participants, relationships and rules come from the
pack; a local language model plans the interactions; deterministic validation checks the result
before anything is shown.

## What you need

- An Architecture Knowledge Pack: a directory with five Markdown tables (`systems.md`, `actors.md`,
  `relationships.md`, `aliases.md`, `rules.md`).
- A structured-output capable model from LM Studio, Ollama, Anthropic, OpenAI or OpenRouter.

Only the compact grounded context of the current flow is sent to the selected provider, never the
whole pack. Local profiles remain loopback-only. Cloud profiles use fixed HTTPS endpoints and keys
stored only in VS Code `SecretStorage`.

## Settings

| Setting | Meaning |
| --- | --- |
| `archiAgent.knowledgePackPath` | Absolute path of the Knowledge Pack directory. |
| `archiAgent.localModel.profile` | Machine-scoped local or cloud provider profile. |
| `archiAgent.localModel.selectedModel` | Machine-scoped model for the explicit profile. |
| `archiAgent.localModel.selectedModelProfile` | Machine-scoped, extension-managed binding of the selected model to its profile. |
| `archiAgent.localModel.baseUrl` | Legacy LM Studio loopback URL/override, default `http://127.0.0.1:1234/v1`. |
| `archiAgent.localModel.model` | Legacy LM Studio model used until a profile is explicitly selected. |
| `archiAgent.localModel.timeoutSeconds` | Time limit of one model request. |
| `archiAgent.defaultAuthor` | Author used when a flow is entered as a plain description. |

## Commands

- `Archi Agent: Select Provider Profile`
- `Archi Agent: Set or Update API Key`
- `Archi Agent: Delete Saved API Key`
- `Archi Agent: Select Model`
- `Archi Agent: Generate Diagram` — choose a type explicitly; D1 supports `sequence`.
- `Archi Agent: Generate Sequence Diagram`

The other named types (`component`, `c4-context`, `c4-container`, `archimate-hld`) are
reserved for later stages and stop before provider access. The existing sequence command
retains its compatible generation path.

Profile, selected-model and binding settings have `machine` scope. They do not travel through
Settings Sync and cannot be overridden by a workspace, so different computers can use independent
providers and models. A selected model is used only when its binding matches the explicit profile;
manually changing a profile therefore cannot carry over the previous profile's model. Existing LM
Studio settings work only when no explicit global profile exists. An unknown explicit profile is a
controlled error before network access and never falls back to those legacy settings.

Cloud API keys are not settings and never appear in this list. Selecting a profile or setting or
deleting a key performs no provider request. A missing cloud key blocks model listing and generation
before provider I/O. The profile picker neither reads a key nor displays its storage status. Keys
are limited to 1–1024 characters without edge whitespace or control characters and are read only
directly before an explicit cloud operation. See the repository documentation `docs/cloud-models.md` for fixed endpoints,
request contracts and optional cost-bearing owner smoke flows.

To generate:

1. Choose the flow source: the active editor document, a flow file, or a description typed in.
2. Resolve ambiguous references and confirm `[NEW: Name]` participants when asked.
3. The validated PlantUML opens in an editor; the grounding report opens beside it.

Diagrams and reports are not written to disk by this version; save the editors where you want them.
