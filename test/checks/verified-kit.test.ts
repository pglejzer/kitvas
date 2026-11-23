import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  blockingFailures,
  refuseFailedKit,
  VERIFY_FILE,
  type VerifyFile,
} from '../../src/checks/index.ts';
import type { LoadedKit } from '../../src/kit/index.ts';
import { catalogDir, KitvasError } from '../../src/shared/index.ts';

const verifyFile = (hash: string, failed: (keyof VerifyFile['steps'])[]): string => {
  const steps: VerifyFile['steps'] = {
    schema: 'passed',
    imports: 'passed',
    types: 'passed',
    render: 'passed',
    tokens: 'passed',
  };
  for (const step of failed) steps[step] = 'failed';
  const file: VerifyFile = {
    schemaVersion: 1,
    kit: 'acme',
    hash,
    at: '2026-11-23T10:00:00.000Z',
    valid: failed.length === 0,
    steps,
    issues: [],
    notes: [],
  };
  return JSON.stringify(file);
};

const kitOf = (project: string | undefined, hash = 'h1'): LoadedKit => {
  const kit = { id: 'acme' } as LoadedKit['kit'];
  return {
    kit,
    dir: '/kits/acme',
    tokens: [],
    issues: [],
    hash,
    project,
    cssVarMap: {},
    additions: [],
    additionsDir: undefined,
    entry: '/kits/acme/generated/kit.ts',
  };
};

test('only schema, imports and types block, and only for the same kit data', () => {
  assert.deepEqual(blockingFailures(undefined, 'h1'), []);
  assert.deepEqual(blockingFailures('not json', 'h1'), []);
  assert.deepEqual(blockingFailures(verifyFile('h1', []), 'h1'), []);
  assert.deepEqual(blockingFailures(verifyFile('h1', ['render', 'tokens']), 'h1'), []);
  assert.deepEqual(blockingFailures(verifyFile('h1', ['imports', 'types', 'render']), 'h1'), [
    'imports',
    'types',
  ]);
  // The kit changed since it was verified: the old answer says nothing about it.
  assert.deepEqual(blockingFailures(verifyFile('h0', ['schema']), 'h1'), []);
});

test('a project kit with a failed blocking step is refused, built-in kits are never read', () => {
  const project = join('/work', 'shop');
  const file = join(catalogDir(project, 'acme'), VERIFY_FILE);
  const read: string[] = [];
  const reader =
    (text: string | undefined) =>
    (path: string): string | undefined => {
      read.push(path);
      return text;
    };

  refuseFailedKit(reader(verifyFile('h1', ['types'])), kitOf(undefined));
  assert.deepEqual(read, []);

  refuseFailedKit(reader(undefined), kitOf(project));
  refuseFailedKit(reader(verifyFile('h1', ['tokens'])), kitOf(project));
  assert.deepEqual(read, [file, file]);

  assert.throws(
    () => refuseFailedKit(reader(verifyFile('h1', ['schema', 'types'])), kitOf(project)),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'KIT_INVALID' &&
      error.params.id === 'acme' &&
      error.params.detail === 'verify.json: schema, types',
  );
});
