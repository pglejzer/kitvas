#!/usr/bin/env bash
# Puts a small React project (test/fixtures/handoff/app-a) in the case workspace and makes a built draft
# "shop" (version 1) in it, so the case starts at the hand-off.
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
K() { node "$ROOT/bin/kitvas.ts" "$@" --json; }

cp -R "$ROOT/test/fixtures/handoff/app-a/." .

K init
K draft new shop --title "Bike shop"

V=".kitvas/drafts/shop/v1"
if [ ! -d "$V" ]; then
  echo "scaffold: expected $V after draft new" >&2
  exit 1
fi

cat > "$V/md/layout.md" <<'EOF'
# Layout: Bike shop

## hero
Purpose: Introduce the bike and offer the rental
Components: Stack, Heading, Text, Button
EOF

cat > "$V/src/tsx/sections/Hero.tsx" <<'EOF'
import { Button, Heading, Stack, Text } from '@kit';

export function Hero(_props: { state: string }) {
  return (
    <Stack className="hero" gap="md">
      <Heading level={1}>City Cruiser</Heading>
      <Text>A comfortable bike for the whole city, 12 EUR per day.</Text>
      <Button>Rent this bike</Button>
    </Stack>
  );
}
EOF

cat > "$V/src/scss/sections/hero.scss" <<'EOF'
.hero {
  padding: var(--kit-space-lg);
}
EOF

K layout shop
K build shop
