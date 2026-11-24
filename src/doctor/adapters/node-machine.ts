// The doctor's machine on Node: files, a loopback port, name lookup and the package loader.

import { lookup } from 'node:dns/promises';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { arch, release, type } from 'node:os';
import { dirname } from 'node:path';
import { resolveDep } from '../../shared/index.ts';
import type { Machine } from '../ports/machine.ts';

/** What kitvas loads through the shared loader: a package, or a file of one. */
const LOADED = [
  'zod',
  'esbuild',
  'sass-embedded',
  'playwright-core',
  'axe-core/axe.min.js',
  'typescript/package.json',
  '@types/react/package.json',
] as const;

/** The error codes of a file another program holds for a moment, as the draft store tolerates. */
const HELD = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** The waits between tries of a move, as the draft store makes them (milliseconds). */
const MOVE_WAITS: readonly number[] = [10, 20, 40, 80, 150, 250, 350, 400];
const LOOKUP_TIMEOUT_MS = 3_000;

function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/** `@scope/name/file` and `name/file` are the package `@scope/name` and `name`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** `roots` are the folders packages are looked for in, the data folder first. */
export function createNodeMachine(input: { roots: string[] }): Machine {
  return {
    readText(file) {
      try {
        return readFileSync(file, 'utf8');
      } catch {
        return undefined;
      }
    },
    isFolder(path) {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    packages() {
      const missing: string[] = [];
      for (const specifier of LOADED) {
        try {
          resolveDep(specifier, input.roots);
        } catch {
          missing.push(packageName(specifier));
        }
      }
      return { total: LOADED.length, missing };
    },
    write(file, text) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    move(from, to) {
      for (let retries = 0; ; retries += 1) {
        try {
          renameSync(from, to);
          return { retries };
        } catch (error) {
          const wait = MOVE_WAITS[retries];
          const code = codeOf(error);
          if (wait === undefined || code === undefined || !HELD.has(code)) throw error;
          sleepSync(wait);
        }
      }
    },
    remove(file) {
      rmSync(file, { force: true });
    },
    openLoopback() {
      return new Promise<void>((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.close((closed) => (closed ? reject(closed) : resolve()));
        });
      });
    },
    async resolveHost(name) {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(Object.assign(new Error('lookup timed out'), { code: 'ETIMEDOUT' })),
          LOOKUP_TIMEOUT_MS,
        ).unref();
      });
      const found = await Promise.race([lookup(name, { all: true }), timeout]);
      return found.map((entry) => entry.address);
    },
    system: () => ({ os: `${type()} ${release()}`, arch: arch() }),
  };
}
