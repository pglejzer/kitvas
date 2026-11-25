#!/usr/bin/env bash
# Only gets the eval's sandbox ready for a build (evals/lib/sandbox.sh); the skill sets kitvas up itself.
set -euo pipefail

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
pnp_folders
