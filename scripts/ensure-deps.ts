// SessionStart hook: install dependencies into the data folder after an install or update. Never blocks a session.

import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ensureDeps } from '../src/shared/deps/deps-install.ts';
import { hookDataDir, PLUGIN_ROOT, resolveDataDir } from '../src/shared/env/paths.ts';
import { createTranslator, loadMessages } from '../src/shared/i18n/i18n.ts';

const t = createTranslator(loadMessages(join(PLUGIN_ROOT, 'locales'), 'en'));
// `--data` is for a run by hand; as a hook, the folder comes from the environment Claude Code sets.
const flag = process.argv.indexOf('--data');
const dataDir = resolveDataDir({
  flag: flag > -1 ? process.argv[flag + 1] : hookDataDir(process.env, PLUGIN_ROOT),
  env: process.env.KITVAS_DATA_DIR,
  home: homedir(),
});

const ready = ensureDeps({
  root: PLUGIN_ROOT,
  dataDir,
  home: homedir(),
  run: (command, args, cwd) =>
    spawnSync(command, args, { cwd, stdio: 'ignore', shell: false }).status ?? 1,
  log: (text) => console.error(text),
  installing: t('cli.installing'),
  // The hook gets the plugin's data folder from Claude Code; later CLI runs find it here.
  remember: true,
});

if (!ready) console.error(t('cli.installFailed'));
process.exit(0);
