#!/usr/bin/env bash
# Makes a project that depends on @mui/material (a design system kitvas has not learned), with kitvas set up
# and one screenshot of the page to rework, pricing.png (page.png of the from-image case).
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

# The eval's sandbox makes every command print a shell error; see evals/lib/sandbox.sh.
. "$HERE/../../lib/sandbox.sh"
prepare_home

cat > package.json <<'JSON'
{
  "name": "bike-shop",
  "version": "1.0.0",
  "dependencies": { "@mui/material": "5.15.0", "react": "18.3.1", "react-dom": "18.3.1" }
}
JSON
cp "$SHOT" pricing.png
node "$ROOT/bin/kitvas.ts" init --json
