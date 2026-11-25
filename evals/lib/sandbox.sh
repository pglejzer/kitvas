# Sourced by the scaffold of every case that builds, checks or verifies, then `pnp_folders` is called.
#
# The eval's sandbox puts files that nothing may read in the case's home folder, the parent of the project:
# among them `.pnp.data.json`, `.pnp.cjs` and `.pnp.js`. esbuild looks for those Yarn files in every folder
# above each file it bundles and stops at one it cannot read, so `kitvas build` fails with
# `Cannot read file "…/.pnp.data.json": permission denied`. esbuild skips a folder of the same name, and the
# sandbox leaves one that is already there as it is. Only the eval's own layout is touched: a project folder
# named `cwd` inside one named `home`.
pnp_folders() {
  local parent
  parent="$(cd .. && pwd)"
  if [ "$(basename "$PWD")" != cwd ] || [ "$(basename "$parent")" != home ]; then
    return 0
  fi
  local name
  for name in .pnp.data.json .pnp.cjs .pnp.js; do
    [ -e "$parent/$name" ] || mkdir "$parent/$name"
  done
}
