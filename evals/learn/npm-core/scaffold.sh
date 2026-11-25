#!/usr/bin/env bash
# Makes a project that uses the fake package @acme/ui (installed in node_modules) and has no kit yet.
# Runs in the case workspace. Needs the plugin folder: it holds the fixture and bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
FIXTURE="$ROOT/test/fixtures/projects/acme-npm"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -d "$FIXTURE" ]; then
  echo "scaffold: cannot find bin/kitvas.ts or the acme-npm fixture three folders above this script; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
pnp_folders

cp "$FIXTURE/package.json" package.json
# The fixture keeps its fake packages in packages/ because git ignores node_modules.
mkdir -p node_modules
cp -R "$FIXTURE/packages/." node_modules/
# React comes from the plugin's own dependencies, like a real project install.
for pkg in react react-dom; do
  if [ -d "$ROOT/node_modules/$pkg" ]; then
    cp -R "$ROOT/node_modules/$pkg" "node_modules/$pkg"
  fi
done

node "$ROOT/bin/kitvas.ts" init --json
