import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseExamples } from '../../../src/checks/app/verify/example-parse.ts';
import { renderStep } from '../../../src/checks/app/verify/render.ts';
import {
  mappedVariables,
  tokensStep,
  writtenTokensStep,
} from '../../../src/checks/app/verify/tokens.ts';
import type { FlatToken } from '../../../src/kit/index.ts';
import {
  ACME_CATALOG,
  acmeLoaded,
  bundleError,
  catalog,
  componentsOf,
  fakeBundler,
  fakeInspector,
  writtenLoaded,
} from './support.ts';

const PAGE = catalog().path;

const TOKENS: FlatToken[] = [
  {
    path: ['color', 'ink'],
    type: 'color',
    value: { colorSpace: 'srgb', components: [0.102, 0.102, 0.102] },
  },
  {
    path: ['color', 'accent'],
    type: 'color',
    value: { colorSpace: 'srgb', components: [0, 0.3333, 1] },
  },
  { path: ['space', 'sm'], type: 'dimension', value: { value: 8, unit: 'px' } },
  { path: ['font', 'body'], type: 'fontFamily', value: ['Inter', 'sans-serif'] },
];

const MAP = {
  'color.ink': '--acme-color-ink',
  'color.accent': '--acme-color-accent',
  'space.sm': '--acme-space-2',
  'font.body': '--acme-font',
};

test('a catalog that did not build fails render with the build errors', async () => {
  const inspector = fakeInspector();
  const result = await renderStep({
    build: catalog({
      built: false,
      errors: [bundleError('kitvas-catalog.tsx', 12, 'Could not resolve "@acme/ui"')],
    }),
    dir: ACME_CATALOG,
    examples: [],
    reported: new Set(),
    inspect: inspector.inspect,
    bundler: fakeBundler(),
  });
  assert.deepEqual(result, {
    state: 'failed',
    issues: [
      {
        step: 'render',
        path: 'runtime.entry',
        key: 'checkRule.tool',
        params: { text: 'Could not resolve "@acme/ui" (kitvas-catalog.tsx:12)' },
      },
    ],
  });
  assert.deepEqual(inspector.asked, []);
});

test('every shown example is opened at 1280 by 800 and passes when it shows cleanly', async () => {
  const { kit } = acmeLoaded();
  const bundler = fakeBundler();
  const inspector = fakeInspector();
  const result = await renderStep({
    build: catalog({ shown: ['Button.1', 'Button.2', 'TextField.1', 'Badge.1'] }),
    dir: ACME_CATALOG,
    examples: await parseExamples(bundler, kit),
    reported: new Set(),
    inspect: inspector.inspect,
    bundler,
  });
  assert.deepEqual(result, { state: 'passed', issues: [] });
  assert.deepEqual(inspector.asked, [
    { page: PAGE, search: '?example=Button.1', width: 1280, height: 800, vars: [] },
    { page: PAGE, search: '?example=Button.2', width: 1280, height: 800, vars: [] },
    { page: PAGE, search: '?example=TextField.1', width: 1280, height: 800, vars: [] },
    { page: PAGE, search: '?example=Badge.1', width: 1280, height: 800, vars: [] },
  ]);
});

test('an example that does not show, errors or fails a request is reported at its place', async () => {
  const { kit } = acmeLoaded();
  const bundler = fakeBundler();
  const inspector = fakeInspector({
    '?example=Button.2': { example: 'failed', errors: ['theme is undefined'] },
    '?example=TextField.1': { example: null },
    '?example=Badge.1': { failed: ['file:///fonts/a.woff2 (net::ERR_FILE_NOT_FOUND)'] },
  });
  const result = await renderStep({
    build: catalog({ shown: ['Button.1', 'Button.2', 'TextField.1', 'Badge.1'] }),
    dir: ACME_CATALOG,
    examples: await parseExamples(bundler, kit),
    reported: new Set(),
    inspect: inspector.inspect,
    bundler,
  });
  assert.deepEqual(result, {
    state: 'failed',
    issues: [
      {
        step: 'render',
        path: 'components.0.examples.1',
        key: 'kitIssue.exampleNotShown',
        params: { key: 'Button.2' },
      },
      {
        step: 'render',
        path: 'components.0.examples.1',
        key: 'kitIssue.exampleError',
        params: { key: 'Button.2', detail: 'theme is undefined' },
      },
      {
        step: 'render',
        path: 'components.1.examples.0',
        key: 'kitIssue.exampleNotShown',
        params: { key: 'TextField.1' },
      },
      {
        step: 'render',
        path: 'components.2.examples.0',
        key: 'kitIssue.exampleError',
        params: { key: 'Badge.1', detail: 'file:///fonts/a.woff2 (net::ERR_FILE_NOT_FOUND)' },
      },
    ],
  });
});

test('an example the build left out is reported unless types already did', async () => {
  const { kit } = acmeLoaded((json) => {
    const [button, , badge] = componentsOf(json);
    if (button?.examples[1]) button.examples[1].code = '<Button BROKEN';
    if (badge?.examples[0]) badge.examples[0].code = '<Badge BROKEN';
  });
  const bundler = fakeBundler((input) => [
    bundleError(input.entry.name, 4, 'Expected ">" but found "<"'),
  ]);
  const examples = await parseExamples(bundler, kit);
  const inspector = fakeInspector();
  const result = await renderStep({
    build: catalog({ shown: ['Button.1'], skipped: ['Button.2', 'Badge.1'] }),
    dir: ACME_CATALOG,
    examples,
    reported: new Set(['Button.2']),
    inspect: inspector.inspect,
    bundler,
  });
  assert.deepEqual(result, {
    state: 'failed',
    issues: [
      {
        step: 'render',
        path: 'components.2.examples.0',
        key: 'kitIssue.exampleRejected',
        params: { key: 'Badge.1', detail: 'Expected ">" but found "<"' },
      },
    ],
  });
  assert.deepEqual(
    bundler.bundles.map((input) => input.entry.name),
    ['Badge.1.tsx'],
  );
});

test('tokens are skipped without a map and without a page', async () => {
  const inspector = fakeInspector();
  const unmapped = acmeLoaded(undefined, { tokens: TOKENS });
  assert.deepEqual(
    await tokensStep({ loaded: unmapped, build: catalog(), inspect: inspector.inspect }),
    { state: 'skipped', issues: [] },
  );
  const mapped = acmeLoaded(undefined, { tokens: TOKENS, cssVarMap: MAP });
  assert.deepEqual(
    await tokensStep({
      loaded: mapped,
      build: catalog({ built: false }),
      inspect: inspector.inspect,
    }),
    { state: 'skipped', issues: [] },
  );
  assert.deepEqual(inspector.asked, []);
});

test('mapped tokens that match what the browser reads pass, read inside the first example', async () => {
  const loaded = acmeLoaded(undefined, { tokens: TOKENS, cssVarMap: MAP });
  const inspector = fakeInspector({
    '?example=Button.1': {
      vars: {
        '--acme-color-ink': 'oklch(0.2178 0 0)',
        '--acme-color-accent': '#0055ff',
        '--acme-space-2': '0.5rem',
        '--acme-font': 'Inter,  sans-serif',
      },
      colors: {
        '--acme-color-ink': '#1b1a1a',
        '--acme-color-accent': '#0055ff',
        '--acme-space-2': null,
        '--acme-font': null,
      },
    },
  });
  const build = catalog({ shown: ['Button.1', 'Button.2'] });
  assert.deepEqual(await tokensStep({ loaded, build, inspect: inspector.inspect }), {
    state: 'passed',
    issues: [],
  });
  assert.deepEqual(inspector.asked, [
    {
      page: PAGE,
      search: '?example=Button.1',
      width: 1280,
      height: 800,
      vars: ['--acme-color-ink', '--acme-color-accent', '--acme-space-2', '--acme-font'],
    },
  ]);
});

test("mappedVariables gives a theme path's variable, and the step reads it from the page", async () => {
  const loaded = acmeLoaded(undefined, {
    tokens: TOKENS,
    cssVarMap: {
      'color.ink': 'theme(colors.primary)',
      'color.accent': '--acme-color-accent',
      'space.sm': 'theme(colors.primary)',
    },
  });
  assert.deepEqual(mappedVariables(loaded), [
    '--kitvas-theme-colors-primary',
    '--acme-color-accent',
  ]);
  const inspector = fakeInspector({
    '': {
      vars: { '--kitvas-theme-colors-primary': '#1a1a1a', '--acme-color-accent': '#0055ff' },
      colors: { '--kitvas-theme-colors-primary': '#1a1a1a', '--acme-color-accent': '#0055ff' },
    },
  });
  const result = await tokensStep({ loaded, build: catalog(), inspect: inspector.inspect });
  assert.deepEqual(inspector.asked[0]?.vars, [
    '--kitvas-theme-colors-primary',
    '--acme-color-accent',
  ]);
  // The dimension is held to a colour's value: one issue, named with the page variable.
  assert.deepEqual(
    result.issues.map((issue) => [issue.path, issue.params?.variable]),
    [['tokens.space.sm', '--kitvas-theme-colors-primary']],
  );
});

test('a token that differs is reported with the browser value; one without a value as unread', async () => {
  const loaded = acmeLoaded(undefined, {
    tokens: TOKENS,
    // Two tokens on one variable, and an entry whose token does not exist (a schema issue).
    cssVarMap: { ...MAP, 'color.gone': '--acme-color-ink' },
  });
  const inspector = fakeInspector({
    '': {
      vars: {
        '--acme-color-ink': '#1a1a1a',
        '--acme-color-accent': 'oklch(0.5 0.2 260)',
        '--acme-space-2': '',
        '--acme-font': 'Inter,sans-serif',
      },
      colors: {
        '--acme-color-ink': '#1a1a1a',
        '--acme-color-accent': '#0044ee',
        '--acme-space-2': null,
        '--acme-font': null,
      },
    },
  });
  // No example is shown: the variables on :root can still be read.
  const result = await tokensStep({ loaded, build: catalog(), inspect: inspector.inspect });
  assert.deepEqual(inspector.asked[0]?.search, '');
  assert.deepEqual(mappedVariables(loaded), [
    '--acme-color-ink',
    '--acme-color-accent',
    '--acme-space-2',
    '--acme-font',
  ]);
  assert.deepEqual(result, {
    state: 'failed',
    issues: [
      {
        step: 'tokens',
        path: 'tokens.color.accent',
        key: 'kitIssue.tokenMismatch',
        params: {
          token: 'color.accent',
          expected: '#0055ff',
          actual: '#0044ee',
          variable: '--acme-color-accent',
        },
      },
      {
        step: 'tokens',
        path: 'tokens.space.sm',
        key: 'kitIssue.tokenUnread',
        params: { variable: '--acme-space-2', token: 'space.sm' },
      },
      {
        step: 'tokens',
        path: 'tokens.font.body',
        key: 'kitIssue.tokenMismatch',
        params: {
          token: 'font.body',
          expected: 'Inter, sans-serif',
          actual: 'Inter,sans-serif',
          variable: '--acme-font',
        },
      },
    ],
  });
});

test('a written kit holds each kit variable of its components to its tokens, with no browser', () => {
  const loaded = { ...writtenLoaded(), tokens: TOKENS };
  const [button] = loaded.kit.components;
  if (button) button.import.from = 'components/Button';
  const files = {
    'components/Button.module.css':
      '.b { color: var(--kit-color-ink); padding: var(--kit-space-sm); }',
    'components/Button.tsx': 'export const Button = () => <b className="x" />;',
    'components/Card.module.css': '.c { color: var(--kit-colorInk); margin: var(--kit-space-xl); }',
  };
  assert.deepEqual(writtenTokensStep(loaded, files), {
    state: 'failed',
    issues: [
      {
        step: 'tokens',
        path: 'components',
        key: 'kitIssue.tokenVarMeant',
        params: {
          file: 'components/Card.module.css',
          name: '--kit-colorInk',
          nearest: '--kit-color-ink',
        },
      },
      {
        step: 'tokens',
        path: 'components',
        key: 'kitIssue.tokenVarUnknown',
        params: { file: 'components/Card.module.css', name: '--kit-space-xl' },
      },
    ],
  });
  const wrong = { 'components/Button.module.css': '.b { gap: var(--kit-space-lg); }' };
  assert.equal(writtenTokensStep(loaded, wrong).issues[0]?.path, 'components.0');
  assert.deepEqual(writtenTokensStep(loaded, {}), { state: 'passed', issues: [] });
});
