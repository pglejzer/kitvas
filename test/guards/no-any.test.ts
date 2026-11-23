import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { listFiles } from '../helpers/architecture.ts';

// Owner rule: the `any` type is never used, in any form, anywhere: code, tests, type files,
// and code that kitvas generates as text (mount sources, type probes). Biome's explicit-type rule
// (biome.json) covers real code; this guard also covers strings and Markdown samples.
// The patterns are built from fragments so this file does not match itself.
const WORD = ['a', 'ny'].join('');
/** The type in a type position: after `:`, `<`, `,`, `|`, `&`, `(`, `=`, `as`, `extends` or `keyof`, before a type's end. */
const AS_TYPE = new RegExp(
  String.raw`(?:[:<,|&(=]|\bas|\bextends|\bkeyof)\s*${WORD}\b(?=\s*(?:[;,)\]>|&=}?'"\x60]|\[\]|$))`,
  'm',
);
/** Ways to switch the rules off instead of fixing the type. */
const ESCAPES = [
  ['noExplicit', 'Any'],
  ['noImplicit', 'AnyLet'],
  ['@ts-', 'ignore'],
  ['@ts-', 'nocheck'],
].map((parts) => parts.join(''));

const FOLDERS = [
  'src',
  'client',
  'test',
  'bin',
  'scripts',
  'hooks',
  'kits',
  'skills',
  'agents',
  'reference',
];
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx|md)$/;

test('the any type is used nowhere, not even in generated code or samples', () => {
  const hits: string[] = [];
  for (const path of FOLDERS.flatMap((folder) => listFiles(PLUGIN_ROOT, folder))) {
    if (!CODE.test(path)) continue;
    const lines = readFileSync(join(PLUGIN_ROOT, path), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (AS_TYPE.test(line)) hits.push(`${path}:${index + 1}: ${line.trim()}`);
      for (const off of ESCAPES) {
        if (line.includes(off)) hits.push(`${path}:${index + 1}: ${off}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});

test('library types that would hand out the any type are narrowed for all of kitvas', () => {
  // `JSON.parse` and `Array.isArray` come with the any type from TypeScript's own library. The
  // declaration below replaces both for every file of the type check (ADR 0039).
  const file = join(PLUGIN_ROOT, 'src', 'shared', 'types', 'strict-lib.d.ts');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /interface JSON \{\s*parse\(text: string[^\n]*\): unknown;/);
  assert.match(
    text,
    /interface ArrayConstructor \{\s*isArray\(arg: unknown\): arg is unknown\[\];/,
  );
  const config = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'tsconfig.json'), 'utf8')) as {
    include: string[];
    exclude?: string[];
  };
  assert.ok(config.include.includes('src'), 'tsconfig.json type-checks src/');
  assert.ok(
    !(config.exclude ?? []).some((path) => 'src/shared/types'.startsWith(path)),
    'src/shared/types is not excluded',
  );
});
