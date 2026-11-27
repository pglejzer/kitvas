import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseTailwindFile,
  readTailwindFile,
  TAILWIND_FILE,
} from '../../src/shared/values/tailwind-file.ts';

const theme = {
  version: 4,
  prefix: 'tw:',
  screens: { tablet: 700, wide: 'x' },
  aliases: { '--primary': '--color-primary', '--ink': 3, plain: '--color-x' },
};

test('a Tailwind file gives its unknown classes and the theme of its build', () => {
  assert.deepEqual(parseTailwindFile({ schemaVersion: 2, unknown: ['bg-nope'], theme }), {
    schemaVersion: 2,
    unknown: ['bg-nope'],
    theme: {
      version: 4,
      prefix: 'tw:',
      screens: { tablet: 700 },
      aliases: { '--primary': '--color-primary' },
    },
  });
  const noAliases = { version: 3, prefix: '', screens: {} };
  const old = parseTailwindFile({ schemaVersion: 2, unknown: [], theme: noAliases });
  assert.deepEqual(old?.theme?.aliases, {});
  const noTheme = parseTailwindFile({ schemaVersion: 2, unknown: [], theme: { version: 2 } });
  assert.equal(noTheme?.theme, null);
});

test('a file of another version or shape is not read', () => {
  for (const raw of [
    { schemaVersion: 1, unknown: ['bg-nope'] },
    { schemaVersion: 2, unknown: [1], theme },
    { schemaVersion: 2, theme },
    undefined,
  ]) {
    assert.equal(parseTailwindFile(raw), undefined, JSON.stringify(raw));
  }
});

test('the file is read from its place in a folder, and broken text is none', () => {
  const files: Record<string, string> = {
    [`v1/${TAILWIND_FILE}`]: JSON.stringify({ schemaVersion: 2, unknown: [], theme: null }),
    [`v2/${TAILWIND_FILE}`]: '{',
  };
  const read = (file: string): string | undefined => files[file];
  assert.deepEqual(readTailwindFile(read, 'v1'), { schemaVersion: 2, unknown: [], theme: null });
  assert.equal(readTailwindFile(read, 'v2'), undefined);
  assert.equal(readTailwindFile(read, 'v3'), undefined);
});
