import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { KitvasError } from '../../../src/shared/index.ts';
import {
  cliRunner,
  JOB_LIMITS,
  type JobLimits,
  outcomeOf,
} from '../../../src/studio/jobs/cli-runner.ts';
import {
  CHATTY_CLI,
  CRASHING_CLI,
  ECHO_CLI,
  ENV_CLI,
  FAILING_CLI,
  fakeCli,
  PARENT_CLI,
  SLOW_CLI,
} from '../../helpers/fake-cli.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { t } from '../../helpers/translate.ts';

function runner(body: string, limits: Partial<JobLimits> = {}) {
  const logs: string[] = [];
  const cwd = tempDir();
  const run = cliRunner(
    { bin: fakeCli(body), cwd, env: process.env },
    { ...JOB_LIMITS, ...limits },
    t,
    (text) => logs.push(text),
  );
  return { run, logs, cwd };
}

const limit = (name: string) => ({
  state: 'failed',
  error: { code: 'JOB_LIMIT', message: t('error.JOB_LIMIT', { limit: name }) },
});

test('a command that answers succeeds with its data; it ran with --json and the heap cap', async () => {
  const { run, cwd } = runner(ECHO_CLI, { memoryMb: 512 });
  const outcome = await run(['build', 'shop']).done;
  assert.equal(outcome.state, 'succeeded');
  const data = (outcome as { result: { args: string[]; memory: string; cwd: string } }).result;
  assert.deepEqual(data.args, ['build', 'shop', '--json']);
  assert.equal(data.memory, '--max-old-space-size=512');
  assert.equal(basename(data.cwd), basename(cwd));
});

test('an error the command reports is the job error', async () => {
  const outcome = await runner(FAILING_CLI).run(['build', 'shop']).done;
  assert.deepEqual(outcome, {
    state: 'failed',
    error: { code: 'DRAFT_NOT_FOUND', message: 'There is no draft shop.' },
  });
});

test('the time and output limits stop the process; cancel ends it as cancelled', async () => {
  const slow = await runner(SLOW_CLI, { timeMs: 300 }).run(['build', 'shop']).done;
  assert.deepEqual(slow, limit('time'));
  const chatty = await runner(CHATTY_CLI, { outputBytes: 1_000 }).run(['build', 'shop']).done;
  assert.deepEqual(chatty, limit('output'));
  const job = runner(SLOW_CLI).run(['build', 'shop']);
  job.cancel();
  job.cancel();
  assert.deepEqual(await job.done, { state: 'cancelled' });
});

test('a process that ends without an answer crashed, and its stderr goes to the log', async () => {
  const { run, logs } = runner(CRASHING_CLI);
  const outcome = await run(['build', 'shop']).done;
  assert.deepEqual(outcome, {
    state: 'failed',
    error: { code: 'JOB_CRASHED', message: t('error.JOB_CRASHED', { exit: 3 }) },
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? '', /exit code 3: boom/);
});

test('a process that cannot start is a crash, not a hang', async () => {
  const logs: string[] = [];
  const run = cliRunner(
    { bin: 'missing.ts', cwd: join(tempDir(), 'missing'), env: process.env },
    JOB_LIMITS,
    t,
    (text) => logs.push(text),
  );
  const outcome = await run(['build', 'shop']).done;
  assert.equal(outcome.state === 'failed' && outcome.error.code, 'JOB_CRASHED');
  assert.equal(logs.length, 1);
});

test('a heap that ran out is the memory limit; text before the answer is skipped', () => {
  const heap = 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory';
  assert.deepEqual(
    outcomeOf({ stop: undefined, exit: 134, stdout: '', stderr: heap }, t),
    limit('memory'),
  );
  assert.deepEqual(
    outcomeOf(
      { stop: undefined, exit: 0, stdout: 'installing\n{"ok":true,"data":{"a":1}}\n', stderr: '' },
      t,
    ),
    { state: 'succeeded', result: { a: 1 } },
  );
});

test('a job waits for its environment; a failure there fails it, a cancel there ends it', async () => {
  const target = { bin: fakeCli(ENV_CLI), cwd: tempDir(), env: process.env };
  const quiet = () => undefined;
  const withEnv = cliRunner(target, JOB_LIMITS, t, quiet, async () => ({
    KITVAS_TEST_VALUE: 'shared',
  }));
  assert.deepEqual(await withEnv(['check', 'shop']).done, {
    state: 'succeeded',
    result: { value: 'shared' },
  });
  const missing = cliRunner(target, JOB_LIMITS, t, quiet, async () => {
    throw new KitvasError('BROWSER_MISSING', { dir: 'x' });
  });
  assert.deepEqual(await missing(['check', 'shop']).done, {
    state: 'failed',
    error: { code: 'BROWSER_MISSING', message: t('error.BROWSER_MISSING', { dir: 'x' }) },
  });
  let release: () => void = () => undefined;
  const slow = cliRunner(
    target,
    JOB_LIMITS,
    t,
    quiet,
    () =>
      new Promise((resolve) => {
        release = () => resolve({});
      }),
  );
  const job = slow(['check', 'shop']);
  job.cancel();
  release();
  assert.deepEqual(await job.done, { state: 'cancelled' });
});

test('an unexpected throw before the start stays out of the answer and goes to the log', async () => {
  const logs: string[] = [];
  const target = { bin: fakeCli(ENV_CLI), cwd: tempDir(), env: process.env };
  const broken = cliRunner(
    target,
    JOB_LIMITS,
    t,
    (text) => logs.push(text),
    async () => {
      throw new Error('EACCES C:Userssomeoneprivate');
    },
  );
  const outcome = await broken(['check', 'shop']).done;
  const message = t('error.INTERNAL', { detail: t('studio.job.notStarted') });
  assert.deepEqual(outcome, { state: 'failed', error: { code: 'INTERNAL', message } });
  assert.ok(!message.includes('private'));
  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? '', /^kitvas check shop could not start: Error: EACCES/);
});

/** Whether a process with `pid` still runs; EPERM means it runs as someone else. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function until<T>(read: () => T | undefined, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test('a cancel ends the command and the processes it started', async () => {
  const file = join(tempDir(), 'child.pid');
  const env = { ...process.env, KITVAS_TEST_PID_FILE: file };
  const run = cliRunner({ bin: fakeCli(PARENT_CLI), cwd: tempDir(), env }, JOB_LIMITS, t, () => {});
  const job = run(['check', 'shop']);
  const pid = await until(() =>
    existsSync(file) ? Number(readFileSync(file, 'utf8')) : undefined,
  );
  assert.equal(alive(pid), true);
  job.cancel();
  assert.deepEqual(await job.done, { state: 'cancelled' });
  assert.equal(await until(() => (alive(pid) ? undefined : true)), true);
});
