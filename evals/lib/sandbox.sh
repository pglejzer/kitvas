# Sourced by every scaffold, then `prepare_home` is called.
#
# The eval's sandbox puts files that nothing may read in the case's home folder, the parent of the project:
# among them `.pnp.data.json`, `.pnp.cjs` and `.pnp.js`. esbuild looks for those Yarn files in every folder
# above each file it bundles and stops at one it cannot read, so `kitvas build` fails with
# `Cannot read file "…/.pnp.data.json": permission denied`. esbuild skips a folder of the same name, and the
# sandbox leaves one that is already there as it is.
#
# `.bashrc` is another of those files. The shell of every Bash call reads it, so every command's output starts
# with two lines `…/.bashrc: Permission denied`. A model then adds `2>/dev/null`, which also hides the error
# kitvas prints. An empty `.bashrc` that is already there stays readable.
#
# Only the eval's own layout is touched: a project folder named `cwd` inside one named `home`.
prepare_home() {
  local parent
  parent="$(cd .. && pwd)"
  if [ "$(basename "$PWD")" != cwd ] || [ "$(basename "$parent")" != home ]; then
    return 0
  fi
  local name
  for name in .pnp.data.json .pnp.cjs .pnp.js; do
    [ -e "$parent/$name" ] || mkdir "$parent/$name"
  done
  [ -e "$parent/.bashrc" ] || : > "$parent/.bashrc"
}
