// Installs the plugin's npm packages into the data folder. Node builtins only: this runs before any package exists.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { userDir } from '../env/paths.ts';

export type Runner = (command: string, args: string[], cwd: string) => number;

const STAMP = 'package-lock.sha256';
const MANIFESTS = ['package.json', 'package-lock.json'];

export function lockHash(root: string): string {
  return createHash('sha256')
    .update(readFileSync(join(root, 'package-lock.json')))
    .digest('hex');
}

export function depsAreFresh(root: string, dataDir: string): boolean {
  if (existsSync(join(root, 'node_modules'))) return true;
  const stamp = join(dataDir, STAMP);
  return existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === lockHash(root);
}

/** npm as `node npm-cli.js` when it ships beside node, so no shell is needed on Windows. */
export function npmInvocation(
  execPath: string,
  exists: (path: string) => boolean,
): [string, string[]] {
  const dir = dirname(execPath);
  const candidates = [
    join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const cli = candidates.find(exists);
  return cli ? [execPath, [cli]] : ['npm', []];
}

export function installDeps(root: string, dataDir: string, run: Runner): boolean {
  mkdirSync(dataDir, { recursive: true });
  const stamp = join(dataDir, STAMP);
  rmSync(stamp, { force: true });
  for (const name of MANIFESTS) copyFileSync(join(root, name), join(dataDir, name));
  const [command, prefix] = npmInvocation(process.execPath, existsSync);
  const args = [...prefix, 'ci', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'];
  if (run(command, args, dataDir) !== 0) return false;
  writeFileSync(stamp, `${lockHash(root)}\n`);
  return true;
}

export type EnsureInput = {
  root: string;
  dataDir: string;
  home: string;
  run: Runner;
  log: (text: string) => void;
  installing: string;
  /**
   * Write `dataDir` into `~/.kitvas/data-dir` for later CLI runs. Only the session hook does: it
   * alone knows the plugin's data folder. A CLI run must not, or a one-off `KITVAS_DATA_DIR`
   * would move every later run to that folder.
   */
  remember: boolean;
};

export function ensureDeps(input: EnsureInput): boolean {
  const { root, dataDir, home, run, log, installing } = input;
  if (input.remember) {
    mkdirSync(userDir(home), { recursive: true });
    writeFileSync(join(userDir(home), 'data-dir'), `${dataDir}\n`);
  }
  if (depsAreFresh(root, dataDir)) return true;
  log(installing);
  return installDeps(root, dataDir, run);
}
