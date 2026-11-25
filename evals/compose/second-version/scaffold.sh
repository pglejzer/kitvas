#!/usr/bin/env bash
# Creates a built draft "shop" (version 1) with the CLI before the case starts.
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

K init
K draft new shop --title "Bike shop"

V=".kitvas/drafts/shop/v1"
if [ ! -d "$V" ]; then
  echo "scaffold: expected $V after draft new" >&2
  exit 1
fi

cat > "$V/md/brief.md" <<'EOF'
# Brief: Bike shop

## Goal

Let a visitor see one bike and start a rental.

## Audience

First-time customers on a phone or a laptop.

## Content

Bike: City Cruiser, 12 EUR per day. Button: Rent this bike.

## States

Only the filled state.
EOF

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
