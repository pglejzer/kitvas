#!/usr/bin/env bash
# Puts a small React project (test/fixtures/handoff/app-a) in the case workspace and makes a built draft
# "rentals" (version 1) in it with one shared value: the Filters section sets the range and the Summary
# section reads it (ADR 0086, 0088). The case starts at the hand-off.
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
K draft new rentals --title "Bike rentals"

V=".kitvas/drafts/rentals/v1"
if [ ! -d "$V" ]; then
  echo "scaffold: expected $V after draft new" >&2
  exit 1
fi

cat > "$V/md/layout.md" <<'EOF'
# Layout: Bike rentals

Screen: dashboard

## shared
The range is a shared value: Filters sets it, Summary reads it.

## filters
Purpose: Choose the period the numbers cover
Components: Stack, Button

## summary
Purpose: Show how many bikes were rented in the chosen period
Components: Stack, Heading, Text
EOF

cat > "$V/src/json/shared.json" <<'EOF'
{
  "schemaVersion": 1,
  "values": [
    {
      "id": "range",
      "label": "Range",
      "default": "7d",
      "values": [
        { "id": "7d", "label": "Last 7 days" },
        { "id": "30d", "label": "Last 30 days" }
      ]
    }
  ]
}
EOF

cat > "$V/src/tsx/sections/Filters.tsx" <<'EOF'
import { Button, Stack } from '@kit';
import type { SetShared, Shared } from '../shared.ts';

const ranges: { value: Shared['range']; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

export function Filters({
  shared,
  setShared,
}: {
  state: string;
  shared: Shared;
  setShared: SetShared;
}) {
  return (
    <Stack className="filters" direction="row" gap="8">
      {ranges.map((range) => (
        <Button
          key={range.value}
          variant={shared.range === range.value ? 'solid' : 'outline'}
          onClick={() => setShared({ range: range.value })}
        >
          {range.label}
        </Button>
      ))}
    </Stack>
  );
}
EOF

cat > "$V/src/tsx/sections/Summary.tsx" <<'EOF'
import { Heading, Stack, Text } from '@kit';
import type { Shared } from '../shared.ts';

const rented: Record<Shared['range'], number> = { '7d': 42, '30d': 180 };

export function Summary({ shared }: { state: string; shared: Shared }) {
  return (
    <Stack className="summary" gap="8">
      <Heading level={2}>Rentals</Heading>
      <Text>{rented[shared.range]} bikes rented in the chosen period.</Text>
    </Stack>
  );
}
EOF

cat > "$V/src/scss/sections/filters.scss" <<'EOF'
.filters {
  padding: var(--kit-space-12);
}
EOF

cat > "$V/src/scss/sections/summary.scss" <<'EOF'
.summary {
  padding: var(--kit-space-12);
}
EOF

K layout rentals
K build rentals
