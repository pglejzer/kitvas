import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFit } from '../../../src/handoff/domain/code/fit.ts';
import type { WriteSet } from '../../../src/handoff/domain/code/listing.ts';
import type { KitvasError } from '../../../src/shared/index.ts';

const write: WriteSet = { to: 'src/pages/pricing', scope: 'new', files: [] };

const full = {
  schemaVersion: 1,
  stack: 'React 18 with CSS Modules, components in single files under src/components',
  files: [
    { path: 'src/pages/pricing/Pricing.tsx', role: 'view' },
    { path: 'src/pages/pricing/Pricing.module.css', role: 'style' },
  ],
  components: [
    { kit: 'Button', to: 'src/components/Button', note: 'same job, variant primary' },
    { kit: 'Stack', to: null, note: 'plain flex column' },
  ],
  tokens: [
    { var: '--kit-space-md', to: '--space-4' },
    { var: '--kit-color-ink', to: null },
  ],
  wiring: [{ file: 'src/App.tsx', change: 'add the /pricing route', done: false }],
  installs: [{ name: 'clsx', why: 'the project joins class names with it' }],
  open: ['Texts are inline: the project has no message files'],
};

function refusal(raw: unknown, to: WriteSet = write): KitvasError {
  const read = readFit(raw, to);
  assert.equal(read.ok, false);
  if (read.ok) throw new Error('expected a refusal');
  return read.error;
}

test('a full report passes and comes back as given', () => {
  const read = readFit(full, write);
  assert.equal(read.ok, true);
  if (read.ok) assert.deepEqual(read.value, full);
});

test('an empty report of lists passes when it has a stack', () => {
  const read = readFit(
    {
      schemaVersion: 1,
      stack: 'Plain HTML',
      files: [],
      components: [],
      tokens: [],
      wiring: [],
      installs: [],
      open: [],
    },
    write,
  );
  assert.equal(read.ok, true);
});

test('a report with no stack is refused, and so is a blank or a two-line stack', () => {
  const { stack: _gone, ...without } = full;
  assert.deepEqual(refusal(without).params, { at: 'stack', reason: 'shape' });
  assert.equal(refusal({ ...full, stack: '   ' }).code, 'HANDOFF_INVALID');
  assert.equal(refusal({ ...full, stack: 'React\nand more' }).code, 'HANDOFF_INVALID');
});

test('a path that leaves the project is refused as outside', () => {
  for (const path of [
    '../other/App.tsx',
    '/etc/passwd',
    'C:/Users/x/App.tsx',
    'src\\App.tsx',
    'src/../../x',
  ]) {
    const error = refusal({ ...full, files: [{ path, role: 'view' }] });
    assert.equal(error.code, 'HANDOFF_OUTSIDE', path);
    assert.equal(error.params.path, path);
  }
  const wiring = [{ file: '../x/routes.ts', change: 'add a route', done: false }];
  assert.equal(refusal({ ...full, wiring }).code, 'HANDOFF_OUTSIDE');
});

test('a wiring entry marked done outside the scope is refused; a proposal is not', () => {
  const done = [{ file: 'src/App.tsx', change: 'add the route', done: true }];
  const error = refusal({ ...full, wiring: done });
  assert.equal(error.code, 'HANDOFF_INVALID');
  assert.deepEqual(error.params, { at: 'wiring.0.file', reason: 'outside-scope' });
  assert.equal(readFit({ ...full, wiring: [{ ...done[0], done: false }] }, write).ok, true);
});

test('done wiring is allowed where the scope allows it', () => {
  const done = [{ file: 'src/App.tsx', change: 'add the route', done: true }];
  assert.equal(readFit({ ...full, wiring: done }, { ...write, scope: 'open' }).ok, true);
  assert.equal(
    readFit({ ...full, wiring: done }, { ...write, scope: 'named', files: ['src/App.tsx'] }).ok,
    true,
  );
  const inside = [{ file: 'src/pages/pricing/index.ts', change: 'export the page', done: true }];
  assert.equal(readFit({ ...full, wiring: inside }, write).ok, true);
});

test('an install with no reason is refused', () => {
  for (const why of ['', '   ']) {
    const error = refusal({ ...full, installs: [{ name: 'clsx', why }] });
    assert.equal(error.code, 'HANDOFF_INVALID');
    assert.equal(error.params.at, 'installs.0.why');
  }
  const { why: _why, ...bare } = { name: 'clsx', why: 'x' };
  assert.equal(refusal({ ...full, installs: [bare] }).code, 'HANDOFF_INVALID');
});

test('a file in .git, a .env file or a lockfile is never written, and a done wiring on one is refused', () => {
  for (const path of [
    '.git/config',
    'app/.env.local',
    '.env',
    'package-lock.json',
    'web/yarn.lock',
    'Cargo.lock',
  ]) {
    const error = refusal({ ...full, files: [{ path, role: 'data' }] });
    assert.deepEqual(error.params, { at: 'files.0.path', reason: 'protected' }, path);
  }
  const wiring = [{ file: 'pnpm-lock.yaml', change: 'update', done: true }];
  assert.equal(
    refusal({ ...full, wiring }, { ...write, scope: 'open' }).params.reason,
    'protected',
  );
});

test('a shape that is not an object, an unknown key or a wrong role is refused', () => {
  assert.equal(refusal(null).code, 'HANDOFF_INVALID');
  assert.equal(refusal([]).code, 'HANDOFF_INVALID');
  assert.equal(refusal({ ...full, extra: 1 }).code, 'HANDOFF_INVALID');
  assert.equal(
    refusal({ ...full, files: [{ path: 'a.ts', role: 'test' }] }).code,
    'HANDOFF_INVALID',
  );
  assert.equal(refusal({ ...full, schemaVersion: 2 }).code, 'HANDOFF_INVALID');
});
