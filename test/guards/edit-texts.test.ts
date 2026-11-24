import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { EDIT_TEXT_KEYS } from '../../src/studio/pages/editor/edit-texts.ts';
import { TRASH_TEXT_KEYS } from '../../src/studio/pages/trash/trash-texts.ts';
import { listFiles } from '../helpers/architecture.ts';

// The editor's script has no texts of its own: the page hands it the keys of `EDIT_TEXT_KEYS`
// (`studio.edit.<key>` of the locale file), and a key the page did not send shows as the key
// itself. So a key written in a script and missing from the list is a text nobody reads.

const messages = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, 'locales', 'en.json'), 'utf8'),
) as Record<string, string>;

const listed = new Set<string>(EDIT_TEXT_KEYS);

// The trash scripts have a list of their own, handed over the same way (ADR 0064):
// `studio.trash.<key>`, read by `client/studio/trash/texts.ts`.
const TRASH_SCRIPTS = 'client/studio/trash/';
const trashListed = new Set<string>(TRASH_TEXT_KEYS);

test('every key the page hands the editor has a text, and is listed once', () => {
  const missing = EDIT_TEXT_KEYS.filter((key) => !(`studio.edit.${key}` in messages));
  assert.deepEqual(missing, []);
  const twice = EDIT_TEXT_KEYS.filter((key, index) => EDIT_TEXT_KEYS.indexOf(key) !== index);
  assert.deepEqual(twice, []);
  const noTrashText = TRASH_TEXT_KEYS.filter((key) => !(`studio.trash.${key}` in messages));
  assert.deepEqual(noTrashText, []);
});

test('every key a script asks for by name is one the page hands over', () => {
  // `text('changes.undoAll')` and `text('ai.status.off', { … })`: the key as a plain string.
  const asked = /\btext\(\s*'([A-Za-z0-9_.-]+)'/g;
  const missing: string[] = [];
  for (const path of listFiles(PLUGIN_ROOT, 'client/studio')) {
    const source = readFileSync(join(PLUGIN_ROOT, path), 'utf8');
    // Only the files that read the editor's texts.
    if (!/from '[./]+(?:edit\/)?texts\.ts'/.test(source)) continue;
    for (const match of source.matchAll(asked)) {
      const key = match[1] ?? '';
      const list = path.startsWith(TRASH_SCRIPTS) ? trashListed : listed;
      if (!list.has(key)) missing.push(`${path}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
