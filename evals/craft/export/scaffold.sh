#!/usr/bin/env bash
# Starts from the project of the neighbour case pick-add (three sketches of BookingIcon, built), then picks
# sketch B and adds it to the kit. The case starts with BookingIcon already in the kit's additions.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$HERE/../../.." && pwd)}"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -f "$HERE/../pick-add/scaffold.sh" ]; then
  echo "scaffold: cannot find bin/kitvas.ts three folders above this script, or ../pick-add/scaffold.sh; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

bash "$HERE/../pick-add/scaffold.sh"

K() { node "$ROOT/bin/kitvas.ts" "$@" --json; }

K craft pick booking-icon B
K craft add booking-icon
if [ ! -f .kitvas/additions/base/components/BookingIcon.tsx ]; then
  echo "scaffold: expected BookingIcon in the kit's additions after craft add" >&2
  exit 1
fi
