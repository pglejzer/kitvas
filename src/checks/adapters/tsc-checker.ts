// The type checker: tsc of the `typescript` package, run as a child process of Node.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { KitvasError, PLUGIN_ROOT, packageDirFrom, resolveDep } from '../../shared/index.ts';
import { parseTscOutput, projectPaths, typesConfig } from '../domain/code/tsc.ts';
import type { TypeChecker } from '../ports/type-checker.ts';

const TIMEOUT_MS = 60_000;

/** Style and asset imports as modules, for every check: drafts and kits, built-in or not. */
const ASSETS = join(PLUGIN_ROOT, 'client', 'types', 'assets.d.ts');

const slashes = (path: string): string => path.split(sep).join('/');

/**
 * One spelling of every path: Windows may give a temp folder in its short form. A missing file
 * keeps its path, so tsc reports it in the draft instead of the check failing here.
 */
const real = (path: string): string => (existsSync(path) ? realpathSync.native(path) : path);

const readText = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** React's types: the project's own when it has them, so its components and the draft agree. */
function reactTypesDir(roots: string[], project: string | undefined): string {
  if (project !== undefined) {
    const own = packageDirFrom(project, '@types/react');
    if (own !== undefined) return own;
  }
  return dirname(resolveDep('@types/react/package.json', roots));
}

function run(args: string[], cwd: string): Promise<{ code: number | null; output: string }> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { cwd, shell: false, windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk: unknown) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk: unknown) => {
      output += String(chunk);
    });
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('error', (cause) => {
      clearTimeout(timer);
      fail(cause);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, output });
    });
  });
}

export function createTscChecker({ roots }: { roots: string[] }): TypeChecker {
  return {
    async check({ workingDir, entry, kitEntry, project }) {
      // `lib/tsc.js` is what `bin/tsc` imports. Neither is in the package's exports, so it is found next to
      // package.json. A sandbox that hides `node_modules/.bin/tsc` hides `bin/tsc`, its target, too.
      const tsc = join(dirname(resolveDep('typescript/package.json', roots)), 'lib', 'tsc.js');
      const cwd = realpathSync.native(workingDir);
      const config = join(cwd, 'build', 'json', 'tsconfig.json');
      mkdirSync(dirname(config), { recursive: true });
      const home = project === undefined ? undefined : real(project);
      const settings = typesConfig({
        entry: slashes(join(cwd, relative(workingDir, entry))),
        kitEntry: slashes(real(kitEntry)),
        reactTypes: slashes(real(reactTypesDir(roots, home))),
        assets: slashes(real(ASSETS)),
        // A built-in kit has no project, so nothing of one is merged.
        ...(home === undefined
          ? {}
          : { paths: projectPaths(`${slashes(home)}/tsconfig.json`, readText) }),
      });
      writeFileSync(config, `${JSON.stringify(settings, null, 2)}\n`);

      const { code, output } = await run([tsc, '-p', config, '--pretty', 'false'], cwd);
      const messages = parseTscOutput(output);
      if (code !== 0 && messages.length === 0) {
        throw new KitvasError('INTERNAL', { detail: output.trim() || `tsc exited with ${code}` });
      }
      return messages;
    },
  };
}
