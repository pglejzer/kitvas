// A kit written from a web page, end to end through the real CLI: a local copy of the fixture site is
// scanned, the kit's examples are checked against the crops of that scan (`kit verify`, step
// `look`), a draft made with the kit is built and checked, and a scan without `--allow-private`
// of the same local address is refused. Skips when no browser starts.

import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { test } from 'node:test';
import type { ChecksReport } from '../../src/checks/index.ts';
import type { BuildView, DraftView, LayoutView, Status } from '../../src/cli/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { fixtureDraftDir } from '../helpers/projects.ts';
import { describeRun, kitvas, runKitvas, type Sandbox } from './helpers/cli.ts';
import { fixtureBox, removeFixtureBox } from './helpers/project-box.ts';

const QUICK_MS = 30_000;
const SCAN_MS = 120_000;
const BUILD_MS = 120_000;
const VERIFY_MS = 180_000;
const CHECK_MS = 120_000;
const TEST_MS = 600_000;

const KIT = 'acme-site';
const SLUG = 'plans';
/** `BROWSER_MISSING` and `SCAN_BLOCKED`, see src/shared/errors/errors.ts. */
const EXIT_BROWSER_MISSING = 14;
const EXIT_SCAN_BLOCKED = 37;
/** Every look score must reach this (0 to 100). */
const MIN_LOOK = 90;

const SITE = join(PLUGIN_ROOT, 'test', 'fixtures', 'site');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

type ScanView = {
  view: 'scan';
  id: string;
  pages: { url: string; width: number }[];
};
type VerifyView = {
  view: 'verify';
  kit: string;
  valid: boolean;
  steps: Record<'schema' | 'imports' | 'types' | 'render' | 'tokens' | 'look', string>;
  issues: { step: string; path: string; key: string; params: Record<string, string | number> }[];
  notes: string[];
  look?: { key: string; score: number }[];
};
type UseView = { view: 'use'; id: string };

/** Serves test/fixtures/site/ on 127.0.0.1; any other path (such as /private.png) is a 404. */
function serveSite(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const name = (request.url ?? '/').split('?')[0] ?? '/';
    const file = name === '/' ? 'index.html' : name.slice(1);
    const known = /^[A-Za-z0-9_-]+\.(html|css)$/.test(file) && existsSync(join(SITE, file));
    if (!known) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(join(SITE, file)));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

/** The scan, or `undefined` when this machine has no browser to scan with. */
async function scan(box: Sandbox, url: string): Promise<ScanView | undefined> {
  const run = await runKitvas(
    box,
    ['kit', 'scan', KIT, '--url', url, '--allow-private', '--json'],
    SCAN_MS,
  );
  if (run.exit === EXIT_BROWSER_MISSING) return undefined;
  const last = run.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .pop();
  assert.equal(run.exit, 0, describeRun(run));
  const answer = JSON.parse(last ?? '{}') as { ok: boolean; data: ScanView };
  assert.equal(answer.ok, true, describeRun(run));
  return answer.data;
}

test('written kit acme-site: scan, verify with look, use, a checked draft, a blocked scan', {
  timeout: TEST_MS,
}, async (t) => {
  const boxed = fixtureBox('acme-written');
  const { box } = boxed;
  const { server, origin } = await serveSite();
  const url = `${origin}/index.html`;
  let passed = false;
  try {
    // The fixture names a placeholder page; this run's server is the kit's first page, so its scan
    // lands in `source/web/1-*`, where the examples' references point.
    const kitJson = join(box.project, '.kitvas', 'kits', KIT, 'kit.json');
    const raw = JSON.parse(readFileSync(kitJson, 'utf8')) as { source: { urls: string[] } };
    raw.source.urls = [url];
    writeFileSync(
      kitJson,
      `${JSON.stringify(raw, null, 2)}
`,
    );
    const scanned = await scan(box, url);
    if (scanned === undefined) {
      t.skip('this machine has no Chrome or Edge, which CI has');
      passed = true;
      return;
    }
    assert.equal(scanned.id, KIT);
    assert.equal(scanned.pages.length, 2, JSON.stringify(scanned.pages));
    const kitDir = join(box.project, '.kitvas', 'kits', KIT);
    for (const crop of ['button-0.png', 'card-0.png']) {
      const file = join(kitDir, 'source', 'web', '1-1280', 'crops', crop);
      assert.ok(existsSync(file), `no crop ${file}`);
    }

    const verify = await kitvas<VerifyView>(box, ['kit', 'verify', KIT], VERIFY_MS);
    const detail = `steps: ${JSON.stringify(verify.steps)}\nissues: ${JSON.stringify(verify.issues, null, 2)}\nlook: ${JSON.stringify(verify.look)}\nnotes: ${verify.notes.join(' ')}`;
    assert.equal(verify.valid, true, detail);
    assert.equal(verify.steps.look, 'passed', detail);
    assert.equal(verify.steps.tokens, 'skipped', detail);
    // Only advice: TextField and Heading have no reference image, so their look is not scored.
    assert.deepEqual(
      verify.issues.map((issue) => [issue.step, issue.key, issue.params.component]),
      [
        ['look', 'kitIssue.lookNoReference', 'TextField'],
        ['look', 'kitIssue.lookNoReference', 'Heading'],
      ],
      detail,
    );
    const scores = verify.look ?? [];
    assert.deepEqual(scores.map((entry) => entry.key).sort(), ['Button.1', 'Card.1'], detail);
    for (const entry of scores) {
      assert.ok(entry.score >= MIN_LOOK, `${entry.key} scored ${entry.score}\n${detail}`);
    }

    const used = await kitvas<UseView>(box, ['kit', 'use', KIT], QUICK_MS);
    assert.equal(used.id, KIT);
    const status = await kitvas<Status>(box, ['status'], QUICK_MS);
    assert.equal(status.kit, KIT);

    const created = await kitvas<Extract<DraftView, { view: 'new' }>>(
      box,
      ['draft', 'new', SLUG, '--title', 'Plans'],
      QUICK_MS,
    );
    assert.equal(created.draft.kit.id, KIT);
    cpSync(fixtureDraftDir('acme-written'), join(created.path, 'v1'), { recursive: true });
    const layout = await kitvas<LayoutView>(box, ['layout', SLUG], QUICK_MS);
    assert.equal(layout.valid, true, JSON.stringify(layout.issues));
    const build = await kitvas<BuildView>(box, ['build', SLUG], BUILD_MS);
    assert.deepEqual(build.errors, []);
    assert.equal(build.built, true);
    const report = await kitvas<ChecksReport>(box, ['check', SLUG], CHECK_MS);
    assert.notEqual(report.checks.a11y, 'skipped', report.notes.join(' '));
    const fixes = report.findings.filter((finding) => finding.severity === 'fix');
    assert.equal(fixes.length, 0, `findings to fix:\n${JSON.stringify(fixes, null, 2)}`);

    // The same local address without --allow-private is refused.
    const blocked = await runKitvas(box, ['kit', 'scan', KIT, '--url', url, '--json'], SCAN_MS);
    assert.equal(blocked.exit, EXIT_SCAN_BLOCKED, describeRun(blocked));
    passed = true;
  } finally {
    await closeServer(server);
    if (passed) removeFixtureBox(boxed);
    else t.diagnostic(`kept for a look: ${box.project} ${box.dataDir}`);
  }
});
