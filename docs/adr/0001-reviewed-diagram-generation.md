# ADR 0001 — Reviewed diagram generation

- Status: Accepted
- Date: 2026-09-21
- Decision owner: project owner

## Context and problem

The experimental D1 `generateDiagram` path asks one model to produce final PlantUML and a
second representation, `messages`. The ledger repeats order, physical `lineNumber`, source,
target, arrow semantics, `async`, `isResponse`, interface type and interface name. These two
representations can disagree even when produced by the same model. Owner smoke with Ollama
`qwen3:30b` exposed a missing final LF, an invalid participant declaration and later
`sequence-arrow-ledger-mismatch`. D1 passed automatic verification but its owner smoke did not
pass. More ledger diagnostics do not remove the duplicated contract.

## Decision

D1.1 replaces the active D1 ledger path with this sequence:

1. Resolve one minimal, validated `ArchitectureSnapshot` and its digest before model I/O.
2. Call the generator once for a strict `{ plantUml }` response only.
3. Parse the accepted PlantUML subset and validate locally, deriving `DiagramFacts` and physical
   line numbers without asking the model for a ledger.
4. If deterministic checks pass, make one separate, independent LLM call as semantic reviewer.
5. Make the final accept/reject decision deterministically from the validation and review verdict.

There is no retry, repair or fallback. A successful reviewed run makes exactly two model calls.
A deterministic rejection after generation makes exactly one. An unsupported diagram type or
invalid context stops before model I/O. Cancellation stops the following phases.

Initially the generator and reviewer use the same configured provider profile and model, but
have separate requests and contexts. Both receive the same snapshot and digest. The reviewer
returns a strict verdict and evidence-linked violations; it cannot modify PlantUML or facts.
The existing `Generate Sequence Diagram` command remains on its old compatibility pipeline and
is not an automatic fallback.

## Consequences

- Model output has no `messages`, ledger, `order` or `lineNumber`. The parser computes line numbers
  and `DiagramFacts` from final PlantUML.
- D1.1 initially implements only `sequence`; later diagram profiles reuse the minimal profile
  boundary without copying the old renderer.
- The current D1 commit remains in Git history. The experimental implementation and two failed
  smoke findings are preserved on `checkpoint/d1-ledger-pipeline`.
- The new active work starts from `4dbc65a2a698ea1ed7e3d00160c4a802c9a8083b`, not from the
  checkpoint. Owner smoke for D1.1 is a separate S1 gate and has not passed.

## MCP boundary

The orchestrator invokes MCP tools deterministically; an LLM never selects or drives those
tools autonomously. MCP results are untrusted data, mapped and validated into the same
`ArchitectureSnapshot` before either model call. The first snapshot provider wraps the existing
Knowledge Pack loader; MCP adaptation belongs to later M1.

## Rejected alternatives

- Further expansion of the model-generated ledger or asking the model to count physical lines:
  retains the duplicated, brittle representation.
- Retry or automatic repair: adds calls and mutation without removing the contract problem.
- A second model without deterministic validation: cannot establish syntax, provenance or
  architecture grounding reliably.
- Autonomous MCP tool calling: weakens the deterministic source boundary.
- Rewriting Git history: would lose the experimental checkpoint and its diagnosis.

The implementation contract is specified in
[`reviewed-diagram-pipeline.md`](../reviewed-diagram-pipeline.md).
