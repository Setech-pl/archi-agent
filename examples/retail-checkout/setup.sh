#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
project=$(pwd -P)
if [ -e .vscode/settings.json ]; then
  echo 'Settings already exist. Preserve them; see START-HERE for the architectureSource object.' >&2
  exit 1
fi
case "$project" in
  *'
'*) echo 'A newline in a path is unsupported.' >&2; exit 1 ;;
esac
escaped=$(printf '%s' "$project" | sed 's/\\/\\\\/g; s/"/\\"/g')
mkdir -p .vscode
# noclobber also protects a settings file created after the check.
set -C
cat > .vscode/settings.json <<EOF
{
  "archiAgent.architectureSource": {
    "kind": "structurizr-json",
    "sourceId": "retail-checkout",
    "modelPath": "$escaped/architecture/workspace.json",
    "overlayPath": "$escaped/architecture/overlay"
  }
}
EOF
printf '%s\n' 'Ready. Open this folder in VS Code; start with inputs/en/01-good.puml or inputs/pl/01-good.puml.'
