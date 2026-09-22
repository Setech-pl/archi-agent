# ADR 0002 — DiagramPlan and deterministic diagram renderers

- Status: Accepted (R2, 2026-09-22)
- Decision owner: project owner
- Supersedes: [ADR 0001](0001-reviewed-diagram-generation.md) as the active generation architecture

## Context

D1.1 implemented the reviewed `{ plantUml }` path and passed automatic checks, but S1 owner
smoke with Ollama `qwen3:30b` failed. Repeated real runs showed that the model did not reliably
combine valid PlantUML syntax with the exact snapshot facts, even after the prompt supplied
literal participant declarations and source-confirmed request/response signatures. S1 is not PASS.
The D1.1 implementation and its smoke diagnosis remain historical evidence on
`checkpoint/d1-final-plantuml-reviewed`.

## Decision

The active target path is:

```text
ArchitectureSnapshot → LLM DiagramPlan → local plan validation
→ deterministic renderer for the diagram type → independent reviewer
→ local decision → result
```

The generator chooses semantic content: elements, relationships, interactions and order. It
does not return PlantUML. Local code validates the plan and controls PlantUML syntax, aliases,
element kinds, arrows, interface names and escaping. Each supported diagram type has its own
bounded plan contract, validator and renderer; there is no universal mega-schema. D1.2 adds
`sequence` first. D2 adds `component`, D3 `c4-context`, D4 `c4-container`, and D5
`archimate-hld` in separate steps. C4 and ArchiMate output uses no external includes or macro
downloads.

The reviewer receives the same validated snapshot and digest as the generator, the plan,
evidence and the deterministically rendered candidate. Both calls use the same configured
provider and model, with separate requests. The reviewer returns only a strict verdict and
fact/evidence references. It neither renders nor repairs the diagram. Local code validates its
response and decides whether to accept the result. Grounding report v2 retains provenance and
safe metadata without prompts or raw model responses.

An invalid input before generation uses zero model calls. A locally rejected plan uses one.
A successful reviewed run uses exactly two. There is no retry, repair, fallback or third call.
The old `generateSequenceDiagram` remains a separate compatibility path, never an automatic
fallback.

## Consequences

The model is responsible for the semantic plan; code is responsible for notation. ADR 0001
and D1.1 are superseded as the active path, but remain in Git history and on the D1.1
checkpoint branch. Their implementation is not silently rewritten by this documentation
decision. D1.2 is the next implementation task, followed by S1; M1, D2 and the old gauntlet
remain blocked until the new S1 passes. A change to this architecture requires a new owner
decision.

## Rejected alternatives

- Expand the generator prompt again: literal syntax fragments already failed to make output reliable.
- Let the reviewer repair: that changes its independent verdict role and adds model calls.
- Require only a stronger model: that would make the product depend on model capability instead
  of enforcing notation locally.
- Extend the PlantUML parser with more variants: that accepts more generated notation without
  removing the model's syntax and snapshot obligations.

See the [reviewed pipeline contract](../reviewed-diagram-pipeline.md) and
[diagram profiles](../diagram-profiles.md).
