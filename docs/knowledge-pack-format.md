# Architecture Knowledge Pack format

An Architecture Knowledge Pack is a small folder of Markdown files that describes the
systems, actors and permitted interactions of one architecture landscape. ArchGround
reads the pack locally; nothing is sent over the network.

## Files

A pack consists of exactly five files:

| File | Purpose |
| --- | --- |
| `systems.md` | Systems, services, databases, queues and external parties |
| `actors.md` | People, roles and external actors |
| `relationships.md` | Known interactions between systems and actors |
| `aliases.md` | Alternative names that point to a known identifier |
| `rules.md` | Interactions that are forbidden or required |

## Document layout

Each file contains:

1. optional blank lines,
2. at most one level-1 heading (`# Title`),
3. exactly one pipe table with a header row, a separator row and data rows.

`systems.md` must contain at least one data row. `actors.md`, `relationships.md`, `aliases.md`
and `rules.md` may contain only the header and the separator row when the landscape has no such
records; the file itself is still required.

Any other content is rejected: free text, additional headings, a second table, code
fences, HTML, images, directives and template placeholders.

Table rules:

- every row starts and ends with a pipe;
- the header must list exactly the documented columns, in the documented order;
- every separator cell consists of at least three hyphens (alignment colons are not used);
- every data row has exactly as many cells as the header;
- surrounding spaces in cells are trimmed;
- a literal pipe inside a cell is written as a backslash followed by a pipe, and a literal
  backslash as two backslashes;
- tabs, control characters and bidirectional formatting characters are rejected;
- empty cells are allowed only in optional columns.

Both LF and CRLF line endings are accepted.

## Identifiers

Identifiers start with a lowercase letter and contain only lowercase letters, digits and
hyphens, up to 64 characters (for example `telemetry-gateway`). Identifiers are never
normalised: `Telemetry-Gateway` is an error, not a synonym.

## systems.md

| Column | Required | Values |
| --- | --- | --- |
| `id` | yes | identifier |
| `canonical_name` | yes | up to 256 characters |
| `kind` | yes | `system`, `service`, `database`, `queue`, `external` |
| `description` | yes | up to 2000 characters |

```markdown
# Systems

| id | canonical_name | kind | description |
| --- | --- | --- | --- |
| telemetry-gateway | Telemetry Gateway | service | Receives spacecraft telemetry |
| flight-plan-store | Flight Plan Store | database | Stores approved flight plans |
```

## actors.md

| Column | Required | Values |
| --- | --- | --- |
| `id` | yes | identifier |
| `canonical_name` | yes | up to 256 characters |
| `kind` | yes | `person`, `role`, `external` |
| `description` | yes | up to 2000 characters |

```markdown
| id | canonical_name | kind | description |
| --- | --- | --- | --- |
| flight-operator | Flight Operator | role | Plans and uploads commands |
```

## relationships.md

| Column | Required | Values |
| --- | --- | --- |
| `from_id` | yes | identifier |
| `to_id` | yes | identifier |
| `interface_type` | yes | `REST_API`, `SOAP`, `EVENT`, `FILE`, `DB`, `INTERNAL` |
| `interface_name` | no | up to 256 characters |
| `mode` | yes | `synchronous`, `asynchronous` |
| `purpose` | yes | up to 2000 characters |

```markdown
| from_id | to_id | interface_type | interface_name | mode | purpose |
| --- | --- | --- | --- | --- | --- |
| flight-operator | telemetry-gateway | REST_API | Command API | synchronous | Sends commands |
| telemetry-gateway | flight-plan-store | DB |  | synchronous | Reads flight plans |
```

## aliases.md

| Column | Required | Values |
| --- | --- | --- |
| `alias` | yes | up to 256 characters |
| `target_id` | yes | identifier |

The same alias may point to more than one target. Such ambiguity is kept and must be
resolved later, never guessed.

```markdown
| alias | target_id |
| --- | --- |
| Gateway | telemetry-gateway |
| Plan Store | flight-plan-store |
```

## rules.md

| Column | Required | Values |
| --- | --- | --- |
| `rule` | yes | `forbid`, `require` |
| `from_id` | yes | identifier |
| `to_id` | yes | identifier |
| `reason` | yes | up to 2000 characters |

```markdown
| rule | from_id | to_id | reason |
| --- | --- | --- | --- |
| forbid | flight-operator | flight-plan-store | Plans change only through the gateway |
```

## Duplicates

Within one file the following must be unique:

- systems and actors: `id`;
- relationships: `from_id`, `to_id`, `interface_type`, `interface_name`, `mode`;
- aliases: `alias` with `target_id`;
- rules: `rule`, `from_id`, `to_id`.

Checks that need more than one file are described in "Loading a complete pack" below.

## Limits

| Limit | Value |
| --- | --- |
| File size | 1 MiB |
| Data rows per table | 10000 |
| Columns per table | 16 |
| Characters per cell | 2000 |
| Identifier length | 64 |
| Canonical name length | 256 |
| Reported issues per file | 100 |

Character limits count Unicode characters, not bytes.

## Errors

Every problem is reported with a stable code, a fixed message and a location (file, line,
column, limit). Reports never repeat cell contents, so they are safe to show in logs.

## Loading a complete pack

### Files

The pack folder must contain exactly these five files, spelled exactly like this:

`systems.md`, `actors.md`, `relationships.md`, `aliases.md`, `rules.md`

- A missing file is an error (`missing-file`).
- A name with different letter case (for example `Systems.md`) does not count as the
  required file: the required file is reported missing and the other name as unexpected.
- Any other Markdown file (`.md` or `.markdown`) is an error (`unexpected-file`), so that
  nobody assumes its content is used. Such files are never read.
- Files that are not Markdown are never read; each one is reported as a warning
  (`ignored-file`).
- Each of the five files is read at most once.

A pack is returned only when there are no errors. Warnings never block a valid pack.
Nothing from a pack with errors is returned, not even the valid parts.

### Cross-file validation

After every file has passed its own validation, the loader checks the pack as a whole:

| Check | Result |
| --- | --- |
| A system and an actor use the same `id` | error `identifier-collision` |
| An alias `target_id` is not a declared system or actor | error `unknown-reference` |
| An alias has no letters or digits (for example `---`) | error `invalid-value` |
| A relationship `from_id` or `to_id` is not declared | error `unknown-reference` |
| A rule `from_id` or `to_id` is not declared | error `unknown-reference` |
| The same directed pair is both `forbid` and `require` | error `conflicting-rules` |
| A declared relationship matches a `forbid` rule | error `forbidden-relationship` |
| A `require` rule has no declared relationship | warning `required-relationship-missing` |

Identifiers are unique across the whole pack: a system and an actor may not share one.
Identifiers are never corrected or changed.

Relationships and rules are directional. A relationship from A to B says nothing about
B to A, and a rule for A to B does not cover B to A. One directed pair may have several
different relationships, for example one per interface.

- `forbid` means the pair must never interact. Declaring such a relationship makes the
  pack invalid.
- `require` means the interaction is expected. If it is not declared, the pack is still
  valid and a warning is reported.

Rule reasons are kept exactly as written; they never appear in error messages.

### Indexes

A loaded pack comes with read-only indexes:

| Index | Lookups |
| --- | --- |
| Systems | identifier, exact canonical name, normalized name |
| Actors | identifier, exact canonical name, normalized name |
| Aliases | normalized alias to one or more system or actor identifiers |
| Relationships | all relationships of a directed pair; declared interface names |
| Rules | forbid and require checks for a directed pair, with the declared reason |

Normalized names ignore letter case, compatibility forms and the difference between
spaces, hyphens and underscores. Letters with diacritics are kept as they are, and
canonical names are stored exactly as written.

Lookups never guess:

- every lookup returns all candidates, sorted by identifier, with an explicit status of
  missing, unique or ambiguous;
- an exact canonical match is reported as exact and is not replaced by a normalized one;
- names that collide after normalization are returned as several candidates;
- an alias declared for several targets stays ambiguous and returns every target;
- there is no fuzzy, partial or prefix matching;
- an empty interface name stays empty; no interface name is invented.

### Determinism

Loading is fully deterministic. The files are read in the fixed order above, independent
of how the folder lists them. Issues are sorted by file (the five files in the order
above, then other files by name), line, column and code, and the total is capped at the
reporting limit. Index results are sorted, so the same pack always gives the same answers.

### Example: Space Mission

The synthetic sample in `samples/space-mission/architecture` describes orbital mission
control:

- systems `mission-control`, `command-service`, `telemetry-service`, `telemetry-store`,
  `command-queue` and `orbital-relay`;
- actors `flight-controller` and `mission-commander`;
- a directed chain from the flight controller through Mission Control, the command
  service, the command queue and the orbital relay to telemetry storage;
- two different relationships from `mission-control` to `command-service` (a REST API
  and a file);
- the alias `control`, declared for both `mission-control` and `flight-controller`, which
  stays ambiguous;
- a `forbid` rule from `flight-controller` to `orbital-relay` and a `require` rule from
  `command-service` to `command-queue`.

```markdown
| alias | target_id |
| --- | --- |
| control | mission-control |
| control | flight-controller |
```
