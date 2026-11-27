#!/usr/bin/env bash
# Puts a small React project (test/fixtures/handoff/app-a) in the case workspace, then makes the craft draft
# of the neighbour case craft/pick-add in it (three sketches of BookingIcon), picks sketch B and builds it.
# The case starts with a finished icon to hand over.
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$HERE/../../.." && pwd)}"
SKETCHES="$HERE/../../craft/pick-add/scaffold.sh"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ] || [ ! -f "$SKETCHES" ]; then
  echo "scaffold: cannot find bin/kitvas.ts three folders above this script, or ../../craft/pick-add/scaffold.sh; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

cp -R "$ROOT/test/fixtures/handoff/app-a/." .
bash "$SKETCHES"

K() { node "$ROOT/bin/kitvas.ts" "$@" --json; }

K craft pick booking-icon B
K build booking-icon
