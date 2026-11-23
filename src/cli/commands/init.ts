// `kitvas init`: create the workspace in the current project.

import { realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { initWorkspace, KitvasError, PLUGIN_ROOT } from '../../shared/index.ts';
import { defineCommand } from '../registry.ts';

/** True when `folder` is the plugin folder or inside it, by real path. */
function insidePlugin(folder: string): boolean {
  const real = realpathSync(folder);
  const way = relative(realpathSync(PLUGIN_ROOT), real);
  return way === '' || (!way.startsWith('..') && !isAbsolute(way));
}

export const initCommand = defineCommand<{ path: string; created: boolean }>({
  name: 'init',
  summary: 'command.init.summary',
  run: ({ cwd }) => {
    if (insidePlugin(cwd)) throw new KitvasError('PLUGIN_FOLDER', { path: cwd });
    return initWorkspace(cwd);
  },
  render: (result, t) => t(result.created ? 'init.created' : 'init.exists', { path: result.path }),
});
