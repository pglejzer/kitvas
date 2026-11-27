#!/usr/bin/env bash
# Runs the skill evals on Linux with the settings they need there (evals/README.md says why):
# a temp folder outside /tmp, or the sandboxed shell can write nothing; no Windows folders on PATH under WSL;
# and --scaffold, because some cases prepare their project first.
# Usage: bash evals/run.sh [options of `claude plugin eval`], for example: bash evals/run.sh --tag smoke
#        bash evals/run.sh --cases kit/badge-tones,craft/look-word [options]: only those case folders
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TMPDIR="${KITVAS_EVAL_TMP:-$HOME/.cache/kitvas-eval}"
mkdir -p "$TMPDIR"
PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"
export PATH
find "$ROOT/evals" -name scaffold.sh -exec chmod +x {} +

# `claude plugin eval` takes one name glob and no list of cases. So a list runs from a copy of `evals/`
# in which every other case has lost its `prompt.md` and `case.yaml`: it is not a case any more, and its
# other files stay for the scaffolds that read a neighbour's (rework/signs-first reads from-image's shot).
# The copy sits beside `evals/`, so each scaffold still finds the plugin three folders above itself; it is
# removed when the run ends.
if [ "${1:-}" = "--cases" ]; then
  LIST="${2:?--cases needs a list such as kit/badge-tones,craft/look-word}"
  shift 2
  IFS=',' read -ra NAMES <<< "$LIST"
  for name in "${NAMES[@]}"; do
    if [ ! -f "$ROOT/evals/$name/prompt.md" ]; then
      echo "run.sh: no case evals/$name" >&2
      exit 1
    fi
  done
  PICKED="$ROOT/evals-picked"
  rm -rf "$PICKED"
  trap 'rm -rf "$PICKED"' EXIT
  mkdir -p "$PICKED"
  for dir in "$ROOT"/evals/*/; do
    [ "$(basename "$dir")" = results ] || cp -R "$dir" "$PICKED/"
  done
  for prompt in "$PICKED"/*/*/prompt.md; do
    name="${prompt#"$PICKED"/}"
    name="${name%/prompt.md}"
    case ",$LIST," in
      *",$name,"*) ;;
      *) rm -f "$prompt" "${prompt%prompt.md}case.yaml" ;;
    esac
  done
  set -- --eval-dir evals-picked --output-dir "evals/results/$(date -u +%Y-%m-%dT%H-%M-%S)-picked" "$@"
fi

cd "$ROOT"
claude plugin eval . --allow-tools Bash Write Edit --scaffold --model sonnet --judge-model sonnet \
  --no-publish -j 3 "$@"
