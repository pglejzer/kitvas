import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { VERIFY_FILE, type VerifyFile } from '../../../src/checks/index.ts';
import { loadKit } from '../../../src/kit/index.ts';
import { catalogDir } from '../../../src/shared/index.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { tempDrafts } from '../../helpers/drafts.ts';
import { builtinKits } from '../../helpers/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { t } from '../../helpers/translate.ts';

function basePage(project: string): string {
  const routes = pageRoutes({
    drafts: tempDrafts().store,
    kits: builtinKits(),
    project,
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
  });
  const route = routes.find((candidate) => candidate.id === 'kit');
  assert.ok(route);
  return route.handle({
    params: { id: 'base' },
    headers: {},
    query: new URLSearchParams(),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  }) as unknown as string;
}

function writeVerify(project: string, overrides: Partial<VerifyFile>): void {
  const dir = catalogDir(project, 'base');
  mkdirSync(dir, { recursive: true });
  const file: VerifyFile = {
    schemaVersion: 1,
    kit: 'base',
    hash: loadKit(builtinKits(), 'base').hash,
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
  writeFileSync(join(dir, VERIFY_FILE), JSON.stringify(file));
}

test('the page names the source and says the kit was never verified', () => {
  const text = basePage(tempDir('kitvas-project-'));
  assert.ok(text.includes('<span data-kit-source>Built in</span>'));
  assert.ok(
    text.includes(
      '<p class="k-quiet" data-verify="never">Not verified yet. Run &quot;kitvas kit verify base&quot;.</p>',
    ),
  );
});

test('a passed verification shows its date', () => {
  const project = tempDir('kitvas-project-');
  writeVerify(project, {});
  assert.ok(
    basePage(project).includes(
      '<p class="k-quiet" data-verify="passed">Verified on 2026-11-23.</p>',
    ),
  );
});

test('a failed verification shows the count and each problem in words', () => {
  const project = tempDir('kitvas-project-');
  writeVerify(project, {
    valid: false,
    steps: {
      schema: 'passed',
      imports: 'passed',
      types: 'passed',
      render: 'failed',
      tokens: 'skipped',
    },
    issues: [
      {
        step: 'render',
        path: 'components.0.examples.0',
        key: 'kitIssue.exampleNotShown',
        params: { key: 'Button.1' },
      },
    ],
  });
  const text = basePage(project);
  assert.ok(
    text.includes('<p class="k-fix" data-verify="failed">Verification found 1 problem(s).'),
  );
  assert.ok(
    text.includes(
      '<li data-verify-step="render">Example Button.1 did not render. <code>components.0.examples.0</code></li>',
    ),
  );
});

test('a verification made for another hash is stale', () => {
  const project = tempDir('kitvas-project-');
  writeVerify(project, { hash: 'old' });
  assert.ok(
    basePage(project).includes('data-verify="stale">The kit changed since it was verified.'),
  );
});

test('a verify file that is not valid JSON counts as never verified', () => {
  const project = tempDir('kitvas-project-');
  const dir = catalogDir(project, 'base');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, VERIFY_FILE), '{not json');
  assert.ok(basePage(project).includes('data-verify="never"'));
});
