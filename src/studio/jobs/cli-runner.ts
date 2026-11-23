// Runs a CLI command as a job: a child process with limits on time, memory and output.

import { spawn } from 'node:child_process';
import { KitvasError, type Translate, type Zod, z } from '../../shared/index.ts';
import type { JobOutcome, JobRunner, RunningJob } from './job.ts';
import { killTree, OWN_GROUP } from './process-tree.ts';

export type CliTarget = {
  /** `bin/kitvas.ts` of the plugin. */
  bin: string;
  /** The project: the command runs there. */
  cwd: string;
  /** The studio process's environment, which never holds the token. */
  env: NodeJS.ProcessEnv;
};

export type JobLimits = { timeMs: number; memoryMb: number; outputBytes: number };

/** 120 s, 2048 MB of heap, 1 MiB over stdout and stderr together. */
export const JOB_LIMITS: JobLimits = { timeMs: 120_000, memoryMb: 2_048, outputBytes: 1_048_576 };

/** Extra environment for one job, found before its process starts; a throw fails the job. */
export type PrepareJob = (args: string[]) => Promise<NodeJS.ProcessEnv>;

/** The end of stderr that is kept, for the answer and the log. */
const ERROR_TAIL = 16_384;

type Stop = 'time' | 'output' | 'cancel';

/** A process that ended: why it was stopped, if it was, and what it printed. */
export type Finished = {
  stop: Stop | undefined;
  exit: number | null;
  stdout: string;
  stderr: string;
};

const AnswerSchema = z.union([
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);

/** The CLI's JSON answer: the last line of `text` that is one. */
function answerOf(text: string): Zod.infer<typeof AnswerSchema> | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .reverse();
  for (const line of lines) {
    try {
      const parsed = AnswerSchema.safeParse(JSON.parse(line));
      if (parsed.success) return parsed.data;
    } catch {
      // Not JSON: the CLI or npm said something else.
    }
  }
  return undefined;
}

/** How a finished run ended, from why it stopped and what it printed. */
export function outcomeOf(run: Finished, t: Translate): JobOutcome {
  const failed = (code: string, params: Record<string, string | number>): JobOutcome => ({
    state: 'failed',
    error: { code, message: t(`error.${code}`, params) },
  });
  if (run.stop === 'cancel') return { state: 'cancelled' };
  if (run.stop) return failed('JOB_LIMIT', { limit: run.stop });
  if (/heap out of memory/i.test(run.stderr)) return failed('JOB_LIMIT', { limit: 'memory' });
  const answer = answerOf(run.stdout) ?? answerOf(run.stderr);
  if (answer?.ok === true) return { state: 'succeeded', result: answer.data ?? null };
  if (answer?.ok === false) return { state: 'failed', error: answer.error };
  return failed('JOB_CRASHED', { exit: run.exit ?? -1 });
}

/**
 * A job error from something thrown before the process started. Only kitvas's own errors are
 * worded for people; any other text (paths, system messages) goes to the log, never the API.
 */
function thrownOutcome(error: unknown, t: Translate, log: (text: string) => void, args: string[]) {
  if (error instanceof KitvasError) {
    const message = t(`error.${error.code}`, error.params);
    return { state: 'failed', error: { code: error.code, message } } satisfies JobOutcome;
  }
  log(`kitvas ${args.join(' ')} could not start: ${String(error)}`);
  const message = t('error.INTERNAL', { detail: t('studio.job.notStarted') });
  return { state: 'failed', error: { code: 'INTERNAL', message } } satisfies JobOutcome;
}

type SpawnInput = {
  target: CliTarget;
  args: string[];
  env: NodeJS.ProcessEnv;
  limits: JobLimits;
  t: Translate;
  log: (text: string) => void;
};

/** One process: `node <bin> <args> --json` in the project, ended by its limits or a cancel. */
function spawnJob({ target, args, env, limits, t, log }: SpawnInput): RunningJob {
  const child = spawn(
    process.execPath,
    [`--max-old-space-size=${limits.memoryMb}`, target.bin, ...args, '--json'],
    {
      cwd: target.cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Its own process group, so a kill also ends what the command started (see process-tree).
      detached: OWN_GROUP,
    },
  );
  const stdout: Buffer[] = [];
  let stderr = '';
  let size = 0;
  let stop: Stop | undefined;
  const end = (why: Stop): void => {
    if (stop !== undefined) return;
    stop = why;
    killTree(child);
  };
  const timer = setTimeout(() => end('time'), limits.timeMs);
  const fits = (chunk: Buffer): boolean => {
    size += chunk.length;
    if (size <= limits.outputBytes) return true;
    end('output');
    return false;
  };
  child.stdout.on('data', (chunk: Buffer) => {
    if (fits(chunk)) stdout.push(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    if (fits(chunk)) stderr = (stderr + chunk.toString('utf8')).slice(-ERROR_TAIL);
  });
  const done = new Promise<JobOutcome>((resolve) => {
    let settled = false;
    const settle = (exit: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const run = { stop, exit, stdout: Buffer.concat(stdout).toString('utf8'), stderr };
      const outcome = outcomeOf(run, t);
      if (outcome.state === 'failed' && outcome.error.code === 'JOB_CRASHED') {
        log(`kitvas ${args.join(' ')} ended with exit code ${exit ?? -1}: ${stderr.trim()}`);
      }
      resolve(outcome);
    };
    child.once('error', (error) => {
      // Only a process that never started ends here; a running one still sends 'close'.
      if (child.pid !== undefined) return;
      stderr += String(error);
      settle(null);
    });
    child.once('close', (exit) => settle(exit));
  });
  return { done, cancel: () => end('cancel') };
}

/** Runs `node <bin> <args> --json` in the project, one process per job, after `prepare`. */
export function cliRunner(
  target: CliTarget,
  limits: JobLimits,
  t: Translate,
  log: (text: string) => void,
  prepare?: PrepareJob,
): JobRunner {
  return (args) => {
    let cancelled = false;
    let running: RunningJob | undefined;
    const done = (async (): Promise<JobOutcome> => {
      let extra: NodeJS.ProcessEnv = {};
      try {
        // Without a prepare step this runs at once, so the process starts before `run` returns.
        extra = prepare ? await prepare(args) : {};
      } catch (error) {
        return thrownOutcome(error, t, log, args);
      }
      if (cancelled) return { state: 'cancelled' };
      running = spawnJob({ target, args, env: { ...target.env, ...extra }, limits, t, log });
      return running.done;
    })();
    return {
      done,
      cancel: () => {
        cancelled = true;
        running?.cancel();
      },
    };
  };
}
