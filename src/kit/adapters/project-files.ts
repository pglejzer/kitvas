// The person's project on disk: its files, resolved like a bundler resolves modules, and the
// package.json of its installed packages.

import {
  type Dirent,
  readdirSync,
  readFileSync,
  realpathSync,
  type Stats,
  statSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { isRecord, packageDirFrom } from '../../shared/index.ts';
import { PACKAGE_SPECIFIER, PROJECT_PATH } from '../domain/contract.ts';
import { packageOf } from '../domain/sources.ts';
import type { ProjectSetup } from '../ports/project-files.ts';

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.css', '.scss'];
const INDEXES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];

/** stat that answers undefined for anything unreadable (missing, a file used as a folder, no access). */
function statOf(path: string): Stats | undefined {
  try {
    return statSync(path, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}

const isFile = (path: string): boolean => statOf(path)?.isFile() === true;
const isFolder = (path: string): boolean => statOf(path)?.isDirectory() === true;

export function createProjectFiles(project: string): ProjectSetup {
  const root = resolve(project);

  /** What a project path names: the file, the file with an extension, a folder's index, the folder. */
  const locate = (relPath: string): string | undefined => {
    if (!PROJECT_PATH.test(relPath)) return undefined;
    const base = resolve(root, ...relPath.split('/').filter(Boolean));
    if (!base.startsWith(root + sep)) return undefined;
    if (isFile(base)) return base;
    const withExtension = EXTENSIONS.map((ext) => base + ext).find(isFile);
    if (withExtension) return withExtension;
    if (!isFolder(base)) return undefined;
    return INDEXES.map((name) => join(base, name)).find(isFile) ?? base;
  };

  /** package.json of an installed package; only real package names, so no path can leave node_modules. */
  const packageJson = (name: string): Record<string, unknown> | undefined => {
    if (!PACKAGE_SPECIFIER.test(name) || packageOf(name) !== name) return undefined;
    // Hoisted workspaces keep packages above the project: look where Node would.
    const dir = packageDirFrom(root, name);
    if (dir === undefined) return undefined;
    const file = join(dir, 'package.json');
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  };

  const realRoot = (): string | undefined => {
    try {
      return realpathSync(root);
    } catch {
      return undefined;
    }
  };

  /** True when the real path of `path` is inside the project. */
  const staysInside = (path: string): boolean => {
    const top = realRoot();
    if (top === undefined) return false;
    try {
      return realpathSync(path).startsWith(top + sep);
    } catch {
      return false;
    }
  };

  /** The absolute path of a project path, exactly as written (no extension or index lookup). */
  const exact = (relPath: string): string | undefined => {
    if (!PROJECT_PATH.test(relPath)) return undefined;
    const path = resolve(root, ...relPath.split('/').filter(Boolean));
    return path.startsWith(root + sep) ? path : undefined;
  };

  /** The file `exact` names, when it is a file whose real path is inside the project. */
  const insideFile = (relPath: string): string | undefined => {
    const path = exact(relPath);
    return path !== undefined && isFile(path) && staysInside(path) ? path : undefined;
  };

  const listUnder = (folder: string, prefix: string, out: string[]): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(folder, entry.name);
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      // A link is followed only to a file inside the project; links to folders are not entered,
      // so a loop cannot trap the walk.
      if (entry.isDirectory()) listUnder(path, rel, out);
      else if (isFile(path) && staysInside(path)) out.push(rel);
    }
  };

  /** Files under `folder` in name order, skipped folders not entered, at most `cap` of them. */
  const walkUnder = (
    folder: string,
    prefix: string,
    options: { skip: ReadonlySet<string>; dots: boolean; cap: number },
    out: string[],
  ): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name)));
    for (const entry of entries) {
      if (out.length >= options.cap) return;
      const path = join(folder, entry.name);
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (options.skip.has(entry.name) || (options.dots && entry.name.startsWith('.'))) continue;
        walkUnder(path, rel, options, out);
      } else if (entry.isFile()) {
        // Never entered through a link, so a plain file is inside the project by construction.
        out.push(rel);
      } else if (entry.isSymbolicLink() && isFile(path) && staysInside(path)) {
        out.push(rel);
      }
    }
  };

  return {
    exists: (relPath) => locate(relPath) !== undefined,
    walk(relPath, { skip, cap }) {
      if (cap < 1) return [];
      const folder = relPath === '' ? root : exact(relPath);
      if (folder === undefined || !isFolder(folder)) return [];
      if (relPath !== '' && !staysInside(folder)) return [];
      const files: string[] = [];
      const names = new Set(skip);
      walkUnder(folder, '', { skip: names, dots: names.has('.*'), cap }, files);
      return files.sort((a, b) => (a < b ? -1 : Number(a > b)));
    },
    listFiles(relPath) {
      const folder = exact(relPath);
      if (folder === undefined || !isFolder(folder) || !staysInside(folder)) return [];
      const files: string[] = [];
      listUnder(folder, '', files);
      return files.sort((a, b) => (a < b ? -1 : Number(a > b)));
    },
    size: (relPath) => {
      const file = insideFile(relPath);
      return file === undefined ? undefined : statOf(file)?.size;
    },
    readBytes(relPath) {
      const file = insideFile(relPath);
      if (file === undefined) return undefined;
      try {
        return new Uint8Array(readFileSync(file));
      } catch {
        return undefined;
      }
    },
    realInside(relPath) {
      const found = locate(relPath);
      if (found === undefined) return false;
      try {
        return realpathSync(found).startsWith(realpathSync(root) + sep);
      } catch {
        return false;
      }
    },
    packageVersion(name) {
      const version = packageJson(name)?.version;
      return typeof version === 'string' && version !== '' ? version : undefined;
    },
    packageDependencies(name) {
      const pkg = packageJson(name);
      if (!pkg) return [];
      const names = ['dependencies', 'peerDependencies'].flatMap((field) => {
        const value = pkg[field];
        return isRecord(value) ? Object.keys(value) : [];
      });
      return [...new Set(names)].sort();
    },
  };
}
