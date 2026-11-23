// `kitvas status`: version, Node, settings and workspace.

import { loadSettings, pluginVersion, type Settings } from '../../shared/index.ts';
import { defineCommand } from '../registry.ts';

export type Status = Settings & { version: string; node: string };

export const statusCommand = defineCommand<Status>({
  name: 'status',
  summary: 'command.status.summary',
  run: ({ cwd, home }) => ({
    version: pluginVersion(),
    node: process.version,
    ...loadSettings({ home, cwd }),
  }),
  render: (status, t) =>
    [
      t('status.version', { version: status.version }),
      t('status.node', { node: status.node }),
      t('status.language', { language: status.language }),
      t('status.kit', { kit: status.kit }),
      t(status.workspace.exists ? 'status.workspace.ready' : 'status.workspace.missing', {
        path: status.workspace.path,
      }),
    ].join('\n'),
});
