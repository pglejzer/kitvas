// Utility CSS from the Tailwind of the person's project, 3 or 4. Each build runs tailwind-worker.ts
// in its own Node process, like a job: an argument array and no shell, a time limit, a memory limit
// and a cap on what it prints. The project's compiler, its config and plugins never run inside
// kitvas's process.

import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KitvasError } from '../../shared/index.ts';
import type { UtilityCss, UtilityInput, UtilityOutput } from '../ports/utility-css.ts';
import { relativeFile } from './real-path.ts';
import { parseAnswer } from './tailwind-compile.ts';

export type TailwindCssOptions = {
  /** The worker script; tests point it at a stand-in. */
  worker?: string | undefined;
  timeoutMs?: number | undefined;
  memoryMb?: number | undefined;
  /** What the worker may print on stdout. */
  outputBytes?: number | undefined;
};

type Limits = { timeoutMs: number; memoryMb: number; outputBytes: number };

const WORKER = fileURLToPath(new URL('./tailwind-worker.ts', import.meta.url));
const LIMITS: Limits = { timeoutMs: 60_000, memoryMb: 512, outputBytes: 20 * 1024 * 1024 };
/** The end of stderr kept for a crash message. */
const ERROR_TAIL = 2000;

type Run = {
  stop: 'time' | 'output' | undefined;
  exit: number | null;
  stdout: string;
  stderr: string;
};

function runWorker(
  worker: string,
  input: UtilityInput,
  limits: Limits,
  running: Set<ChildProcess>,
): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${limits.memoryMb}`, worker], {
      cwd: input.project,
      shell: false,
      windowsHide: true,
    });
    running.add(child);
    const stdout: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let stop: Run['stop'];
    const end = (why: 'time' | 'output'): void => {
      if (stop !== undefined) return;
      stop = why;
      child.kill();
    };
    const timer = setTimeout(() => end('time'), limits.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limits.outputBytes) end('output');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-ERROR_TAIL);
    });
    let settled = false;
    const settle = (exit: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(child);
      resolve({ stop, exit, stdout: Buffer.concat(stdout).toString('utf8'), stderr });
    };
    child.once('error', (error) => {
      // Only a process that never started ends here; a running one still sends 'close'.
      if (child.pid !== undefined) return;
      stderr += String(error);
      settle(null);
    });
    child.once('close', (exit) => settle(exit));
    // A worker that ends early stops reading; its answer, not a broken pipe, says why.
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(input));
  });
}

function outputOf(run: Run, input: UtilityInput, limits: Limits): UtilityOutput {
  const failed = (message: string): UtilityOutput => ({
    css: '',
    unknown: [],
    errors: [
      {
        source: 'styles',
        file: relativeFile(input.project, input.entry),
        line: 0,
        column: 0,
        message,
      },
    ],
    files: [input.entry],
  });
  if (run.stop === 'time') {
    return failed(`Tailwind did not finish in ${limits.timeoutMs / 1000} s.`);
  }
  if (run.stop === 'output') {
    return failed(`Tailwind printed more than ${limits.outputBytes} bytes.`);
  }
  const answer = parseAnswer(run.stdout);
  if (answer === undefined) {
    return failed(
      run.stderr.trim() || `The Tailwind worker ended with exit code ${run.exit ?? -1}.`,
    );
  }
  if (answer.ok) {
    const { css, unknown, files, theme } = answer;
    return { css, unknown, errors: [], files, theme };
  }
  if ('missing' in answer) throw new KitvasError('KIT_PACKAGE_MISSING', { name: answer.missing });
  return failed(answer.message);
}

export function createTailwindCss(options: TailwindCssOptions = {}): UtilityCss {
  const worker = options.worker ?? WORKER;
  const limits: Limits = {
    timeoutMs: options.timeoutMs ?? LIMITS.timeoutMs,
    memoryMb: options.memoryMb ?? LIMITS.memoryMb,
    outputBytes: options.outputBytes ?? LIMITS.outputBytes,
  };
  const running = new Set<ChildProcess>();
  return {
    async build(input) {
      return outputOf(await runWorker(worker, input, limits, running), input, limits);
    },
    async dispose() {
      for (const child of running) child.kill();
      running.clear();
    },
  };
}
