import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRequestCommand, runCli } from '../../src/cli/index.ts';
import { initWorkspace, PLUGIN_ROOT } from '../../src/shared/index.ts';
import type {
  LifecycleDeps,
  RequestContext,
  RequestView,
  StudioCaller,
} from '../../src/studio/index.ts';
import { fakeLifecycle } from '../helpers/fake-lifecycle.ts';
import { SAMPLE_STATE } from '../helpers/studio-state.ts';
import { tempDir } from '../helpers/tmp.ts';

const ID = '00000000-0000-4000-8000-000000000021';
const OTHER = '00000000-0000-4000-8000-000000000022';
const BUTTON = 'sections/Hero:section/Button';

const VIEW: RequestView = {
  id: ID,
  kind: 'say',
  elements: [BUTTON],
  context: { width: null, state: null },
  text: 'Make it stand out',
  version: 1,
  at: '2026-11-24T10:00:00.000Z',
  status: 'taken',
  note: null,
  stale: false,
  answer: null,
};
const CONTEXT: RequestContext = {
  request: VIEW,
  slug: 'shop',
  format: 'scss',
  elements: [],
  locked: [BUTTON],
  ops: [],
};
const VARIANTS = {
  variants: [{ label: 'Bold', changes: [{ kind: 'text', id: BUTTON, value: 'Go now' }] }],
};
const NOT_TAKEN = { code: 'REQUEST_NOT_TAKEN', detail: 'Not taken.' };

type Answer = { status: number; body: unknown };

/** A studio that answers each `METHOD path` with its answer, else 404; the calls are kept. */
function fakeStudio(answers: Record<string, Answer>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const call: StudioCaller = async (_state, made) => {
    calls.push({ method: made.method, path: made.path, body: made.body });
    const missing = { code: 'REQUEST_NOT_FOUND', detail: 'There is none.' };
    return answers[`${made.method} ${made.path}`] ?? { status: 404, body: missing };
  };
  return { call, calls };
}

const STUDIO = fakeStudio({
  [`GET /api/v1/requests/${ID}`]: { status: 200, body: CONTEXT },
  [`POST /api/v1/requests/${ID}/answer`]: {
    status: 200,
    body: { ...VIEW, status: 'answered', answer: { kind: 'variants', ...VARIANTS } },
  },
  [`POST /api/v1/requests/${ID}/done`]: {
    status: 200,
    body: { ...VIEW, status: 'answered', answer: { kind: 'done', message: 'Moved it' } },
  },
  [`POST /api/v1/requests/${ID}/fail`]: {
    status: 200,
    body: { ...VIEW, status: 'failed', answer: { kind: 'failed', reason: 'No such token' } },
  },
  [`POST /api/v1/requests/${OTHER}/done`]: { status: 409, body: NOT_TAKEN },
});

function harness(lifecycle: LifecycleDeps, call: StudioCaller = STUDIO.call, workspace = true) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  if (workspace) {
    initWorkspace(io.cwd);
    writeFileSync(join(io.cwd, '.kitvas', 'decisions.md'), '---\nkit: tiny\n---\n');
  }
  const commands = [createRequestCommand({ lifecycle: () => lifecycle, call })];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  const data = (): unknown => (JSON.parse(out.at(-1) ?? '') as { data: unknown }).data;
  const error = () =>
    (JSON.parse(err.at(-1) ?? '') as { error: { code: string; message: string } }).error;
  /** A file in the project folder, as Claude writes the variants. */
  const file = (name: string, text: string): string => {
    writeFileSync(join(io.cwd, name), text);
    return name;
  };
  return { out, err, run, data, error, file };
}

const running = () => fakeLifecycle({ running: SAMPLE_STATE }).deps;

test('request show prints what Claude needs, in JSON and in words', async () => {
  const h = harness(running());
  assert.equal(await h.run('request', 'show', ID, '--json'), 0);
  assert.deepEqual(h.data(), { view: 'show', ...CONTEXT });
  assert.equal(await h.run('request', 'show', ID.toUpperCase()), 0);
  assert.equal(
    h.out.at(-1),
    [
      `Request ${ID} (say, taken) on shop: Make it stand out`,
      'Elements now: none',
      `Locked, never to be changed: ${BUTTON}`,
    ].join('\n'),
  );
});

test('request answer sends the variants file once it reads as variants', async () => {
  const studio = fakeStudio({
    [`POST /api/v1/requests/${ID}/answer`]: {
      status: 200,
      body: { ...VIEW, status: 'answered', answer: { kind: 'variants', ...VARIANTS } },
    },
  });
  const h = harness(running(), studio.call);
  const path = h.file('answer.json', JSON.stringify(VARIANTS));
  assert.equal(await h.run('request', 'answer', ID, '--file', path, '--json'), 0);
  assert.deepEqual(studio.calls, [
    { method: 'POST', path: `/api/v1/requests/${ID}/answer`, body: VARIANTS },
  ]);
  assert.equal((h.data() as { request: RequestView }).request.status, 'answered');
  assert.equal(await h.run('request', 'answer', ID, '--file', path), 0);
  assert.equal(h.out.at(-1), `Request ${ID} is answered. Variants: 1.`);

  // Nothing is sent for a file that is missing, not JSON, or not variants.
  assert.equal(await h.run('request', 'answer', ID, '--json'), 2);
  assert.equal(await h.run('request', 'answer', ID, '--file', 'gone.json', '--json'), 2);
  assert.match(h.error().message, /gone\.json cannot be read/);
  const broken = h.file('broken.json', '{ "variants": ');
  assert.equal(await h.run('request', 'answer', ID, '--file', broken, '--json'), 2);
  assert.match(h.error().message, /not a variants file: \/: not JSON/);
  const many = { variants: [1, 2, 3, 4].map(() => VARIANTS.variants[0]) };
  const four = h.file('four.json', JSON.stringify(many));
  assert.equal(await h.run('request', 'answer', ID, '--file', four, '--json'), 2);
  assert.match(h.error().message, /\/variants:/);
  assert.equal(studio.calls.length, 2);
});

test('request done and fail close a taken request with a word or a reason', async () => {
  const h = harness(running());
  assert.equal(await h.run('request', 'done', ID, '--message', ' Moved it ', '--json'), 0);
  assert.equal((h.data() as { view: string }).view, 'done');
  assert.deepEqual(STUDIO.calls.at(-1)?.body, { message: 'Moved it' });
  assert.equal(await h.run('request', 'done', ID), 0);
  assert.equal(h.out.at(-1), `Request ${ID} is done.`);
  assert.deepEqual(STUDIO.calls.at(-1)?.body, { message: '' });
  assert.equal(await h.run('request', 'fail', ID, '--reason', 'No such token'), 0);
  assert.equal(h.out.at(-1), `Request ${ID} is marked as not done.`);
  assert.equal(await h.run('request', 'fail', ID, '--json'), 2);
  assert.equal(await h.run('request', 'fail', ID, '--reason', 'x'.repeat(501), '--json'), 2);
});

test('the studio refusals keep their codes; no studio is its own error', async () => {
  const h = harness(running());
  assert.equal(await h.run('request', 'done', OTHER, '--json'), 55);
  assert.equal(h.error().code, 'REQUEST_NOT_TAKEN');
  assert.match(h.error().message, new RegExp(`Request ${OTHER} is not taken now`));
  assert.equal(await h.run('request', 'show', OTHER, '--json'), 54);
  assert.equal(h.error().message, `There is no request ${OTHER}.`);
  const stopped = harness(fakeLifecycle().deps);
  assert.equal(await stopped.run('request', 'show', ID, '--json'), 57);
  assert.equal(stopped.error().code, 'STUDIO_NOT_RUNNING');
});

test('a wrong subcommand, id or folder is a usage error before any call', async () => {
  const studio = fakeStudio({});
  const h = harness(running(), studio.call);
  assert.equal(await h.run('request', 'take', ID), 2);
  assert.equal(await h.run('request', 'show'), 2);
  assert.equal(await h.run('request', 'show', 'not-an-id', '--json'), 2);
  assert.match(h.error().message, /"not-an-id" is not a request id/);
  assert.equal(await harness(running(), studio.call, false).run('request', 'show', ID), 13);
  assert.deepEqual(studio.calls, []);
});
