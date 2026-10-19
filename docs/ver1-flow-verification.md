# VER1 — approved flow verification contract

Approved plan: the complete planning response in the owner's session, followed by explicit
implementation approval including native alias saving. This file records its implementation
contract. VER1 is independent of generation under ADR 0002; it verifies Sequence text and prose,
not C4. SRC1/K1 source resolution, indexes, name resolution and provenance are reused.

## Operation

Input contains format (`plantuml-sequence` or `prose`), captured text, optional logical filename,
first source line and language, active KnowledgePackSourceConfig and (prose only) interpreter
configuration. Runtime owns a frozen session: input/hash, validated interpretation/hash, one
KnowledgeSnapshot/digest, indexes, source fingerprints and user decisions. Continuations reuse
the interpretation with zero model calls. No CLI/MCP implementation or persistent session history.

Source guards reread bytes only to compare versions. They never replace the evaluation snapshot.
Changed configuration/model/overlay means `stale-source`: no decisions or alias edits are applied
to the new version. A new operation is required. A saved alias does not change the current report;
the next operation reloads it. Standalone packs support session decisions only.

## Interpretation and PlantUML

Participants retain literal mentions and input spans. Steps contain local participant references,
label, required nullable async/isResponse, nullable responseTo/interfaceType/interfaceName,
attribute evidence and block path. async=true/isResponse=true is invalid. Unknown is not false.
Unexamined spans are explicit. All references, spans, literal evidence and limits are validated.

PlantUML uses zero LLM/provider/credential requests and executes no PlantUML engine. Reuse the
existing document boundary, alias/text safety, limits and exact local PL/EN legends. The new
reader returns semantic steps; the existing generation validator keeps its stricter contract.

Supported: one exact @startuml/@enduml; LF/CRLF with source positions; blank/indented lines;
actor/participant/database/queue declarations in `kind ID`, `kind ID as ID` and
`kind "label" as ID` forms before messages; unique ASCII aliases; explicit declared endpoints;
`->`, `->>`, `-->`, `<-`, `<<-`, `<--` messages with nonempty labels; self messages;
alt/else/opt/loop/group/end, balanced to depth 4; single-line apostrophe comments; exact existing
Archi Agent legends; existing renderer's terminal interface annotations. Labels/conditions are
data. Local aliases only connect messages to declaration labels; they are not knowledge aliases.

Only the exact known Archi Agent legend establishes sync/async/response semantics. Without it,
arrow styles do not prove mode or response role. A response needs an earlier unmatched synchronous
request with reversed endpoints and compatible explicit attributes in the same lexical branch;
LIFO, no cross-branch inference. It checks the request relation, never a new reverse relation.
`return`, activations, create/destroy, par/break/critical/ref, notes, styles, colors, general legends,
multiline declarations and other arrows are unsupported. Directives/includes/macros/resources/URLs
are rejected. Unknown syntax never silently yields PASS: independent known steps may yield a
partial report; unsupported blocks exclude their contents, unsafe boundaries reject the input.

Limits: 256 Ki characters, 2000 lines, 1000 characters/line, 64 participants, 256 messages,
depth 4, 100 issues. Zero evaluated steps cannot be conformant.

## Prose

Exactly one structured interpretation call after local input/source validation; max 50000 input
characters, 64 participants, 256 steps, 16384 output tokens. No architecture catalog is needed by
the interpreter: preserve literal names and inflections. No generator/reviewer/retry/repair/fallback.
Invalid output/evidence, timeout, truncation and cancellation are terminal for that attempt.
The LLM never supplies architecture IDs, name decisions or compliance verdicts. The report shows
the validated interpretation and its language-understanding limitation. Evidence coverage does
not prove perfect natural-language interpretation.

## Deterministic assessment

Resolve complete references using ParticipantDictionary.resolveReference; unknown names may be
selected explicitly from existing indexes. No fuzzy/stemming/automatic target choice. User
confirmation is evidence of a session mapping, not a model fact. Unknown elements/relationships
are never written to the architecture. NEW markers do not authorize creation in VER1.

Use all directional RelationshipIndex candidates. Filter only explicit attributes; ordinary labels
do not automatically equal interface names. Preserve every matching fact and every provenance,
including multiple original relationship IDs folded into one K1 fact. One matching relation proves
the described possible interaction; competing candidates cannot arbitrarily resolve missing data.
Direction/mode conflicts consider all candidates. Self operations do not establish relationships.
Apply forbid rules; report relevant require rules absent from the input without demanding that
every scenario shows every model relationship.

Findings: unknown-element, ambiguous-element, relationship-not-in-model, direction-mismatch,
interaction-mode-conflict, relationship-ambiguous, insufficient-data, source-not-covered,
syntax-not-covered, forbidden-interaction, required-interaction-not-shown. Missing relations are
missing from the loaded scope, not proof of nonexistence. SRC1 source omissions remain explicit.

Execution: completed / needs-resolution / unsupported / invalid-input / stale-source / failed /
cancelled. Assessment: conformant-within-scope only when every required step/attribute is resolved
without relevant omissions; discrepancies when differences exist (even with partial coverage);
inconclusive otherwise. No universal full architectural PASS. Coverage counts conformant,
discrepant, unresolved and omitted steps and preserves all syntax/source gaps. Reports bind
input spans to fact IDs and field-specific model/overlay provenance and user decisions.

## Aliases and native save

Runtime prepares a minimal aliases.md edit binding sourceId and ORIGINAL element ID. Validate
source fingerprint, live target, all resolver/index normalized collisions, exact duplicate no-op,
and the entire proposed overlay using the production SRC1 mapper. Never overwrite an alias
pointing elsewhere. Existing ambiguity can be resolved in-session without replacing its rows.

Host uses a clean native VS Code document and version-checked TextEditor.edit followed by native
save. Check disk fingerprint/document version/dirty state and conflicts; no blind writeFile,
forced overwrite or automatic merge. Before `saved`, reread exact bytes and validate the source.
Separate prepared/saved/unchanged/conflict/stale-source/cancelled/failed outcomes. Preserve foreign
edits; no unsafe rollback. This is not an atomic model+overlay transaction against arbitrary external
writers. A source change never triggers rebase/retry of a decision.

## UX, tests and gates

One `archiAgent.verifyFlow` command: selection, active document or entered prose. Reuse source
settings, QuickPick selections, provider selection only for prose, output and JSON editor beside
input. Support unresolved partial reports and cancellation. No Configuration Workbench expansion.
Report saving does not masquerade as ART1 generation. Existing generation and ART1 remain intact.

Tests cover all syntax/arrows/blocks/responses/limits/directives, false PASS prevention, all findings,
parallel relations, precise field provenance, Polish inflections, one/zero call budgets, frozen
continuations, every source mutation, alias collisions/deleted targets/dirty/concurrent edits,
next-operation persistence and standalone session decisions. Full root/extension tests, typechecks,
build/package/verify, demo/docs/diff checks, exact-VSIX runtime outside repo, SRC1/K1/K3/ART1 and
Sequence/Component regressions, actual Host/visible UI, independent read-only review are required
before functional checkpoint. Owner smoke DEFERRED; new remote CI NOT_RUN.
