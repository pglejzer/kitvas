#!/usr/bin/env node
// kitvas entry point: check Node, make sure dependencies are installed, then run the command.

import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ensureDeps } from '../src/shared/deps/deps-install.ts';
import { isSupportedNode } from '../src/shared/env/node-version.ts';
import { PLUGIN_ROOT, resolveDataDir } from '../src/shared/env/paths.ts';
import { createTranslator, loadMessages } from '../src/shared/i18n/i18n.ts';

const t = createTranslator(loadMessages(join(PLUGIN_ROOT, 'locales'), 'en'));

if (!isSupportedNode(process.version)) {
  console.error(t('error.NODE_UNSUPPORTED', { version: process.version }));
  process.exit(5);
}

const flag = process.argv.indexOf('--data');
const dataDir = resolveDataDir({
  flag: flag > -1 ? process.argv[flag + 1] : undefined,
  env: process.env.KITVAS_DATA_DIR,
  home: homedir(),
});
process.env.KITVAS_DATA_DIR = dataDir;

const ready = ensureDeps({
  root: PLUGIN_ROOT,
  dataDir,
  home: homedir(),
  run: (command, args, cwd) =>
    spawnSync(command, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'], shell: false })
      .status ?? 1,
  log: (text) => console.error(text),
  installing: t('cli.installing'),
  remember: false,
});

if (!ready) {
  console.error(t('cli.installFailed'));
  process.exit(4);
}

const { main } = await import('../src/main.ts');
process.exitCode = await main(process.argv.slice(2));
