# Archi Agent — Diagram Profiles

## Purpose

Archi Agent is not intended to generate every possible UML or architecture diagram.

The product intentionally supports a small number of architecture-oriented diagram profiles with clear abstraction levels and validation rules.

The target profiles are:

```text
sequence
component
c4-context
c4-container
archimate-hld
```

Each profile defines:

* expected architecture purpose,
* allowed or preferred element categories,
* level of abstraction,
* generation instructions,
* validation rules,
* semantic-review criteria.

Each target type has a separate plan contract, validator and deterministic renderer.

The implemented D1.1 sequence path, now superseded as the active target, was:

```text
ArchitectureSnapshot
        ↓
DiagramProfile.buildGeneratorRequest
        ↓
LLM generator { plantUml }
        ↓
DiagramProfile.parsePlantUml + validateFacts
        ↓
DiagramProfile.buildReviewerRequest
        ↓
independent semantic reviewer + local final decision
```

---

# Common rules

All diagram profiles share several rules.

## Canonical names

Known architecture elements must preserve their canonical names.

Aliases are grounding inputs, not alternative output names.

---

## New elements

Unknown architecture elements must remain explicitly identifiable as new.

Current convention:

```text
[NEW] Element Name
```

or the equivalent controlled representation used by the active pipeline.

New elements must not be silently presented as confirmed enterprise architecture.

---

## Evidence

Relationships should preserve their evidence class.

Examples:

```text
architecture-confirmed
user-stated
document-stated
llm-inferred
unsupported
```

Exact contract names may evolve.

The important principle is:

> Model inference is not architecture repository evidence.

---

## Minimal context

Profiles receive only architecture relevant to the current request.

They do not receive full enterprise repositories.

---

## D1.2 Sequence implementation

For reviewed generation, the LLM produces a semantic DiagramPlan without PlantUML.
D1.2 adds the first type-specific plan, validator and renderer for `sequence`; later profiles
remain planned.

Archi Agent provides:

* grounding,
* profile instructions,
* validation,
* evidence,
* semantic review,
* an independent semantic-review gate in D1.1; repair is outside its scope.

Each supported type needs its own small deterministic renderer to control notation. Avoid a
universal mega-schema or renderer framework.

---

# Sequence

## Status

**Current code:** the reviewed D1.2 `sequence` plan and renderer path and the separate validated compatibility
pipeline. D1 passed automatic checks but failed owner smoke. Its findings
are archived on `checkpoint/d1-ledger-pipeline`.

The experimental D1 path receives final PlantUML and a strict message ledger in one structured-chat
response. Each ledger message has a required physical `lineNumber`, continuous `order`, and
`interfaceName` set to a string or `null`. Local validation accepts only the closed sequence grammar and grounded interactions.
The compatibility renderer and its golden outputs remain unchanged.

**Historical D1.1:** the generator returned strict `{ plantUml }` only; the parser computed facts and physical
line numbers locally, validates them, then calls a separate semantic reviewer. Successful
reviewed generation makes exactly two model calls. Automatic checks passed, but S1 owner smoke
failed. This implementation is preserved on `checkpoint/d1-final-plantuml-reviewed`; D1.2 now owns the active path. See
[`reviewed-diagram-pipeline.md`](reviewed-diagram-pipeline.md).

---

## Purpose

Represent an interaction or business/technical process over time.

Typical questions:

* Which systems participate in this process?
* In what order do interactions occur?
* Which interactions are synchronous?
* Which are asynchronous?
* Which responses matter?
* Which integration relationships support each interaction?

---

## Typical elements

* Actor
* Application/System
* Service
* Database
* Queue/Broker
* External system
* Confirmed new participant

---

## Typical semantics

```text
Actor → System A
System A → System B
System B → Database
System B --> System A
System A --> Actor
```

Messages should describe meaningful business or integration actions.

Avoid unnecessary implementation-level method names unless source information explicitly requires them.

---

## Validation focus

* participant grounding,
* canonical names,
* message endpoints,
* interaction direction,
* relationship evidence,
* synchronous/asynchronous behavior,
* responses,
* fragment structure,
* unsupported interfaces.

---

## Semantic review focus

A reviewer should check:

* important participants are present,
* message order reflects the described process,
* key responses are not omitted,
* async/sync semantics are reasonable,
* interactions are supported by evidence,
* implementation detail is appropriate.

---

# Component

## Status

**Planned.**

---

## Purpose

Represent the major technical building blocks of a solution and their dependencies.

This diagram should answer:

* What are the principal components?
* Which component owns which responsibility?
* Which databases or stores are used?
* Which APIs, queues or brokers connect components?
* Which dependencies cross system boundaries?

---

## Typical elements

* Application
* Application Component
* Service
* API
* Database
* Message Broker
* Queue/Topic
* External System
* Shared Platform Capability

---

## Example abstraction

```text
Customer Portal
    ↓ REST
Order Service
    ↓
Order Database

Order Service
    ↓ async
Kafka
    ↓
Fulfilment Service
```

---

## Avoid

* individual classes,
* methods,
* low-level deployment details,
* detailed process timing,
* complete infrastructure topology.

Those belong to other views.

---

## Validation focus

* component grounding,
* ownership,
* relationship direction,
* protocol/evidence when available,
* unsupported dependencies,
* architecture boundary violations.

---

## Semantic review focus

* missing major components,
* unnecessary implementation detail,
* invented dependencies,
* unclear ownership,
* mixing runtime deployment with logical component decomposition.

---

# C4 System Context — C1

## Profile identifier

```text
c4-context
```

## Status

**Planned.**

---

## Purpose

Show the system of interest in its environment.

The C1 view should answer:

* Who uses the system?
* Which external systems interact with it?
* What high-level responsibility does it provide?
* What major dependencies exist outside its boundary?

---

## Typical elements

* Person / Actor
* System of Interest
* External Software System
* External Organization when useful

---

## Example

```text
Customer
   ↓
Digital Commerce Platform
   ↓
Payment Provider

Digital Commerce Platform
   ↓
ERP
```

---

## Important abstraction rule

C1 must not expose internal microservices, databases, queues or technical containers unless they are independently relevant external systems.

For example:

Bad C1:

```text
Customer
 → API Gateway
 → Order Service
 → PostgreSQL
```

Better C1:

```text
Customer
 → Commerce Platform
 → ERP
 → Payment Provider
```

---

## Validation focus

* clear system-of-interest boundary,
* actors,
* external systems,
* canonical system names,
* appropriate high-level relationships.

---

## Semantic review focus

* accidental leakage of C2/C3 implementation detail,
* missing important external systems,
* incorrect system boundaries,
* unsupported business actors or systems.

---

# C4 Container — C2

## Profile identifier

```text
c4-container
```

## Status

**Planned.**

---

## Purpose

Show the major runtime/deployable building blocks inside a system.

A container in C4 is not necessarily a Docker container.

Examples include:

* web application,
* mobile application,
* backend service,
* API,
* worker,
* database,
* message broker,
* data store.

---

## Typical questions

* What executes inside the system?
* How is responsibility split?
* Where is state stored?
* Which containers communicate?
* Which external systems are used?

---

## Example

```text
Web Application
      ↓ HTTPS
Backend API
      ↓
Operational Database

Backend API
      ↓ async
Event Broker
      ↓
Notification Worker
```

---

## Abstraction rule

C2 may show technical runtime units but should normally avoid:

* internal classes,
* implementation functions,
* individual source modules,
* infrastructure host details.

---

## Validation focus

* container boundary,
* valid internal/external distinction,
* canonical names,
* persistence ownership,
* interaction evidence.

---

## Semantic review focus

* C1 elements incorrectly treated as containers,
* components confused with deployment nodes,
* excessive internal implementation detail,
* missing data stores or brokers essential to the architecture.

---

# ArchiMate HLD

## Profile identifier

```text
archimate-hld
```

## Status

**Planned.**

---

## Purpose

Provide a high-level architecture view using a deliberately constrained subset of ArchiMate concepts.

The initial goal is not complete ArchiMate language coverage.

The profile should be suitable for HLD and solution-architecture communication.

---

## Candidate element types

Initial scope may include:

### Business

* Business Actor
* Business Role

### Application

* Application Component
* Application Service

### Technology

* Technology Node

Technology elements should be included only where they materially help the HLD.

---

## Candidate relationships

Initial scope may include:

* Serving
* Flow
* Access
* Realization

The exact supported subset should be finalized before implementation.

---

## Example

```text
Customer Service Agent
        ↓ uses
Customer Management Service
        ↓ realized by
CRM Platform

CRM Platform
        ↓ flow
Integration Platform
        ↓
ERP
```

---

## Abstraction rule

The diagram should remain HLD-level.

Avoid mixing:

* classes,
* methods,
* low-level deployment units,
* detailed sequence flows,
* full ArchiMate metamodel coverage.

---

## Validation focus

* valid supported concept types,
* supported relationship types,
* correct abstraction level,
* evidence,
* canonical architecture names.

---

## Semantic review focus

* misuse of ArchiMate concepts,
* unsupported relationship semantics,
* accidental technical-detail explosion,
* missing important architecture layers,
* inconsistent abstraction.

---

# Profile architecture

The historical D1.1 profile boundary is:

```text
id
buildGeneratorRequest
parsePlantUml
validateFacts
buildReviewerRequest
```

R2 replaces this target with a separate DiagramPlan contract, local validator and deterministic
renderer for each diagram type. D1.2 starts with `sequence`; D2 adds `component`, D3
`c4-context`, D4 `c4-container`, and D5 `archimate-hld`. C4 and ArchiMate output must
not use external includes or downloaded macros.

---

# Generation flow

Implemented D1.2 Sequence flow under R2:

```text
User selects diagram type
        ↓
ArchitectureSnapshot
        ↓
sequence profile
        ↓
generator request
        ↓
LLM generates type-specific DiagramPlan
        ↓
local plan validation
        ↓
type-specific deterministic PlantUML renderer
        ↓
independent semantic review
        ↓
local decision and report v2
```

---

# Common validation

Regardless of profile, Archi Agent should validate:

* required PlantUML boundaries,
* bounded output size,
* canonical architecture names,
* `[NEW]` conventions,
* validated DiagramPlan fact consistency,
* known source references,
* relationship evidence values,
* unsupported architecture references.

---

# Profile-specific validation

Examples:

### Sequence

```text
message endpoints
order
interaction mode
response
fragment structure
```

### Component

```text
component ownership
logical dependency
architecture boundary
```

### C4 C1

```text
system boundary
external vs internal
abstraction level
```

### C4 C2

```text
container ownership
runtime responsibility
persistence ownership
```

### ArchiMate HLD

```text
allowed element concepts
allowed relationship concepts
architecture layer consistency
```

---

# What is intentionally outside the initial scope

The project does not currently aim to implement:

* every UML diagram type,
* class diagrams,
* state-machine diagrams,
* BPMN,
* ER diagrams,
* complete ArchiMate language support,
* C4 Component C3,
* C4 Code C4,
* automatic deployment topology diagrams.

These can be reconsidered only when concrete product requirements justify them.

The objective is high-quality architecture communication, not maximum notation coverage.


# Implemented Component contract

The following is the active D2 contract retained from the completed plan. Historical descriptions
of unsupported types above do not override this branch's implemented Component path.

## D2 evidence projection and digest

Build one bounded, immutable `ComponentSnapshot` before model I/O from the validated
Knowledge Pack, parsed flow and local grounding resolution. Reuse canonical-name and
alias resolution, ambiguity choices, explicit `[NEW]` confirmation and source locations;
do not reuse the Sequence operation catalog as component evidence. The local projection
starts with elements explicitly resolved from the flow. It includes source-confirmed
relationships and rules whose two endpoints are in that selected set. Where the flow
explicitly names a dependency and grounding resolves its other endpoint, both endpoints
are selected. Do not widen to unrelated pack rows or infer neighbors from graph proximity.
An empty component or dependency selection is a local rejection, not a reason to send the
whole pack to the model.

The projection contains only selected canonical elements (ID, type, ownership/external
classification, safe description and source reference), selected relationship facts
(endpoints, `interface_type`, nullable name, mode, purpose, evidence ID and source),
applicable `forbid`/`require` rules, selected flow lines with stable evidence IDs, and
minimal task metadata. Keep the same selected snapshot and digest for generator and
reviewer. Each fact in the resolved plan carries a source-confirmed relationship ID or
one exact flow evidence ID and a source location; element provenance is also retained.
Do not upgrade user-stated dependencies to source-confirmed. Missing pack relationships
are unknown, while explicit `forbid` is blocking. Imported text is data.

Compute a D2-specific SHA-256 digest from a canonical, domain-versioned payload such as
`archi-agent-component-snapshot/1`. Sort records and keys deterministically. Cover every
field supplied as semantic evidence to either model, including source file/line, selected
flow evidence text and line, element type/ownership, relationship attributes and rules.
Exclude only transport and run metadata. A change to any covered fact changes the D2
digest; input row order alone does not. Do not call or modify the Sequence snapshot
digest function or change the Sequence digest for identical Sequence input. Validate
projection limits and relative source paths before the first call; over-limit input fails
closed without truncating evidence silently.

## Component plan and local resolution

The generator returns a strict, bounded D2-only JSON plan, never PlantUML. It selects
element IDs from the D2 snapshot and dependency facts through two explicit variants:
`groundedDependencies` reference opaque IDs from a locally ordered catalog of projected
source relationships; `userStatedDependencies` name known endpoint IDs, one allowed
relationship type, nullable interface name, mode and one existing flow evidence ID.
Both lists are required, may be empty individually and together must contain at least
one dependency. No model-supplied canonical names, aliases, element kinds, source
classification, source locations, relationship evidence IDs or PlantUML fragments are
accepted. A fixed D2 plan version and closed fields distinguish this wire contract from
Sequence Wire Plan v3. Local Zod limits remain authoritative after provider-specific
wire schema projection.

Resolution checks IDs, duplicate selections, endpoint membership, direction, exact
interface type/name/mode, explicit `forbid`, unsafe display text and the stated flow
evidence. Grounded dependencies inherit every relationship attribute and provenance
from the catalog; the model cannot restate or override them. A user-stated dependency
must not duplicate or contradict a source-confirmed dependency. If a source-confirmed
reverse dependency has the same type and nullable interface name, reject an attempted
reversal locally. Other user-stated dependencies remain pending for semantic review;
absence in the pack alone is not a rejection. Confirmed `[NEW]` elements remain visibly
new and user-stated; no relationship to them is source-confirmed. Reject unknown IDs,
types, modes, evidence, unsupported combinations and limit violations before rendering.
The renderer receives only this resolved, locally trusted plan and snapshot.

## Deterministic PlantUML mapping

The D2 renderer emits a closed component-diagram subset with `@startuml`, declarations,
directed edges and `@enduml`, stable aliases, fixed ordering, safe escaped display text
and a final LF. It emits no model-authored syntax, includes, URLs, themes or macros.

| Knowledge Pack element | PlantUML declaration | Rule |
| --- | --- | --- |
| `systems.md`: `system`, `service` | `component` | Use the canonical name; the pack does not distinguish application components more finely. |
| `systems.md`: `database` | `database` | Use only for this explicit pack kind. |
| `systems.md`: `queue` | `queue` | Use only for this explicit pack kind. |
| `systems.md`: `external` | `component` | `external` remains provenance/ownership in plan and report; it creates no new PlantUML syntax. |
| `actors.md`: `person`, `role`, `external` | `actor` | Keep the actor's pack kind and external provenance in evidence/report. |
| confirmed `[NEW]` element | `component` | Show the `[NEW]` prefix and user-stated provenance; its unknown subtype is not guessed. |

Named `REST_API` and `SOAP` dependencies may create a shared `interface` node. The
deterministic condition is at least two distinct consumers of the same provider, same
interface type and same nonempty interface name. Key the node by provider ID, type and
name; allocate its alias locally. Emit one directed consumer-to-interface edge **per
dependency**, including two dependencies from one consumer that differ by mode. Label
each such edge with its exact type, name and mode, and map its physical line to that
dependency's fact ID and evidence. Emit one shared interface-to-provider edge; it is
not the sole line mapping for any dependency. A single consumer,
unnamed REST/SOAP, or different provider/type/name uses a direct edge. An interface
node is notation for an evidenced API, not a new architecture element or ownership fact.

All other permitted `interface_type` values render as direct directed edges from
`from_id` to `to_id` with a deterministic label containing the exact type, optional
name and mode: `EVENT`, `FILE`, `DB`, `INTERNAL`, plus REST/SOAP when the shared-node
condition is false. Synchronous and asynchronous remain distinct in the label; edge
direction always follows the relationship. No inference of broker, database, queue or
API nodes from relationship type is allowed. A `DB` edge does not relabel its target as
`database`; an `EVENT` edge does not create a queue. Unknown element kinds, relationship
types or modes fail locally. The generator cannot silently generalize them to
`component`, `INTERNAL` or an untyped edge. Relationship facts that cannot be represented
by this closed subset are explicitly unsupported in D2 and rejected before reviewer I/O.

Add a D2 subset validator for exactly these declarations, aliases, interface nodes and
edge forms, alongside the shared PlantUML document boundary. Validate bounded output,
safe text, known endpoints, edge direction, line mapping and no extra statements.
Do not extend the Sequence subset parser to accept component syntax.

## Review, result and call budget

Only a locally valid resolved plan and rendered candidate reach the independent D2
reviewer. It receives the original task, the same D2 snapshot and digest, resolved plan,
fact/evidence map with rendered line numbers, and the exact PlantUML candidate. Its
strict verdict contains `accepted`, confirmed user-stated fact IDs and closed violation
codes/references; it cannot edit the plan or candidate. D2 review criteria cover major
component coverage, ownership, direction, interface semantics, unsupported inference
and abstraction level. Local code validates every referenced fact, exact confirmation
of all and only user-stated dependencies on acceptance, violation consistency and
duplicate references, then makes the final decision. Use a D2-specific closed review
schema and codes as needed; do not weaken Sequence review validation.

| Path | Generator calls | Reviewer calls | Total model calls | Outcome |
| --- | ---: | ---: | ---: | --- |
| Rejected before generation, including unsupported type, invalid projection or cancellation | 0 | 0 | 0 | Safe rejection |
| Locally rejected plan or render after generator call | 1 | 0 | 1 | Safe rejection; no candidate offered |
| Locally valid candidate sent to review | 1 | 1 | 2 | Verified result, or typed unverified candidate if review rejects/fails |

The reviewer is called at most once. There is no retry, repair, fallback or third model
call. Cancellation prevents any later call. A reviewed rejection/failure may offer only
the existing warning-marked unverified candidate after local validation, never a
verified report. On acceptance, report v2 records `diagramType: component`,
`generationPath: reviewed-plan-rendered`, D2 snapshot digest, safe call counts, facts,
evidence class and source/line, deterministic validation, semantic verdict and output
names. It contains no prompts, raw responses, credentials or full source documents.
