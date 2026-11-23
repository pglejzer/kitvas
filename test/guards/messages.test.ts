import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { ERROR_TABLE } from '../../src/shared/errors/errors.ts';
import { listFiles } from '../helpers/architecture.ts';

const messages = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, 'locales', 'en.json'), 'utf8'),
) as Record<string, string>;

test('every error code has a message', () => {
  const missing = Object.keys(ERROR_TABLE).filter((code) => !(`error.${code}` in messages));
  assert.deepEqual(missing, []);
});

test('every message key written in code exists', () => {
  const keyInCode =
    /['"]((?:cli|command|status|init|error|kits|kitIssue|drafts|draftIssue|render|renderIssue|check|checkRule|checkHint|browser|studio)\.[A-Za-z0-9_.]+)['"]/g;
  // A file name such as 'cli.js' starts like a key but is not one.
  const fileName = /\.(?:[cm]?js|ts|json)$/;
  const missing: string[] = [];
  const paths = [
    ...listFiles(PLUGIN_ROOT, 'src'),
    ...listFiles(PLUGIN_ROOT, 'bin'),
    ...listFiles(PLUGIN_ROOT, 'scripts'),
  ];
  for (const path of paths) {
    const text = readFileSync(join(PLUGIN_ROOT, path), 'utf8');
    for (const match of text.matchAll(keyInCode)) {
      const key = match[1] ?? '';
      if (!fileName.test(key) && !(key in messages)) missing.push(`${path}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
