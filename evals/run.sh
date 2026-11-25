#!/usr/bin/env bash
# Runs the skill evals on Linux with the settings they need there (evals/README.md says why):
# a temp folder outside /tmp, or the sandboxed shell can write nothing; no Windows folders on PATH under WSL;
# and --scaffold, because some cases prepare their project first.
# Usage: bash evals/run.sh [options of `claude plugin eval`], for example: bash evals/run.sh --tag smoke
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TMPDIR="${KITVAS_EVAL_TMP:-$HOME/.cache/kitvas-eval}"
mkdir -p "$TMPDIR"
PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"
export PATH
find "$ROOT/evals" -name scaffold.sh -exec chmod +x {} +

cd "$ROOT"
exec claude plugin eval . --allow-tools Bash Write Edit --scaffold --model sonnet --judge-model sonnet \
  --no-publish -j 3 "$@"
