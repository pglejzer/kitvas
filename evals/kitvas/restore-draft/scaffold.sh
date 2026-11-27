#!/usr/bin/env bash
# Creates the kitvas workspace with the draft old-shop and deletes it, so the case starts with that draft in
# the trash.
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
K draft new old-shop --title "Old shop"
K draft delete old-shop
if [ -d .kitvas/drafts/old-shop ]; then
  echo "scaffold: expected the draft old-shop to be in the trash after draft delete" >&2
  exit 1
fi
