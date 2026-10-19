# Archi Agent — Product Roadmap

This roadmap describes this branch only; Git and its implementation define available behavior.
Historical milestones are retained locally and in Git. Plans do not authorize implementation.

# Archi Agent — Product Roadmap

## Product vision

Archi Agent is intended to become a grounded architecture assistant integrated with Visual Studio Code.

Its role is not simply to ask an LLM to draw a diagram.

The system should combine:

* deterministic enterprise architecture knowledge,
* project requirements and documentation,
* LLM reasoning,
* strict validation,
* source attribution,
* optional independent semantic review.

The target user workflow is:

```text
architecture sources
+ requirements
+ user description
        ↓
grounding
        ↓
compact architecture context
        ↓
LLM generation
        ↓
deterministic validation
        ↓
optional semantic review
        ↓
optional repair
        ↓
PlantUML
```

---

## Constraints

Grounding stays deterministic and local; only minimal context reaches a model. Untrusted output
is validated. New providers, sources, diagrams, retry/repair/fallback and extra calls need approved
scope. No functionality is imported from later main by this documentation cleanup.
