// `kitvas init`: create the workspace in the current project.

import { initWorkspace } from '../../shared/index.ts';
import { defineCommand } from '../registry.ts';

export const initCommand = defineCommand<{ path: string; created: boolean }>({
  name: 'init',
  summary: 'command.init.summary',
  run: ({ cwd }) => initWorkspace(cwd),
  render: (result, t) => t(result.created ? 'init.created' : 'init.exists', { path: result.path }),
});
