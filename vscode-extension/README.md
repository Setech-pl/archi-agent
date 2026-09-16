# Archi Agent

Archi Agent turns a plain-language flow description into a PlantUML sequence diagram that is
grounded in an Architecture Knowledge Pack. Participants, relationships and rules come from the
pack; a local language model plans the interactions; deterministic validation checks the result
before anything is shown.

## What you need

- An Architecture Knowledge Pack: a directory with five Markdown tables (`systems.md`, `actors.md`,
  `relationships.md`, `aliases.md`, `rules.md`).
- A local OpenAI-compatible server on the loopback interface, such as LM Studio, with an
  instruction model loaded that supports structured JSON output.

Nothing is sent anywhere except the configured loopback endpoint, and only the compact grounded
context of the current flow is sent, never the whole pack.

## Settings

| Setting | Meaning |
| --- | --- |
| `archiAgent.knowledgePackPath` | Absolute path of the Knowledge Pack directory. |
| `archiAgent.localModel.baseUrl` | Loopback base URL of the local server, default `http://127.0.0.1:1234/v1`. |
| `archiAgent.localModel.model` | Model identifier; when empty the command lets you pick one from the server. |
| `archiAgent.localModel.timeoutSeconds` | Time limit of one model request. |
| `archiAgent.defaultAuthor` | Author used when a flow is entered as a plain description. |

## Command

`Archi Agent: Generate Sequence Diagram`

1. Choose the flow source: the active editor document, a flow file, or a description typed in.
2. Resolve ambiguous references and confirm `[NEW: Name]` participants when asked.
3. The validated PlantUML opens in an editor; the grounding report opens beside it.

Diagrams and reports are not written to disk by this version; save the editors where you want them.
