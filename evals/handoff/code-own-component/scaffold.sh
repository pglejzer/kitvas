#!/usr/bin/env bash
# Puts a project of single-file components (the acme-sfc fixture) in the case workspace, makes its finished kit
# "acme-sfc" the project's kit (every component of it points at the project's own file) and makes a built draft
# "plans" (version 1) from that kit, so the case starts at the hand-off.
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
K() { node "$ROOT/bin/kitvas.ts" "$@" --json; }

cp "$FIXTURE/package.json" package.json
cp "$FIXTURE/index.html" index.html
cp -R "$FIXTURE/src" src

# The kit's copies import React, which kitvas builds the draft with.
mkdir -p node_modules
for pkg in react react-dom scheduler; do
  if [ -d "$ROOT/node_modules/$pkg" ]; then
    cp -R "$ROOT/node_modules/$pkg" "node_modules/$pkg"
  fi
done

K init
K kit new acme-sfc --from code:src/components
cp -R "$FIXTURE/kit/." .kitvas/kits/acme-sfc/
K kit use acme-sfc

K draft new plans --title "Plans"

V=".kitvas/drafts/plans/v1"
if [ ! -d "$V" ]; then
  echo "scaffold: expected $V after draft new" >&2
  exit 1
fi

cat > "$V/md/layout.md" <<'EOF'
# Layout: Plans

## plans
Purpose: Let a person pick a plan and say where the receipt goes
Components: Card, Field
EOF

cat > "$V/src/tsx/sections/Plans.tsx" <<'EOF'
import { Card, Field } from '@kit';

export function Plans(_props: { state: string }) {
  return (
    <div className="plans">
      <Card title="Starter plan" actionLabel="Choose plan">
        Billing is monthly. Cancel any time.
      </Card>
      <Field label="Email" name="email" placeholder="you@acme.test" />
    </div>
  );
}
EOF

cat > "$V/src/scss/sections/plans.scss" <<'EOF'
.plans {
  display: flex;
  flex-direction: column;
  gap: var(--kit-space-lg);
  padding: var(--kit-space-xl);
}
EOF

K layout plans
K build plans
