import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { listFiles } from '../helpers/architecture.ts';

// Names that must never appear in the repo, kept only as hashes: not even their parts are stored.
// `roll` is the rolling hash below of the word in lower case; a window of text whose rolling
// hash matches is confirmed by its sha256, so a match is exact.
const FORBIDDEN = [
  {
    length: 5,
    roll: 85_534_436,
    sha256: 'eac2be81ca493c7c202d4f62637f474b435d717396c5ec50c6a89d17d47fca95',
  },
  {
    length: 9,
    roll: 1_651_159_429,
    sha256: '3775602171bb518977ae97c236bb75bce7967e3152c28565e474cec19bdaa6d2',
  },
  {
    length: 20,
    roll: 2_047_054_379,
    sha256: '45d2ea5b1b8c5e33835d921809015c34d9065fdf98c894ebf994816755466165',
  },
  {
    length: 8,
    roll: 1_043_214_688,
    sha256: 'c2f408a559fedf26f9fddc0acd20c43f5ec708de108ffbdb0466c2d17ccee8b4',
  },
];
// Polynomial hash of UTF-16 code units, base 257, modulo the prime 2^31 - 1: every step stays
// below 2^53, so plain numbers are exact.
const BASE = 257;
const PRIME = 2_147_483_647;

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The numbers (from 1) of the forbidden names found in `text`, which is in lower case. */
function forbiddenIn(text: string): number[] {
  const found: number[] = [];
  FORBIDDEN.forEach((word, index) => {
    const size = word.length;
    if (text.length < size) return;
    let high = 1;
    for (let step = 1; step < size; step += 1) high = (high * BASE) % PRIME;
    let hash = 0;
    for (let at = 0; at < size; at += 1) hash = (hash * BASE + text.charCodeAt(at)) % PRIME;
    for (let start = 0; ; start += 1) {
      if (hash === word.roll && sha256(text.slice(start, start + size)) === word.sha256) {
        found.push(index + 1);
        return;
      }
      const next = start + size;
      if (next >= text.length) return;
      const kept = (hash - ((text.charCodeAt(start) * high) % PRIME) + PRIME) % PRIME;
      hash = (kept * BASE + text.charCodeAt(next)) % PRIME;
    }
  });
  return found;
}

const FOLDERS = [
  'src',
  'test',
  'bin',
  'scripts',
  'hooks',
  'locales',
  'docs',
  'skills',
  'agents',
  'reference',
  'kits',
];
const ROOT_FILES = [
  'AGENTS.md',
  'README.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'SKILL.md',
  'package.json',
];
const TEXT = /\.(ts|tsx|json|md|scss|css|html|yml|yaml|svg)$/;
const NON_ASCII = /[^\x20-\x7E]/;
const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

// Folders never searched: installed packages (also those inside fixtures) and git's own store.
const SKIPPED_DIRS = new Set(['node_modules', '.git']);

/** Every file of the repo, git-ignored ones too (ledgers, plans, spikes), as posix paths. */
function everyFile(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(PLUGIN_ROOT, dir), { withFileTypes: true })) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(path);
      } else if (entry.isFile()) found.push(path);
    }
  };
  walk('');
  return found.sort();
}

/** A file is text unless its first 8 KiB hold a NUL byte (images, fonts, archives). */
function textOf(path: string): string | undefined {
  const bytes = readFileSync(join(PLUGIN_ROOT, path));
  return bytes.subarray(0, 8192).includes(0) ? undefined : bytes.toString('utf8');
}

function files(): string[] {
  const inFolders = FOLDERS.filter((folder) => existsSync(join(PLUGIN_ROOT, folder))).flatMap(
    (folder) => listFiles(PLUGIN_ROOT, folder),
  );
  const atRoot = ROOT_FILES.filter((name) => existsSync(join(PLUGIN_ROOT, name)));
  return [...inFolders, ...atRoot];
}

// The whole repo, not only the shipped folders: the owner's rule is "nowhere, ever".
test('no forbidden name in any file or file name of the repo', () => {
  const hits: string[] = [];
  for (const path of everyFile()) {
    for (const word of forbiddenIn(path.toLowerCase())) {
      hits.push(`${path}: name has forbidden name ${word}`);
    }
    const text = textOf(path)?.toLowerCase();
    if (text === undefined) continue;
    for (const word of forbiddenIn(text)) hits.push(`${path}: text has forbidden name ${word}`);
  }
  assert.deepEqual(hits, []);
});

test('file names are plain ASCII and code has no Polish text', () => {
  const hits: string[] = [];
  for (const path of files()) {
    if (NON_ASCII.test(path)) hits.push(`${path}: non-ASCII file name`);
    const isCode = /^(src|bin|scripts|locales|hooks)\//.test(path) && TEXT.test(path);
    if (isCode && POLISH.test(readFileSync(join(PLUGIN_ROOT, path), 'utf8'))) {
      hits.push(`${path}: Polish characters in code or messages`);
    }
  }
  assert.deepEqual(hits, []);
});
