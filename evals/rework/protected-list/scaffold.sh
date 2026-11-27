#!/usr/bin/env bash
# Puts the screenshot of the neighbour case from-image in the case workspace as pricing.png and creates the
# kitvas workspace, so the case starts at the rework.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$HERE/../../.." && pwd)}"
SHOT="$HERE/../from-image/page.png"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -f "$SHOT" ]; then
  echo "scaffold: cannot find bin/kitvas.ts three folders above this script, or ../from-image/page.png; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$HERE/../../lib/sandbox.sh"
prepare_home

cp "$SHOT" pricing.png
node "$ROOT/bin/kitvas.ts" init --json
