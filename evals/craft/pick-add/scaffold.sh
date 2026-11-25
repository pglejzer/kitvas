#!/usr/bin/env bash
# Makes a craft draft "booking-icon" with three written sketches (A, B, C) and builds it: the case starts at the pick.
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
pnp_folders
K() { node "$ROOT/bin/kitvas.ts" "$@" --json; }

K init
K craft new booking-icon --subject icon --name BookingIcon --description "A calendar with a check mark, for a confirmed booking"

V=".kitvas/drafts/booking-icon/v1"
if [ ! -d "$V/src/tsx/sketches" ]; then
  echo "scaffold: expected $V/src/tsx/sketches after craft new" >&2
  exit 1
fi

# One sketch on the Base kit's icon grid: 20 by 20, stroke 1.75, round caps and joins, currentColor.
sketch() {
  local letter="$1" idea="$2" shapes="$3"
  cat > "$V/src/tsx/sketches/$letter.tsx" <<EOF
export type BookingIcon${letter}Props = { size?: number; title?: string };

export function BookingIcon${letter}({ size = 20, title }: BookingIcon${letter}Props) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title === undefined ? undefined : 'img'}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
    >
$shapes
    </svg>
  );
}
EOF
  mkdir -p "$V/why"
  cat > "$V/why/$letter.json" <<EOF
{ "lines": ["$idea"], "guidelines": [], "hash": "0000000000000000000000000000000000000000000000000000000000000000" }
EOF
}

sketch A "A dated page with a small check inside it: the booking sits on a day." \
'      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 2.5v3M13 2.5v3" />
      <path d="M7.25 12.75l1.75 1.75 3.75-4" />'

sketch B "The check steps out of the corner of the page, like a stamp put on the booking." \
'      <path d="M17 9.5v-3a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2V15a2 2 0 0 0 2 2h4.5" />
      <path d="M3 8.5h14M7 2.5v3M13 2.5v3" />
      <path d="M11.5 14.5l2 2 4-4.5" />'

sketch C "The check fills the whole page and the header line is dropped: confirmed reads first." \
'      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M7 2.5v3M13 2.5v3" />
      <path d="M6.5 11l2.5 2.5 4.5-5" />'

K build booking-icon
