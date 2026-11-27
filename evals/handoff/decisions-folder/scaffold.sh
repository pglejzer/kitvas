#!/usr/bin/env bash
# Starts from the project of the neighbour case code-app-a (a small React project with the built draft
# "shop") and writes the project's hand-off decisions: the folder, the scope, no scripts and no comparison.
# The case starts with every answer the hand-off needs already in `.kitvas/decisions.md`.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$HERE/../../.." && pwd)}"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -f "$HERE/../code-app-a/scaffold.sh" ]; then
  echo "scaffold: cannot find bin/kitvas.ts three folders above this script, or ../code-app-a/scaffold.sh; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

bash "$HERE/../code-app-a/scaffold.sh"

node "$ROOT/bin/kitvas.ts" decisions add --section Handoff --json \
  --text "A draft goes into src/pages, in a folder named after the draft; new files only; run no scripts afterwards; the look is not compared."
if ! grep -q "src/pages" .kitvas/decisions.md; then
  echo "scaffold: expected the Handoff line in .kitvas/decisions.md" >&2
  exit 1
fi
