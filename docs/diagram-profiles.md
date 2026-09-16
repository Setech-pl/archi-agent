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

A diagram profile is not a local renderer.

The target architecture is:

```text
GroundedDiagramContext
        ↓
DiagramProfile
        ↓
LLM
        ↓
final PlantUML
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

## LLM-first target

For future multi-diagram generation, the LLM is expected to produce final PlantUML.

Archi Agent provides:

* grounding,
* profile instructions,
* validation,
* evidence,
* semantic review,
* repair orchestration.

A separate handcrafted renderer should not be created for each diagram profile.

---

# Sequence

## Status

**Implemented through the current validated sequence pipeline.**

A future LLM-first path may coexist with the deterministic renderer during migration.

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

A profile should conceptually contain:

```text
id
display name
purpose
system instructions
diagram instructions
supported concepts
abstraction rules
validation policy
semantic-review criteria
```

Example:

```ts
interface DiagramProfile {
  id: DiagramType;
  displayName: string;
  purpose: string;
  generationInstructions: string;
  validationPolicy: DiagramValidationPolicy;
  reviewCriteria: DiagramReviewCriteria;
}
```

The profile must not contain a local diagram-generation algorithm.

---

# Generation flow

Target flow:

```text
User selects diagram type
        ↓
GroundedDiagramContext
        ↓
profile registry
        ↓
profile-specific compact prompt
        ↓
LLM generates PlantUML
        ↓
common validation
        ↓
profile validation
        ↓
optional semantic review
```

---

# Common validation

Regardless of profile, Archi Agent should validate:

* required PlantUML boundaries,
* bounded output size,
* canonical architecture names,
* `[NEW]` conventions,
* accountability ledger consistency,
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
