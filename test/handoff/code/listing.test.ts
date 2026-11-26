import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type ProjectListing,
  projectChanges,
  type WriteSet,
} from '../../../src/handoff/domain/code/listing.ts';

const listing = (files: Record<string, string>, watched = true): ProjectListing => ({
  schemaVersion: 1,
  watched,
  files,
});

const BEFORE = listing({
  'package.json': '10:aa',
  'src/App.tsx': '20:bb',
  'src/ui/Old.tsx': '30:cc',
  'src/lib/util.ts': '40:dd',
});

const write = (scope: WriteSet['scope'], files: string[] = []): WriteSet => ({
  to: 'src/ui',
  scope,
  files,
});

test('nothing changed: nothing is said', () => {
  assert.deepEqual(projectChanges(BEFORE, BEFORE, write('new')), {
    watched: true,
    inside: [],
    outside: [],
    removed: [],
  });
});

test('scope new: new files under the folder are inside; an edited existing file is outside', () => {
  const after = listing({
    ...BEFORE.files,
    'src/ui/Pricing.tsx': '50:ee',
    'src/ui/Pricing.module.scss': '60:ff',
    'src/ui/Old.tsx': '31:c2',
    'src/App.tsx': '21:b2',
    'src/pages/Pricing.tsx': '70:gg',
  });
  assert.deepEqual(projectChanges(BEFORE, after, write('new')), {
    watched: true,
    inside: ['src/ui/Pricing.module.scss', 'src/ui/Pricing.tsx'],
    outside: ['src/App.tsx', 'src/pages/Pricing.tsx', 'src/ui/Old.tsx'],
    removed: [],
  });
});

test('scope new ignores a list of named files', () => {
  const after = listing({ ...BEFORE.files, 'src/App.tsx': '21:b2' });
  const changes = projectChanges(BEFORE, after, write('new', ['src/App.tsx']));
  assert.deepEqual(changes.inside, []);
  assert.deepEqual(changes.outside, ['src/App.tsx']);
});

test('scope named: a file on the list is inside, a file not on it is outside', () => {
  const after = listing({
    ...BEFORE.files,
    'src/App.tsx': '21:b2',
    'src/ui/Old.tsx': '31:c2',
    'src/ui/New.tsx': '50:ee',
  });
  assert.deepEqual(projectChanges(BEFORE, after, write('named', ['src/App.tsx'])), {
    watched: true,
    inside: ['src/App.tsx', 'src/ui/New.tsx'],
    outside: ['src/ui/Old.tsx'],
    removed: [],
  });
});

test('scope open: every change is inside, but never a file kitvas does not write', () => {
  const after = listing({
    ...BEFORE.files,
    'src/App.tsx': '21:b2',
    'src/new/Thing.ts': '5:ee',
    '.env.local': '9:',
    'package-lock.json': '99:',
  });
  assert.deepEqual(projectChanges(BEFORE, after, write('open')), {
    watched: true,
    inside: ['src/App.tsx', 'src/new/Thing.ts'],
    outside: ['.env.local', 'package-lock.json'],
    removed: [],
  });
});

test('a deleted file is removed, under the folder or not', () => {
  const gone = ['src/ui/Old.tsx', 'src/lib/util.ts'];
  const rest = Object.entries(BEFORE.files).filter(([path]) => !gone.includes(path));
  const changes = projectChanges(BEFORE, listing(Object.fromEntries(rest)), write('new'));
  assert.deepEqual(changes.removed, ['src/lib/util.ts', 'src/ui/Old.tsx']);
  assert.deepEqual(changes.inside, []);
  assert.deepEqual(changes.outside, []);
});

test('a file the person changed meanwhile is listed like the rest, with no guess about who wrote it', () => {
  const after = listing({ ...BEFORE.files, 'package.json': '12:zz', 'src/ui/Pricing.tsx': '1:aa' });
  assert.deepEqual(projectChanges(BEFORE, after, write('new')), {
    watched: true,
    inside: ['src/ui/Pricing.tsx'],
    outside: ['package.json'],
    removed: [],
  });
});

test('a file over the read limit is compared by its size alone', () => {
  const before = listing({ 'src/big.bin': '999:' });
  assert.deepEqual(
    projectChanges(before, listing({ 'src/big.bin': '999:' }), write('open')).inside,
    [],
  );
  assert.deepEqual(
    projectChanges(before, listing({ 'src/big.bin': '1000:' }), write('open')).inside,
    ['src/big.bin'],
  );
});

test('a folder given as ./src/ui/ or the project root works the same way', () => {
  const after = listing({ ...BEFORE.files, 'src/ui/Pricing.tsx': '1:aa', 'top.ts': '1:bb' });
  assert.deepEqual(
    projectChanges(BEFORE, after, { to: './src/ui/', scope: 'new', files: [] }).inside,
    ['src/ui/Pricing.tsx'],
  );
  assert.deepEqual(projectChanges(BEFORE, after, { to: '', scope: 'new', files: [] }).inside, [
    'src/ui/Pricing.tsx',
    'top.ts',
  ]);
});

test('a listing that was not taken says nothing, whichever side it is on', () => {
  const unwatched = listing({}, false);
  const none = { watched: false, inside: [], outside: [], removed: [] };
  assert.deepEqual(projectChanges(unwatched, BEFORE, write('open')), none);
  assert.deepEqual(projectChanges(BEFORE, unwatched, write('open')), none);
});
