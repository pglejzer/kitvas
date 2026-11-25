#!/usr/bin/env bash
# Makes a project with @acme/ui installed and a learned kit "acme" that lacks the Badge component.
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
for pkg in react react-dom; do
  if [ -d "$ROOT/node_modules/$pkg" ]; then
    cp -R "$ROOT/node_modules/$pkg" "node_modules/$pkg"
  fi
done

node "$ROOT/bin/kitvas.ts" init --json
node "$ROOT/bin/kitvas.ts" kit new acme --from npm:@acme/ui --json

# Start from the fixture's learned kit, then take Badge out and list it as missing.
KIT=".kitvas/kits/acme"
mkdir -p "$KIT/json"
cp "$FIXTURE/kit/kit.json" "$KIT/kit.json"
cp "$FIXTURE/kit/json/tokens.json" "$KIT/json/tokens.json"
cp "$FIXTURE/kit/json/css-var-map.json" "$KIT/json/css-var-map.json"

node -e '
const fs = require("node:fs");
const file = process.argv[1];
const kit = JSON.parse(fs.readFileSync(file, "utf8"));
kit.components = kit.components.filter((c) => c.name !== "Badge");
kit.gaps = [...(kit.gaps || []), { path: "Badge", reason: "missing" }];
fs.writeFileSync(file, JSON.stringify(kit, null, 2) + "\n");
' "$KIT/kit.json"

node "$ROOT/bin/kitvas.ts" kit use acme --json
