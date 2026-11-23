#!/usr/bin/env bash
# Makes a project that lists @acme/ui in package.json but has no node_modules: the package is not installed.
# Runs in the case workspace. Needs the plugin folder: it holds the fixture and bin/kitvas.ts.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-}"
FIXTURE="$ROOT/test/fixtures/projects/acme-npm"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -d "$FIXTURE" ]; then
  echo "scaffold: cannot find bin/kitvas.ts or the acme-npm fixture; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder before running this case" >&2
  exit 1
fi

cp "$FIXTURE/package.json" package.json
node "$ROOT/bin/kitvas.ts" init --json
