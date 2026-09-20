# Archi Agent

Archi Agent turns a plain-language flow description into a PlantUML sequence diagram that is
grounded in an Architecture Knowledge Pack. Participants, relationships and rules come from the
pack; a local language model plans the interactions; deterministic validation checks the result
before anything is shown.

## What you need

- An Architecture Knowledge Pack: a directory with five Markdown tables (`systems.md`, `actors.md`,
  `relationships.md`, `aliases.md`, `rules.md`).
- A local OpenAI-compatible server on the loopback interface: LM Studio or Ollama, with an
  instruction model loaded that supports structured JSON output.

Nothing is sent anywhere except the configured loopback endpoint, and only the compact grounded
context of the current flow is sent, never the whole pack.

## Settings

| Setting | Meaning |
| --- | --- |
| `archiAgent.knowledgePackPath` | Absolute path of the Knowledge Pack directory. |
| `archiAgent.localModel.profile` | Machine-scoped local profile (`local-lm-studio` or `local-ollama`). |
| `archiAgent.localModel.selectedModel` | Machine-scoped model for the explicit profile. |
| `archiAgent.localModel.selectedModelProfile` | Machine-scoped, extension-managed binding of the selected model to its profile. |
| `archiAgent.localModel.baseUrl` | Legacy LM Studio loopback URL/override, default `http://127.0.0.1:1234/v1`. |
| `archiAgent.localModel.model` | Legacy LM Studio model used until a profile is explicitly selected. |
| `archiAgent.localModel.timeoutSeconds` | Time limit of one model request. |
| `archiAgent.defaultAuthor` | Author used when a flow is entered as a plain description. |

## Command

- `Archi Agent: Select Local Provider Profile`
- `Archi Agent: Select Local Model`
- `Archi Agent: Generate Sequence Diagram`

Profile, selected-model and binding settings have `machine` scope. They do not travel through
Settings Sync and cannot be overridden by a workspace, so different computers can use independent
providers and models. A selected model is used only when its binding matches the explicit profile;
manually changing a profile therefore cannot carry over the previous profile's model. Existing LM
Studio settings work only when no explicit global profile exists. An unknown explicit profile is a
controlled error before network access and never falls back to those legacy settings.

To generate:

1. Choose the flow source: the active editor document, a flow file, or a description typed in.
2. Resolve ambiguous references and confirm `[NEW: Name]` participants when asked.
3. The validated PlantUML opens in an editor; the grounding report opens beside it.

Diagrams and reports are not written to disk by this version; save the editors where you want them.
