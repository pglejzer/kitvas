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
prepare_home
K() { node "$ROOT/bin/kitvas.ts" "$@" --json; }

K init
K craft new booking-icon --subject icon --name BookingIcon --description "A calendar with a check mark, for a confirmed booking"

V=".kitvas/drafts/booking-icon/v1"
if [ ! -d "$V/src/tsx/sketches" ]; then
  echo "scaffold: expected $V/src/tsx/sketches after craft new" >&2
  exit 1
fi

# One sketch on the kitvas UI kit's icon grid: 16 by 16, stroke 1.4, round caps and joins, currentColor.
sketch() {
  local letter="$1" idea="$2" shapes="$3"
  cat > "$V/src/tsx/sketches/$letter.tsx" <<EOF
export type BookingIcon${letter}Props = { size?: number; title?: string };

export function BookingIcon${letter}({ size = 16, title }: BookingIcon${letter}Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
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
'      <rect x="2.4" y="3.6" width="11.2" height="10" rx="1.6" />
      <path d="M2.4 6.8h11.2M5.6 2v2.4M10.4 2v2.4" />
      <path d="M5.8 10.2l1.4 1.4 3-3.2" />'

sketch B "The check steps out of the corner of the page, like a stamp put on the booking." \
'      <path d="M13.6 7.6V5.2a1.6 1.6 0 0 0-1.6-1.6H4a1.6 1.6 0 0 0-1.6 1.6V12a1.6 1.6 0 0 0 1.6 1.6h3.6" />
      <path d="M2.4 6.8h11.2M5.6 2v2.4M10.4 2v2.4" />
      <path d="M9.2 11.6l1.6 1.6 3.2-3.6" />'

sketch C "The check fills the whole page and the header line is dropped: confirmed reads first." \
'      <rect x="2.4" y="3.6" width="11.2" height="10" rx="1.6" />
      <path d="M5.6 2v2.4M10.4 2v2.4" />
      <path d="M5.2 8.8l2 2 3.6-4" />'

K build booking-icon
