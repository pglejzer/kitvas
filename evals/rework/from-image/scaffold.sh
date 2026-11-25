#!/usr/bin/env bash
# Makes a project with kitvas set up and one screenshot of the page to rework, pricing.png.
# The screenshot is page.png of this folder, rendered from page.html at 1280 px wide.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$HERE/../../.." && pwd)}"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -f "$HERE/page.png" ]; then
  echo "scaffold: cannot find bin/kitvas.ts three folders above this script, or page.png beside it; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
pnp_folders

cp "$HERE/page.png" pricing.png
node "$ROOT/bin/kitvas.ts" init --json
