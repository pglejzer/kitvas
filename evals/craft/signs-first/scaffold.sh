#!/usr/bin/env bash
# Makes a project that uses a design system kitvas has not learned (the package @mui/material in
# package.json) and creates the kitvas workspace. The case starts with no kit of the project's own.
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

cat > package.json <<'JSON'
{
  "name": "bike-shop",
  "version": "1.0.0",
  "dependencies": { "@mui/material": "5.15.0", "react": "18.3.1", "react-dom": "18.3.1" }
}
JSON

node "$ROOT/bin/kitvas.ts" init --json
