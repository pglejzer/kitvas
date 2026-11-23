import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTranslator, loadMessages } from '../../src/shared/i18n/i18n.ts';

test('fills named params and keeps unknown ones visible', () => {
  const t = createTranslator({ hello: 'Hi {name}, {missing}' });
  assert.equal(t('hello', { name: 'Ada' }), 'Hi Ada, {missing}');
});

test('throws on a missing key', () => {
  const t = createTranslator({});
  assert.throws(() => t('nope'), /Missing message: nope/);
});

test('loads English and overlays another language when its file exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kitvas-i18n-'));
  writeFileSync(join(dir, 'en.json'), JSON.stringify({ a: 'A', b: 'B' }));
  writeFileSync(join(dir, 'pl.json'), JSON.stringify({ a: 'A-pl' }));
  assert.deepEqual(loadMessages(dir, 'en'), { a: 'A', b: 'B' });
  assert.deepEqual(loadMessages(dir, 'pl'), { a: 'A-pl', b: 'B' });
  assert.deepEqual(loadMessages(dir, 'de'), { a: 'A', b: 'B' });
});
