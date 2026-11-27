#!/usr/bin/env bash
# Makes a project of single-file components (the acme-sfc fixture) with its finished kit "acme-sfc" in use, verified
# once so that kitvas has recorded where each component came from, then changes one project file in a way that
# changes nothing a person sees: a comment in the script of src/components/Button.vue. kitvas names Button as out of
# date; the kit needs no change, only the record that Button was looked at.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
FIXTURE="$ROOT/test/fixtures/projects/acme-sfc"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -d "$FIXTURE/kit" ]; then
  echo "scaffold: cannot find bin/kitvas.ts or the acme-sfc fixture three folders above this script; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
prepare_home

cp "$FIXTURE/package.json" package.json
cp "$FIXTURE/index.html" index.html
cp -R "$FIXTURE/src" src

mkdir -p node_modules
for pkg in react react-dom scheduler; do
  if [ -d "$ROOT/node_modules/$pkg" ]; then
    cp -R "$ROOT/node_modules/$pkg" "node_modules/$pkg"
  fi
done

K() { node "$ROOT/bin/kitvas.ts" "$@" --json; }

K init
K kit new acme-sfc --from code:src/components
# Start from the fixture's finished kit.
cp -R "$FIXTURE/kit/." .kitvas/kits/acme-sfc/
K kit use acme-sfc
# The first verify records where each component came from. Without a browser it skips some steps; that is fine.
K kit verify acme-sfc || true
if [ ! -f .kitvas/kits/acme-sfc/origins.json ]; then
  echo "scaffold: expected .kitvas/kits/acme-sfc/origins.json after kit verify" >&2
  exit 1
fi

# A project file changes after the kit was made, in nothing that is drawn.
sed -i 's|^export default {|// Reviewed by the team in the spring.\nexport default {|' src/components/Button.vue
if ! grep -q 'Reviewed by the team' src/components/Button.vue; then
  echo "scaffold: the comment was not added to Button.vue" >&2
  exit 1
fi
