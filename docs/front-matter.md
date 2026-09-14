# Flow front matter

A flow description starts with a short front matter block that names the diagram and
its author. The block is deliberately not YAML: only simple single-line `key: value`
entries are understood, and everything else is rejected rather than interpreted.

## Example

```markdown
---
diagram_name: orbit-transfer
flow_name: Orbit transfer request
author: Flight Dynamics Team
language: en
---
The flight operator submits an orbit transfer request to the telemetry gateway.
```

## Keys

| Key | Required | Rules |
| --- | --- | --- |
| `diagram_name` | yes | lowercase letters, digits and hyphens; used as a safe file name |
| `flow_name` | yes | free text, up to 256 characters |
| `author` | yes | free text, up to 256 characters |
| `language` | no | `en` or `pl`; defaults to `en` |

No other keys are accepted, and each key may appear only once.

## Syntax

- The first line is exactly `---` and a later line is exactly `---`.
- Each entry is `key: value` on one line, with a single space after the colon.
- Blank lines inside the block are ignored.
- Values may not be empty and may not exceed 256 characters.
- LF and CRLF line endings are accepted.
- Everything after the closing `---` is the flow body, passed on unchanged.

## Rejected constructs

The parser rejects, with an error, all of the following:

- lists and block sequences (`[a, b]`, lines starting with `-`);
- objects and nested mappings (`{a: b}`, `key: inner: value`);
- anchors, aliases and tags (`&name`, `*name`, `!!str`);
- block scalars and multiline values (`|`, `>`, indented continuation lines);
- quoted values, directives and comments;
- template placeholders (double braces or a dollar sign followed by a brace);
- tabs, control characters and bidirectional formatting characters.

## Limits

| Limit | Value |
| --- | --- |
| Whole flow document | 50000 characters |
| Front matter value | 256 characters |
| Reported issues | 100 |

## Errors

Problems are reported with a stable code, a fixed message and a line number. Error
reports never repeat the entered values or unknown key names.
