// Two kit stores as one: the built-in kits, then the kits of the project. A project folder with a
// built-in id is hidden: the built-in kit wins everywhere, and `shadowedIds` names such folders.

import type { KitStore } from '../ports/kit-store.ts';

export type ProjectLayer = {
  /** The project folder: what `KitFiles.project` and `LoadedKit.project` say. */
  dir: string;
  /** The kits in `<dir>/.kitvas/kits/`. */
  store: KitStore;
};

export function createLayeredKitStore(
  builtin: KitStore,
  project: ProjectLayer | undefined,
): KitStore {
  const isBuiltin = (id: string): boolean => builtin.exists(id, 'kit.json');
  const layerOf = (id: string): KitStore => (project && !isBuiltin(id) ? project.store : builtin);

  return {
    list() {
      const ids = new Set([...builtin.list(), ...(project?.store.list() ?? [])]);
      return [...ids].sort();
    },
    read(id) {
      const own = builtin.read(id);
      if (own || !project) return own;
      const files = project.store.read(id);
      return files && { ...files, project: project.dir };
    },
    readJson: (id, relPath) => layerOf(id).readJson(id, relPath),
    exists: (id, relPath) => layerOf(id).exists(id, relPath),
    readTree: (id, dir) => layerOf(id).readTree?.(id, dir) ?? {},
    shadowedIds() {
      if (!project) return [];
      const builtinIds = new Set(builtin.list());
      return project.store.list().filter((id) => builtinIds.has(id));
    },
  };
}
