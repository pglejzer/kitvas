#!/usr/bin/env bash
# Starts from the project of the neighbour case code-app-a (a small React project with the built draft
# "shop"), then breaks the draft: its only section gets a tag that is never closed, and the build is removed.
# The case starts with a draft that does not build, so there is nothing to hand over.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "$HERE/../code-app-a/scaffold.sh" ]; then
  echo "scaffold: cannot find ../code-app-a/scaffold.sh beside this case" >&2
  exit 1
fi

bash "$HERE/../code-app-a/scaffold.sh"

V=".kitvas/drafts/shop/v1"
rm -rf "$V/build"
cat > "$V/src/tsx/sections/Hero.tsx" <<'EOF'
import { Button, Heading, Stack, Text } from '@kit';

export function Hero(_props: { state: string }) {
  return (
    <Stack className="hero" gap="12">
      <Heading level={1}>City Cruiser</Heading>
      <Text>A comfortable bike for the whole city, 12 EUR per day.</Text>
      <Button>Rent this bike</Button>
  );
}
EOF
