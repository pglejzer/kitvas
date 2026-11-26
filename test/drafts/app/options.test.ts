import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkOptions, readOptions, setOptionDefaults } from '../../../src/drafts/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';

const FILE = 'v1/src/json/options.json';

const opt = (id: string, def: string, values: string[]) => ({
  id,
  label: id,
  default: def,
  values: values.map((value) => ({ id: value, label: value })),
});

const TEXT = `${JSON.stringify(
  {
    schemaVersion: 1,
    options: [opt('columns', '3', ['3', '2']), opt('cards', 'outlined', ['outlined', 'filled'])],
  },
  null,
  2,
)}\n`;

test('a missing file, a file that is not JSON and a file with nine options read as none', () => {
  const { store } = shopDraft();
  assert.deepEqual(readOptions(store, 'shop', 'v1'), []);
  assert.deepEqual(checkOptions(store, 'shop', 'v1', []), []);

  store.writeText('shop', FILE, '{ not json');
  assert.deepEqual(readOptions(store, 'shop', 'v1'), []);
  assert.deepEqual(
    checkOptions(store, 'shop', 'v1', []).map((issue) => issue.key),
    ['draftIssue.optionsInvalid'],
  );

  const nine = Array.from({ length: 9 }, (_, index) => opt(`o${index}`, 'a', ['a', 'b']));
  store.writeText('shop', FILE, JSON.stringify({ schemaVersion: 1, options: nine }));
  assert.deepEqual(readOptions(store, 'shop', 'v1'), []);
});

test('a good file reads in the order of the file', () => {
  const { store } = shopDraft();
  store.writeText('shop', FILE, TEXT);
  assert.deepEqual(
    readOptions(store, 'shop', 'v1').map((option) => option.id),
    ['columns', 'cards'],
  );
  assert.deepEqual(checkOptions(store, 'shop', 'v1', []), []);
});

test('a default changes in place, and the old choice gives the file back byte for byte', () => {
  const { store } = shopDraft();
  store.writeText('shop', FILE, TEXT);
  const changed = setOptionDefaults(store, 'shop', 1, { columns: '2' });
  assert.equal(changed.file, FILE);
  assert.equal(changed.before, TEXT);
  assert.equal(changed.after, TEXT.replace('"default": "3"', '"default": "2"'));
  assert.equal(store.readText('shop', FILE), changed.after);

  const back = setOptionDefaults(store, 'shop', 1, { columns: '3', cards: 'outlined' });
  assert.equal(back.after, TEXT);
  assert.equal(store.readText('shop', FILE), TEXT);
});

test('an id or a value the version lacks changes nothing', () => {
  const { store } = shopDraft();
  store.writeText('shop', FILE, TEXT);
  const same = setOptionDefaults(store, 'shop', 1, { columns: '9', unknown: 'x' });
  assert.equal(same.after, TEXT);
  assert.equal(store.readText('shop', FILE), TEXT);
});

test('CRLF stays CRLF and a label that looks like a default key is left alone', () => {
  const { store } = shopDraft();
  const tricky = TEXT.replace('"label": "cards"', '"label": "a \\"default\\": \\"x\\""').replace(
    /\n/g,
    '\r\n',
  );
  store.writeText('shop', FILE, tricky);
  const { after } = setOptionDefaults(store, 'shop', 1, { cards: 'filled' });
  assert.equal(after, tricky.replace('"default": "outlined"', '"default": "filled"'));
  assert.ok(after.includes('\r\n') && !/[^\r]\n/.test(after));
});

test('no readable options file is DRAFT_INVALID', () => {
  const { store } = shopDraft();
  assert.throws(
    () => setOptionDefaults(store, 'shop', 1, { columns: '2' }),
    (error) => error instanceof KitvasError && error.code === 'DRAFT_INVALID',
  );
});
