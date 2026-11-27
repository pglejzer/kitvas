#!/usr/bin/env bash
# Creates the kitvas workspace and sets the project's copy language to Polish in `.kitvas/decisions.md`.
# The case starts with a decision that the person does not repeat in the request.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ]; then
  echo "scaffold: cannot find bin/kitvas.ts three folders above this script; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
prepare_home

K() { node "$ROOT/bin/kitvas.ts" "$@" --json; }

K init
K decisions set copy pl
if ! grep -q "^copy: pl" .kitvas/decisions.md; then
  echo "scaffold: expected copy: pl in .kitvas/decisions.md" >&2
  exit 1
fi
