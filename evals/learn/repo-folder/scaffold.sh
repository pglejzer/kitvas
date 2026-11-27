#!/usr/bin/env bash
# Makes a project whose design system is a folder of its own components (the acme-repo fixture: src/ds with
# Button, Card and Stack), with React in node_modules, and creates the kitvas workspace.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
FIXTURE="$ROOT/test/fixtures/projects/acme-repo"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -d "$FIXTURE/src/ds" ]; then
  echo "scaffold: cannot find bin/kitvas.ts or the acme-repo fixture three folders above this script; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
prepare_home

cp "$FIXTURE/package.json" package.json
cp -R "$FIXTURE/src" src

# The components import React, which a real project has installed. Copy it, with the package react-dom needs,
# from the plugin's own packages.
mkdir -p node_modules
for pkg in react react-dom scheduler; do
  if [ -d "$ROOT/node_modules/$pkg" ]; then
    cp -R "$ROOT/node_modules/$pkg" "node_modules/$pkg"
  fi
done

node "$ROOT/bin/kitvas.ts" init --json
