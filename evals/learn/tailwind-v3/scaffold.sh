#!/usr/bin/env bash
# Makes a project whose own components are styled with Tailwind 3: the components of the acme-tailwind
# fixture, with tailwindcss 3 in package.json, a tailwind.config.js and the three @tailwind lines in the CSS.
# kitvas learns Tailwind 4 only, so the case starts at a source it cannot learn yet.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
FIXTURE="$ROOT/test/fixtures/projects/acme-tailwind"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -d "$FIXTURE/src" ]; then
  echo "scaffold: cannot find bin/kitvas.ts or the acme-tailwind fixture three folders above this script; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
prepare_home

cp -R "$FIXTURE/src" src
cat > package.json <<'JSON'
{
  "name": "bike-shop",
  "private": true,
  "dependencies": { "react": "19.3.1", "react-dom": "19.3.1", "tailwindcss": "3.4.17" }
}
JSON
cat > src/app/globals.css <<'CSS'
@tailwind base;
@tailwind components;
@tailwind utilities;
CSS
cat > tailwind.config.js <<'JS'
module.exports = { content: ['./src/**/*.tsx'], theme: { extend: {} } };
JS

node "$ROOT/bin/kitvas.ts" init --json
