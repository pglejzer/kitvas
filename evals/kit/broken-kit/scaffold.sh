#!/usr/bin/env bash
# Creates the kitvas workspace and puts a project kit "shopkit" in it whose kit.json is broken (the fixture
# test/fixtures/kits/broken). The case starts with a kit that does not load.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
FIXTURE="$ROOT/test/fixtures/kits/broken"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -f "$FIXTURE/kit.json" ]; then
  echo "scaffold: cannot find bin/kitvas.ts or the broken kit fixture three folders above this script; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
prepare_home

node "$ROOT/bin/kitvas.ts" init --json
mkdir -p .kitvas/kits/shopkit
cp "$FIXTURE/kit.json" .kitvas/kits/shopkit/kit.json
