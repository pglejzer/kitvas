import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { listFiles } from '../helpers/architecture.ts';

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

function files(): string[] {
  const inFolders = FOLDERS.filter((folder) => existsSync(join(PLUGIN_ROOT, folder))).flatMap(
    (folder) => listFiles(PLUGIN_ROOT, folder),
  );
  const atRoot = ROOT_FILES.filter((name) => existsSync(join(PLUGIN_ROOT, name)));
  return [...inFolders, ...atRoot];
}

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
