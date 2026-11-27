#!/usr/bin/env bash
# Makes a project of single-file components with scoped styles, none of it React (the acme-sfc fixture: src/components with
# Button, Field and Card), and creates the kitvas workspace. The fixture's finished kit is not copied: the case
# asks the skill to write it.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
FIXTURE="$ROOT/test/fixtures/projects/acme-sfc"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -d "$FIXTURE/src/components" ]; then
  echo "scaffold: cannot find bin/kitvas.ts or the acme-sfc fixture three folders above this script; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
prepare_home

cp "$FIXTURE/package.json" package.json
cp -R "$FIXTURE/src" src
cp "$FIXTURE/index.html" index.html

# The kit's copies import React, which kitvas builds them with. Copy it, with the package react-dom needs,
# from the plugin's own packages.
mkdir -p node_modules
for pkg in react react-dom scheduler; do
  if [ -d "$ROOT/node_modules/$pkg" ]; then
    cp -R "$ROOT/node_modules/$pkg" "node_modules/$pkg"
  fi
done

node "$ROOT/bin/kitvas.ts" init --json
