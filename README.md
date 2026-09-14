# ArchGround

ArchGround is intended to become a Visual Studio Code extension that drafts PlantUML sequence diagrams from process descriptions, grounded in a local Markdown knowledge pack.

**Status:** private migration staging.

> **Warning:** this project is not ready for publication or distribution. Do not publish the source or distribute packages built from it. Most planned capabilities are not implemented yet.

## Current contents

- Core model types, output naming and versioning helpers, and deterministic text utilities.
- A dependency-free leak scanner in `scripts/leak-scan.mjs`.
- Unit tests that have not been executed yet, because no dependencies have been installed.

## Leak scan

    node scripts/leak-scan.mjs --root <project-dir> --rules <forbidden-patterns-file> [--private-tokens <token-file>]

The rules file and the optional private token file are kept outside this repository.
