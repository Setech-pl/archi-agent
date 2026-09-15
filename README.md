# ArchGround

ArchGround is intended to become a Visual Studio Code extension that drafts PlantUML sequence diagrams from process descriptions, grounded in a local Markdown knowledge pack.

**Status:** private migration staging.

> **Warning:** this project is not ready for publication or distribution. Do not publish the source or distribute packages built from it. Most planned capabilities are not implemented yet.

## Current contents

- Core model types, output naming and versioning helpers, and deterministic text utilities.
- Knowledge Pack loading, indexing and deterministic grounding (see `docs/architecture.md`).
- A validated generation pipeline: strict model schema, normalization, grounding, relationship and interface-name validation, safe PlantUML rendering, a local structural PlantUML check and a grounding report.
- Node adapters for reading the flow and the pack and for writing artifact pairs safely.
- An offline Space Mission demo with a deterministic scripted generator (see `docs/demo.md`).
- Model-driven generation through a local OpenAI-compatible structured-output server such as LM Studio, loopback only (see `docs/local-model.md`).
- A dependency-free leak scanner in `scripts/leak-scan.mjs`.
- Unit and integration tests run with `npm test`.

Not implemented: remote model providers, the editor extension and packaging.

## Offline demo

    npm run demo:dry-run
    npm run demo

The dry run executes every stage and writes nothing. The real run writes a diagram and its grounding report to `architecture-diagrams/space-mission/sequence/`, using `-v2`, `-v3` and so on instead of overwriting. No language model is called and no network access occurs.

## Local model demo

    npm run local:models
    npm run demo:llm:dry-run -- "<model-id>"
    npm run demo:llm -- "<model-id>"

These commands use a model loaded in a local LM Studio server on the loopback interface. Pass the model as one positional argument; `-- --model` is not recommended because npm can read `--model` as its own option. The direct form `node dist/demo/lm-studio-demo.js generate --model "<model-id>" --dry-run` also works after a build. The model must be named explicitly, each run makes exactly one model request, and the answer passes the same validation pipeline; there is no retry, repair or fallback. See `docs/local-model.md`.

## Leak scan

    node scripts/leak-scan.mjs --root <project-dir> --rules <forbidden-patterns-file> [--private-tokens <token-file>]

The rules file and the optional private token file are kept outside this repository.
