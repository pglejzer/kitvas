// Downloads Chromium with playwright-core's own installer into kitvas's folder.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { KitvasError, resolveDep } from '../../shared/index.ts';
import type { BrowserInstaller } from '../ports/browser.ts';

/** Runs a command and resolves with its exit code and what it wrote to stderr. */
export type InstallRunner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<{ code: number | null; errors: string }>;

const runProcess: InstallRunner = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (chunk) => {
      errors += String(chunk);
    });
    child.on('error', fail);
    child.on('close', (code) => done({ code, errors }));
  });

export type InstallerOptions = { roots: string[]; browsersDir: string; run?: InstallRunner };

export function createBrowserInstaller({
  roots,
  browsersDir,
  run = runProcess,
}: InstallerOptions): BrowserInstaller {
  return {
    async install() {
      const cli = join(dirname(resolveDep('playwright-core/package.json', roots)), 'cli.js');
      const args = [cli, 'install', '--only-shell', '--no-progress', 'chromium'];
      const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir };
      const { code, errors } = await run(process.execPath, args, env);
      if (code !== 0) {
        throw new KitvasError('BROWSER_INSTALL_FAILED', {
          detail: errors.trim() || `exit code ${code}`,
        });
      }
      return browsersDir;
    },
  };
}
