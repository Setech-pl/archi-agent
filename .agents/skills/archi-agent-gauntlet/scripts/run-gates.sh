#!/usr/bin/env bash
set -euo pipefail

dry_run=false
with_install=false
audit_unavailable=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    --with-install) with_install=true ;;
    --audit-unavailable) audit_unavailable=true ;;
    *) printf 'Usage: %s [--dry-run] [--with-install] [--audit-unavailable]\n' "$0" >&2; exit 2 ;;
  esac
done

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repo_root=$(CDPATH= cd -- "$script_dir/../../../.." && pwd -P)
git_root=$(git -C "$repo_root" rev-parse --show-toplevel)
git_root=$(CDPATH= cd -- "$git_root" && pwd -P)
if [[ "$repo_root" != "$git_root" || ! -f "$repo_root/AGENTS.md" || ! -f "$repo_root/docs/product-roadmap.md" || ! -f "$repo_root/vscode-extension/package.json" || ! -f "$repo_root/package.json" ]]; then
  printf 'Refusing to run outside the Archi Agent repository\n' >&2
  exit 2
fi
if [[ "$(node -p 'require(process.argv[1]).name' "$repo_root/package.json")" != archground || "$(node -p 'require(process.argv[1]).name' "$repo_root/vscode-extension/package.json")" != archi-agent ]]; then
  printf 'Unexpected package identity; refusing to run\n' >&2
  exit 2
fi
cd -- "$repo_root"

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if [[ "$dry_run" == false ]]; then
    "$@"
  fi
}

check_quietly() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if [[ "$dry_run" == false ]]; then
    if "$@" >/dev/null 2>&1; then
      :
    else
      printf 'Git whitespace check failed; inspect the diff privately\n' >&2
      return 1
    fi
  fi
}

if [[ "$with_install" == true ]]; then
  run npm ci
fi
run npm test
run npm run typecheck
run npm run extension:typecheck
run npm run extension:test
run npm run extension:build
run npm run extension:package
run npm run extension:verify
run npm run demo:dry-run
check_quietly git diff --check
check_quietly git diff --cached --check
while IFS= read -r -d '' path; do
  printf '+ git diff --no-index --check /dev/null %q\n' "$path"
  if [[ "$dry_run" == false ]]; then
    if git diff --no-index --check /dev/null "$path" >/dev/null 2>&1; then
      :
    else
      check_status=$?
      if [[ "$check_status" -ne 1 ]]; then
        printf 'Untracked-file whitespace check failed; inspect the file privately\n' >&2
        exit 1
      fi
    fi
  fi
done < <(git ls-files --others --exclude-standard -z)
if [[ "$audit_unavailable" == true ]]; then
  printf 'SKIPPED npm audit: network unavailable; record this in the report\n'
else
  run npm audit --audit-level=low
fi
