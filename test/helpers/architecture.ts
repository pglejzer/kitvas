// Reads the import graph of src/ and reports imports that break the module rules.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

export type SourceFile = { path: string; imports: string[] };

const LAYERS = ['domain', 'app', 'ports', 'adapters'];
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

const toPosix = (path: string): string => path.split(sep).join(posix.sep);

export function listFiles(root: string, dir: string): string[] {
  const start = join(root, dir);
  if (!existsSync(start)) return [];
  const found: string[] = [];
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) walk(full);
      else found.push(toPosix(relative(root, full)));
    }
  };
  walk(start);
  return found.sort();
}

export function collectSources(root: string): SourceFile[] {
  return listFiles(root, 'src')
    .filter((path) => path.endsWith('.ts'))
    .map((path) => {
      const text = readFileSync(join(root, path), 'utf8');
      const imports = [...text.matchAll(IMPORT)].map((match) => {
        const target = match[1] ?? match[2] ?? '';
        return toPosix(relative(root, resolve(root, dirname(path), target)));
      });
      return { path, imports };
    });
}

function describe(path: string) {
  const segments = path.split('/');
  const module = segments[1] ?? '';
  const second = segments[2] ?? '';
  return {
    module,
    layer: LAYERS.includes(second) ? second : undefined,
    isIndex: segments.length === 3 && second === 'index.ts',
  };
}

export function violations(files: SourceFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (!file.path.startsWith('src/') || file.path === 'src/main.ts') continue;
    const from = describe(file.path);
    for (const target of file.imports) {
      if (!target.startsWith('src/')) continue;
      const to = describe(target);
      const where = `${file.path} -> ${target}`;
      if (target === 'src/main.ts') {
        found.push(`${where}: nothing imports main.ts`);
        continue;
      }
      if (from.module === 'shared' && to.module !== 'shared') {
        found.push(`${where}: shared imports nothing outside shared`);
      }
      if (to.module === 'cli' && from.module !== 'cli') {
        found.push(`${where}: only main.ts imports cli`);
      }
      if (to.layer === 'adapters' && !(from.module === to.module && from.layer === 'adapters')) {
        found.push(`${where}: only main.ts imports adapters`);
      }
      if (from.module !== to.module && to.module !== 'shared' && !to.isIndex) {
        found.push(`${where}: import another module through its index.ts`);
      }
      const ownDomain = to.module === from.module && to.layer === 'domain';
      if (from.layer === 'domain' && to.module !== 'shared' && !ownDomain) {
        found.push(`${where}: domain imports only its own domain and shared`);
      }
      const ownInner = to.module === from.module && to.layer !== 'adapters';
      if (from.layer === 'app' && to.module !== 'shared' && !ownInner && !to.isIndex) {
        found.push(`${where}: app imports its own domain, ports and app, and other modules' index`);
      }
    }
  }
  return found;
}
