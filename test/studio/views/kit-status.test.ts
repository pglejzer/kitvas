import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VerifyFile } from '../../../src/checks/index.ts';
import { lookView, sourceLine, verifyView } from '../../../src/studio/views/kit-status.ts';

function file(overrides: Partial<VerifyFile>): VerifyFile {
  return {
    schemaVersion: 1,
    kit: 'acme',
    hash: 'h1',
    at: '2026-11-23T10:15:00.000Z',
    valid: true,
    steps: {
      schema: 'passed',
      imports: 'passed',
      types: 'passed',
      render: 'passed',
      tokens: 'passed',
    },
    issues: [],
    notes: [],
    ...overrides,
  };
}

test('the source line names the package, the folder or the built-in kit', () => {
  assert.deepEqual(sourceLine({ type: 'builtin' }), {
    key: 'studio.kit.source.builtin',
    params: {},
  });
  assert.deepEqual(sourceLine({ type: 'npm', package: '@acme/ui', version: '1.2.0' }), {
    key: 'studio.kit.source.npm',
    params: { name: '@acme/ui', version: '1.2.0' },
  });
  assert.deepEqual(sourceLine({ type: 'repo', path: 'src/ds' }), {
    key: 'studio.kit.source.repo',
    params: { path: 'src/ds' },
  });
});

test('written sources: figma, the distinct hosts of the pages, images', () => {
  const url = `https://www.figma.com/design/${'a'.repeat(22)}/x`;
  assert.deepEqual(sourceLine({ type: 'figma', url }), {
    key: 'studio.kit.source.figma',
    params: {},
  });
  assert.deepEqual(
    sourceLine({ type: 'web', urls: ['https://a.dev/x', 'https://a.dev/y', 'http://b.dev'] }),
    { key: 'studio.kit.source.web', params: { host: 'a.dev, b.dev' } },
  );
  assert.deepEqual(sourceLine({ type: 'images' }), { key: 'studio.kit.source.images', params: {} });
});

test('look scores: none without a look, stale for another hash, else by example', () => {
  const look = [{ key: 'Button.1', score: 80, size: 1, colour: 2, structure: 3 }];
  assert.deepEqual(lookView(undefined, 'h1'), { state: 'none' });
  assert.deepEqual(lookView(file({}), 'h1'), { state: 'none' });
  assert.deepEqual(lookView(file({ look }), 'h2'), { state: 'stale' });
  assert.deepEqual(lookView(file({ look }), 'h1'), {
    state: 'scored',
    entries: { 'Button.1': look[0] },
  });
});

test('no verify file is "never"', () => {
  assert.deepEqual(verifyView(undefined, 'h1'), { state: 'never', date: '', count: 0, issues: [] });
});

test('a valid file for the same hash is "passed" with its date', () => {
  assert.deepEqual(verifyView(file({}), 'h1'), {
    state: 'passed',
    date: '2026-11-23',
    count: 0,
    issues: [],
  });
});

test('a file for another hash is "stale", valid or not', () => {
  const issue = {
    step: 'types' as const,
    path: 'components.0',
    key: 'kitIssue.propRejected',
    params: {},
  };
  assert.equal(verifyView(file({}), 'h2').state, 'stale');
  assert.equal(verifyView(file({ valid: false, issues: [issue] }), 'h2').state, 'stale');
});

test('an invalid file for the same hash is "failed" with its problems counted', () => {
  const issue = {
    step: 'types' as const,
    path: 'components.0',
    key: 'kitIssue.propRejected',
    params: {},
  };
  assert.deepEqual(verifyView(file({ valid: false, issues: [issue, issue] }), 'h1'), {
    state: 'failed',
    date: '2026-11-23',
    count: 2,
    issues: [issue, issue],
  });
});
