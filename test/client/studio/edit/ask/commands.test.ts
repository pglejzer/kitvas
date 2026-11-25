// The commands after a `/` (redesign spec goal 10; plan 19, task T3; Review Focus 4): Improve first,
// the menu's actions after it, the filter by every word, an action that is off with its reason.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandsFor, queryOf } from '../../../../../client/studio/edit/ask/commands.ts';
import { initialState } from '../../../../../client/studio/edit/store.ts';

const say = (key: string): string => key;
const options = { mac: false, say };

const selected = () => ({ ...initialState('shop'), on: true, selection: ['hero/btn'] });

test('a field that starts with a slash is a command query; any other is a request', () => {
  assert.equal(queryOf('/dup'), 'dup');
  assert.equal(queryOf('/'), '');
  assert.equal(queryOf('make it /bigger'), null);
  assert.equal(queryOf(' /dup'), null);
});

test('Improve comes first, then the actions of the menu', () => {
  const all = commandsFor(selected(), '', options);
  assert.equal(all[0]?.id, 'improve');
  assert.equal(all[0]?.enabled, true);
  assert.equal(all[1]?.id, 'delete');
  assert.ok(all.some((command) => command.id === 'duplicate'));
});

test('Replace needs a second list, so it is not a command', () => {
  const all = commandsFor(selected(), '', options);
  assert.equal(
    all.some((command) => command.id === 'replace'),
    false,
  );
});

test('Show all and the Lock that does not apply stay out, as in the menu', () => {
  const ids = commandsFor(selected(), '', options).map((command) => command.id);
  assert.equal(ids.includes('show-all'), false);
  assert.equal(ids.includes('unlock'), false);
  assert.equal(ids.includes('lock'), true);
});

test('the query filters by the label and the id', () => {
  const ids = commandsFor(selected(), 'copy', options).map((command) => command.id);
  assert.deepEqual(ids, ['copy', 'copy-location', 'copy-style']);
});

test('every word of the query must match', () => {
  const ids = commandsFor(selected(), 'copy style', options).map((command) => command.id);
  assert.deepEqual(ids, ['copy-style']);
  assert.deepEqual(commandsFor(selected(), 'copy zzz', options), []);
});

test('the filter ignores case', () => {
  assert.equal(commandsFor(selected(), 'DUP', options)[0]?.id, 'duplicate');
});

test('a query that matches nothing gives an empty list', () => {
  assert.deepEqual(commandsFor(selected(), 'nothing like this', options), []);
});

test('an action that is off carries its reason and is not enabled', () => {
  // The structure is not read, so the element is not found: Delete cannot run.
  const remove = commandsFor(selected(), 'delete', options).find(
    (command) => command.id === 'delete',
  );
  assert.equal(remove?.enabled, false);
  assert.equal(remove?.reason, 'menu.reason.not-found');
});

test('an action that is on has no reason', () => {
  const copy = commandsFor(selected(), 'copy', options).find((command) => command.id === 'copy');
  assert.equal(copy?.enabled, true);
  assert.equal(copy?.reason, null);
});

test('with nothing selected Improve is off and says to select', () => {
  const none = { ...initialState('shop'), on: true };
  const improve = commandsFor(none, 'improve', options)[0];
  assert.equal(improve?.id, 'improve');
  assert.equal(improve?.enabled, false);
  assert.equal(improve?.reason, 'ask.reason.select');
});
